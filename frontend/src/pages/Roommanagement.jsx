import { useEffect, useMemo, useState } from "react";
import api from "../axios";

const STATUS = ["AVAILABLE", "RESERVED", "OCCUPIED", "MAINTENANCE"];

const Roommanagement = () => {
  const [buildings, setBuildings] = useState([]);
  const [editingBuildingId, setEditingBuildingId] = useState(null);
  const [buildingForm, setBuildingForm] = useState({ code: "", name: "", address: "" });
  const [newBuilding, setNewBuilding] = useState({ code: "", name: "", address: "" });

  const [rooms, setRooms] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [buildingId, setBuildingId] = useState("all");
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");

  const [newRoom, setNewRoom] = useState({
    building_id: "",
    room_no: "",
    floor: "",
    type: "",
    sell_type: "DAILY",
    base_rent_day: "",
    base_rent_month: "",
    status: "AVAILABLE",
    note: "",
  });

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editRoom, setEditRoom] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [bRes, rRes] = await Promise.all([api.get("/buildings"), api.get("/rooms")]);
        setBuildings(bRes.data || []);
        setRooms(rRes.data || []);
        setError("");
      } catch (e) {
        setError(
          e?.response?.data?.message || e?.response?.data?.error || "Load failed"
        );
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ===== Derived list (filters + search) =====
  const viewRooms = useMemo(() => {
    let list = rooms;

    if (buildingId !== "all") {
      list = list.filter((x) => x.building_id === buildingId);
    }
    if (status !== "all") {
      list = list.filter((x) => x.status === status);
    }

    const qq = String(q || "").trim().toLowerCase();
    if (qq) {
      list = list.filter(
        (x) =>
          (x.room_no || "").toLowerCase().includes(qq) ||
          (x.type || "").toLowerCase().includes(qq) ||
          (x.building_code || "").toLowerCase().includes(qq)
      );
    }
    return list;
  }, [rooms, buildingId, status, q]);

  // ===== Helpers =====
  const refreshRooms = async () => {
    const res = await api.get("/rooms", {
      params: {
        building_id: buildingId !== "all" ? buildingId : undefined,
        status: status !== "all" ? status : undefined,
        q: q || undefined,
      },
    });
    setRooms(res.data || []);
  };

  // ===== Buildings: CRUD =====
  const createBuilding = async () => {
    try {
      if (!newBuilding.code.trim()) return alert("Code is required");
      const res = await api.post("/buildings", {
        code: newBuilding.code.trim(),
        name: newBuilding.name || null,
        address: newBuilding.address || null
      });
      setBuildings((prev) => [...prev, res.data]);
      setNewBuilding({ code: "", name: "", address: "" });
    } catch (e) {
      alert(e?.response?.data?.message || "Create building failed");
    }
  };

  const startEditBuilding = (b) => {
    setEditingBuildingId(b.id);
    setBuildingForm({ code: b.code || "", name: b.name || "", address: b.address || "" });
  };

  const cancelEditBuilding = () => {
    setEditingBuildingId(null);
    setBuildingForm({ code: "", name: "", address: "" });
  };

  const saveBuilding = async () => {
    try {
      const id = editingBuildingId;
      if (!id) return;
      const res = await api.patch(`/buildings/${id}`, {
        code: buildingForm.code?.trim() || null,
        name: buildingForm.name || null,
        address: buildingForm.address || null,
      });
      setBuildings((prev) => prev.map((x) => (x.id === id ? res.data : x)));
      cancelEditBuilding();
    } catch (e) {
      alert(e?.response?.data?.message || "Update building failed");
    }
  };

  const deleteBuilding = async (id) => {
    if (!window.confirm("Delete this building? Rooms inside must be empty.")) return;
    try {
      await api.delete(`/buildings/${id}`);
      setBuildings((prev) => prev.filter((x) => x.id !== id));
      if (buildingId === id) setBuildingId("all");
      await refreshRooms();
    } catch (e) {
      alert(e?.response?.data?.message || "Delete building failed");
    }
  };

  // ===== Rooms: Create / Delete =====
  const createRoom = async () => {
    try {
      if (!newRoom.building_id || !newRoom.room_no.trim()) {
        return alert("building and room_no are required");
      }
      const payload = {
        building_id: newRoom.building_id,
        room_no: newRoom.room_no.trim(),
        floor: newRoom.floor !== "" ? Number(newRoom.floor) : null,
        type: newRoom.type ? newRoom.type.toUpperCase() : null,
        sell_type: newRoom.sell_type || "DAILY",
        area_sqm: null,
        base_rent_day: newRoom.base_rent_day !== "" ? Number(newRoom.base_rent_day) : null,
        base_rent_month: newRoom.base_rent_month !== "" ? Number(newRoom.base_rent_month) : null,
        status: newRoom.status,
        note: newRoom.note || null,
      };
      await api.post("/rooms", payload);
      await refreshRooms();
      setNewRoom({
        building_id: "",
        room_no: "",
        floor: "",
        type: "",
        sell_type: "DAILY",
        base_rent_day: "",
        base_rent_month: "",
        status: "AVAILABLE",
        note: "",
      });
    } catch (e) {
      alert(e?.response?.data?.message || "Create room failed");
    }
  };

  const deleteRoom = async (id) => {
    if (!window.confirm("Delete this room?")) return;
    try {
      await api.delete(`/rooms/${id}`);
      setRooms((prev) => prev.filter((x) => x.id !== id));
    } catch (e) {
      alert(e?.response?.data?.message || "Delete room failed");
    }
  };

  // ===== Rooms: Edit (Modal) =====
  const openEdit = (room) => {
    setEditRoom({
      id: room.id,
      building_id: room.building_id,
      room_no: room.room_no || "",
      floor: room.floor ?? "",
      type: room.type ?? "",
      sell_type: room.sell_type || "DAILY",
      base_rent_day: room.base_rent_day ?? "",
      base_rent_month: room.base_rent_month ?? "",
      status: room.status || "AVAILABLE",
      note: room.note ?? "",
    });
    setIsEditOpen(true);
  };

  const closeEdit = () => {
    setIsEditOpen(false);
    setEditRoom(null);
  };

  const saveEditRoom = async () => {
    try {
      if (!editRoom) return;
      const payload = {
        building_id: editRoom.building_id,
        room_no: editRoom.room_no.trim(),
        floor: editRoom.floor !== "" ? Number(editRoom.floor) : null,
        type: editRoom.type ? editRoom.type.toUpperCase() : null,
        sell_type: editRoom.sell_type || "DAILY",
        base_rent_day: editRoom.base_rent_day !== "" ? Number(editRoom.base_rent_day) : null,
        base_rent_month: editRoom.base_rent_month !== "" ? Number(editRoom.base_rent_month) : null,
        status: editRoom.status,
        note: editRoom.note || null,
      };
      await api.patch(`/rooms/${editRoom.id}`, payload);
      await refreshRooms();
      closeEdit();
    } catch (e) {
      alert(e?.response?.data?.message || "Update room failed");
    }
  };

  // ===== Render =====
  if (loading) return <div className="p-4">Loading rooms…</div>;

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-lg font-semibold">Rooms</h2>
      {error && <div className="text-red-600">{error}</div>}

      {/* ===== BUILDINGS (create + list+inline edit + filters) ===== */}
      <div className="border p-3 rounded">
        <h3 className="font-medium mb-2">Buildings</h3>

        {/* create new building */}
        <div className="flex gap-2 mb-3">
          <input
            className="border px-2 py-1"
            placeholder="Code (e.g. B1)"
            value={newBuilding.code}
            onChange={(e) => setNewBuilding((f) => ({ ...f, code: e.target.value }))}
          />
          <input
            className="border px-2 py-1"
            placeholder="Name"
            value={newBuilding.name}
            onChange={(e) => setNewBuilding((f) => ({ ...f, name: e.target.value }))}
          />
          <input
            className="border px-2 py-1 w-80"
            placeholder="Address"
            value={newBuilding.address}
            onChange={(e) => setNewBuilding((f) => ({ ...f, address: e.target.value }))}
          />
          <button onClick={createBuilding} className="border px-3 py-1">
            Add Building
          </button>
        </div>

        {/* buildings list + inline edit */}
        <div className="overflow-x-auto mb-3">
          <table className="min-w-[640px] border">
            <thead className="bg-gray-50">
              <tr>
                <th className="border p-2 text-left">Code</th>
                <th className="border p-2 text-left">Name</th>
                <th className="border p-2 text-left">Address</th>
                <th className="border p-2 text-left">Action</th>
              </tr>
            </thead>
            <tbody>
              {buildings.map((b) => {
                const isEd = editingBuildingId === b.id;
                return (
                  <tr key={b.id} className="odd:bg-white even:bg-gray-50">
                    <td className="border p-2">
                      {isEd ? (
                        <input
                          className="border px-2 py-1"
                          value={buildingForm.code}
                          onChange={(e) =>
                            setBuildingForm((f) => ({ ...f, code: e.target.value }))
                          }
                        />
                      ) : (
                        b.code
                      )}
                    </td>
                    <td className="border p-2">
                      {isEd ? (
                        <input
                          className="border px-2 py-1"
                          value={buildingForm.name}
                          onChange={(e) =>
                            setBuildingForm((f) => ({ ...f, name: e.target.value }))
                          }
                        />
                      ) : (
                        b.name || "-"
                      )}
                    </td>
                    <td className="border p-2">
                      {isEd ? (
                        <input
                          className="border px-2 py-1 w-80"
                          value={buildingForm.address}
                          onChange={(e) =>
                            setBuildingForm((f) => ({ ...f, address: e.target.value }))
                          }
                        />
                      ) : (
                        b.address || "-"
                      )}
                    </td>
                    <td className="border p-2 space-x-2">
                      {isEd ? (
                        <>
                          <button
                            className="px-3 py-1 rounded border border-indigo-600 bg-indigo-600 text-white shadow hover:bg-indigo-700"
                            onClick={saveBuilding}
                          >
                            Save
                          </button>
                          <button className="border px-3 py-1" onClick={cancelEditBuilding}>
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            className="border px-3 py-1"
                            onClick={() => startEditBuilding(b)}
                          >
                            Edit
                          </button>
                          <button
                            className="border px-3 py-1"
                            onClick={() => deleteBuilding(b.id)}
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
              {buildings.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-3 text-center">
                    No buildings
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* filters for rooms */}
        <div className="flex gap-2 items-center">
          <span>Filter:</span>
          <select
            value={buildingId}
            onChange={(e) => setBuildingId(e.target.value)}
            className="border px-2 py-1"
          >
            <option value="all">All Buildings</option>
            {buildings.map((b) => (
              <option key={b.id} value={b.id}>
                {b.code} {b.name ? `- ${b.name}` : ""}
              </option>
            ))}
          </select>

          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="border px-2 py-1"
          >
            <option value="all">All Status</option>
            {STATUS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <input
            placeholder="Search room/type/building…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="border px-2 py-1"
          />
          <button onClick={refreshRooms} className="border px-3 py-1">
            Refresh
          </button>
        </div>
      </div>

      {/* ===== CREATE ROOM ===== */}
      <div className="border p-3 rounded">
        <h3 className="font-medium mb-2">Create Room</h3>
        <div className="flex flex-wrap gap-2">
          <select
            value={newRoom.building_id}
            onChange={(e) => setNewRoom((f) => ({ ...f, building_id: e.target.value }))}
            className="border px-2 py-1"
          >
            <option value="">Select Building</option>
            {buildings.map((b) => (
              <option key={b.id} value={b.id}>
                {b.code}
              </option>
            ))}
          </select>
          <input
            placeholder="Room no"
            value={newRoom.room_no}
            onChange={(e) => setNewRoom((f) => ({ ...f, room_no: e.target.value }))}
            className="border px-2 py-1"
          />
          <input
            placeholder="Floor"
            value={newRoom.floor}
            onChange={(e) => setNewRoom((f) => ({ ...f, floor: e.target.value }))}
            className="border px-2 py-1 w-24"
          />
          <input
            placeholder="Type (STANDARD/DELUXE)"
            value={newRoom.type}
            onChange={(e) => setNewRoom((f) => ({ ...f, type: e.target.value }))}
            className="border px-2 py-1"
          />
          <select
            value={newRoom.sell_type}
            onChange={(e) => setNewRoom((f) => ({ ...f, sell_type: e.target.value }))}
            className="border px-2 py-1"
          >
            <option value="DAILY">Daily</option>
            <option value="MONTHLY">Monthly</option>
          </select>
          <input
            placeholder="Rent/Day"
            value={newRoom.base_rent_day}
            onChange={(e) => setNewRoom((f) => ({ ...f, base_rent_day: e.target.value }))}
            className="border px-2 py-1 w-28"
          />
          <input
            placeholder="Rent/Month"
            value={newRoom.base_rent_month}
            onChange={(e) =>
              setNewRoom((f) => ({ ...f, base_rent_month: e.target.value }))
            }
            className="border px-2 py-1 w-32"
          />
          <select
            value={newRoom.status}
            onChange={(e) => setNewRoom((f) => ({ ...f, status: e.target.value }))}
            className="border px-2 py-1"
          >
            {STATUS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <input
            placeholder="Note (optional)"
            value={newRoom.note}
            onChange={(e) => setNewRoom((f) => ({ ...f, note: e.target.value }))}
            className="border px-2 py-1 w-80"
          />
          <button onClick={createRoom} className="border px-3 py-1">
            Add Room
          </button>
        </div>
      </div>

      {/* ===== ROOMS TABLE ===== */}
      <div className="overflow-x-auto">
        <table className="min-w-[900px] border">
          <thead className="bg-gray-50">
            <tr>
              <th className="border p-2 text-left">Building</th>
              <th className="border p-2 text-left">Room</th>
              <th className="border p-2 text-left">Floor</th>
              <th className="border p-2 text-left">Type</th>
              <th className="border p-2 text-left">Sell Type</th>
              <th className="border p-2 text-left">Rent/Day</th>
              <th className="border p-2 text-left">Rent/Month</th>
              <th className="border p-2 text-left">Status</th>
              <th className="border p-2 text-left">Action</th>
            </tr>
          </thead>
          <tbody>
            {viewRooms.map((r) => (
              <tr key={r.id} className="odd:bg-white even:bg-gray-50">
                <td className="border p-2">{r.building_code}</td>
                <td className="border p-2">{r.room_no}</td>
                <td className="border p-2">{r.floor ?? "-"}</td>
                <td className="border p-2">{r.type ?? "-"}</td>
                <td className="border p-2">{(r.sell_type || "-").toUpperCase()}</td>
                <td className="border p-2">{r.base_rent_day ?? "-"}</td>
                <td className="border p-2">{r.base_rent_month ?? "-"}</td>
                <td className="border p-2">{r.status}</td>
                <td className="border p-2">
                  <button className="border px-2 py-1 mr-2" onClick={() => openEdit(r)}>
                    Edit
                  </button>
                  <button className="border px-2 py-1" onClick={() => deleteRoom(r.id)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {viewRooms.length === 0 && (
              <tr>
                <td className="p-3 text-center" colSpan={9}>
                  No rooms found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ===== Edit Room Modal ===== */}
      {isEditOpen && editRoom && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded shadow p-4 w-[720px]">
            <h3 className="font-semibold text-lg mb-3">Edit Room</h3>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm">Building</label>
                <select
                  className="border px-2 py-1 w-full"
                  value={editRoom.building_id}
                  onChange={(e) =>
                    setEditRoom((f) => ({ ...f, building_id: e.target.value }))
                  }
                >
                  {buildings.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.code}
                      {b.name ? ` - ${b.name}` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm">Room No</label>
                <input
                  className="border px-2 py-1 w-full"
                  value={editRoom.room_no}
                  onChange={(e) =>
                    setEditRoom((f) => ({ ...f, room_no: e.target.value }))
                  }
                />
              </div>

              <div>
                <label className="block text-sm">Floor</label>
                <input
                  className="border px-2 py-1 w-full"
                  value={editRoom.floor}
                  onChange={(e) =>
                    setEditRoom((f) => ({ ...f, floor: e.target.value }))
                  }
                />
              </div>

              <div>
                <label className="block text-sm">Type</label>
                <input
                  className="border px-2 py-1 w-full"
                  value={editRoom.type}
                  onChange={(e) =>
                    setEditRoom((f) => ({ ...f, type: e.target.value }))
                  }
                />
              </div>

              <div>
                <label className="block text-sm">Sell Type</label>
                <select
                  className="border px-2 py-1 w-full"
                  value={editRoom.sell_type}
                  onChange={(e) =>
                    setEditRoom((f) => ({ ...f, sell_type: e.target.value }))
                  }
                >
                  <option value="DAILY">Daily</option>
                  <option value="MONTHLY">Monthly</option>
                </select>
              </div>

              <div>
                <label className="block text-sm">Rent/Day</label>
                <input
                  className="border px-2 py-1 w-full"
                  value={editRoom.base_rent_day}
                  onChange={(e) =>
                    setEditRoom((f) => ({ ...f, base_rent_day: e.target.value }))
                  }
                />
              </div>

              <div>
                <label className="block text-sm">Rent/Month</label>
                <input
                  className="border px-2 py-1 w-full"
                  value={editRoom.base_rent_month}
                  onChange={(e) =>
                    setEditRoom((f) => ({ ...f, base_rent_month: e.target.value }))
                  }
                />
              </div>

              <div>
                <label className="block text-sm">Status</label>
                <select
                  className="border px-2 py-1 w-full"
                  value={editRoom.status}
                  onChange={(e) =>
                    setEditRoom((f) => ({ ...f, status: e.target.value }))
                  }
                >
                  {STATUS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div className="col-span-2">
                <label className="block text-sm">Note</label>
                <textarea
                  className="border px-2 py-1 w-full"
                  rows={2}
                  value={editRoom.note}
                  onChange={(e) =>
                    setEditRoom((f) => ({ ...f, note: e.target.value }))
                  }
                />
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button className="border px-3 py-1" onClick={closeEdit}>
                Cancel
              </button>
              <button
                className="px-3 py-1 rounded border border-indigo-600 bg-indigo-600 text-white shadow hover:bg-indigo-700"
                onClick={saveEditRoom}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Roommanagement;
