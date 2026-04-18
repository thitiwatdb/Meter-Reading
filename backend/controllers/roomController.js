const pool = require("../config/db");

exports.list = async (req, res) => {
  try {
    const { building_id, status, q } = req.query;

    const conds = [];
    const vals = [];
    let i = 1;

    if (building_id) {
      conds.push(`r.building_id = $${i++}`);
      vals.push(building_id);
    }

    if (status) {
      conds.push(`r.status = $${i++}`);
      vals.push(status);
    }
    if (q) {
      conds.push(
        `(LOWER(r.room_no) LIKE LOWER($${i}) OR LOWER(r.type) LIKE LOWER($${i}))`
      );
      vals.push(`%${q}%`);
      i++;
    }

    const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
    const sql = `
    SELECT r.id, r.building_id, r.room_no, r.floor, r.type, r.area_sqm, r.base_rent_day,
    r.base_rent_month, r.status, r.note, r.sell_type, r.created_at, b.code AS building_code, b.name AS building_name
    FROM rooms r
    JOIN buildings b ON b.id = r.building_id
    ${where}
    ORDER BY b.code ASC, r.room_no ASC`;

    const result = await pool.query(sql, vals);
    return res.json(result.rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.create = async (req, res) => {
  try {
    const {
      building_id,
      room_no,
      floor,
      type,
      area_sqm,
      base_rent_day,
      base_rent_month,
      status = "AVAILABLE",
      note,
      sell_type,
    } = req.body;

    const sellType = String(sell_type || "DAILY").toUpperCase();
    if (!["DAILY", "MONTHLY"].includes(sellType)) {
      return res.status(400).json({ message: "sell_type must be DAILY or MONTHLY" });
    }

    if (!building_id || !room_no) {
      return res
        .status(400)
        .json({ message: "building_id and room_no are required" });
    }

    const result = await pool.query(
      `INSERT INTO rooms (building_id, room_no, floor, type, area_sqm, base_rent_day, base_rent_month, status, note, sell_type)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
            RETURNING id, building_id, room_no, floor, type, area_sqm, base_rent_month, base_rent_day, status, note, sell_type, created_at`,
      [
        building_id,
        room_no.trim(),
        floor ?? null,
        type ?? null,
        area_sqm ?? null,
        base_rent_day ?? null,
        base_rent_month ?? null,
        status,
        note ?? null,
        sellType,
      ]
    );
    return res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === "23505") {
      return res
        .status(400)
        .json({ message: "This room_no already exists in the building" });
    }
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      building_id,
      room_no,
      floor,
      type,
      area_sqm,
      base_rent_day,
      base_rent_month,
      status,
      note,
      sell_type,
    } = req.body;

    let sellType = null;
    if (sell_type !== undefined && sell_type !== null) {
      sellType = String(sell_type).toUpperCase();
      if (!["DAILY", "MONTHLY"].includes(sellType)) {
        return res.status(400).json({ message: "sell_type must be DAILY or MONTHLY" });
      }
    }

    const result = await pool.query(
      `UPDATE rooms SET
          building_id     = COALESCE($2, building_id),
          room_no         = COALESCE($3, room_no),
          floor           = COALESCE($4, floor),
          type            = COALESCE($5, type),
          area_sqm        = COALESCE($6, area_sqm),
          base_rent_day   = COALESCE($7, base_rent_day),
          base_rent_month = COALESCE($8, base_rent_month),
          status          = COALESCE($9, status),
          note            = COALESCE($10, note),
          sell_type       = COALESCE($11, sell_type)
       WHERE id=$1
       RETURNING id, building_id, room_no, floor, type, area_sqm,
                 base_rent_day, base_rent_month, status, note, sell_type, created_at`,
      [
        id,
        building_id ?? null,
        room_no?.trim() ?? null,
        floor ?? null,
        type ?? null,
        area_sqm ?? null,
        base_rent_day ?? null,
        base_rent_month ?? null,
        status ?? null,
        note ?? null,
        sellType,
      ]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Not found" });
    }
    return res.json(result.rows[0]);
  } catch (err) {
    if (err.code === "23505") {
      return res
        .status(400)
        .json({ message: "This room_no already exist in the building" });
    }
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.remove = async (req, res) => {
  try {
    const { id } = req.params;

    const pendapp = await pool.query(
      `SELECT 1 FROM bookings WHERE room_id=$1 AND status IN ('PENDING','APPROVED','CHECKED_IN') LIMIT 1`,
      [id]
    );
    if (pendapp.rowCount) {
      return res
        .status(400)
        .json({ message: "Cannot Delete: room has active booking" });
    }

    const actmov = await pool.query(
      `SELECT 1 FROM tenancies WHERE room_id=$1 AND status IN ('ACTIVE','MOVING_OUT') LIMIT 1`,
      [id]
    );
    if (actmov.rowCount) {
      return res
        .status(400)
        .json({ message: "Cannot delete: room has active tenancies" });
    }

    const result = await pool.query(`DELETE FROM rooms WHERE id=$1`, [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Not found" });
    }
    return res.status(201).json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.availability = async (req, res) => {
  try {
    const { start_date, end_date, building_id, sell_type } = req.query;
    if (!start_date || !end_date) {
      return res
        .status(400)
        .json({ message: "start_date and end_date are required (YYYY-MM-DD)" });
    }

    const vals = [start_date, end_date];
    const conds = [];

    if (building_id) {
      vals.push(building_id);
      conds.push(`r.building_id = $${vals.length}`);
    }
    if (sell_type) {
      vals.push(String(sell_type).toUpperCase());
      conds.push(`UPPER(r.sell_type) = $${vals.length}`);
    }

    const whereExtra = conds.length ? "AND " + conds.join(" AND ") : "";

    const sql = `
      SELECT r.*, b.code AS building_code, b.name AS building_name
      FROM rooms r
      JOIN buildings b ON b.id = r.building_id
      WHERE
        -- exclude conflicting bookings
        NOT EXISTS (
          SELECT 1 FROM bookings bk
          WHERE bk.room_id = r.id
          AND bk.status IN ('PENDING','APPROVED','CHECKED_IN')
          AND NOT ($2 <= bk.start_date OR $1 >= bk.end_date)
        )
        -- exclude overlapping active tenancies
        AND NOT EXISTS (
          SELECT 1 FROM tenancies t
          WHERE t.room_id = r.id
          AND t.status IN ('ACTIVE','MOVING_OUT')
          AND NOT ($2 <= t.start_date OR $1 >= COALESCE(t.end_date, '9999-12-31'))
        )
        ${whereExtra}
      ORDER BY b.code ASC, r.room_no ASC
    `;

    const rs = await pool.query(sql, vals);
    return res.json(rs.rows);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.overview = async (req, res) => {
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

    const roomBaseRs = await pool.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status = 'MAINTENANCE')::int AS maintenance
       FROM rooms`
    );
    const roomBase = roomBaseRs.rows[0] || { total: 0, maintenance: 0 };

    const occupiedRs = await pool.query(
      `
      SELECT DISTINCT room_id
      FROM tenancies
      WHERE room_id IS NOT NULL
        AND status IN ('ACTIVE','MOVING_OUT')
        AND NOT ($2 <= start_date OR $1 >= COALESCE(end_date, '9999-12-31'))
      `,
      [dayStartStr, dayEndStr]
    );
    const occupiedSet = new Set(occupiedRs.rows.map((row) => row.room_id));

    const reservedRs = await pool.query(
      `
      SELECT DISTINCT room_id
      FROM bookings
      WHERE room_id IS NOT NULL
        AND status IN ('PENDING','APPROVED','CHECKED_IN')
        AND NOT ($2 <= start_date OR $1 >= end_date)
      `,
      [dayStartStr, dayEndStr]
    );
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

    const breakdownRs = await pool.query(
      `SELECT status, COUNT(*)::int AS count FROM rooms GROUP BY status`
    );

    return res.json({
      date: dayStartStr,
      total: Number(roomBase.total || 0),
      maintenance: Number(roomBase.maintenance || 0),
      occupied: occupiedCount,
      reserved: reservedCount,
      available: availableCount,
      breakdown: breakdownRs.rows,
      occupied_room_ids: Array.from(occupiedSet),
      reserved_room_ids: Array.from(reservedSet)
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Server error' });
  }
};
