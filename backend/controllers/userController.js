const db = require("../config/db");
const bcrypt = require('bcrypt');

const isValidEmail = (value = '') => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim());

exports.getAllUsers = async (req, res) => {
  try {
    const result = await db.query("SELECT id, username, email, role, phone, full_name, is_active FROM users ORDER BY username ASC");
    res.json(result.rows);
  } catch (error) {
    console.error("Error getting users:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.searchTenants = async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.json([]);
    const rs = await db.query(
      `SELECT id, username, email, full_name, phone, role
       FROM users
       WHERE role IN ('TENANT','MANAGER','ADMIN')
       AND (LOWER(username) LIKE LOWER($1) OR LOWER(email) LIKE LOWER($1) OR LOWER(COALESCE(full_name,'')) LIKE LOWER($1))
       ORDER BY username ASC LIMIT 20`,
      [`%${q}%`]
    );
    return res.json(rs.rows);
  } catch (e) {
    console.error('searchTenants error', e);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.ensureTenant = async (req, res) => {
  try {
    let { username, email, full_name, phone } = req.body || {};
    username = (username || '').trim();
    email = (email || '').trim();
    phone = (phone || '').trim();

    if (!username && !email) return res.status(400).json({ message: 'username or email required' });
    if (!phone || phone.length < 6) return res.status(400).json({ message: 'phone required' });

    const qUser = username || null;
    const qEmail = email || null;
    const find = await db.query(
      `SELECT id, username, phone FROM users
       WHERE ($1::text IS NOT NULL AND username = $1::text)
          OR ($2::text IS NOT NULL AND email    = $2::text)
       LIMIT 1`,
      [qUser, qEmail]
    );
    if (find.rowCount) {
      const existing = find.rows[0];
      if (!existing.phone || existing.phone.trim() === '' || existing.phone !== phone) {
        await db.query(`UPDATE users SET phone=$1, updated_at=now() WHERE id=$2`, [phone, existing.id]);
      }
      return res.json({ id: existing.id, username: existing.username });
    }

    const baseUsername = username || (email.includes('@') ? email.split('@')[0] : 'guest');
    const finalEmail = email || `${baseUsername}@mut888.ac.th`;

    const pass = Math.random().toString(36).slice(2, 10);
    const hash = await bcrypt.hash(pass, 10);
    try {
      const ins = await db.query(
        `INSERT INTO users(username, email, password_hash, role, full_name, phone)
         VALUES ($1,$2,$3,'TENANT',$4,$5)
         RETURNING id, username`,
        [baseUsername, finalEmail, hash, full_name || null, phone]
      );
      return res.status(201).json(ins.rows[0]);
    } catch (err) {
      if (err.code === '23505') {
        return res.status(400).json({ message: 'username or email already exists' });
      }
      throw err;
    }
  } catch (e) {
    console.error('ensureTenant error', e);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.updateUser = async (req, res) => {
  const { id } = req.params;
  const { username = null, email = null, role = null, phone = null, full_name = null } = req.body;

  try {
    let phoneValue = null;
    if (phone !== null && phone !== undefined) {
      const trimmed = String(phone).trim();
      if (!trimmed) {
        return res.status(400).json({ message: 'phone cannot be empty' });
      }
      if (trimmed.length < 6) {
        return res.status(400).json({ message: 'phone number is too short' });
      }
      phoneValue = trimmed;
    }
    const result = await db.query(
      `UPDATE users
       SET username = COALESCE($1, username),
           email    = COALESCE($2, email),
           role     = COALESCE($3, role),
           phone    = COALESCE($4, phone),
           full_name = COALESCE($5, full_name),
           updated_at = now()
       WHERE id = $6
       RETURNING id, username, email, role, phone, full_name`,
      [username, email, role, phoneValue, full_name, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Update user error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.deleteUser = async (req, res) => {
  const { id } = req.params;
  if (req.params.id === req.user?.id) {
    return res
      .status(400)
      .json({ message: "You cannot delete your own account" });
  }
  try {
    const adminCount = await db.query("SELECT COUNT(*)::int AS c FROM users WHERE role = 'ADMIN'")
    if (adminCount.rows[0].c <= 1) {
      const target = await db.query("SELECT role FROM users WHERE id = $1", [id])

      if (target.rows.length === 0) {
        return res.status(404).json({ message: "User not found"})
      }

      if (target.rows[0].role === "ADMIN") {
        return res.status(409).json({ message: "Cannot delete the last admin"})
      }
    }


    const result = await db.query("DELETE FROM users WHERE id = $1 RETURNING id,username,email,role",[id])

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "User not found"})
    }

    return res.status(200).json({ message :"User deleted", user: result.rows[0]})
  } catch (error) {
    console.error("Delete user error:", error);
    return res.status(500).json({ message: "Server error"})
  }
};

exports.getMyProfile = async (req, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ message: 'Unauthorized' });
  try {
    const result = await db.query(
      `SELECT id, username, email, role, phone, full_name
       FROM users WHERE id=$1`,
      [userId]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    return res.json(result.rows[0]);
  } catch (err) {
    console.error('getMyProfile error', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.updateMyProfile = async (req, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ message: 'Unauthorized' });

  let { full_name, phone, email } = req.body || {};
  const updates = [];
  const values = [];
  let idx = 1;

  if (full_name !== undefined) {
    const normalized = String(full_name || '').trim();
    updates.push(`full_name = $${idx++}`);
    values.push(normalized || null);
  }

  if (phone !== undefined) {
    const normalized = String(phone || '').trim();
    if (!normalized) {
      return res.status(400).json({ message: 'Phone is required' });
    }
    if (normalized.length < 6) {
      return res.status(400).json({ message: 'Phone number is too short' });
    }
    updates.push(`phone = $${idx++}`);
    values.push(normalized);
  }

  if (email !== undefined) {
    const normalized = String(email || '').trim().toLowerCase();
    if (!normalized) {
      return res.status(400).json({ message: 'Email is required' });
    }
    if (!isValidEmail(normalized)) {
      return res.status(400).json({ message: 'Invalid email address' });
    }
    updates.push(`email = $${idx++}`);
    values.push(normalized);
  }

  if (!updates.length) {
    return res.status(400).json({ message: 'No changes provided' });
  }

  const setClause = [...updates, 'updated_at = now()'].join(', ');
  const query = `
    UPDATE users
    SET ${setClause}
    WHERE id = $${idx}
    RETURNING id, username, email, role, phone, full_name
  `;
  values.push(userId);

  try {
    const result = await db.query(query, values);
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    return res.json(result.rows[0]);
  } catch (err) {
    console.error('updateMyProfile error', err);
    if (err.code === '23505') {
      return res.status(409).json({ message: 'Email is already in use' });
    }
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.changeMyPassword = async (req, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ message: 'Unauthorized' });

  const currentPassword = String(req.body?.current_password || '').trim();
  const newPassword = String(req.body?.new_password || '').trim();

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: 'Both current_password and new_password are required' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ message: 'New password must be at least 8 characters' });
  }
  if (currentPassword === newPassword) {
    return res.status(400).json({ message: 'New password must be different from current password' });
  }

  try {
    const result = await db.query(
      `SELECT password_hash FROM users WHERE id=$1`,
      [userId]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    const isMatch = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
    if (!isMatch) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }
    const hash = await bcrypt.hash(newPassword, 10);
    await db.query(
      `UPDATE users SET password_hash=$1, updated_at=now() WHERE id=$2`,
      [hash, userId]
    );
    return res.json({ message: 'Password updated successfully' });
  } catch (err) {
    console.error('changeMyPassword error', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.resetPassword = async (req, res) => {
  const { id } = req.params;
  const { new_password } = req.body || {};
  try {
    const password = String(new_password || '').trim();
    if (password.length < 8) {
      return res.status(400).json({ message: 'new_password must be at least 8 characters' });
    }
    const hash = await bcrypt.hash(password, 10);
    const result = await db.query(
      `UPDATE users SET password_hash=$1, updated_at=now() WHERE id=$2 RETURNING id, username, role`,
      [hash, id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json({ message: 'Password reset', user: result.rows[0] });
  } catch (err) {
    console.error('resetPassword error', err);
    res.status(500).json({ message: 'Server error' });
  }
};
