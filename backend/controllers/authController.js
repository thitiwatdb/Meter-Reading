const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const pool = require("../config/db");

const register = async (req, res) => {
  const {
    username,
    email,
    password,
    phone,
    full_name: fullName = null,
    role = "TENANT",
  } = req.body;
  try {
    if (!username || !email || !password || !phone) {
      return res
        .status(400)
        .json({ message: "Username, email, password and phone are required" });
    }
    const exists = await pool.query(
      "SELECT 1 FROM users WHERE email=$1 OR username=$2",
      [email, username]
    );
    if (exists.rowCount > 0) {
      return res.status(400).json({ message: "username or email already exists" });
    }
    const hashed = await bcrypt.hash(password, 10);
    const normalizedRole = String(role || "TENANT").trim().toUpperCase();
    await pool.query(
      `INSERT INTO users (username, email, password_hash, full_name, phone, role)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        username.trim(),
        email.trim(),
        hashed,
        fullName ? String(fullName).trim() : null,
        phone.trim(),
        normalizedRole,
      ]
    );
    return res.status(201).json({ message: "User registered" });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Server error" });
  }
};

const login = async (req, res) => {
  const { username, password } = req.body;
  try {
    //console.log(username)
    //console.log(password)
    const rs = await pool.query(
      `SELECT id, username, email, role, password_hash, is_active
       FROM users WHERE username=$1 LIMIT 1`,[username]
    );
    if (rs.rowCount === 0) {
      //console.log(rs.rowCount)
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const user = rs.rows[0];
    if (!user.is_active) return res.status(403).json({ message: "Account disabled" });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(400).json({ message: "Invalid credentials" });

    const normalizedRole = String(user.role || '').trim().toUpperCase();
    const token = jwt.sign(
      { id: user.id, username: user.username, role: normalizedRole },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );
    //console.log(user)
    //console.log(token)
    return res.json({ token, user: { id: user.id, username: user.username, role: normalizedRole }});
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Server error" });
  }
  
};

module.exports = { register, login };
