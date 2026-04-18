const pool = require("../config/db");
const { log } = require('../utils/activityLogger');
const { nightsInclusive, dateToISO } = require('../utils/dateHelpers');
const { generateBillIdentity } = require('../utils/billIdentity');

function pad(n, w = 4) { return String(n).padStart(w, '0'); }
async function genBookingCode(sellType = 'DAILY') {
  const now = new Date();
  const ym = `${now.getFullYear()}${pad(now.getMonth()+1,2)}`;
  let attempt = 0;
  while (attempt < 5) {
    const code = `BK-${ym}-${Math.random().toString().slice(2,6)}`;
    const rs = await pool.query(`SELECT 1 FROM bookings WHERE booking_code=$1`, [code]);
    if (!rs.rowCount) return code;
    attempt++;
  }
  return `BK-${ym}-${Date.now().toString().slice(-4)}`;
}

async function hasConflict(roomId, startDate, endDate, excludeBookingId = null) {
  const params = [roomId, startDate, endDate];
  let sql = `
    SELECT 1
    FROM bookings b
    WHERE b.room_id = $1
      AND b.status IN ('PENDING','APPROVED','CHECKED_IN')
      AND NOT ($3 <= b.start_date OR $2 >= b.end_date)
  `;
  if (excludeBookingId) {
    params.push(excludeBookingId);
    sql += ` AND b.id <> $4`;
  }
  sql += ` LIMIT 1`;

  const conflict = await pool.query(sql, params);
  if (conflict.rowCount) return true;

  const tConflict = await pool.query(
    `
    SELECT 1
    FROM tenancies t
    WHERE t.room_id = $1
      AND t.status IN ('ACTIVE','MOVING_OUT')
      AND NOT ($3 <= t.start_date OR $2 >= COALESCE(t.end_date, '9999-12-31'))
    LIMIT 1
    `,
    [roomId, startDate, endDate]
  );
  return tConflict.rowCount > 0;
}

function serializeBookingRow(row) {
  if (!row || typeof row !== 'object') return row;
  const serialized = { ...row };
  if (typeof row.start_date === 'string') {
    serialized.start_date = row.start_date;
  } else {
    const startIso = dateToISO(row.start_date);
    if (startIso) serialized.start_date = startIso;
  }
  if (typeof row.end_date === 'string') {
    serialized.end_date = row.end_date;
  } else {
    const endIso = dateToISO(row.end_date);
    if (endIso) serialized.end_date = endIso;
  }
  if (row.created_at instanceof Date) serialized.created_at = row.created_at.toISOString();
  if (row.updated_at instanceof Date) serialized.updated_at = row.updated_at.toISOString();
  if (row.checked_in_at instanceof Date) serialized.checked_in_at = row.checked_in_at.toISOString();
  if (row.checked_out_at instanceof Date) serialized.checked_out_at = row.checked_out_at.toISOString();
  if (row.deposit_paid_at instanceof Date) serialized.deposit_paid_at = row.deposit_paid_at.toISOString();
  if (row.hold_expires_at instanceof Date) serialized.hold_expires_at = row.hold_expires_at.toISOString();
  return serialized;
}

async function ensurePrepaymentBill(bookingId) {
  const bkRs = await pool.query(
    `SELECT
       b.*,
       r.base_rent_day,
       r.base_rent_month,
       r.room_no,
       bld.code AS building_code
     FROM bookings b
     LEFT JOIN rooms r ON r.id = b.room_id
     LEFT JOIN buildings bld ON bld.id = r.building_id
     WHERE b.id = $1`,
    [bookingId]
  );
  if (!bkRs.rowCount) return null;
  const bk = bkRs.rows[0];
  if (!bk.room_id) return null;

  const existing = await pool.query(
    `SELECT id, bill_no, total_amount, status
       FROM bills
       WHERE booking_id = $1
       ORDER BY issued_at DESC
       LIMIT 1`,
    [bookingId]
  );
  if (existing.rowCount) return existing.rows[0];

  const nights = nightsInclusive(bk.start_date, bk.end_date);
  let rentAmount = 0;
  if (bk.is_monthly) {
    rentAmount = Number(bk.base_rent_month || 0);
  } else {
    rentAmount = Number(bk.base_rent_day || 0) * Math.max(1, nights);
  }
  rentAmount = Number(Number.isFinite(rentAmount) ? rentAmount.toFixed(2) : 0);
  if (rentAmount <= 0) return null;

  const noteParts = [];
  if (bk.booking_code) noteParts.push(`Booking ${bk.booking_code}`);
  noteParts.push('Full pre-checkin payment required');
  const note = noteParts.join(' • ');

  const reference = bk.booking_code || bk.room_no || bk.id;
  let billNo = '';
  let billScope = 'BOOKING';
  let attempt = 0;
  while (attempt < 6) {
    const identity = generateBillIdentity({
      baseScope: 'BOOKING',
      hasRent: true,
      reference
    });
    billNo = identity.bill_no.slice(0, 40);
    billScope = identity.bill_scope;
    try {
      const billInsert = await pool.query(
        `INSERT INTO bills (booking_id, bill_no, period_start, period_end, subtotal, total_amount, status, due_date, note, bill_scope)
         VALUES ($1,$2,$3,$4,$5,$5,'PENDING',$6,$7,$8)
         RETURNING *`,
        [
          bookingId,
          billNo,
          bk.start_date,
          bk.end_date,
          rentAmount,
          bk.start_date,
          note,
          billScope
        ]
      );
      const bill = billInsert.rows[0];
      const descParts = [];
      if (bk.is_monthly) {
        descParts.push('Monthly rent');
      } else {
        descParts.push(`Daily rent x${Math.max(1, nights)}`);
      }
      if (bk.room_no) {
        descParts.push(`${bk.building_code ? `${bk.building_code}-` : ''}${bk.room_no}`);
      }
      await pool.query(
        `INSERT INTO bill_items (bill_id, item_type, description, qty, unit_price, amount, meter_prev_reading_id, meter_curr_reading_id)
         VALUES ($1,'RENT',$2,$3,$4,$5,NULL,NULL)`,
        [
          bill.id,
          descParts.join(' • ') || 'Room rent',
          bk.is_monthly ? 1 : Math.max(1, nights),
          bk.is_monthly ? rentAmount : Number(Number(bk.base_rent_day || 0).toFixed(2)),
          rentAmount
        ]
      );
      return bill;
    } catch (e) {
      if (e.code === '23505') {
        attempt += 1;
        continue;
      }
      throw e;
    }
  }
  throw new Error('Unable to generate unique bill number for booking prepayment');
}



exports.list = async (req, res) => {
  try {
    const { status, tenant_id, room_id, q, ready_for_checkin } = req.query;
    const conds = [];
    const vals = [];
    let i = 1;

    if (status) {
      conds.push(`b.status = $${i++}`);
      vals.push(status);
    }
    if (tenant_id) {
      conds.push(`b.tenant_id = $${i++}`);
      vals.push(tenant_id);
    }
    if (room_id) {
      conds.push(`b.room_id = $${i++}`);
      vals.push(room_id);
    }

    if (q) {
      const qi = `%${String(q).toLowerCase()}%`;
      conds.push(`(LOWER(b.booking_code) LIKE LOWER($${i}) OR CAST(b.id AS text) LIKE LOWER($${i}) OR LOWER(u.username) LIKE LOWER($${i}))`);
      vals.push(qi);
      i++;
    }
    if (String(ready_for_checkin).toLowerCase() === 'true') {
      conds.push(`b.status = 'APPROVED'`);
      conds.push(`NOT EXISTS (
        SELECT 1 FROM tenancies t
        WHERE t.room_id = b.room_id
          AND t.tenant_id = b.tenant_id
          AND t.status IN ('ACTIVE','MOVING_OUT')
          AND NOT (b.end_date <= t.start_date OR b.start_date >= COALESCE(t.end_date, '9999-12-31'))
      )`);
      conds.push(`EXISTS (SELECT 1 FROM bills pb WHERE pb.booking_id = b.id)`);
      conds.push(`NOT EXISTS (
        SELECT 1
        FROM bills pb
        LEFT JOIN LATERAL (
          SELECT COALESCE(SUM(paid_amount), 0)::numeric AS total_paid
          FROM payments pm
          WHERE pm.bill_id = pb.id AND pm.status = 'CONFIRMED'
        ) pay ON true
        WHERE pb.booking_id = b.id
          AND (
            pb.total_amount > COALESCE(pay.total_paid, 0) + 0.009
            OR pb.status <> 'PAID'
          )
      )`);
    }
    const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";

    const sql = `
      SELECT b.*,
             u.username AS tenant_username,
             r.room_no,
             bld.code AS building_code,
             pre.prepayment_bill_id,
             pre.prepayment_bill_no,
             pre.prepayment_bill_status,
             pre.prepayment_total_amount,
             pre.prepayment_paid_amount,
             pre.prepayment_outstanding_amount,
             pre.prepayment_due_date
      FROM bookings b
      JOIN users u ON u.id = b.tenant_id
      LEFT JOIN rooms r ON r.id = b.room_id
      LEFT JOIN buildings bld ON bld.id = r.building_id
      LEFT JOIN LATERAL (
        SELECT
          pb.id AS prepayment_bill_id,
          pb.bill_no AS prepayment_bill_no,
          pb.status AS prepayment_bill_status,
          pb.total_amount::numeric AS prepayment_total_amount,
          pb.due_date AS prepayment_due_date,
          COALESCE(pay.total_paid, 0)::numeric AS prepayment_paid_amount,
          GREATEST(pb.total_amount - COALESCE(pay.total_paid, 0), 0)::numeric AS prepayment_outstanding_amount
        FROM bills pb
        LEFT JOIN LATERAL (
          SELECT COALESCE(SUM(paid_amount), 0)::numeric AS total_paid
          FROM payments pm
          WHERE pm.bill_id = pb.id AND pm.status = 'CONFIRMED'
        ) pay ON true
        WHERE pb.booking_id = b.id
        ORDER BY pb.issued_at DESC
        LIMIT 1
      ) pre ON true
      ${where}
      ORDER BY b.created_at DESC
    `;
    const result = await pool.query(sql, vals);
    return res.json(result.rows.map(serializeBookingRow));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.mine = async (req, res) => {
  try {
    const userId = req.user?.id;
    const result = await pool.query(
      `
      SELECT
        b.*,
        r.room_no,
        r.type AS room_type,
        bld.code AS building_code,
        t.id        AS tenancy_id,
        t.status    AS tenancy_status,
        t.start_date AS tenancy_start_date,
        t.end_date   AS tenancy_end_date,
        bills.bill_total_amount,
        bills.bill_paid_amount,
        bills.bill_outstanding_amount,
        bills.bill_count,
        bills.all_paid AS bills_all_paid,
        pre.prepayment_bill_id,
        pre.prepayment_bill_no,
        pre.prepayment_bill_status,
        pre.prepayment_total_amount,
        pre.prepayment_paid_amount,
        pre.prepayment_outstanding_amount,
        pre.prepayment_due_date
      FROM bookings b
      LEFT JOIN rooms r ON r.id = b.room_id
      LEFT JOIN buildings bld ON bld.id = r.building_id
      LEFT JOIN tenancies t ON t.booking_id = b.id
      LEFT JOIN LATERAL (
        SELECT
          COALESCE(SUM(bl.total_amount),0)::numeric AS bill_total_amount,
          COALESCE(SUM(paid.pay_sum),0)::numeric     AS bill_paid_amount,
          GREATEST(COALESCE(SUM(bl.total_amount),0) - COALESCE(SUM(paid.pay_sum),0), 0)::numeric AS bill_outstanding_amount,
          COUNT(*) AS bill_count,
          BOOL_AND(bl.status = 'PAID') AS all_paid
        FROM bills bl
        LEFT JOIN LATERAL (
          SELECT COALESCE(SUM(pm.paid_amount),0)::numeric AS pay_sum
          FROM payments pm
          WHERE pm.bill_id = bl.id
        ) paid ON true
        WHERE bl.tenancy_id = t.id
      ) bills ON true
      LEFT JOIN LATERAL (
        SELECT
          pb.id AS prepayment_bill_id,
          pb.bill_no AS prepayment_bill_no,
          pb.status AS prepayment_bill_status,
          pb.total_amount::numeric AS prepayment_total_amount,
          pb.due_date AS prepayment_due_date,
          COALESCE(pay.total_paid, 0)::numeric AS prepayment_paid_amount,
          GREATEST(pb.total_amount - COALESCE(pay.total_paid, 0), 0)::numeric AS prepayment_outstanding_amount
        FROM bills pb
        LEFT JOIN LATERAL (
          SELECT COALESCE(SUM(paid_amount), 0)::numeric AS total_paid
          FROM payments pm
          WHERE pm.bill_id = pb.id AND pm.status = 'CONFIRMED'
        ) pay ON true
        WHERE pb.booking_id = b.id
        ORDER BY pb.issued_at DESC
        LIMIT 1
      ) pre ON true
      WHERE b.tenant_id = $1
      ORDER BY b.created_at DESC
      `,
      [userId]
    );
    return res.json(result.rows.map(serializeBookingRow));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.create = async (req, res) => {
  try {
    const tenantId = req.user?.id;
    let { room_id, start_date, end_date, is_monthly, note } = req.body;

    if (
      !room_id ||
      !start_date ||
      !end_date ||
      typeof is_monthly !== "boolean"
    ) {
      return res.status(400).json({
        message: "room_id, start_date, end_date, is_monthly required",
      });
    }

    if (new Date(start_date) >= new Date(end_date)) {
      return res
        .status(400)
        .json({ message: "end_date must be after start_date" });
    }

    const roomRs = await pool.query(`SELECT id, sell_type, room_no, status FROM rooms WHERE id=$1`, [room_id]);
    if (roomRs.rowCount === 0) {
      return res.status(400).json({ message: "Invalid room_id" });
    }
    const room = roomRs.rows[0];
    if (String(room.status || '').toUpperCase() === 'MAINTENANCE') {
      return res.status(400).json({ message: 'Room is under maintenance and unavailable for booking' });
    }
    const requiredSellType = is_monthly ? "MONTHLY" : "DAILY";
    if (String(room.sell_type).toUpperCase() !== requiredSellType) {
      return res.status(400).json({ message: `Room is locked for ${room.sell_type} bookings` });
    }

    const conflict = await hasConflict(room_id, start_date, end_date);
    if (conflict) {
      return res
        .status(400)
        .json({ message: "Room is not available in this period" });
    }

    let holdExpiresAt = null;
    if (!is_monthly) {
      holdExpiresAt = new Date(Date.now() + 30 * 60 * 1000);
    }

    const booking_code = await genBookingCode(is_monthly ? 'MONTHLY' : 'DAILY');
    const result = await pool.query(
      `
      INSERT INTO bookings
      (room_id, tenant_id, start_date, end_date, is_monthly, status, hold_expires_at, note, sell_type, booking_code)
      VALUES ($1,$2,$3,$4,$5,'PENDING',$6,$7,$8,$9)
      RETURNING *
      `,
      [
        room_id,
        tenantId,
        start_date,
        end_date,
        is_monthly,
        holdExpiresAt,
        note || null,
        requiredSellType,
        booking_code
      ]
    );

    const created = result.rows[0];
    log({ actor_user_id: req.user?.id, action: 'BOOKING_CREATE', entity_type: 'BOOKING', entity_id: created.id, details: { type: 'WALKIN', room_id } });
    try {
      const { notify } = require('../utils/notifications');
      const staffRes = await pool.query(`SELECT id FROM users WHERE UPPER(role) IN ('ADMIN','MANAGER')`);
      if (staffRes.rowCount) {
        const actorName = req.user?.username ? `Tenant ${req.user.username}` : 'A tenant';
        const roomLabel = room?.room_no ? `room ${room.room_no}` : `room ${room_id}`;
        const message = `${actorName} requested a booking for ${roomLabel} (${created.booking_code}).`;
        await Promise.all(
          staffRes.rows
            .filter((u) => String(u.id) !== String(tenantId))
            .map((u) =>
              notify({
                user_id: u.id,
                title: 'New booking request',
                body: message,
                type: 'BOOKING',
                link: '/bookingmanagement',
              })
            )
        );
      }
    } catch (_) {}
    return res.status(201).json(created);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.createOnline = async (req, res) => {
  try {
    const tenantId = req.user?.id;
    const role = String(req.user?.role || '').toUpperCase();
    if (!tenantId) return res.status(401).json({ message: 'Unauthorized' });
    if (role !== 'TENANT') {
      return res.status(403).json({ message: 'Only tenants can submit online bookings' });
    }

    let { room_type, sell_type, start_date, end_date, note } = req.body;
    if (!sell_type || !start_date || !end_date) {
      return res.status(400).json({ message: 'sell_type, start_date, end_date required' });
    }
    const dup = await pool.query(`SELECT 1 FROM bookings WHERE tenant_id=$1 AND status='PENDING' LIMIT 1`, [tenantId]);
    if (dup.rowCount) return res.status(400).json({ message: 'You already have a pending booking' });
    if (new Date(start_date) >= new Date(end_date)) {
      return res.status(400).json({ message: 'end_date must be after start_date' });
    }
    const st = String(sell_type).toUpperCase();
    if (!['DAILY','MONTHLY'].includes(st)) {
      return res.status(400).json({ message: 'sell_type must be DAILY or MONTHLY' });
    }
    const isMonthly = st === 'MONTHLY';
    const params = [start_date, end_date, st];
    let typeCondRooms = '';
    let typeCondQueued = '';
    if (room_type) {
      params.push(String(room_type).toUpperCase());
      typeCondRooms = ` AND UPPER(r.type) = $${params.length}`;
      typeCondQueued = ` AND UPPER(COALESCE(b.room_type,'')) = $${params.length}`;
    }
    const freeQ = await pool.query(
      `SELECT COUNT(*)::int AS cnt
       FROM rooms r
       WHERE UPPER(r.sell_type) = $3
         AND UPPER(COALESCE(r.status,'')) <> 'MAINTENANCE'
         ${typeCondRooms}
         AND NOT EXISTS (
           SELECT 1 FROM bookings bk
           WHERE bk.room_id = r.id
             AND bk.status IN ('PENDING','APPROVED','CHECKED_IN')
             AND NOT ($2 <= bk.start_date OR $1 >= bk.end_date)
         )
         AND NOT EXISTS (
           SELECT 1 FROM tenancies t
           WHERE t.room_id = r.id
             AND t.status IN ('ACTIVE','MOVING_OUT')
             AND NOT ($2 <= t.start_date OR $1 >= COALESCE(t.end_date, '9999-12-31'))
         )`,
      params
    );
    const freeRooms = Number(freeQ.rows[0]?.cnt || 0);
    const queuedQ = await pool.query(
      `SELECT COUNT(*)::int AS cnt
       FROM bookings b
       WHERE b.room_id IS NULL AND b.status='PENDING'
         AND UPPER(COALESCE(b.sell_type, CASE WHEN b.is_monthly THEN 'MONTHLY' ELSE 'DAILY' END)) = $3
         ${typeCondQueued}
         AND NOT ($2 <= b.start_date OR $1 >= b.end_date)`,
      params
    );
    const queued = Number(queuedQ.rows[0]?.cnt || 0);
    if (freeRooms - queued <= 0) {
      return res.status(400).json({ message: 'No capacity for the requested type/period' });
    }
    const holdExpiresAt = !isMonthly ? new Date(Date.now() + 30 * 60 * 1000) : null;
    const booking_code = await genBookingCode(isMonthly ? 'MONTHLY' : 'DAILY');
    const rs = await pool.query(
      `INSERT INTO bookings (room_id, room_type, sell_type, tenant_id, start_date, end_date, is_monthly, status, hold_expires_at, note, booking_code)
       VALUES (NULL,$1,$2,$3,$4,$5,$6,'PENDING',$7,$8,$9)
       RETURNING *`,
      [room_type || null, st, tenantId, start_date, end_date, isMonthly, holdExpiresAt, note || null, booking_code]
    );
    const createdOnline = rs.rows[0];
    log({
      actor_user_id: tenantId,
      action: 'BOOKING_CREATE',
      entity_type: 'BOOKING',
      entity_id: createdOnline.id,
      details: { type: 'ONLINE' }
    });
    try {
      const { notify } = require('../utils/notifications');
      const staffRes = await pool.query(`SELECT id FROM users WHERE UPPER(role) IN ('ADMIN','MANAGER')`);
      if (staffRes.rowCount) {
        const actorName = req.user?.username ? `Tenant ${req.user.username}` : 'A tenant';
        const bookingRef = createdOnline.booking_code || createdOnline.id;
        const message = `${actorName} submitted an online booking (${bookingRef}).`;
        await Promise.all(
          staffRes.rows
            .filter((u) => String(u.id) !== String(tenantId))
            .map((u) =>
              notify({
                user_id: u.id,
                title: 'New online booking',
                body: message,
                type: 'BOOKING',
                link: '/bookingmanagement',
              })
            )
        );
      }
    } catch (_) {}
    return res.status(201).json(createdOnline);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.createForTenant = async (req, res) => {
  try {
    const { tenant_id, room_id, start_date, end_date, is_monthly, note } = req.body;
    const role = String(req.user?.role || '').toUpperCase();
    if (['ADMIN','MANAGER'].includes(role) && req.user?.id && String(req.user.id) === String(tenant_id)) {
      return res.status(400).json({ message: 'Staff cannot create walk-in bookings for themselves' });
    }
    if (!tenant_id || !room_id || !start_date || !end_date || typeof is_monthly !== 'boolean') {
      return res.status(400).json({ message: 'tenant_id, room_id, start_date, end_date, is_monthly required' });
    }
    if (new Date(start_date) >= new Date(end_date)) {
      return res.status(400).json({ message: 'end_date must be after start_date' });
    }
    const roomRs = await pool.query(`SELECT id, sell_type, status FROM rooms WHERE id=$1`, [room_id]);
    if (roomRs.rowCount === 0) return res.status(400).json({ message: 'Invalid room_id' });
    const room = roomRs.rows[0];
    if (String(room.status || '').toUpperCase() === 'MAINTENANCE') {
      return res.status(400).json({ message: 'Room is under maintenance and unavailable for booking' });
    }
    const requiredSellType = is_monthly ? 'MONTHLY' : 'DAILY';
    if (String(room.sell_type).toUpperCase() !== requiredSellType) {
      return res.status(400).json({ message: `Room is locked for ${room.sell_type} bookings` });
    }
    const conflict = await hasConflict(room_id, start_date, end_date);
    if (conflict) return res.status(400).json({ message: 'Room is not available in this period' });

    const holdExpiresAt = !is_monthly ? new Date(Date.now() + 30 * 60 * 1000) : null;
    const booking_code = await genBookingCode(is_monthly ? 'MONTHLY' : 'DAILY');
    const result = await pool.query(
      `INSERT INTO bookings (room_id, tenant_id, start_date, end_date, is_monthly, status, hold_expires_at, note, sell_type, booking_code)
       VALUES ($1,$2,$3,$4,$5,'PENDING',$6,$7,$8,$9)
       RETURNING *` ,
      [room_id, tenant_id, start_date, end_date, is_monthly, holdExpiresAt, note || null, requiredSellType, booking_code]
    );
    const created = result.rows[0];
    log({ actor_user_id: req.user?.id, action: 'BOOKING_CREATE', entity_type: 'BOOKING', entity_id: created.id, details: { type: 'WALKIN', room_id, tenant_id } });
    return res.status(201).json(created);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.approve = async (req, res) => {
  try {
    const id = req.params.id;
    const approverId = req.user?.id;

    const b = await pool.query(`SELECT * FROM bookings WHERE id=$1`, [id]);
    if (b.rowCount === 0) {
      return res.status(404).json({ message: "Not found" });
    }

    const bk = b.rows[0];
    if (bk.status !== "PENDING") {
      return res
        .status(400)
        .json({ message: "Only PENDING bookings can be approved" });
    }

    if (!bk.room_id) {
      return res.status(400).json({ message: "Allocate a room before approval" });
    }

    const conflict = await hasConflict(bk.room_id, bk.start_date, bk.end_date, bk.id);
    if (conflict) {
      return res.status(400).json({ message: "Room now unavailable" });
    }

    const result = await pool.query(
      `
      UPDATE bookings
      SET status='APPROVED', approved_by=$2, approved_at=now(), updated_at=now()
      WHERE id=$1
      RETURNING *
      `,
      [id, approverId]
    );

    const approved = result.rows[0];
    let bill = null;
    try {
      bill = await ensurePrepaymentBill(approved.id);
      if (bill) {
        approved.prepayment_bill_id = bill.id;
        approved.prepayment_bill_no = bill.bill_no;
        approved.prepayment_bill_status = bill.status;
        approved.prepayment_total_amount = Number(bill.total_amount || 0);
        approved.prepayment_paid_amount = 0;
        approved.prepayment_outstanding_amount = Number(bill.total_amount || 0);
        approved.prepayment_due_date = bill.due_date;
      }
    } catch (e) {
      console.error('Failed to ensure prepayment bill', e);
      return res.status(500).json({ message: 'Booking approved but failed to issue payment request. Please retry.' });
    }

    log({ actor_user_id: approverId, action: 'BOOKING_APPROVE', entity_type: 'BOOKING', entity_id: approved.id });
    try {
      const { notify } = require('../utils/notifications');
      await notify({ user_id: approved.tenant_id, title: 'Booking approved', body: `Your booking ${approved.booking_code || approved.id} has been approved.`, type: 'BOOKING', link: `/my-bookings` });
      if (bill) {
        await notify({
          user_id: approved.tenant_id,
          title: 'Payment required',
          body: `Please pay ${Number(bill.total_amount || 0).toFixed(2)} before check-in for booking ${approved.booking_code || approved.id}.`,
          type: 'BILL',
          link: `/my-billing`
        });
      }
    } catch (_) {}
    return res.json(serializeBookingRow(approved));
  } catch (err) {
    console.log(err);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.reject = async (req, res) => {
  try {
    const id = req.params.id;
    const { reason } = req.body;
    const b = await pool.query(`SELECT * FROM bookings WHERE id=$1`, [id]);
    if (b.rowCount === 0) {
      return res.status(404).json({ message: "Not found" });
    }
    if (b.rows[0].status !== "PENDING") {
      return res
        .status(400)
        .json({ message: "Only PENDING bookings can be rejected" });
    }

    const result = await pool.query(
      `
      UPDATE bookings
      SET status='REJECTED', cancel_reason=$2, updated_at=now()
      WHERE id=$1
      RETURNING *
      `,
      [id, reason || null]
    );
    const rej = result.rows[0];
    try {
      const { notify } = require('../utils/notifications');
      await notify({ user_id: rej.tenant_id, title: 'Booking rejected', body: `Your booking ${rej.id} was rejected.`, type: 'BOOKING', link: `/my-bookings` });
    } catch (_) {}
    return res.json(serializeBookingRow(rej));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.cancel = async (req, res) => {
  try {
    const id = req.params.id;
    const { reason } = req.body;

    const b = await pool.query(`SELECT * FROM bookings WHERE id=$1`, [id]);
    if (b.rowCount === 0) {
      return res.status(404).json({ message: "Not found" });
    }
    const bk = b.rows[0];

    const role = String(req.user?.role || '').toUpperCase();
    if (role === 'TENANT') {
      if (bk.status !== 'PENDING') {
        return res.status(403).json({ message: 'Tenants can cancel only PENDING bookings' });
      }
    } else {
      if (!["PENDING", "APPROVED"].includes(bk.status)) {
        return res.status(400).json({ message: "Cannot cancel this booking" });
      }
    }

    const result = await pool.query(
      `
      UPDATE bookings
      SET status='CANCELLED', cancelled_at=now(), cancel_reason=$2
      WHERE id=$1
      RETURNING *
      `,
      [id, reason || null]
    );
    const cancelled = result.rows[0];
    log({ actor_user_id: req.user?.id, action: 'BOOKING_CANCEL', entity_type: 'BOOKING', entity_id: cancelled.id, details: { reason } });
    try {
      const { notify } = require('../utils/notifications');
      await notify({ user_id: cancelled.tenant_id, title: 'Booking cancelled', body: `Your booking ${cancelled.id} was cancelled.`, type: 'BOOKING', link: `/my-bookings` });
    } catch (_) {}
    return res.json(serializeBookingRow(cancelled));
  } catch (err) {
    console.error(err)
    return res.status(500).json({ message: "Server error"})
  }
};

exports.allocate = async (req, res) => {
  try {
    const id = req.params.id;
    const { room_id } = req.body;
    if (!room_id) return res.status(400).json({ message: 'room_id required' });

    const b = await pool.query(`SELECT * FROM bookings WHERE id=$1`, [id]);
    if (b.rowCount === 0) return res.status(404).json({ message: 'Not found' });
    const bk = b.rows[0];
    if (bk.status !== 'PENDING') return res.status(400).json({ message: 'Only PENDING booking can be allocated' });
    if (bk.room_id) return res.status(400).json({ message: 'Booking already has a room' });

    const roomRs = await pool.query(`SELECT id, sell_type, status FROM rooms WHERE id=$1`, [room_id]);
    if (roomRs.rowCount === 0) return res.status(400).json({ message: 'Invalid room_id' });
    const room = roomRs.rows[0];
    if (String(room.status || '').toUpperCase() === 'MAINTENANCE') {
      return res.status(400).json({ message: 'Selected room is under maintenance' });
    }

    const requiredSellType = (bk.sell_type ? String(bk.sell_type).toUpperCase() : (bk.is_monthly ? 'MONTHLY' : 'DAILY'));
    if (String(room.sell_type).toUpperCase() !== requiredSellType) {
      return res.status(400).json({ message: `Room is locked for ${room.sell_type} bookings` });
    }

    const conflict = await hasConflict(room_id, bk.start_date, bk.end_date);
    if (conflict) return res.status(400).json({ message: 'Room is not available in this period' });

    const up = await pool.query(
      `UPDATE bookings SET room_id=$2, updated_at=now() WHERE id=$1 RETURNING *`,
      [id, room_id]
    );
    const allocated = up.rows[0];
    log({ actor_user_id: req.user?.id, action: 'BOOKING_ALLOCATE', entity_type: 'BOOKING', entity_id: allocated.id, details: { room_id } });
    return res.json(serializeBookingRow(allocated));
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.allocatableRooms = async (req, res) => {
  try {
    const id = req.params.id;
    const bq = await pool.query(`SELECT * FROM bookings WHERE id=$1`, [id]);
    if (!bq.rowCount) return res.status(404).json({ message: 'Not found' });
    const bk = bq.rows[0];
    if (bk.status !== 'PENDING') return res.status(400).json({ message: 'Only PENDING booking can be allocated' });

    const requiredSellType = (bk.sell_type ? String(bk.sell_type).toUpperCase() : (bk.is_monthly ? 'MONTHLY' : 'DAILY'));

    const requiredRoomType = bk.room_type ? String(bk.room_type).toUpperCase() : null;

    const rs = await pool.query(
      `SELECT r.*, b.code AS building_code, b.name AS building_name
      FROM rooms r
      JOIN buildings b ON b.id = r.building_id
      WHERE UPPER(r.sell_type) = $3
        AND UPPER(COALESCE(r.status,'')) <> 'MAINTENANCE'
        AND ($4::text IS NULL OR UPPER(r.type) = $4)
        AND NOT EXISTS (
          SELECT 1 FROM bookings ob
          WHERE ob.room_id = r.id
            AND ob.status IN ('PENDING','APPROVED','CHECKED_IN')
             AND NOT ($2 <= ob.start_date OR $1 >= ob.end_date)
         )
         AND NOT EXISTS (
           SELECT 1 FROM tenancies t
           WHERE t.room_id = r.id
             AND t.status IN ('ACTIVE','MOVING_OUT')
             AND NOT ($2 <= t.start_date OR $1 >= COALESCE(t.end_date, '9999-12-31'))
         )
       ORDER BY b.code ASC, r.room_no ASC`,
      [bk.start_date, bk.end_date, requiredSellType, requiredRoomType]
    );
    return res.json(rs.rows);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.reallocate = async (req, res) => {
  try {
    const id = req.params.id;
    const { room_id } = req.body;
    if (!room_id) return res.status(400).json({ message: 'room_id required' });
    const b = await pool.query(`SELECT * FROM bookings WHERE id=$1`, [id]);
    if (!b.rowCount) return res.status(404).json({ message: 'Not found' });
    const bk = b.rows[0];
    if (!['PENDING','APPROVED'].includes(String(bk.status).toUpperCase())) {
      return res.status(400).json({ message: 'Only PENDING/APPROVED can be reallocated' });
    }
    const roomRs = await pool.query(`SELECT id, sell_type, type, status FROM rooms WHERE id=$1`, [room_id]);
    if (roomRs.rowCount === 0) return res.status(400).json({ message: 'Invalid room_id' });
    const room = roomRs.rows[0];
    if (String(room.status || '').toUpperCase() === 'MAINTENANCE') {
      return res.status(400).json({ message: 'Selected room is under maintenance' });
    }
    const requiredSellType = (bk.sell_type ? String(bk.sell_type).toUpperCase() : (bk.is_monthly ? 'MONTHLY' : 'DAILY'));
    if (String(room.sell_type).toUpperCase() !== requiredSellType) {
      return res.status(400).json({ message: `Room is locked for ${room.sell_type} bookings` });
    }
    const requiredRoomType = bk.room_type ? String(bk.room_type).toUpperCase() : null;
    if (requiredRoomType && String(room.type).toUpperCase() !== requiredRoomType) {
      return res.status(400).json({ message: `Room type must be ${requiredRoomType}` });
    }
    const conflict = await hasConflict(room_id, bk.start_date, bk.end_date, bk.id);
    if (conflict) return res.status(400).json({ message: 'Room is not available in this period' });
    const up = await pool.query(`UPDATE bookings SET room_id=$2, updated_at=now() WHERE id=$1 RETURNING *`, [id, room_id]);
    const updated = up.rows[0];
    if (String(updated.status || '').toUpperCase() === 'APPROVED') {
      const billRs = await pool.query(
        `SELECT pb.id,
                pb.bill_no,
                pb.status,
                pb.total_amount::numeric AS total_amount,
                COALESCE(pay.total_paid, 0)::numeric AS total_paid
         FROM bills pb
         LEFT JOIN LATERAL (
           SELECT COALESCE(SUM(paid_amount), 0)::numeric AS total_paid
           FROM payments pm
           WHERE pm.bill_id = pb.id AND pm.status = 'CONFIRMED'
         ) pay ON true
         WHERE pb.booking_id = $1`,
        [id]
      );
      for (const row of billRs.rows) {
        const totalPaid = Number(row.total_paid || 0);
        const totalAmount = Number(row.total_amount || 0);
        const outstanding = Math.max(0, Number((totalAmount - totalPaid).toFixed(2)));
        if (totalPaid > 0.009) {
          updated.prepayment_bill_id = row.id;
          updated.prepayment_bill_no = row.bill_no;
          updated.prepayment_total_amount = totalAmount;
          updated.prepayment_paid_amount = totalPaid;
          updated.prepayment_outstanding_amount = outstanding;
          updated.prepayment_bill_status = outstanding <= 0.009 ? 'PAID' : (totalPaid > 0.009 ? 'PARTIAL' : row.status);
          continue;
        }
        await pool.query(`DELETE FROM bills WHERE id = $1`, [row.id]);
      }
      try {
        const bill = await ensurePrepaymentBill(id);
        if (bill) {
          updated.prepayment_bill_id = bill.id;
          updated.prepayment_bill_no = bill.bill_no;
          updated.prepayment_bill_status = bill.status;
          updated.prepayment_total_amount = Number(bill.total_amount || 0);
          updated.prepayment_paid_amount = 0;
          updated.prepayment_outstanding_amount = Number(bill.total_amount || 0);
          updated.prepayment_due_date = bill.due_date;
        }
      } catch (e) {
        console.error('Failed to refresh prepayment bill after reallocate', e);
      }
    }
    log({ actor_user_id: req.user?.id, action: 'BOOKING_REALLOCATE', entity_type: 'BOOKING', entity_id: updated.id, details: { room_id } });
    return res.json(serializeBookingRow(updated));
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.readyForCheckInCount = async (req, res) => {
  try {
    const rs = await pool.query(
      `
      SELECT COUNT(*)::int AS cnt
      FROM bookings b
      WHERE b.status = 'APPROVED'
        AND NOT EXISTS (
          SELECT 1
          FROM tenancies t
          WHERE t.room_id = b.room_id
            AND t.tenant_id = b.tenant_id
            AND t.status IN ('ACTIVE','MOVING_OUT')
            AND NOT (b.end_date <= t.start_date OR b.start_date >= COALESCE(t.end_date, '9999-12-31'))
        )
        AND EXISTS (SELECT 1 FROM bills pb WHERE pb.booking_id = b.id)
        AND NOT EXISTS (
          SELECT 1
          FROM bills pb
          LEFT JOIN LATERAL (
            SELECT COALESCE(SUM(paid_amount), 0)::numeric AS total_paid
            FROM payments pm
            WHERE pm.bill_id = pb.id AND pm.status = 'CONFIRMED'
          ) pay ON true
          WHERE pb.booking_id = b.id
            AND (
              pb.total_amount > COALESCE(pay.total_paid, 0) + 0.009
              OR pb.status <> 'PAID'
            )
        )
      `
    );
    return res.json({ count: rs.rows[0]?.cnt || 0 });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.pendingCount = async (req, res) => {
  try {
    const rs = await pool.query(
      `SELECT COUNT(*)::int AS cnt FROM bookings WHERE status = 'PENDING'`
    );
    return res.json({ count: rs.rows[0]?.cnt || 0 });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Server error' });
  }
};
