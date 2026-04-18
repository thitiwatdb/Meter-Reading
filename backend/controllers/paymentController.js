const pool = require("../config/db");
const { log } = require("../utils/activityLogger");
const settingsController = require('./settingsController');
const generatePromptPayPayload = require('promptpay-qr');
const QRCode = require('qrcode');

exports.list = async (req, res) => {
  try {
    const { bill_id } = req.query;
    const conds = [];
    const vals = [];
    if (bill_id) {
      conds.push(`p.bill_id = $${vals.length + 1}`);
      vals.push(bill_id);
    }
    const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
    const sql = `
      SELECT p.*, b.bill_no, u.username AS confirmed_by_username
      FROM payments p
      JOIN bills b ON b.id = p.bill_id
      LEFT JOIN users u ON u.id = p.confirmed_by
      ${where}
      ORDER BY p.paid_at DESC
    `;
    const rs = await pool.query(sql, vals);
    return res.json(rs.rows);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.create = async (req, res) => {
  try {
    const receiverId = req.user?.id;
    const { bill_id, paid_amount, method, slip_path, note } = req.body;
    if (!bill_id || !paid_amount)
      return res
        .status(400)
        .json({ message: "bill_id and paid_amount required" });

    const billOutstanding = await pool.query(
      `SELECT
         b.total_amount,
         b.status,
         COALESCE((
           SELECT SUM(paid_amount) FROM payments p
           WHERE p.bill_id = b.id AND p.status IN ('CONFIRMED','PENDING')
         ),0)::numeric AS paid_sum
       FROM bills b
       WHERE b.id = $1`,
      [bill_id]
    );
    if (!billOutstanding.rowCount) {
      return res.status(404).json({ message: "Bill not found" });
    }
    const row = billOutstanding.rows[0];
    const outstanding =
      Number(row.total_amount || 0) - Number(row.paid_sum || 0);
    if (outstanding <= 0.009) {
      return res
        .status(400)
        .json({ message: "This bill is already fully paid" });
    }
    if (Number(paid_amount) > outstanding + 0.01) {
      return res
        .status(400)
        .json({ message: "Paid amount exceeds outstanding balance" });
    }

    await pool.query("BEGIN");
    const m = String(method || "CASH").toUpperCase();
    const pq = await pool.query(
      `INSERT INTO payments (bill_id, paid_amount, method, slip_path, received_by, note, status, confirmed_at, confirmed_by, paid_at)
       VALUES ($1,$2,$3,$4,$5,$6,'CONFIRMED',now(),$5,now()) RETURNING *`,
      [
        bill_id,
        paid_amount,
        m,
        slip_path ?? null,
        receiverId ?? null,
        note ?? null,
      ]
    );

    const totals = await pool.query(
      `SELECT COALESCE(SUM(paid_amount),0) AS paid, (SELECT total_amount FROM bills WHERE id=$1) AS total
       FROM payments p WHERE p.bill_id=$1 AND p.status='CONFIRMED'`,
      [bill_id]
    );
    if (Number(totals.rows[0].paid) >= Number(totals.rows[0].total || 0)) {
      await pool.query(`UPDATE bills SET status='PAID' WHERE id=$1`, [bill_id]);
    }

    await pool.query("COMMIT");
    const created = pq.rows[0];
    log({
      actor_user_id: receiverId,
      action: "PAYMENT_CREATE",
      entity_type: "PAYMENT",
      entity_id: created.id,
      details: { bill_id },
    });
    try {
      const b = await pool.query(
        `SELECT t.tenant_id, b.bill_no FROM bills b JOIN tenancies t ON t.id=b.tenancy_id WHERE b.id=$1`,
        [bill_id]
      );
      const tenantId = b.rows[0]?.tenant_id;
      if (tenantId) {
        const { notify } = require("../utils/notifications");
        await notify({
          user_id: tenantId,
          title: "Payment recorded",
          body: `Payment for bill ${b.rows[0].bill_no} has been recorded.`,
          type: "PAYMENT",
          link: `/my-billing`,
        });
      }
    } catch (_) {}
    return res.status(201).json(created);
  } catch (e) {
    await pool.query("ROLLBACK").catch(() => {});
    console.error(e);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.createSelf = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { bill_id, paid_amount, method, slip_path, note } = req.body;
    if (!bill_id || !paid_amount) {
      return res.status(400).json({ message: 'bill_id and paid_amount required' });
    }

    const m = String(method || '').toUpperCase();
    if (!['QR', 'TRANSFER'].includes(m)) {
      return res.status(400).json({ message: 'Only QR or TRANSFER allowed for tenant payments' });
    }
    if (!slip_path) {
      return res.status(400).json({ message: 'Slip is required for QR/TRANSFER' });
    }
    const bill = await pool.query(
      `SELECT b.id, b.total_amount
         FROM bills b
    LEFT JOIN tenancies t ON t.id = b.tenancy_id
    LEFT JOIN bookings  k ON k.id = b.booking_id
        WHERE b.id = $1
          AND (
                (b.tenancy_id IS NOT NULL AND t.tenant_id = $2)
             OR (b.booking_id IS NOT NULL AND k.tenant_id = $2)
          )`,
      [bill_id, userId]
    );
    if (!bill.rowCount) {
      return res.status(403).json({ message: 'You can only pay your own bills' });
    }
    const out = await pool.query(
      `SELECT
          b.total_amount
        - COALESCE((SELECT SUM(paid_amount) FROM payments p
                    WHERE p.bill_id = b.id AND p.status IN ('CONFIRMED','PENDING')), 0) AS outstanding
         FROM bills b
        WHERE b.id = $1`,
      [bill_id]
    );
    const outstanding = Number(out.rows?.[0]?.outstanding ?? 0);
    if (outstanding <= 0) {
      return res.status(400).json({ message: 'This bill is already fully covered' });
    }
    if (Number(paid_amount) > outstanding + 0.001) {
      return res.status(400).json({ message: 'Paid amount exceeds outstanding' });
    }

    await pool.query('BEGIN');
    const pq = await pool.query(
      `INSERT INTO payments (bill_id, paid_amount, method, slip_path, received_by, note, status)
       VALUES ($1, $2, $3, $4, NULL, $5, 'PENDING')
       RETURNING *`,
      [bill_id, paid_amount, m, slip_path ?? null, note ?? null]
    );
    await pool.query('COMMIT');

    const created = pq.rows[0];
    log({
      actor_user_id: userId,
      action: 'PAYMENT_SUBMIT',
      entity_type: 'PAYMENT',
      entity_id: created.id,
      details: { bill_id, method: m }
    });

    try {
      const b = await pool.query(`SELECT bill_no FROM bills WHERE id=$1`, [bill_id]);
      const { notify } = require('../utils/notifications');
      await notify({
        user_id: userId,
        title: 'Payment submitted',
        body: `We received your payment for bill ${b.rows[0]?.bill_no}.`,
        type: 'PAYMENT',
        link: `/my-billing`
      });
    } catch (_) {}

    return res.status(201).json({ ...created, status: 'PENDING' });
  } catch (e) {
    await pool.query('ROLLBACK').catch(()=>{});
    console.error(e);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.confirm = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    await pool.query("BEGIN");
    const rs = await pool.query(
      `UPDATE payments
          SET status='CONFIRMED',
              confirmed_at = now(),
              confirmed_by = $2
        WHERE id=$1 AND status <> 'CONFIRMED'
        RETURNING bill_id, paid_amount`,
      [id, userId]
    );
    if (rs.rowCount === 0) {
      await pool.query("ROLLBACK");
      return res
        .status(404)
        .json({ message: "Payment not found or already confirmed" });
    }
    const { bill_id } = rs.rows[0];
    const totals = await pool.query(
      `SELECT COALESCE(SUM(paid_amount),0) AS paid, (SELECT total_amount FROM bills WHERE id=$1) AS total
       FROM payments p WHERE p.bill_id=$1 AND p.status='CONFIRMED'`,
      [bill_id]
    );
    if (Number(totals.rows[0].paid) >= Number(totals.rows[0].total || 0)) {
      await pool.query(`UPDATE bills SET status='PAID' WHERE id=$1`, [bill_id]);
    }
    await pool.query("COMMIT");
    log({
      actor_user_id: userId,
      action: "PAYMENT_CONFIRM",
      entity_type: "PAYMENT",
      entity_id: id,
      details: { bill_id },
    });
    return res.json({ message: "Payment confirmed" });
  } catch (e) {
    await pool.query("ROLLBACK").catch(() => {});
    console.error(e);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.generateQrPreview = async (req, res) => {
  try {
    const rawAmount = Number(req.query.amount);
    const amount = Number.isFinite(rawAmount) ? Number(rawAmount.toFixed(2)) : 0;
    if (amount <= 0) {
      return res.status(400).json({ message: 'Invalid amount' });
    }
    const paymentInfo = await settingsController.getPaymentInfo();
    const promptpayId = (paymentInfo.promptpay_id || process.env.PROMPTPAY_ID || '').replace(/\s+/g, '');
    if (!promptpayId) {
      return res.status(400).json({ message: 'PromptPay ID not configured' });
    }
    const payload = generatePromptPayPayload(promptpayId, { amount });
    const dataUrl = await QRCode.toDataURL(payload, { width: 320, margin: 1 });
    return res.json({ payload, dataUrl });
  } catch (e) {
    console.error('generateQrPreview error:', e);
    return res.status(500).json({ message: 'Unable to generate QR' });
  }
};
