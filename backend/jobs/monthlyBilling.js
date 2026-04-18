const pool = require('../config/db');
const { generateBillForTenancyPeriod } = require('../controllers/billingController');

function firstDayOfMonth(year, month) { // month: 0-11
  return new Date(Date.UTC(year, month, 1)).toISOString().slice(0,10);
}
function lastDayOfMonth(year, month) { // month: 0-11
  return new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0,10);
}

async function generateForPreviousMonthIfDue(now = new Date()) {
  try {
    const y = now.getUTCFullYear();
    const m = now.getUTCMonth(); // 0-11
    if (now.getUTCDate() !== 1) return { skipped: true };

    const prevYear = m === 0 ? y - 1 : y;
    const prevMonth = m === 0 ? 11 : m - 1;
    const period_start = firstDayOfMonth(prevYear, prevMonth);
    const period_end = lastDayOfMonth(prevYear, prevMonth);

    const due_date = new Date(Date.UTC(y, m, 10)).toISOString().slice(0,10);

    const tq = await pool.query(
      `SELECT t.id
       FROM tenancies t
       WHERE t.is_monthly = true
         AND t.status IN ('ACTIVE','MOVING_OUT','ENDED')
         AND t.start_date <= $2
         AND (t.end_date IS NULL OR t.end_date >= $1)`,
      [period_start, period_end]
    );

    let createdCount = 0;
    for (const row of tq.rows) {
      const tenancy_id = row.id;
      const existing = await pool.query(
        `SELECT 1 FROM bills WHERE tenancy_id=$1 AND period_start=$2 AND period_end=$3 LIMIT 1`,
        [tenancy_id, period_start, period_end]
      );
      if (existing.rowCount) continue;

      try {
        await generateBillForTenancyPeriod(tenancy_id, period_start, period_end, { due_date, note: `Auto-generated for ${period_start.slice(0,7)}` });
        createdCount++;
      } catch (e) {
        console.error('[monthlyBilling] failed for tenancy', tenancy_id, e.message);
      }
    }
    if (createdCount) {
      console.log(`[monthlyBilling] Generated ${createdCount} bills for period ${period_start}..${period_end}`);
    } else {
      console.log(`[monthlyBilling] No bills to generate for period ${period_start}..${period_end}`);
    }
    return { createdCount };
  } catch (e) {
    console.error('[monthlyBilling] error', e);
    return { error: e.message };
  }
}

function startMonthlyBillingScheduler() {
  const intervalMs = 6 * 60 * 60 * 1000;
  setInterval(() => generateForPreviousMonthIfDue().catch(()=>{}), intervalMs);
  generateForPreviousMonthIfDue().catch(()=>{});
}

module.exports = { startMonthlyBillingScheduler, generateForPreviousMonthIfDue };

