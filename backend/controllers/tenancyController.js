const pool = require("../config/db");
const { log } = require('../utils/activityLogger');
const { get: getSetting } = require('./settingsController');
const { generateBillIdentity } = require('../utils/billIdentity');
const {
  toDateOnly,
  dateToISO,
  nightsInclusive,
  firstDayOfMonthUTC,
  lastDayOfMonthUTC
} = require('../utils/dateHelpers');

async function usageForBillingMonth(roomId, type, billingMonthIso) {
  const normalizedType = String(type).toUpperCase();
  const monthDate = toDateOnly(billingMonthIso);
  if (!monthDate) {
    const err = new Error('Invalid billing month supplied for usage calculation.');
    err.status = 400;
    throw err;
  }
  const billingMonth = dateToISO(firstDayOfMonthUTC(monthDate));

  const currRs = await pool.query(
    `SELECT id, ai_value, value_unit
       FROM meter_readings
      WHERE room_id=$1 AND type=$2 AND billing_month=$3
      ORDER BY reading_date DESC, created_at DESC
      LIMIT 1`,
    [roomId, normalizedType, billingMonth]
  );
  if (!currRs.rowCount) {
    const err = new Error(`No ${type.toLowerCase()} reading available for billing month ${billingMonth}.`);
    err.status = 400;
    throw err;
  }
  const current = currRs.rows[0];

  const prevRs = await pool.query(
    `SELECT id, ai_value, value_unit
       FROM meter_readings
      WHERE room_id=$1 AND type=$2 AND billing_month < $3
      ORDER BY billing_month DESC, reading_date DESC, created_at DESC
      LIMIT 1`,
    [roomId, normalizedType, billingMonth]
  );
  const previous = prevRs.rows[0] || null;

  const currentUsageCandidate = Number(current.value_unit);
  let usage = Number.isFinite(currentUsageCandidate) ? Number(currentUsageCandidate.toFixed(3)) : null;

  const currentReadingValue =
    current.ai_value !== null && current.ai_value !== undefined
      ? Number(Number(current.ai_value).toFixed(3))
      : null;
  const previousReadingValue =
    previous && previous.ai_value !== null && previous.ai_value !== undefined
      ? Number(Number(previous.ai_value).toFixed(3))
      : null;

  if (!Number.isFinite(usage) && currentReadingValue !== null) {
    usage =
      previousReadingValue !== null
        ? Number((currentReadingValue - previousReadingValue).toFixed(3))
        : currentReadingValue;
  }

  if (!Number.isFinite(usage)) {
    const err = new Error(`Unable to determine ${type.toLowerCase()} usage for billing month ${billingMonth}.`);
    err.status = 400;
    throw err;
  }

  if (usage < 0) {
    const err = new Error(`${type} usage calculated as negative. Please verify the meter readings.`);
    err.status = 400;
    throw err;
  }

  const duplicateCheck = await pool.query(
    `SELECT 1 FROM bill_items WHERE meter_curr_reading_id = $1 LIMIT 1`,
    [current.id]
  );
  if (duplicateCheck.rowCount) {
    const err = new Error(`${type} reading has already been used for billing.`);
    err.status = 400;
    throw err;
  }

  return {
    usage,
    previousReadingId: previous?.id || null,
    previousReadingValue,
    currentReadingId: current.id,
    currentReadingValue
  };
}

function hydrateTenancy(row) {
  if (!row) return row;
  const {
    booking_checked_in_at,
    booking_checked_out_at,
    ...rest
  } = row;
  const checkedIn =
    rest.checked_in_at ||
    booking_checked_in_at ||
    null;
  const checkedOut =
    rest.checked_out_at ||
    booking_checked_out_at ||
    null;
  return {
    ...rest,
    checked_in_at: checkedIn,
    checked_out_at: checkedOut
  };
}

exports.createFromBooking = async (req, res) => {
  try {
    const { booking_id } = req.body;
    if (!booking_id) return res.status(400).json({ message: "booking_id is required" });

    const bq = await pool.query(`SELECT * FROM bookings WHERE id=$1`, [booking_id]);
    if (bq.rowCount === 0) return res.status(404).json({ message: "Booking not found" });
    const bk = bq.rows[0];

    if (bk.status !== "APPROVED") {
      return res.status(400).json({ message: "Only APPROVED booking can start tenancy" });
    }
    const prepayRs = await pool.query(
      `
      SELECT
        pb.id,
        pb.status,
        pb.total_amount::numeric AS total_amount,
        COALESCE(pay.total_paid, 0)::numeric AS total_paid
      FROM bills pb
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(paid_amount), 0)::numeric AS total_paid
        FROM payments pm
        WHERE pm.bill_id = pb.id AND pm.status = 'CONFIRMED'
      ) pay ON true
      WHERE pb.booking_id = $1
      `,
      [booking_id]
    );
    if (!prepayRs.rowCount) {
      return res.status(400).json({ message: "Pre-checkin invoice not issued yet" });
    }
    const unpaid = prepayRs.rows.find((row) => {
      const totalAmount = Number(row.total_amount || 0);
      const totalPaid = Number(row.total_paid || 0);
      const outstanding = Math.max(0, Number((totalAmount - totalPaid).toFixed(2)));
      if (totalAmount <= 0.01) return false;
      if (outstanding > 0.01) return true;
      return String(row.status || '').toUpperCase() !== 'PAID';
    });
    if (unpaid) {
      return res.status(400).json({ message: "Full payment required before check-in" });
    }

    const conflict = await pool.query(
      `
      SELECT 1 FROM tenancies t
      WHERE t.room_id = $1
        AND t.status IN ('ACTIVE','MOVING_OUT')
        AND NOT ($3 <= t.start_date OR $2 >= COALESCE(t.end_date,'9999-12-31'))
      LIMIT 1
      `,
      [bk.room_id, bk.start_date, bk.end_date]
    );
    if (conflict.rowCount) {
      return res.status(400).json({ message: "Room already occupied in this period" });
    }

    await pool.query("BEGIN");

    const tq = await pool.query(
      `
      INSERT INTO tenancies
      (room_id, tenant_id, start_date, end_date, is_monthly, status, booking_id)
      VALUES ($1,$2,$3,$4,$5,'ACTIVE',$6)
      RETURNING *
      `,
      [bk.room_id, bk.tenant_id, bk.start_date, bk.end_date, bk.is_monthly, booking_id]
    );
    const tenancy = tq.rows[0];

    await pool.query(
      `UPDATE rooms SET status='OCCUPIED' WHERE id=$1`,
      [bk.room_id]
    );

    try {
      await pool.query(
        `UPDATE bookings
           SET checked_in_at = now(),
               status = 'CHECKED_IN'
         WHERE id = $1`,
        [booking_id]
      );
    } catch (e) {
      if (e.code !== '42703') throw e;
    }

    await pool.query("COMMIT");
    const full = await pool.query(
      `SELECT
         t.*,
         r.room_no,
         b.code AS building_code,
         u.username AS tenant_username,
         u.full_name AS tenant_full_name,
         u.phone AS tenant_phone,
         bk.booking_code,
         bk.checked_in_at AS booking_checked_in_at,
         bk.checked_out_at AS booking_checked_out_at
       FROM tenancies t
       JOIN rooms r ON r.id = t.room_id
       JOIN buildings b ON b.id = r.building_id
       JOIN users u ON u.id = t.tenant_id
       LEFT JOIN bookings bk ON bk.id = t.booking_id
       WHERE t.id=$1`,
      [tenancy.id]
    );
    log({ actor_user_id: req.user?.id, action: 'TENANCY_START', entity_type: 'TENANCY', entity_id: tenancy.id, details: { booking_id } });
    return res.status(201).json(hydrateTenancy(full.rows[0]));
  } catch (e) {
    await pool.query("ROLLBACK").catch(()=>{});
    console.error(e);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.list = async (req, res) => {
  try {
    const { status, tenant_id, room_id } = req.query;
    const conds = [];
    const vals = [];
    let i = 1;

    if (status)    { conds.push(`t.status = $${i++}`);    vals.push(status); }
    if (tenant_id) { conds.push(`t.tenant_id = $${i++}`); vals.push(tenant_id); }
    if (room_id)   { conds.push(`t.room_id = $${i++}`);   vals.push(room_id); }

    const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
    const rs = await pool.query(
      `
      SELECT
        t.*,
        r.room_no,
        b.code AS building_code,
        u.username AS tenant_username,
        u.full_name AS tenant_full_name,
        u.phone AS tenant_phone,
        bk.booking_code,
        bk.checked_in_at AS booking_checked_in_at,
        bk.checked_out_at AS booking_checked_out_at
      FROM tenancies t
      JOIN rooms r ON r.id = t.room_id
      JOIN buildings b ON b.id = r.building_id
      JOIN users u ON u.id = t.tenant_id
      LEFT JOIN bookings bk ON bk.id = t.booking_id
      ${where}
      ORDER BY t.created_at DESC
      `,
      vals
    );
    return res.json(rs.rows.map(hydrateTenancy));
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.activeCountMine = async (req, res) => {
  try {
    const userId = req.user?.id;
    const rs = await pool.query(
      `SELECT COUNT(*)::int AS cnt FROM tenancies WHERE tenant_id=$1 AND status IN ('ACTIVE','MOVING_OUT')`,
      [userId]
    );
    return res.json({ count: Number(rs.rows[0]?.cnt || 0) });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.listMyRooms = async (req, res) => {
  try {
    const userId = req.user?.id;
    const rs = await pool.query(
      `
      SELECT
        t.id   AS tenancy_id,
        t.status AS tenancy_status,
        r.id   AS room_id,
        r.room_no,
        r.sell_type,
        b.code AS building_code
      FROM tenancies t
      JOIN rooms r ON r.id = t.room_id
      JOIN buildings b ON b.id = r.building_id
      WHERE t.tenant_id = $1
        AND t.status IN ('ACTIVE','MOVING_OUT')
      ORDER BY b.code ASC, r.room_no ASC
      `,
      [userId]
    );
    return res.json(rs.rows);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.markMovingOut = async (req, res) => {
  try {
    const { id } = req.params;
    const rs = await pool.query(
      `
      UPDATE tenancies
      SET status='MOVING_OUT'
      WHERE id=$1 AND status='ACTIVE'
      RETURNING *
      `,
      [id]
    );
    if (rs.rowCount === 0) {
      return res.status(400).json({ message: "Only ACTIVE tenancy can be marked moving out" });
    }
    const moved = rs.rows[0];
    const full = await pool.query(
      `SELECT
         t.*,
         r.room_no,
         b.code AS building_code,
         u.username AS tenant_username,
         u.full_name AS tenant_full_name,
         u.phone AS tenant_phone,
         bk.booking_code,
         bk.checked_in_at AS booking_checked_in_at,
         bk.checked_out_at AS booking_checked_out_at
       FROM tenancies t
       JOIN rooms r ON r.id = t.room_id
       JOIN buildings b ON b.id = r.building_id
       JOIN users u ON u.id = t.tenant_id
       LEFT JOIN bookings bk ON bk.id = t.booking_id
       WHERE t.id=$1`,
      [moved.id]
    );
    log({ actor_user_id: req.user?.id, action: 'TENANCY_MOVING_OUT', entity_type: 'TENANCY', entity_id: moved.id });
    return res.json(hydrateTenancy(full.rows[0]));
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.end = async (req, res) => {
  try {
    const { id } = req.params;
    const { end_date } = req.body;

    const tq = await pool.query(`SELECT * FROM tenancies WHERE id=$1`, [id]);
    if (tq.rowCount === 0) return res.status(404).json({ message: "Not found" });
    const t = tq.rows[0];
    if (!['ACTIVE','MOVING_OUT'].includes(t.status)) {
      return res.status(400).json({ message: "Only ACTIVE/MOVING_OUT can be ended" });
    }

    await pool.query("BEGIN");

    const endDate = end_date || new Date().toISOString().slice(0,10);
    const up = await pool.query(
      `
      UPDATE tenancies
      SET status='ENDED', end_date=$2
      WHERE id=$1
      RETURNING *
      `,
      [id, endDate]
    );
    const ended = up.rows[0];

    try {
      const WATER_RATE = Number((await getSetting('WATER_RATE')) ?? process.env.WATER_RATE ?? 0);
      const ELECTRIC_RATE = Number((await getSetting('ELECTRIC_RATE')) ?? process.env.ELECTRIC_RATE ?? 0);
      const endDateObj = toDateOnly(endDate);
      const tenancyStart = toDateOnly(t.start_date) || endDateObj;
      let periodStartDate = tenancyStart;
      let periodEndDate = endDateObj;
      if (t.is_monthly) {
        periodStartDate = firstDayOfMonthUTC(endDateObj) || endDateObj;
        periodEndDate = lastDayOfMonthUTC(endDateObj) || endDateObj;
      }
      const ps = dateToISO(periodStartDate);
      const pe = dateToISO(periodEndDate);
      const items = [];
      if (t.is_monthly && ps && pe) {
        const waterUsage = await usageForBillingMonth(t.room_id, 'WATER', ps);
        if (WATER_RATE > 0 && waterUsage.usage > 0.0001) {
          items.push({
            item_type: 'WATER',
            description: `Water ${waterUsage.previousReadingValue !== null ? waterUsage.previousReadingValue.toFixed(3) : '-'} -> ${waterUsage.currentReadingValue !== null ? waterUsage.currentReadingValue.toFixed(3) : '-'} = ${waterUsage.usage.toFixed(3)} units @ ${WATER_RATE.toFixed(2)}`,
            qty: Number(waterUsage.usage.toFixed(3)),
            unit_price: WATER_RATE,
            amount: Number((WATER_RATE * waterUsage.usage).toFixed(2)),
            meter_prev_reading_id: waterUsage.previousReadingId || null,
            meter_curr_reading_id: waterUsage.currentReadingId
          });
        }

        const elecUsage = await usageForBillingMonth(t.room_id, 'ELECTRIC', ps);
        if (ELECTRIC_RATE > 0 && elecUsage.usage > 0.0001) {
          items.push({
            item_type: 'ELECTRIC',
            description: `Electric ${elecUsage.previousReadingValue !== null ? elecUsage.previousReadingValue.toFixed(3) : '-'} -> ${elecUsage.currentReadingValue !== null ? elecUsage.currentReadingValue.toFixed(3) : '-'} = ${elecUsage.usage.toFixed(3)} units @ ${ELECTRIC_RATE.toFixed(2)}`,
            qty: Number(elecUsage.usage.toFixed(3)),
            unit_price: ELECTRIC_RATE,
            amount: Number((ELECTRIC_RATE * elecUsage.usage).toFixed(2)),
            meter_prev_reading_id: elecUsage.previousReadingId || null,
            meter_curr_reading_id: elecUsage.currentReadingId
          });
        }
      }

      if (items.length) {
        const subtotal = items.reduce((s,it)=> s + Number(it.amount||0), 0);
        const hasRent = items.some((it) => String(it.item_type || '').toUpperCase() === 'RENT');
        const hasUtility = items.some((it) => {
          const typ = String(it.item_type || '').toUpperCase();
          return typ === 'WATER' || typ === 'ELECTRIC';
        });
        const identity = generateBillIdentity({
          baseScope: 'TENANCY',
          hasRent,
          hasUtility,
          reference: t.room_id
        });
        const billInsert = await pool.query(
          `INSERT INTO bills(tenancy_id, bill_no, period_start, period_end, subtotal, total_amount, status, bill_scope)
           VALUES ($1, $2, $3, $4, $5, $5, 'PENDING', $6) RETURNING id`,
          [t.id, identity.bill_no, ps, pe, subtotal, identity.bill_scope]
        );
        for (const it of items) {
          await pool.query(
            `INSERT INTO bill_items (bill_id, item_type, description, qty, unit_price, amount, meter_prev_reading_id, meter_curr_reading_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [
              billInsert.rows[0].id,
              it.item_type,
              it.description,
              it.qty,
              it.unit_price,
              it.amount,
              it.meter_prev_reading_id || null,
              it.meter_curr_reading_id || null
            ]
          );
        }
        try {
          const { notify } = require('../utils/notifications');
          await notify({ user_id: t.tenant_id, title: 'Checkout completed', body: 'Your final bill has been issued.', type: 'BILL', link: '/my-billing' });
        } catch (_) {}
      }
    } catch(e) {
      console.error('tenancy end billing error:', e.message);
    }

    const bk = await pool.query(
      `
      SELECT 1 FROM bookings
      WHERE room_id=$1
        AND status='APPROVED'
        AND start_date >= $2
      LIMIT 1
      `,
      [t.room_id, endDate]
    );

    if (bk.rowCount === 0) {

      await pool.query(`UPDATE rooms SET status='AVAILABLE' WHERE id=$1`, [t.room_id]);
    } else {

      await pool.query(`UPDATE rooms SET status='RESERVED' WHERE id=$1`, [t.room_id]);
    }

    if (t.booking_id) {
      try {
        await pool.query(
          `UPDATE bookings
             SET status = 'CHECKED_OUT',
                 checked_out_at = now(),
                 updated_at = now()
           WHERE id = $1`,
          [t.booking_id]
        );
      } catch (err) {
        console.error('tenancy end update booking failed:', err.message);
      }
    }

    await pool.query("COMMIT");
    const full = await pool.query(
      `SELECT
         t.*,
         r.room_no,
         b.code AS building_code,
         u.username AS tenant_username,
         u.full_name AS tenant_full_name,
         u.phone AS tenant_phone,
         bk.booking_code,
         bk.checked_in_at AS booking_checked_in_at,
         bk.checked_out_at AS booking_checked_out_at
       FROM tenancies t
       JOIN rooms r ON r.id = t.room_id
       JOIN buildings b ON b.id = r.building_id
       JOIN users u ON u.id = t.tenant_id
       LEFT JOIN bookings bk ON bk.id = t.booking_id
       WHERE t.id=$1`,
      [ended.id]
    );
    log({ actor_user_id: req.user?.id, action: 'TENANCY_END', entity_type: 'TENANCY', entity_id: ended.id, details: { end_date: ended.end_date } });
    return res.json(hydrateTenancy(full.rows[0]));
  } catch (e) {
    await pool.query("ROLLBACK").catch(()=>{});
    console.error(e);
    return res.status(500).json({ message: "Server error" });
  }
};

