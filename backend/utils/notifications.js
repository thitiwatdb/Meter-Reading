const pool = require('../config/db');

async function ensureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id),
      title varchar(200) NOT NULL,
      body text,
      type varchar(40),
      link text,
      read_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, created_at DESC);
  `);
}

async function notify({ user_id, title, body = null, type = null, link = null }) {
  await ensureTable();
  await pool.query(
    `INSERT INTO notifications (user_id, title, body, type, link) VALUES ($1,$2,$3,$4,$5)`,
    [user_id, title, body, type, link]
  );
}

async function listForUser(user_id) {
  await ensureTable();
  const rs = await pool.query(
    `SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100`,
    [user_id]
  );
  return rs.rows;
}

module.exports = { notify, listForUser };

