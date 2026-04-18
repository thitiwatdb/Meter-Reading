const pool = require("../config/db");

exports.list = async (req, res) => {
    try {
        const result = await pool.query( "SELECT id, code, name, address, created_at FROM buildings ORDER BY code ASC")
        return res.json(result.rows);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Server error"})
    }
};

exports.create = async (req, res) => {
    try {
        const {code, name, address } = req.body;
        if(!code){
            return res.status(400).json({ message: "code is required"})
        }

        const result = await pool.query( "INSERT INTO buildings (code, name, address) VALUES ($1,$2,$3) RETURNING id, code, name, address, created_at",[code.trim(), name || null, address || null])
        return res.status(201).json(result.rows[0])
    } catch (err) {
        if (err.code === "23505") {
            return res.status(400).json({ message: "Building code already exist"})
        }
        console.error(err)
        return res.status(500).json({ message: "Server error"})
    }
}

exports.update = async (req, res) => {
    try {
        const { id } = req.params;
        const { code, name, address } = req.body;

        const result = await pool.query("UPDATE buildings SET code = COALESCE($2, code),name = COALESCE($3, name), address = COALESCE($4, address) WHERE id=$1 RETURNING id, code, name, address, created_at",[id, code?.trim() ?? null, name ?? null, address ?? null])
        
        if(result.rowCount === 0) {
            return res.status(404).json({ message: "Not found"})
        }
        return res.json(result.rows[0]);
    } catch (err) {
        if(err.code === "23505") {
            return res.status(400).json({ message: "Building code already exist"})
        }
        console.error(err)
        return res.status(500).json({ message: "Server error"})
    }
}

exports.remove = async (req, res) => {
    try {
        const { id } = req.params;

        const rooms = await pool.query("SELECT 1 FROM rooms WHERE building_id = $1 LIMIT 1",[id])

        if(rooms.rowCount > 0) {
            return res.status(400).json({ message: "Cannot delete: building has rooms"})
        }
        const result = await pool.query("DELETE FROM buildings WHERE id = $1",[id])
        if(result.rowCount === 0) {
            return res.status(404).json({ message: "Not found"})
        }
        return res.json({ ok: true})
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Server error"})
    }
}