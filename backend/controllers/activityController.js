const pool = require('../config/db');

exports.list = async (req, res) => {
  try {
    const { entity_type, entity_id, limit = 100 } = req.query;
    const vals = [];
    const conds = [];
    if (entity_type) { conds.push('entity_type = $' + (vals.push(entity_type)) ); }
    if (entity_id)   { conds.push('entity_id = $' + (vals.push(entity_id)) ); }
    const where = conds.length ? ('WHERE ' + conds.join(' AND ')) : '';
    const rs = await pool.query(
      `SELECT a.*, u.username AS actor_username
       FROM activity_logs a
       LEFT JOIN users u ON u.id = a.actor_user_id
       ${where}
       ORDER BY a.created_at DESC
       LIMIT ${Number(limit) || 100}`,
      vals
    );
    return res.json(rs.rows);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Server error' });
  }
};

