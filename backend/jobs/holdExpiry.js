const pool = require('../config/db');

async function expireHoldsOnce() {
  try {
    const rs = await pool.query(
      `UPDATE bookings
       SET status='CANCELLED', cancelled_at=now(), cancel_reason='Hold expired', updated_at=now()
       WHERE status='PENDING' AND hold_expires_at IS NOT NULL AND hold_expires_at < now()
       RETURNING id`
    );
    if (rs.rowCount) {
      console.log(`[holdExpiry] Cancelled ${rs.rowCount} expired holds`);
    }
  } catch (e) {
    console.error('[holdExpiry] error', e.message);
  }
}

function startScheduler() {
  setInterval(expireHoldsOnce, 60 * 1000);
  expireHoldsOnce();
}

module.exports = { startScheduler };

