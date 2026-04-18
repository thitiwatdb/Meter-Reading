const pool = require("../config/db");
const { log } = require('../utils/activityLogger');

exports.list = async (req, res) => {
  try {
    const { status, room_id, building_id } = req.query;
    const conds = [];
    const vals = [];
    let i = 1;
    if (status)  { conds.push(`m.status = $${i++}`);  vals.push(status.toUpperCase()); }
    if (room_id) { conds.push(`m.room_id = $${i++}`); vals.push(room_id); }
    if (building_id) { conds.push(`b.id = $${i++}`); vals.push(building_id); }
    const role = String(req.user?.role || '').toUpperCase();
    if (role === 'TENANT') {
      conds.push(`m.requester_id = $${i++}`);
      vals.push(req.user?.id);
    }
    const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
    const rs = await pool.query(
      `SELECT m.*, r.room_no, b.code AS building_code, u.username AS requester_username
       FROM maintenance_requests m
       JOIN rooms r ON r.id = m.room_id
       JOIN buildings b ON b.id = r.building_id
       JOIN users u ON u.id = m.requester_id
       ${where}
       ORDER BY m.created_at DESC`
    , vals);
    return res.json(rs.rows);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.create = async (req, res) => {
  try {
    const requesterId = req.user?.id;
    const { room_id, title, description, photo_path } = req.body;
    if (!room_id || !title) return res.status(400).json({ message: 'room_id and title required' });
    const role = String(req.user?.role || '').toUpperCase();
    if (role === 'TENANT') {
      const tq = await pool.query(
        `SELECT 1 FROM tenancies WHERE room_id=$1 AND tenant_id=$2 AND status IN ('ACTIVE','MOVING_OUT') LIMIT 1`,
        [room_id, requesterId]
      );
      if (!tq.rowCount) return res.status(403).json({ message: 'Only active tenants of the room can request maintenance' });
    }
    const rs = await pool.query(
      `INSERT INTO maintenance_requests (room_id, requester_id, title, description, status, photo_path)
       VALUES ($1,$2,$3,$4,'REQUESTED',$5)
       RETURNING *`,
      [room_id, requesterId, title, description ?? null, photo_path ?? null]
    );
    const created = rs.rows[0];
    log({ actor_user_id: requesterId, action: 'MAINT_CREATE', entity_type: 'MAINT', entity_id: created.id, details: { room_id } });
    try {
      const { notify } = require('../utils/notifications');
      await notify({
        user_id: requesterId,
        title: 'Maintenance request submitted',
        body: `Your maintenance request "${created.title}" has been recorded.`,
        type: 'MAINTENANCE',
        link: '/maintenance'
      });
    } catch (_) {}
    return res.status(201).json(created);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.updateStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, reason } = req.body;
    if (!status) return res.status(400).json({ message: 'status required' });
    const current = await pool.query(`SELECT status FROM maintenance_requests WHERE id=$1`, [id]);
    if (current.rowCount === 0) return res.status(404).json({ message: 'Not found' });
    const currentStatus = String(current.rows[0].status || '').toUpperCase();
    const nextStatus = String(status).toUpperCase();
    if (currentStatus === 'COMPLETED' && nextStatus === 'CANCELLED') {
      return res.status(400).json({ message: 'Completed requests cannot be cancelled' });
    }
    if (nextStatus === 'CANCELLED' && !String(reason || '').trim()) {
      return res.status(400).json({ message: 'Cancellation reason required' });
    }
    const rs = await pool.query(
      `UPDATE maintenance_requests SET status=$2, cancel_reason=$3, updated_at=now() WHERE id=$1 RETURNING *`,
      [id, nextStatus, nextStatus === 'CANCELLED' ? String(reason).trim() : null]
    );
    if (rs.rowCount === 0) return res.status(404).json({ message: 'Not found' });
    const updated = rs.rows[0];
    log({
      actor_user_id: req.user?.id,
      action: 'MAINT_STATUS',
      entity_type: 'MAINT',
      entity_id: updated.id,
      details: { status: updated.status, reason: nextStatus === 'CANCELLED' ? String(reason).trim() : undefined }
    });
    try {
      const { notify } = require('../utils/notifications');
      await notify({
        user_id: updated.requester_id,
        title: 'Maintenance status updated',
        body: `Your maintenance request "${updated.title}" is now ${updated.status}.`,
        type: 'MAINTENANCE',
        link: '/maintenance'
      });
    } catch (_) {}
    return res.json(updated);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Server error" });
  }
};
