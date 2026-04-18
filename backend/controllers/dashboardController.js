const pool = require("../config/db");

exports.summary = async (req, res) => {
  try {
    const input = req.query.date;
    let baseDate = new Date();
    if (input) {
      const parsed = new Date(input);
      if (Number.isNaN(parsed.getTime())) {
        return res.status(400).json({ message: 'Invalid date format (YYYY-MM-DD)' });
      }
      baseDate = parsed;
    }
    const dayStart = new Date(Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth(), baseDate.getUTCDate()));
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    const dayStartStr = dayStart.toISOString().slice(0, 10);
    const dayEndStr = dayEnd.toISOString().slice(0, 10);

    const [
      roomBaseRs,
      roomStatusRs,
      occupiedRs,
      reservedRs,
      bookingAgg,
      tenancyAgg,
      billingAgg,
      maintenanceAgg,
      prepayAgg
    ] = await Promise.all([
      pool.query(
        `SELECT
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE status = 'MAINTENANCE')::int AS maintenance
         FROM rooms`
      ),
      pool.query(`SELECT status, COUNT(*)::int AS count FROM rooms GROUP BY status`),
      pool.query(
        `
        SELECT DISTINCT room_id
        FROM tenancies
        WHERE room_id IS NOT NULL
          AND status IN ('ACTIVE','MOVING_OUT')
          AND NOT ($2 <= start_date OR $1 >= COALESCE(end_date, '9999-12-31'))
        `,
        [dayStartStr, dayEndStr]
      ),
      pool.query(
        `
        SELECT DISTINCT room_id
        FROM bookings
        WHERE room_id IS NOT NULL
          AND status IN ('PENDING','APPROVED','CHECKED_IN')
          AND NOT ($2 <= start_date OR $1 >= end_date)
        `,
        [dayStartStr, dayEndStr]
      ),
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'PENDING')::int AS pending,
          COUNT(*) FILTER (WHERE status = 'PENDING' AND room_id IS NULL)::int AS pending_allocation,
          COUNT(*) FILTER (WHERE status = 'APPROVED')::int AS approved,
          COUNT(*) FILTER (WHERE status = 'CHECKED_IN')::int AS checked_in,
          COUNT(*) FILTER (WHERE status = 'APPROVED' AND start_date = CURRENT_DATE)::int AS today_checkins,
          COUNT(*) FILTER (WHERE (status = 'APPROVED' OR status = 'CHECKED_IN') AND end_date = CURRENT_DATE)::int AS today_checkouts
        FROM bookings
      `),
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'ACTIVE')::int AS active,
          COUNT(*) FILTER (WHERE status = 'MOVING_OUT')::int AS moving_out,
          COUNT(*) FILTER (
            WHERE status IN ('ACTIVE','MOVING_OUT')
              AND end_date IS NOT NULL
              AND end_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
          )::int AS ending_soon,
          COUNT(*) FILTER (
            WHERE status = 'ENDED'
              AND end_date IS NOT NULL
              AND end_date >= CURRENT_DATE - INTERVAL '30 days'
          )::int AS ended_recent
        FROM tenancies
      `),
      pool.query(`
        WITH payment_sum AS (
          SELECT bill_id, COALESCE(SUM(paid_amount), 0)::numeric(12,2) AS paid_amount
          FROM payments
          WHERE status = 'CONFIRMED'
          GROUP BY bill_id
        ),
        outstanding AS (
          SELECT
            b.id,
            b.due_date,
            GREATEST(0, b.total_amount - COALESCE(ps.paid_amount, 0))::numeric(12,2) AS balance
          FROM bills b
          LEFT JOIN payment_sum ps ON ps.bill_id = b.id
        )
        SELECT
          COUNT(*) FILTER (WHERE balance > 0)::int AS pending_count,
          COUNT(*) FILTER (WHERE balance > 0 AND due_date IS NOT NULL AND due_date < CURRENT_DATE)::int AS overdue_count,
          COUNT(*) FILTER (WHERE balance > 0 AND due_date = CURRENT_DATE)::int AS due_today_count,
          COALESCE(SUM(balance), 0)::numeric(14,2) AS outstanding_total
        FROM outstanding
      `),
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE status IN ('REQUESTED','IN_PROGRESS'))::int AS open,
          COUNT(*) FILTER (WHERE status = 'REQUESTED')::int AS requested,
          COUNT(*) FILTER (WHERE status = 'IN_PROGRESS')::int AS in_progress,
          COUNT(*) FILTER (WHERE status = 'COMPLETED')::int AS completed,
          COUNT(*) FILTER (
            WHERE status IN ('REQUESTED','IN_PROGRESS')
              AND created_at < now() - INTERVAL '3 days'
          )::int AS aging
        FROM maintenance_requests
      `),
      pool.query(`
        WITH payment_sum AS (
          SELECT bill_id, COALESCE(SUM(paid_amount), 0)::numeric(12,2) AS paid_amount
          FROM payments
          WHERE status = 'CONFIRMED'
          GROUP BY bill_id
        )
        SELECT
          COUNT(*) FILTER (WHERE balance > 0)::int AS pending_count,
          COALESCE(SUM(balance), 0)::numeric(14,2) AS pending_amount
        FROM (
          SELECT
            b.id,
            GREATEST(0, b.total_amount - COALESCE(ps.paid_amount, 0))::numeric(12,2) AS balance
          FROM bills b
          LEFT JOIN payment_sum ps ON ps.bill_id = b.id
          WHERE b.bill_scope = 'BOOKING'
        ) pending
      `)
    ]);

    const roomBase = roomBaseRs.rows[0] || { total: 0, maintenance: 0 };
    const occupiedSet = new Set(occupiedRs.rows.map((row) => row.room_id));
    const reservedSet = new Set(
      reservedRs.rows
        .map((row) => row.room_id)
        .filter((roomId) => roomId && !occupiedSet.has(roomId))
    );

    const occupiedCount = occupiedSet.size;
    const reservedCount = reservedSet.size;
    const availableCount = Math.max(
      0,
      Number(roomBase.total || 0) - Number(roomBase.maintenance || 0) - occupiedCount - reservedCount
    );

    const bookingsRow = bookingAgg.rows[0] || {};
    const tenanciesRow = tenancyAgg.rows[0] || {};
    const billingRow = billingAgg.rows[0] || {};
    const maintenanceRow = maintenanceAgg.rows[0] || {};
    const prepayRow = prepayAgg.rows[0] || {};

    return res.json({
      date: dayStartStr,
      rooms: {
        date: dayStartStr,
        total: Number(roomBase.total || 0),
        maintenance: Number(roomBase.maintenance || 0),
        occupied: occupiedCount,
        reserved: reservedCount,
        available: availableCount,
        breakdown: roomStatusRs.rows
      },
      bookings: {
        pending: Number(bookingsRow.pending || 0),
        pending_allocation: Number(bookingsRow.pending_allocation || 0),
        approved: Number(bookingsRow.approved || 0),
        checked_in: Number(bookingsRow.checked_in || 0),
        today_checkins: Number(bookingsRow.today_checkins || 0),
        today_checkouts: Number(bookingsRow.today_checkouts || 0)
      },
      tenancies: {
        active: Number(tenanciesRow.active || 0),
        moving_out: Number(tenanciesRow.moving_out || 0),
        ending_soon: Number(tenanciesRow.ending_soon || 0),
        ended_recent: Number(tenanciesRow.ended_recent || 0)
      },
      billing: {
        pending_count: Number(billingRow.pending_count || 0),
        overdue_count: Number(billingRow.overdue_count || 0),
        due_today_count: Number(billingRow.due_today_count || 0),
        outstanding_total: Number(billingRow.outstanding_total || 0)
      },
      maintenance: {
        open: Number(maintenanceRow.open || 0),
        requested: Number(maintenanceRow.requested || 0),
        in_progress: Number(maintenanceRow.in_progress || 0),
        completed: Number(maintenanceRow.completed || 0),
        aging: Number(maintenanceRow.aging || 0)
      },
      prepayments: {
        pending_count: Number(prepayRow.pending_count || 0),
        pending_amount: Number(prepayRow.pending_amount || 0)
      }
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Server error" });
  }
};

