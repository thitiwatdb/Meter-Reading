const pool = require('../config/db');

async function log({ actor_user_id = null, action, entity_type, entity_id = null, details = null }) {
  try {
    await pool.query(
      `INSERT INTO activity_logs(actor_user_id, action, entity_type, entity_id, details)
       VALUES ($1,$2,$3,$4,$5)` ,
      [actor_user_id, action, entity_type, entity_id, details ? JSON.stringify(details) : null]
    );
  } catch (e) {
    console.error('[activityLogger]', e.message);
  }
}

module.exports = { log };

