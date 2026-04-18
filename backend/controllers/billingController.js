const pool = require("../config/db");
const { log } = require('../utils/activityLogger');
const {
  toDateOnly,
  dateToISO,
  nightsInclusive,
  firstDayOfMonthUTC,
  lastDayOfMonthUTC
} = require('../utils/dateHelpers');
const { generateBillIdentity } = require('../utils/billIdentity');
const settingsController = require('./settingsController');

exports.listBills = async (req, res) => {
  try {
    const { status, tenancy_id, q, scope, type } = req.query;
    const conds = [];
    const vals = [];
    let i = 1;
    if (status) {
      conds.push(`UPPER(b.status) = $${i++}`);
      vals.push(String(status).toUpperCase());
    }
    if (tenancy_id) {
      conds.push(`b.tenancy_id = $${i++}`);
      vals.push(tenancy_id);
    }
    if (scope) {
      conds.push(`UPPER(b.bill_scope) = $${i++}`);
      vals.push(String(scope).toUpperCase());
    }
    if (q) {
      conds.push(`(
        LOWER(b.bill_no) LIKE LOWER($${i})
        OR LOWER(r.room_no) LIKE LOWER($${i})
        OR LOWER(bld.code) LIKE LOWER($${i})
        OR LOWER(tenant.username) LIKE LOWER($${i})
        OR LOWER(tenant.full_name) LIKE LOWER($${i})
        OR LOWER(COALESCE(bk.booking_code, '')) LIKE LOWER($${i})
      )`);
      vals.push(`%${q}%`);
      i++;
    }
    const typeUpper = typeof type === 'string' ? type.toUpperCase() : '';
    if (typeUpper === 'ROOM') {
      conds.push(`COALESCE(items.has_rent, false) = true`);
    } else if (typeUpper === 'UTILITY') {
      conds.push(`COALESCE(items.has_utility, false) = true AND COALESCE(items.has_rent, false) = false`);
    } else if (typeUpper === 'MIXED') {
      conds.push(`COALESCE(items.has_rent, false) = true AND COALESCE(items.has_utility, false) = true`);
    }
    const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
    const rs = await pool.query(
      `SELECT
         b.*,
         COALESCE(t.room_id, bk.room_id)        AS room_id,
         r.room_no,
         bld.code                              AS building_code,
         tenant.username                       AS tenant_username,
         tenant.full_name                      AS tenant_full_name,
         tenant.phone                          AS tenant_phone,
         bk.booking_code,
         bk.sell_type                          AS booking_sell_type,
         bk.start_date                         AS booking_start_date,
         bk.end_date                           AS booking_end_date,
         COALESCE(pay.total_paid, 0)::numeric  AS paid_amount,
         COALESCE(items.has_rent, false)       AS has_rent,
         COALESCE(items.has_utility, false)    AS has_utility,
         COALESCE(items.rent_amount, 0)::numeric    AS rent_amount,
         COALESCE(items.utility_amount, 0)::numeric AS utility_amount
       FROM bills b
       LEFT JOIN tenancies t ON t.id = b.tenancy_id
       LEFT JOIN bookings bk ON bk.id = b.booking_id
       LEFT JOIN rooms r ON r.id = COALESCE(t.room_id, bk.room_id)
       LEFT JOIN buildings bld ON bld.id = r.building_id
       LEFT JOIN users tenant ON tenant.id = COALESCE(t.tenant_id, bk.tenant_id)
       LEFT JOIN LATERAL (
         SELECT COALESCE(SUM(paid_amount), 0)::numeric AS total_paid
         FROM payments p
         WHERE p.bill_id = b.id AND p.status = 'CONFIRMED'
       ) pay ON true
       LEFT JOIN LATERAL (
         SELECT
           BOOL_OR(item_type = 'RENT')                              AS has_rent,
           BOOL_OR(item_type IN ('WATER','ELECTRIC'))               AS has_utility,
           COALESCE(SUM(CASE WHEN item_type = 'RENT' THEN amount ELSE 0 END), 0)::numeric AS rent_amount,
           COALESCE(SUM(CASE WHEN item_type IN ('WATER','ELECTRIC') THEN amount ELSE 0 END), 0)::numeric AS utility_amount
         FROM bill_items bi
         WHERE bi.bill_id = b.id
       ) items ON true
       ${where}
       ORDER BY b.issued_at DESC`,
      vals
    );
    return res.json(rs.rows);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.getBillItems = async (req, res) => {
  try {
    const { id } = req.params;
    const rs = await pool.query(`SELECT * FROM bill_items WHERE bill_id=$1 ORDER BY description ASC`, [id]);
    return res.json(rs.rows);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.getMyBillItems = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    const own = await pool.query(
      `SELECT 1
       FROM bills b
       LEFT JOIN tenancies t ON t.id = b.tenancy_id
       LEFT JOIN bookings bk ON bk.id = b.booking_id
       WHERE b.id = $1
         AND COALESCE(t.tenant_id, bk.tenant_id) = $2`,
      [id, userId]
    );
    if (!own.rowCount) {
      return res.status(404).json({ message: 'Bill not found' });
    }
    const rs = await pool.query(
      `SELECT item_type, description, qty, unit_price, amount, meter_prev_reading_id, meter_curr_reading_id
       FROM bill_items
       WHERE bill_id = $1
       ORDER BY item_type ASC, description ASC`,
      [id]
    );
    return res.json(rs.rows);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.createBill = async (req, res) => {
  try {
    const { tenancy_id, period_start, period_end, items = [], due_date, note, bill_scope } = req.body;
    if (!tenancy_id) return res.status(400).json({ message: 'tenancy_id required' });

    await pool.query('BEGIN');
    const safeItems = Array.isArray(items) ? items : [];
    const subtotal = safeItems.reduce((s, it) => s + Number(it.amount || 0), 0);
    const total_amount = subtotal;
    const hasRent = safeItems.some((it) => String(it.item_type || '').toUpperCase() === 'RENT');
    const hasUtility = safeItems.some((it) => {
      const t = String(it.item_type || '').toUpperCase();
      return t === 'WATER' || t === 'ELECTRIC';
    });
    const identity = generateBillIdentity({
      baseScope: bill_scope || 'TENANCY',
      hasRent,
      hasUtility,
      reference: tenancy_id
    });

    const bq = await pool.query(
      `INSERT INTO bills(tenancy_id, bill_no, period_start, period_end, subtotal, total_amount, status, due_date, note, bill_scope)
       VALUES ($1,$2,$3,$4,$5,$6,'PENDING',$7,$8,$9)
       RETURNING *`,
      [
        tenancy_id,
        identity.bill_no,
        period_start ?? null,
        period_end ?? null,
        subtotal,
        total_amount,
        due_date ?? null,
        note ?? null,
        identity.bill_scope
      ]
    );
    const bill = bq.rows[0];

    for (const it of safeItems) {
      if ((it.meter_prev_reading_id && !it.meter_curr_reading_id) || (!it.meter_prev_reading_id && it.meter_curr_reading_id)) {
        await pool.query('ROLLBACK').catch(()=>{});
        return res.status(400).json({ message: 'Utility readings must include both previous and current reading IDs' });
      }
      await pool.query(
        `INSERT INTO bill_items (bill_id, item_type, description, qty, unit_price, amount, meter_prev_reading_id, meter_curr_reading_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          bill.id,
          it.item_type || 'OTHER',
          it.description || null,
          it.qty || 1,
          it.unit_price || 0,
          it.amount || 0,
          it.meter_prev_reading_id || null,
          it.meter_curr_reading_id || null
        ]
      );
    }

    await pool.query('COMMIT');
    log({ actor_user_id: req.user?.id, action: 'BILL_CREATE', entity_type: 'BILL', entity_id: bill.id });
    return res.status(201).json(bill);
  } catch (e) {
    await pool.query('ROLLBACK').catch(()=>{});
    if (e.code === '23505') return res.status(400).json({ message: 'Duplicate bill_no' });
    console.error(e);
    return res.status(500).json({ message: "Server error" });
  }
};

async function getUsage(pool, roomId, type, billingMonthIso) {
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
    const err = new Error(`No ${type.toLowerCase()} reading recorded for billing month ${billingMonth}.`);
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
    const err = new Error(`${type} reading has already been billed. Please record a new reading before generating another bill.`);
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

async function generateBillForTenancyPeriod(tenancy_id, period_start, period_end, { due_date = null, note = null } = {}) {
  const tq = await pool.query(
    `SELECT t.*, r.base_rent_month, r.base_rent_day, r.id AS room_id
     FROM tenancies t JOIN rooms r ON r.id = t.room_id WHERE t.id=$1`,
    [tenancy_id]
  );
  if (tq.rowCount === 0) throw Object.assign(new Error('Tenancy not found'), { status: 404 });
  const t = tq.rows[0];

  const startObj = toDateOnly(period_start);
  const endObj = toDateOnly(period_end);
  if (!startObj || !endObj) {
    throw Object.assign(new Error('Invalid billing period'), { status: 400 });
  }
  let normalizedStart = startObj;
  let normalizedEnd = endObj;
  if (t.is_monthly) {
    normalizedStart = firstDayOfMonthUTC(endObj) || startObj;
    normalizedEnd = lastDayOfMonthUTC(endObj) || endObj;
  }
  const periodStart = dateToISO(normalizedStart);
  const periodEnd = dateToISO(normalizedEnd);

  const { get } = require('./settingsController');
  const WATER_RATE = Number((await get('WATER_RATE')) ?? process.env.WATER_RATE ?? 0);
  const ELECTRIC_RATE = Number((await get('ELECTRIC_RATE')) ?? process.env.ELECTRIC_RATE ?? 0);

  const rentNights = t.is_monthly ? 0 : nightsInclusive(normalizedStart, normalizedEnd);
  const rentAmount = t.is_monthly
    ? Number(t.base_rent_month || 0)
    : Number(t.base_rent_day || 0) * Math.max(1, rentNights);

  const items = [];
  items.push({ item_type: 'RENT', description: 'Rent', qty: 1, unit_price: rentAmount, amount: rentAmount });
  if (t.is_monthly) {
    const billingMonthIso = dateToISO(firstDayOfMonthUTC(normalizedEnd));
    const formatReading = (value) =>
      value === null || value === undefined ? '-' : Number(value).toFixed(3);
    const water = await getUsage(pool, t.room_id, 'WATER', billingMonthIso);
    const elec = await getUsage(pool, t.room_id, 'ELECTRIC', billingMonthIso);
    if (WATER_RATE > 0 && water.usage > 0.0001) {
      items.push({
        item_type: 'WATER',
        description: `Water ${formatReading(water.previousReadingValue)} → ${formatReading(
          water.currentReadingValue
        )} = ${water.usage.toFixed(3)} units @ ${WATER_RATE.toFixed(2)}`,
        qty: Number(water.usage.toFixed(3)),
        unit_price: WATER_RATE,
        amount: Number((WATER_RATE * water.usage).toFixed(2)),
        meter_prev_reading_id: water.previousReadingId || null,
        meter_curr_reading_id: water.currentReadingId
      });
    }
    if (ELECTRIC_RATE > 0 && elec.usage > 0.0001) {
      items.push({
        item_type: 'ELECTRIC',
        description: `Electric ${formatReading(elec.previousReadingValue)} → ${formatReading(
          elec.currentReadingValue
        )} = ${elec.usage.toFixed(3)} units @ ${ELECTRIC_RATE.toFixed(2)}`,
        qty: Number(elec.usage.toFixed(3)),
        unit_price: ELECTRIC_RATE,
        amount: Number((ELECTRIC_RATE * elec.usage).toFixed(2)),
        meter_prev_reading_id: elec.previousReadingId || null,
        meter_curr_reading_id: elec.currentReadingId
      });
    }
  }

  const hasRent = items.some((it) => String(it.item_type || '').toUpperCase() === 'RENT');
  const hasUtility = items.some((it) => {
    const type = String(it.item_type || '').toUpperCase();
    return type === 'WATER' || type === 'ELECTRIC';
  });
  const identity = generateBillIdentity({
    baseScope: 'TENANCY',
    hasRent,
    hasUtility,
    reference: t.room_id || t.tenant_id
  });

  await pool.query('BEGIN');
  const subtotal = items.reduce((s, it) => s + Number(it.amount || 0), 0);
  const total_amount = subtotal;
  const bq = await pool.query(
    `INSERT INTO bills(tenancy_id, bill_no, period_start, period_end, subtotal, total_amount, status, due_date, note, bill_scope)
     VALUES ($1,$2,$3,$4,$5,$6,'PENDING',$7,$8,$9) RETURNING *`,
    [
      tenancy_id,
      identity.bill_no,
      periodStart,
      periodEnd,
      subtotal,
      total_amount,
      due_date ?? null,
      note ?? null,
      identity.bill_scope
    ]
  );
  const bill = bq.rows[0];
  for (const it of items) {
    await pool.query(
      `INSERT INTO bill_items (bill_id, item_type, description, qty, unit_price, amount, meter_prev_reading_id, meter_curr_reading_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        bill.id,
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
  await pool.query('COMMIT');
  try {
    const t = await pool.query(`SELECT tenant_id FROM tenancies WHERE id=$1`, [bill.tenancy_id]);
    const tenantId = t.rows[0]?.tenant_id;
    if (tenantId) {
      const { notify } = require('../utils/notifications');
      await notify({ user_id: tenantId, title: 'New bill issued', body: `Bill ${bill.bill_no} has been issued.`, type: 'BILL', link: `/my-billing` });
    }
  } catch (_) {}
  return bill;
}

exports.generateBillForTenancyPeriod = generateBillForTenancyPeriod;

exports.generateBillFromReadings = async (req, res) => {
  try {
    const { tenancy_id, period_start, period_end, due_date, note } = req.body;
    if (!tenancy_id || !period_start || !period_end) {
      return res.status(400).json({ message: 'tenancy_id, period_start, period_end required' });
    }
    const bill = await generateBillForTenancyPeriod(tenancy_id, period_start, period_end, { due_date, note });
    log({ actor_user_id: req.user?.id, action: 'BILL_GENERATE', entity_type: 'BILL', entity_id: bill.id });
    return res.status(201).json(bill);
  } catch (e) {
    await pool.query('ROLLBACK').catch(()=>{});
    if (e.status === 404) return res.status(404).json({ message: e.message });
    console.error(e);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.listMyBills = async (req, res) => {
  try {
    const userId = req.user?.id;
    const rs = await pool.query(
      `
      SELECT
        b.*,
        COALESCE(t.room_id, bk.room_id)          AS room_id,
        t.status                                 AS tenancy_status,
        r.room_no,
        bld.code                                 AS building_code,
        COALESCE(pay.total_paid, 0)::numeric     AS paid_amount,
        COALESCE(items.has_rent, false)          AS has_rent,
        COALESCE(items.has_utility, false)       AS has_utility,
        COALESCE(items.rent_amount, 0)::numeric  AS rent_amount,
        COALESCE(items.utility_amount, 0)::numeric AS utility_amount,
        bk.booking_code,
        bk.sell_type                             AS booking_sell_type,
        bk.start_date                            AS booking_start_date,
        bk.end_date                              AS booking_end_date
      FROM bills b
      LEFT JOIN tenancies t ON t.id = b.tenancy_id
      LEFT JOIN bookings bk ON bk.id = b.booking_id
      LEFT JOIN rooms r ON r.id = COALESCE(t.room_id, bk.room_id)
      LEFT JOIN buildings bld ON bld.id = r.building_id
      LEFT JOIN users u ON u.id = COALESCE(t.tenant_id, bk.tenant_id)
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(paid_amount), 0)::numeric AS total_paid
        FROM payments p
        WHERE p.bill_id = b.id AND p.status = 'CONFIRMED'
      ) pay ON true
      LEFT JOIN LATERAL (
        SELECT
          BOOL_OR(item_type = 'RENT')                              AS has_rent,
          BOOL_OR(item_type IN ('WATER','ELECTRIC'))               AS has_utility,
          COALESCE(SUM(CASE WHEN item_type = 'RENT' THEN amount ELSE 0 END), 0)::numeric AS rent_amount,
          COALESCE(SUM(CASE WHEN item_type IN ('WATER','ELECTRIC') THEN amount ELSE 0 END), 0)::numeric AS utility_amount
        FROM bill_items bi
        WHERE bi.bill_id = b.id
      ) items ON true
      WHERE COALESCE(t.tenant_id, bk.tenant_id) = $1
      ORDER BY b.issued_at DESC
      `,
      [userId]
    );
    const bills = rs.rows.map((row) => {
      const paid = Number(row.paid_amount || 0);
      const total = Number(row.total_amount || 0);
      const outstanding = Math.max(0, Number((total - paid).toFixed(2)));
      return {
        ...row,
        paid_amount: paid,
        outstanding_amount: outstanding
      };
    });
    return res.json(bills);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.myOverview = async (req, res) => {
  try {
    const userId = req.user?.id;
    const billRs = await pool.query(
      `
      SELECT
        b.*,
        t.room_id,
        t.status AS tenancy_status,
        r.room_no,
        bld.code AS building_code,
        COALESCE(pay.total_paid, 0)::numeric AS paid_amount
      FROM bills b
      LEFT JOIN tenancies t ON t.id = b.tenancy_id
      LEFT JOIN bookings bk ON bk.id = b.booking_id
      LEFT JOIN rooms r ON r.id = COALESCE(t.room_id, bk.room_id)
      LEFT JOIN buildings bld ON bld.id = r.building_id
      LEFT JOIN users u ON u.id = COALESCE(t.tenant_id, bk.tenant_id)
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(paid_amount), 0)::numeric AS total_paid
        FROM payments p
        WHERE p.bill_id = b.id AND p.status = 'CONFIRMED'
      ) pay ON true
      LEFT JOIN LATERAL (
        SELECT
          BOOL_OR(item_type = 'RENT')                              AS has_rent,
          BOOL_OR(item_type IN ('WATER','ELECTRIC'))               AS has_utility,
          COALESCE(SUM(CASE WHEN item_type = 'RENT' THEN amount ELSE 0 END), 0)::numeric AS rent_amount,
          COALESCE(SUM(CASE WHEN item_type IN ('WATER','ELECTRIC') THEN amount ELSE 0 END), 0)::numeric AS utility_amount
        FROM bill_items bi
        WHERE bi.bill_id = b.id
      ) items ON true
      WHERE COALESCE(t.tenant_id, bk.tenant_id) = $1
      ORDER BY b.issued_at DESC
      `,
      [userId]
    );

    const openBills = [];
    const historyBills = [];
    let billsTotal = 0;
    let billsPaidTotal = 0;
    let outstandingTotal = 0;
    let precheckinTotal = 0;
    let precheckinPaid = 0;
    let precheckinOutstanding = 0;
    let rentChargesTotal = 0;
    let utilityChargesTotal = 0;

    billRs.rows.forEach((row) => {
      const paid = Number(row.paid_amount || 0);
      const total = Number(row.total_amount || 0);
      const outstanding = Math.max(0, Number((total - paid).toFixed(2)));
      const scope = String(row.bill_scope || '').toUpperCase();
      billsTotal += total;
      billsPaidTotal += paid;
      outstandingTotal += outstanding;
      if (scope === 'BOOKING') {
        precheckinTotal += total;
        precheckinPaid += paid;
        precheckinOutstanding += outstanding;
      }
      rentChargesTotal += Number(row.rent_amount || 0);
      utilityChargesTotal += Number(row.utility_amount || 0);
      const enriched = {
        ...row,
        paid_amount: paid,
        outstanding_amount: outstanding
      };
      if (outstanding > 0.009 || String(row.status).toUpperCase() !== 'PAID') {
        openBills.push(enriched);
      } else {
        historyBills.push(enriched);
      }
    });

    const summary = {
      outstanding_total: Number(outstandingTotal.toFixed(2)),
      bills_total: Number(billsTotal.toFixed(2)),
      bills_paid_total: Number(billsPaidTotal.toFixed(2)),
      precheckin_total: Number(precheckinTotal.toFixed(2)),
      precheckin_paid_total: Number(precheckinPaid.toFixed(2)),
      precheckin_outstanding_total: Number(precheckinOutstanding.toFixed(2)),
      rent_charge_total: Number(rentChargesTotal.toFixed(2)),
      utility_charge_total: Number(utilityChargesTotal.toFixed(2)),
      all_cleared: outstandingTotal <= 0.009
    };

    let paymentSettings = {
      promptpay_id: '',
      bank_account_name: '',
      bank_account_number: ''
    };
    try {
      paymentSettings = await settingsController.getPaymentInfo();
    } catch (err) {
      console.error('billing.myOverview payment settings error:', err);
    }

    return res.json({
      summary,
      open_bills: openBills,
      history_bills: historyBills,
      payment_settings: paymentSettings
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Server error' });
  }
};

