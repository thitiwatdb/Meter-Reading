const pool = require("../config/db");
const { log } = require('../utils/activityLogger');
const { spawn } = require('child_process');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const { UPLOAD_DIR } = require('../utils/uploadBase64');
const { get: getSetting } = require('./settingsController');
const { toDateOnly, dateToISO, firstDayOfMonthUTC } = require('../utils/dateHelpers');

const PYTHON_CMD = process.env.PYTHON_PATH || 'python';
const PREDICT_SCRIPT = path.join(__dirname, '..', 'utils', 'predict', 'predict.py');

function safeFilename(name) {
  return (name || `predict_${Date.now()}.jpg`).replace(/[^a-zA-Z0-9._-]/g, '_');
}

function extractBase64(input) {
  if (typeof input !== 'string') return null;
  return input.includes(',') ? input.split(',').pop() : input;
}

async function runPythonPredict(imagePath) {
  const stdoutChunks = [];
  const stderrChunks = [];
  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(PYTHON_CMD, [PREDICT_SCRIPT, imagePath], { stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', (chunk) => stdoutChunks.push(chunk.toString()));
    child.stderr.on('data', (chunk) => stderrChunks.push(chunk.toString()));
    child.on('error', (err) => reject(err));
    child.on('close', (code) => resolve(code));
  });

  const stdout = stdoutChunks.join('').trim();
  const stderr = stderrChunks.join('').trim();

  if (exitCode !== 0) {
    const err = new Error('Prediction script failed');
    err.stderr = stderr;
    throw err;
  }

  try {
    return JSON.parse(stdout || '{}');
  } catch (parseErr) {
    const err = new Error('Prediction output invalid');
    err.raw = stdout;
    throw err;
  }
}

async function predictFromBase64(contentBase64, filename) {
  const raw = extractBase64(contentBase64);
  if (!raw) {
    const err = new Error('Invalid base64 payload');
    err.statusCode = 400;
    throw err;
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'meter-predict-'));
  const tmpFile = path.join(tmpDir, safeFilename(filename));
  try {
    await fs.writeFile(tmpFile, Buffer.from(raw, 'base64'));
    return await runPythonPredict(tmpFile);
  } finally {
    await fs.rm(tmpFile, { force: true }).catch(() => {});
    await fs.rm(tmpDir, { force: true, recursive: true }).catch(() => {});
  }
}

async function predictFromImagePath(imagePath) {
  if (!imagePath) return null;
  const fileName = path.basename(imagePath);
  const absolutePath = path.join(UPLOAD_DIR, fileName);
  try {
    await fs.access(absolutePath);
  } catch (err) {
    return null;
  }
  try {
    return await runPythonPredict(absolutePath);
  } catch (err) {
    console.warn('predictFromImagePath failed:', err);
    return null;
  }
}

function extractNumericValue(prediction) {
  if (!prediction || prediction.status !== 'success') return null;
  const detections = prediction.detections || {};
  const numericRaw = detections.numeric_value;
  if (numericRaw !== null && numericRaw !== undefined && numericRaw !== '') {
    const parsed = Number(numericRaw);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  const concatenated = detections.concatenated_labels;
  if (typeof concatenated === 'string' && /^\d+$/.test(concatenated)) {
    return Number(concatenated);
  }
  return null;
}

function normalizeBillingMonth(billingMonth, readingDate) {
  const fromBilling = toDateOnly(billingMonth);
  if (fromBilling) {
    const first = firstDayOfMonthUTC(fromBilling);
    return dateToISO(first);
  }
  const fromReading = toDateOnly(readingDate);
  if (fromReading) {
    const first = firstDayOfMonthUTC(fromReading);
    return dateToISO(first);
  }
  return null;
}

function ensureBillingMonth(billingMonth, readingDate) {
  const normalized = normalizeBillingMonth(billingMonth, readingDate);
  if (!normalized) {
    const err = new Error('Unable to determine billing month. Please provide billing_month or a valid reading_date.');
    err.status = 400;
    throw err;
  }
  return normalized;
}

async function getRateForType(type) {
  const key = type === 'ELECTRIC' ? 'ELECTRIC_RATE' : 'WATER_RATE';
  const settingValue = await getSetting(key);
  const raw = settingValue ?? process.env[key] ?? 0;
  const num = Number(raw);
  return Number.isFinite(num) ? num : 0;
}

async function getRates() {
  const [water, electric] = await Promise.all([
    getRateForType('WATER'),
    getRateForType('ELECTRIC')
  ]);
  return { WATER_RATE: water, ELECTRIC_RATE: electric };
}

function computePricing(row, rates) {
  const rate = row.type === 'ELECTRIC' ? rates.ELECTRIC_RATE : rates.WATER_RATE;
  const hasValue = row.value_unit !== null && row.value_unit !== undefined && row.value_unit !== '';
  const numericValue = hasValue ? Number(row.value_unit) : null;
  const normalizedValue = Number.isFinite(numericValue) ? Number(numericValue.toFixed(3)) : null;
  const price = normalizedValue !== null ? Number((normalizedValue * rate).toFixed(2)) : null;
  const hasReading = row.ai_value !== null && row.ai_value !== undefined && row.ai_value !== '';
  const numericReading = hasReading ? Number(row.ai_value) : null;
  const normalizedReading = Number.isFinite(numericReading) ? Number(numericReading.toFixed(3)) : null;
  return {
    ...row,
    value_unit: normalizedValue,
    ai_value: normalizedReading,
    rate,
    price
  };
}

async function deriveValueDetails({ roomId, type, billingMonth, readingDate, aiValue, fallbackValue }) {
  const normalizedType = String(type).toUpperCase();
  const normalizedBillingMonth = ensureBillingMonth(billingMonth, readingDate);
  let previousReading = null;

  if (roomId && normalizedBillingMonth) {
    const prevRs = await pool.query(
      `SELECT ai_value, value_unit
         FROM meter_readings
        WHERE room_id = $1
          AND type = $2
          AND billing_month < $3
        ORDER BY billing_month DESC, reading_date DESC, created_at DESC
        LIMIT 1`,
      [roomId, normalizedType, normalizedBillingMonth]
    );
    const prev = prevRs.rows[0];
    if (prev) {
      const candidate = prev.ai_value ?? prev.value_unit;
      const numericPrev = Number(candidate);
      if (Number.isFinite(numericPrev)) {
        previousReading = Number(numericPrev.toFixed(3));
      }
    }
  }

  let normalizedAi = null;
  if (Number.isFinite(aiValue)) {
    normalizedAi = Number(aiValue.toFixed(3));
    if (previousReading !== null && normalizedAi < previousReading) {
      const err = new Error('Current reading is lower than the previous reading. Please verify the meter reading.');
      err.status = 400;
      throw err;
    }
  }

  let computedValue = null;
  if (normalizedAi !== null) {
    computedValue = previousReading !== null ? normalizedAi - previousReading : normalizedAi;
  }

  if (!Number.isFinite(computedValue) && fallbackValue !== undefined && fallbackValue !== null && fallbackValue !== '') {
    const fallbackNumeric = Number(fallbackValue);
    if (!Number.isFinite(fallbackNumeric)) {
      const err = new Error('Usage must be a valid number.');
      err.status = 400;
      throw err;
    }
    if (fallbackNumeric < 0) {
      const err = new Error('Usage cannot be negative. Please verify the meter reading.');
      err.status = 400;
      throw err;
    }
    computedValue = Number(fallbackNumeric.toFixed(3));
  }

  if (Number.isFinite(computedValue)) {
    if (computedValue < 0) {
      const err = new Error('Calculated usage is negative. Please verify the readings.');
      err.status = 400;
      throw err;
    }
    computedValue = Number(computedValue.toFixed(3));
  } else {
    computedValue = null;
  }

  const rate = await getRateForType(normalizedType);
  const price = computedValue !== null ? Number((computedValue * rate).toFixed(2)) : null;

  return {
    normalizedType,
    billingMonth: normalizedBillingMonth,
    computedValue,
    price,
    rate,
    previousReading
  };
}

exports.list = async (req, res) => {
  try {
    const { room_id, type, date_from, date_to } = req.query;
    const conds = [];
    const vals = [];
    let i = 1;
    if (room_id) { conds.push(`m.room_id = $${i++}`); vals.push(room_id); }
    if (type)    { conds.push(`m.type = $${i++}`);    vals.push(type.toUpperCase()); }
    if (date_from) { conds.push(`m.reading_date >= $${i++}`); vals.push(date_from); }
    if (date_to)   { conds.push(`m.reading_date <= $${i++}`); vals.push(date_to); }
    const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
    const sql = `
      SELECT m.*, r.room_no, b.code AS building_code, prev.previous_ai_value
      FROM meter_readings m
      JOIN rooms r ON r.id = m.room_id
      JOIN buildings b ON b.id = r.building_id
      LEFT JOIN LATERAL (
        SELECT mr.ai_value AS previous_ai_value
        FROM meter_readings mr
        WHERE mr.room_id = m.room_id
          AND mr.type = m.type
          AND mr.billing_month < m.billing_month
        ORDER BY mr.billing_month DESC, mr.reading_date DESC, mr.created_at DESC
        LIMIT 1
      ) prev ON true
      ${where}
      ORDER BY m.reading_date DESC, m.created_at DESC
    `;
    const rs = await pool.query(sql, vals);
    const rates = await getRates();
    const rows = rs.rows.map((row) => computePricing(row, rates));
    return res.json(rows);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.create = async (req, res) => {
  try {
    const { room_id, type, reading_date, billing_month, value_unit, image_path, ai_value, ai_confidence } = req.body;
    if (!room_id || !type || !reading_date) {
      return res.status(400).json({ message: "room_id, type, reading_date required" });
    }
    const normalizedType = String(type).toUpperCase();

    let finalAiValue = null;
    if (ai_value !== undefined && ai_value !== null && ai_value !== '') {
      const parsed = Number(ai_value);
      if (Number.isFinite(parsed)) {
        finalAiValue = Number(parsed.toFixed(3));
      }
    }

    let finalAiConfidence = null;
    if (ai_confidence !== undefined && ai_confidence !== null && ai_confidence !== '') {
      const parsedConf = Number(ai_confidence);
      if (Number.isFinite(parsedConf)) {
        finalAiConfidence = parsedConf;
      }
    }

    if (finalAiValue === null && image_path) {
      const prediction = await predictFromImagePath(image_path);
      const numeric = extractNumericValue(prediction);
      if (Number.isFinite(numeric)) {
        finalAiValue = Number(numeric.toFixed(3));
      }
    }

    const normalizedBillingMonth = ensureBillingMonth(billing_month, reading_date);

    const {
      computedValue,
      price,
      rate,
      previousReading
    } = await deriveValueDetails({
      roomId: room_id,
      type: normalizedType,
      billingMonth: normalizedBillingMonth,
      readingDate: reading_date,
      aiValue: finalAiValue,
      fallbackValue: value_unit
    });

    const rs = await pool.query(
      `INSERT INTO meter_readings (room_id, type, reading_date, billing_month, value_unit, image_path, ai_value, ai_confidence)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [room_id, normalizedType, reading_date, normalizedBillingMonth, computedValue, image_path ?? null, finalAiValue, finalAiConfidence]
    );
    const created = rs.rows[0];
    created.value_unit = computedValue;
    created.ai_value = finalAiValue;
    created.ai_confidence = finalAiConfidence;
    created.rate = rate;
    created.price = price;
    created.previous_ai_value = previousReading;
    created.billing_month = normalizedBillingMonth;
    log({ actor_user_id: req.user?.id, action: 'METER_CREATE', entity_type: 'METER', entity_id: created.id, details: { room_id } });
    return res.status(201).json(created);
  } catch (e) {
    if (e.status) return res.status(e.status).json({ message: e.message });
    if (e.code === '23505') return res.status(400).json({ message: 'Duplicate reading for date/type/room' });
    console.error(e);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.mine = async (req, res) => {
  try {
    const userId = req.user?.id;
    const role = String(req.user?.role || '').toUpperCase();
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const rs = await pool.query(
      `
        SELECT
          m.id,
          m.room_id,
          m.type,
          m.reading_date,
          m.billing_month,
          m.value_unit,
          m.image_path,
          m.created_at,
          r.room_no,
          b.code AS building_code,
          prev.previous_ai_value
      FROM meter_readings m
      JOIN rooms r ON r.id = m.room_id
      JOIN buildings b ON b.id = r.building_id
      JOIN tenancies t ON t.room_id = m.room_id
        AND t.tenant_id = $1
        AND t.is_monthly = true
        AND m.reading_date >= t.start_date
        AND (t.end_date IS NULL OR m.reading_date <= t.end_date)
      LEFT JOIN LATERAL (
        SELECT mr.ai_value AS previous_ai_value
        FROM meter_readings mr
        WHERE mr.room_id = m.room_id
          AND mr.type = m.type
          AND mr.billing_month < m.billing_month
        ORDER BY mr.billing_month DESC, mr.reading_date DESC, mr.created_at DESC
        LIMIT 1
      ) prev ON true
        ORDER BY m.reading_date DESC, m.created_at DESC
      `,
      [userId]
    );
    const rates = await getRates();
    const rows = rs.rows.map((row) => computePricing(row, rates));
    return res.json(rows);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const currentRs = await pool.query(`SELECT * FROM meter_readings WHERE id=$1`, [id]);
    if (!currentRs.rowCount) {
      return res.status(404).json({ message: 'Not found' });
    }
    const current = currentRs.rows[0];
    const payload = req.body || {};

    const targetRoom = payload.room_id || current.room_id;
    const normalizedType = payload.type ? String(payload.type).toUpperCase() : current.type;
    const targetDate = payload.reading_date || current.reading_date;

    let finalAiValue = current.ai_value;
    if (Object.prototype.hasOwnProperty.call(payload, 'ai_value')) {
      const incoming = payload.ai_value;
      if (incoming === null || incoming === '') {
        finalAiValue = null;
      } else {
        const numeric = Number(incoming);
        if (!Number.isFinite(numeric)) {
          return res.status(400).json({ message: 'ai_value must be a valid number' });
        }
        finalAiValue = Number(numeric.toFixed(3));
      }
    }

    let fallbackValue = current.value_unit;
    if (Object.prototype.hasOwnProperty.call(payload, 'value_unit')) {
      const incoming = payload.value_unit;
      if (incoming === null || incoming === '') {
        fallbackValue = null;
      } else {
        const numeric = Number(incoming);
        if (!Number.isFinite(numeric)) {
          return res.status(400).json({ message: 'value_unit must be a valid number' });
        }
        fallbackValue = Number(numeric.toFixed(3));
      }
    }

    const normalizedBillingMonth = ensureBillingMonth(payload.billing_month, targetDate);

    const {
      computedValue,
      price,
      rate,
      previousReading
    } = await deriveValueDetails({
      roomId: targetRoom,
      type: normalizedType,
      billingMonth: normalizedBillingMonth,
      readingDate: targetDate,
      aiValue: finalAiValue,
      fallbackValue
    });

    if (finalAiValue !== null) {
      const nextRs = await pool.query(
        `SELECT ai_value, value_unit, billing_month
           FROM meter_readings
          WHERE room_id = $1
            AND type = $2
            AND id <> $3
            AND billing_month >= $4
          ORDER BY billing_month ASC, reading_date ASC, created_at ASC
          LIMIT 1`,
        [targetRoom, normalizedType, id, normalizedBillingMonth]
      );
      const nextRow = nextRs.rows[0];
      if (nextRow && nextRow.ai_value !== null && nextRow.ai_value !== undefined) {
        const numericNext = Number(nextRow.ai_value);
        if (Number.isFinite(numericNext)) {
          const nextValue = Number(numericNext.toFixed(3));
          if (finalAiValue > nextValue) {
            return res.status(400).json({ message: 'Current reading cannot exceed the next recorded reading.' });
          }
        }
      }
    }

    let finalImagePath = current.image_path;
    if (Object.prototype.hasOwnProperty.call(payload, 'image_path')) {
      const incomingPath = payload.image_path;
      finalImagePath = incomingPath === '' ? null : incomingPath;
    }

    const updateRs = await pool.query(
      `UPDATE meter_readings
          SET room_id = $1,
              type = $2,
              reading_date = $3,
              billing_month = $4,
              value_unit = $5,
              ai_value = $6,
              image_path = $7
        WHERE id = $8
        RETURNING *`,
      [targetRoom, normalizedType, targetDate, normalizedBillingMonth, computedValue, finalAiValue, finalImagePath, id]
    );

    const updatedRow = updateRs.rows[0];
    const rates = await getRates();
    const enriched = computePricing(updatedRow, rates);
    enriched.previous_ai_value = previousReading;
    enriched.price = price;
    enriched.rate = rate;
    enriched.billing_month = normalizedBillingMonth;
    log({
      actor_user_id: req.user?.id,
      action: 'METER_UPDATE',
      entity_type: 'METER',
      entity_id: id,
      details: { room_id: targetRoom, type: normalizedType }
    });
    return res.json(enriched);
  } catch (e) {
    if (e.status) return res.status(e.status).json({ message: e.message });
    if (e.code === '23505') return res.status(400).json({ message: 'Duplicate reading for date/type/room' });
    console.error(e);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.predict = async (req, res) => {
  try {
    const { contentBase64, filename, room_id, type, reading_date, billing_month } = req.body || {};
    if (!contentBase64) {
      return res.status(400).json({ message: 'contentBase64 is required' });
    }
    const prediction = await predictFromBase64(contentBase64, filename);
    const numeric = extractNumericValue(prediction);
    let derived = null;
      if (room_id && type && reading_date && Number.isFinite(numeric)) {
        try {
          const normalizedBillingMonth = ensureBillingMonth(billing_month, reading_date);
          derived = await deriveValueDetails({
            roomId: room_id,
            type,
            billingMonth: normalizedBillingMonth,
            readingDate: reading_date,
            aiValue: Number(numeric.toFixed(3))
          });
        } catch (err) {
          if (err.status) {
            return res.status(err.status).json({ message: err.message });
          }
          throw err;
        }
      }
    return res.json({
      ...prediction,
      numeric_value: Number.isFinite(numeric) ? Number(numeric.toFixed(3)) : null,
      derived
    });
  } catch (e) {
    const status = e.statusCode || 500;
    if (status >= 500) {
      console.error('meter predict error:', e);
    }
    return res.status(status).json({ message: e.message || 'Prediction error', stderr: e.stderr, raw: e.raw });
  }
};

exports.derive = async (req, res) => {
  try {
    const { room_id, type, reading_date, billing_month, reading_value } = req.body || {};
    if (!room_id || !type || !reading_date) {
      return res.status(400).json({ message: 'room_id, type, reading_date are required' });
    }
    let aiValue = null;
    if (reading_value !== undefined && reading_value !== null && reading_value !== '') {
      const numericReading = Number(reading_value);
      if (!Number.isFinite(numericReading)) {
        return res.status(400).json({ message: 'reading_value must be a number' });
      }
      aiValue = Number(numericReading.toFixed(3));
    }
    const normalizedBillingMonth = ensureBillingMonth(billing_month, reading_date);
    const details = await deriveValueDetails({
      roomId: room_id,
      type,
      billingMonth: normalizedBillingMonth,
      readingDate: reading_date,
      aiValue
    });
    return res.json(details);
  } catch (e) {
    if (e.status) return res.status(e.status).json({ message: e.message });
    console.error('meter derive error:', e);
    return res.status(500).json({ message: 'Failed to derive usage' });
  }
};

exports.remove = async (req, res) => {
  try {
    const { id } = req.params;
    const rs = await pool.query('DELETE FROM meter_readings WHERE id = $1 RETURNING *', [id]);
    if (rs.rowCount === 0) {
      return res.status(404).json({ message: 'Not found' });
    }
    log({ actor_user_id: req.user?.id, action: 'METER_DELETE', entity_type: 'METER', entity_id: id });
    return res.json({ success: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Server error' });
  }
};

