const pool = require('../config/db');

async function initSettingsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS settings (
      key text PRIMARY KEY,
      value text,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`);
  await pool.query(`INSERT INTO settings(key,value) VALUES ('WATER_RATE','0') ON CONFLICT(key) DO NOTHING`);
  await pool.query(`INSERT INTO settings(key,value) VALUES ('ELECTRIC_RATE','0') ON CONFLICT(key) DO NOTHING`);
  await pool.query(`INSERT INTO settings(key,value) VALUES ('BANK_ACCOUNT_NAME','') ON CONFLICT(key) DO NOTHING`);
  await pool.query(`INSERT INTO settings(key,value) VALUES ('BANK_ACCOUNT_NUMBER','') ON CONFLICT(key) DO NOTHING`);
  await pool.query(`INSERT INTO settings(key,value) VALUES ('PROMPTPAY_ID','') ON CONFLICT(key) DO NOTHING`);
}

exports.getAll = async (req, res) => {
  try {
    try {
      await initSettingsTable().catch(() => {});
      const rs = await pool.query(`SELECT key, value FROM settings ORDER BY key ASC`);
      const obj = {};
      for (const r of rs.rows) obj[r.key] = r.value;
      return res.json(obj);
    } catch (e) {
      if (e.code === '42P01') {
        try {
          await initSettingsTable();
          const rs2 = await pool.query(`SELECT key, value FROM settings ORDER BY key ASC`);
          const obj2 = {};
          for (const r of rs2.rows) obj2[r.key] = r.value;
          return res.json(obj2);
        } catch (e2) {
          if (e2.code === '42501') {
            return res.json({
              WATER_RATE: process.env.WATER_RATE || '0',
              ELECTRIC_RATE: process.env.ELECTRIC_RATE || '0',
              BANK_ACCOUNT_NAME: process.env.BANK_ACCOUNT_NAME || '',
              BANK_ACCOUNT_NUMBER: process.env.BANK_ACCOUNT_NUMBER || '',
              PROMPTPAY_ID: process.env.PROMPTPAY_ID || '',
              _note: 'settings table init denied (insufficient privilege)'
            });
          }
          throw e2;
        }
      }
      if (e.code === '42501') {
        return res.json({
          WATER_RATE: process.env.WATER_RATE || '0',
          ELECTRIC_RATE: process.env.ELECTRIC_RATE || '0',
          BANK_ACCOUNT_NAME: process.env.BANK_ACCOUNT_NAME || '',
          BANK_ACCOUNT_NUMBER: process.env.BANK_ACCOUNT_NUMBER || '',
          PROMPTPAY_ID: process.env.PROMPTPAY_ID || '',
          _note: 'settings table unavailable (insufficient privilege)'
        });
      }
      throw e;
    }
  } catch (e) {
    console.error('settings.getAll error:', e);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.setMany = async (req, res) => {
  try {
    const data = req.body || {};
    const entries = Object.entries(data);
    if (!entries.length) return res.status(400).json({ message: 'No settings provided' });
    try {
      await initSettingsTable();
    } catch (e) {
      if (e.code === '42501') {
        return res.status(403).json({ message: 'Insufficient privilege to create/update settings' });
      }
      throw e;
    }
    await pool.query('BEGIN');
    for (const [key, value] of entries) {
      await pool.query(
        `INSERT INTO settings(key, value, updated_at) VALUES ($1,$2,now())
         ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()`,
        [key, String(value)]
      );
    }
    await pool.query('COMMIT');
    return exports.getAll(req, res);
  } catch (e) {
    await pool.query('ROLLBACK').catch(()=>{});
    console.error('settings.setMany error:', e);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.get = async (key) => {
  const rs = await pool.query(`SELECT value FROM settings WHERE key=$1`, [key]);
  return rs.rowCount ? rs.rows[0].value : null;
};

exports.setValue = async (key, value) => {
  if (!key) throw new Error('Setting key is required');
  try {
    await initSettingsTable();
  } catch (e) {
    if (e.code === '42501') {
      const err = new Error('Insufficient privilege to update settings');
      err.status = 403;
      err.code = 'SETTINGS_PRIVILEGE_DENIED';
      throw err;
    }
    throw e;
  }
  await pool.query(
    `INSERT INTO settings(key, value, updated_at) VALUES ($1,$2,now())
     ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()`,
    [key, String(value ?? '')]
  );
};

exports.getPaymentInfo = async () => {
  await initSettingsTable().catch(() => {});
  const keys = ['BANK_ACCOUNT_NAME', 'BANK_ACCOUNT_NUMBER', 'PROMPTPAY_ID'];
  const rs = await pool.query(
    `SELECT key, value FROM settings WHERE key = ANY($1::text[])`,
    [keys]
  );
  const map = Object.fromEntries(rs.rows.map((row) => [row.key, row.value]));
  return {
    bank_account_name: map.BANK_ACCOUNT_NAME || '',
    bank_account_number: map.BANK_ACCOUNT_NUMBER || '',
    promptpay_id: map.PROMPTPAY_ID || ''
  };
};
