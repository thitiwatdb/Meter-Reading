import { useEffect, useState } from "react";
import api from "../axios";

const STATUS = ["AVAILABLE", "RESERVED", "OCCUPIED", "MAINTENANCE"];

const RoomBrowser = () => {
  const [buildings, setBuildings] = useState([]);
  const [rooms, setRooms] = useState([]);

  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [searchSellType, setSearchSellType] = useState("DAILY");
  const [searchMonth, setSearchMonth] = useState("");
  const [buildingId, setBuildingId] = useState("all");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);

  const [bookOpen, setBookOpen] = useState(false);
  const [bookForm, setBookForm] = useState({
    room_id: "",
    start_date: "",
    end_date: "",
    is_monthly: false,
    note: "",
  });
  const [customer, setCustomer] = useState({ username: "", email: "", full_name: "", phone: "" });
  const [resolvedTenant, setResolvedTenant] = useState(null);
  const [role, setRole] = useState("");
  const [onlineOpen, setOnlineOpen] = useState(false);
  const [onlineForm, setOnlineForm] = useState({
    sell_type: "DAILY",
    room_type: "STANDARD",
    start_date: "",
    end_date: "",
    note: ""
  });
  const [onlineMonth, setOnlineMonth] = useState("");
  const [walkinType, setWalkinType] = useState("DAILY");
  const [monthlyMonth, setMonthlyMonth] = useState("");
  const [selectedRoomSellType, setSelectedRoomSellType] = useState("DAILY");

  const computeMonthRange = (value) => {
    if (!value) return { start: "", end: "" };
    const [yearStr, monthStr] = value.split("-") || [];
    const year = Number(yearStr);
    const month = Number(monthStr);
    if (!year || !month) return { start: "", end: "" };
    const paddedMonth = String(month).padStart(2, "0");
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const startIso = `${yearStr}-${paddedMonth}-01`;
    const endIso = `${yearStr}-${paddedMonth}-${String(daysInMonth).padStart(2, "0")}`;
    return { start: startIso, end: endIso };
  };

  const handleWalkinTypeChange = (nextType) => {
    const normalized = nextType === "MONTHLY" ? "MONTHLY" : "DAILY";
    if (normalized !== selectedRoomSellType) {
      return;
    }
    setWalkinType(normalized);
    if (normalized === "MONTHLY") {
      const fallback = (start || bookForm.start_date || new Date().toISOString().slice(0, 10)).slice(0, 7);
      const base = monthlyMonth || fallback;
      const range = computeMonthRange(base);
      setMonthlyMonth(base);
      setBookForm((f) => ({
        ...f,
        is_monthly: true,
        start_date: range.start || f.start_date,
        end_date: range.end || f.end_date,
      }));
    } else {
      setMonthlyMonth("");
      setBookForm((f) => ({
        ...f,
        is_monthly: false,
        start_date: start || f.start_date,
        end_date: end || f.end_date,
      }));
    }
  };

  const handleMonthlyMonthChange = (value) => {
    setMonthlyMonth(value);
    const range = computeMonthRange(value);
    if (!range.start || !range.end) return;
    setBookForm((f) => ({
      ...f,
      is_monthly: true,
      start_date: range.start,
      end_date: range.end,
    }));
  };

  const handleOnlineTypeChange = (value) => {
    const normalized = value === "MONTHLY" ? "MONTHLY" : "DAILY";
    if (normalized === "MONTHLY") {
      const base = (onlineMonth || new Date().toISOString().slice(0, 7));
      const range = computeMonthRange(base);
      setOnlineMonth(base);
      setOnlineForm((f) => ({
        ...f,
        sell_type: "MONTHLY",
        start_date: range.start,
        end_date: range.end,
      }));
    } else {
      setOnlineMonth("");
      setOnlineForm((f) => ({
        ...f,
        sell_type: "DAILY",
        start_date: "",
        end_date: "",
      }));
    }
  };

  useEffect(() => {
    (async () => {
      const b = await api.get("/buildings");
      setBuildings(b.data || []);
    })();
    setRole(localStorage.getItem("role") || "");
  }, []);

  const handleSearchTypeChange = (value) => {
    const normalized = value === "MONTHLY" ? "MONTHLY" : "DAILY";
    setSearchSellType(normalized);
    if (normalized === "MONTHLY") {
      setSearchMonth((prev) => prev || new Date().toISOString().slice(0, 7));
      setStart("");
      setEnd("");
    } else {
      setSearchMonth("");
    }
  };

  const search = async () => {
    let searchStart = start;
    let searchEnd = end;

    if (searchSellType === "MONTHLY") {
      if (!searchMonth) {
        return alert("Please choose a month");
      }
      const range = computeMonthRange(searchMonth);
      if (!range.start || !range.end) {
        return alert("Invalid month");
      }
      searchStart = range.start;
      searchEnd = range.end;
      setStart(range.start);
      setEnd(range.end);
    } else {
      if (!searchStart || !searchEnd) {
        return alert("Please choose start and end dates");
      }
      if (new Date(searchStart) >= new Date(searchEnd)) {
        return alert("End date must be after start date");
      }
    }
    setLoading(true);
    try {
      const res = await api.get("/rooms/availability", {
        params: {
          start_date: searchStart,
          end_date: searchEnd,
          building_id: buildingId !== "all" ? buildingId : undefined,
          sell_type: searchSellType,
        },
      });
      let list = res.data || [];
      const qq = (q || "").trim().toLowerCase();
      if (qq) {
        list = list.filter(
          (r) =>
            (r.room_no || "").toLowerCase().includes(qq) ||
            (r.type || "").toLowerCase().includes(qq) ||
            (r.building_code || "").toLowerCase().includes(qq)
        );
      }
      setRooms(list);
    } finally {
      setLoading(false);
    }
  };

  const openBook = (room) => {
    const defaultType = String(room.sell_type || "DAILY").toUpperCase();
    const nextType = defaultType === "MONTHLY" ? "MONTHLY" : "DAILY";
    const todayIso = new Date().toISOString().slice(0, 10);
    const baseStart = start || bookForm.start_date || todayIso;
    const baseEnd = end || bookForm.end_date || baseStart;
    let startDate = baseStart;
    let endDate = baseEnd;
    let monthValue = monthlyMonth || searchMonth;
    if (nextType === "MONTHLY") {
      if (!monthValue) {
        monthValue = (searchMonth || baseStart || todayIso).slice(0, 7);
      }
      const range = computeMonthRange(monthValue);
      startDate = range.start || startDate;
      endDate = range.end || endDate;
    }
    setSelectedRoomSellType(nextType);
    setWalkinType(nextType);
    setMonthlyMonth(nextType === "MONTHLY" ? monthValue : "");
    setBookForm((f) => ({
      ...f,
      room_id: room.id,
      start_date: startDate,
      end_date: endDate,
      is_monthly: nextType === "MONTHLY",
    }));
    setBookOpen(true);
  };

  const openOnline = (room) => {
    const type = String(room.sell_type || "DAILY").toUpperCase();
    const roomType = String(room.type || "STANDARD").toUpperCase();
    if (type === "MONTHLY") {
      const base = (searchMonth || start || new Date().toISOString().slice(0, 10)).slice(0, 7);
      const range = computeMonthRange(base);
      setOnlineMonth(base);
      setOnlineForm((f) => ({
        ...f,
        sell_type: "MONTHLY",
        room_type: roomType,
        start_date: range.start,
        end_date: range.end,
      }));
    } else {
      setOnlineMonth("");
      setOnlineForm((f) => ({
        ...f,
        sell_type: "DAILY",
        room_type: roomType,
        start_date: start || f.start_date,
        end_date: end || f.end_date,
      }));
    }
    setOnlineOpen(true);
  };

  const closeBook = () => {
    setBookOpen(false);
    setBookForm({
      room_id: "",
      start_date: "",
      end_date: "",
      is_monthly: false,
      note: "",
    });
    setWalkinType("DAILY");
    setMonthlyMonth("");
    setSelectedRoomSellType("DAILY");
  };

  const submitBooking = async () => {
    const isMonthly = walkinType === "MONTHLY";
    if (isMonthly) {
      if (!monthlyMonth) {
        return alert("Please choose a month for monthly bookings");
      }
    } else if (!bookForm.start_date || !bookForm.end_date) {
      return alert("Please choose start and end dates");
    }
    if (!bookForm.room_id) {
      return alert("Room not selected");
    }
    // Walk-in bookings allocate a fixed room for the selected tenant.
    if (!resolvedTenant?.id) {
      return alert("Please find or create customer first");
    }
    if (!isMonthly) {
      const startDate = new Date(bookForm.start_date);
      const endDate = new Date(bookForm.end_date);
      if (!(startDate instanceof Date) || isNaN(startDate.getTime()) || !(endDate instanceof Date) || isNaN(endDate.getTime()) || startDate >= endDate) {
        return alert("End date must be after start date");
      }
    }
    const payload = {
      tenant_id: resolvedTenant.id,
      room_id: bookForm.room_id,
      start_date: bookForm.start_date,
      end_date: bookForm.end_date,
      is_monthly: isMonthly,
      note: bookForm.note,
    };
    await api.post("/bookings/walkin", payload);
    alert("Booking recorded. Please collect full payment before check-in.");
    closeBook();
  };

  const ensureCustomer = async () => {
    try {
      if (!customer.username && !customer.email) {
        return alert("Username or email required");
      }
      const phoneValue = (customer.phone || "").trim();
      if (!phoneValue) {
        return alert("Phone required");
      }
      const payload = {
        username: customer.username?.trim() || "",
        email: customer.email?.trim() || "",
        full_name: customer.full_name?.trim() || "",
        phone: phoneValue,
      };
      const res = await api.post("/users/ensure-tenant", payload);
      setResolvedTenant(res.data);
      alert(`Customer ready: ${res.data.username}`);
    } catch (e) {
      alert(e.response?.data?.message || "Failed to ensure customer");
    }
  };

  const submitOnline = async () => {
    let payload = { ...onlineForm };
    if (onlineForm.sell_type === "MONTHLY") {
      if (!onlineMonth) {
        return alert("Please choose a month");
      }
      const range = computeMonthRange(onlineMonth);
      if (!range.start || !range.end) {
        return alert("Invalid month selection");
      }
      payload = { ...payload, start_date: range.start, end_date: range.end };
    } else if (!onlineForm.start_date || !onlineForm.end_date) {
      return alert("Please choose start and end dates");
    }
    await api.post("/bookings/online", payload);
    alert("Online booking request submitted. A staff member will allocate a room.");
    setOnlineOpen(false);
    setOnlineForm({ sell_type: "DAILY", room_type: "STANDARD", start_date: "", end_date: "", note: "" });
    setOnlineMonth("");
  };

  const isStaff = ["ADMIN", "MANAGER"].includes(String(role).toUpperCase());

  return (
    <>
      <div className="p-4 max-w-6xl mx-auto space-y-4">
        <h2 className="text-xl font-semibold">{isStaff ? "Walk-in Booking" : "Request Booking"}</h2>

        {isStaff ? (
          <div className="flex flex-wrap gap-2 items-end">
            <div>
              <label className="block text-sm">Booking Type</label>
              <select
                className="border px-2 py-1"
                value={searchSellType}
                onChange={(e) => handleSearchTypeChange(e.target.value)}
              >
                <option value="DAILY">Daily</option>
                <option value="MONTHLY">Monthly</option>
              </select>
            </div>
            {searchSellType === "MONTHLY" ? (
              <div>
                <label className="block text-sm">Stay Month</label>
                <input
                  type="month"
                  className="border px-2 py-1"
                  value={searchMonth}
                  onChange={(e) => setSearchMonth(e.target.value)}
                />
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-sm">Start</label>
                  <input
                    type="date"
                    className="border px-2 py-1"
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm">End</label>
                  <input
                    type="date"
                    className="border px-2 py-1"
                    value={end}
                    onChange={(e) => setEnd(e.target.value)}
                  />
                </div>
              </>
            )}
            <div>
              <label className="block text-sm">Building</label>
              <select
                className="border px-2 py-1"
                value={buildingId}
                onChange={(e) => setBuildingId(e.target.value)}
              >
                <option value="all">All</option>
                {buildings.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.code}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm">Search</label>
              <input
                className="border px-2 py-1"
                placeholder="room/type/building"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <button className="border px-3 py-1" onClick={search} disabled={loading}>
              {loading ? "Searching..." : "Search"}
            </button>
          </div>
        ) : (
          <div className="p-3 rounded bg-amber-50 border text-sm text-amber-800">
            Tenants cannot browse availability directly. Please submit an online booking request.
          </div>
        )}

        {isStaff && (
          <div className="overflow-x-auto rounded border">
            <table className="min-w-[900px] w-full">
              <thead className="bg-gray-50 text-left">
                <tr>
                  <th className="p-2 border-b">Building</th>
                  <th className="p-2 border-b">Room</th>
                  <th className="p-2 border-b">Type</th>
                  <th className="p-2 border-b">Sell Type</th>
                  <th className="p-2 border-b">Rent/Day</th>
                  <th className="p-2 border-b">Rent/Month</th>
                  <th className="p-2 border-b">Status</th>
                  <th className="p-2 border-b">Action</th>
                </tr>
              </thead>
              <tbody>
                {rooms.map((r) => (
                  <tr key={r.id} className="odd:bg-white even:bg-gray-50">
                    <td className="p-2 border-b">{r.building_code}</td>
                    <td className="p-2 border-b">{r.room_no}</td>
                    <td className="p-2 border-b">{r.type ?? "-"}</td>
                    <td className="p-2 border-b">{(r.sell_type || "-").toUpperCase()}</td>
                    <td className="p-2 border-b">{r.base_rent_day ?? "-"}</td>
                    <td className="p-2 border-b">{r.base_rent_month ?? "-"}</td>
                    <td className="p-2 border-b">{r.status}</td>
                    <td className="p-2 border-b">
                      {isStaff ? (
                        <button className="px-3 py-1 border rounded hover:bg-gray-50" onClick={() => openBook(r)}>
                          Book
                        </button>
                      ) : (
                        <button className="px-3 py-1 border rounded hover:bg-gray-50" onClick={() => openOnline(r)}>
                          Request
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {rooms.length === 0 && (
                  <tr>
                    <td className="p-3 text-center" colSpan={8}>
                      No rooms
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {!isStaff && (
          <div>
            <button className="border px-3 py-1" onClick={() => setOnlineOpen(true)}>
              Submit Online Booking Request
            </button>
          </div>
        )}

        {isStaff && bookOpen && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white rounded shadow p-4 w-[520px]">
              <h3 className="font-semibold text-lg mb-3">Walk-in Booking</h3>
              <div className="space-y-2">
                <div className="border rounded p-2">
                  <div className="text-sm font-medium mb-1">Customer</div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      className="border px-2 py-1"
                      placeholder="username"
                      value={customer.username}
                      onChange={(e) => setCustomer((c) => ({ ...c, username: e.target.value }))}
                    />
                    <input
                      className="border px-2 py-1"
                      placeholder="email"
                      value={customer.email}
                      onChange={(e) => setCustomer((c) => ({ ...c, email: e.target.value }))}
                    />
                    <input
                      className="border px-2 py-1"
                      placeholder="full name"
                      value={customer.full_name}
                      onChange={(e) => setCustomer((c) => ({ ...c, full_name: e.target.value }))}
                    />
                    <input
                      className="border px-2 py-1"
                      placeholder="phone"
                      value={customer.phone}
                      onChange={(e) => setCustomer((c) => ({ ...c, phone: e.target.value }))}
                    />
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <button className="px-3 py-1 border rounded hover:bg-gray-50" type="button" onClick={ensureCustomer}>
                      Find or Create
                    </button>
                    {resolvedTenant && <span className="text-sm text-green-700">Using: {resolvedTenant.username}</span>}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium">Booking Type</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={selectedRoomSellType !== 'DAILY'}
                      className={`px-3 py-1 rounded-xl border ${
                        walkinType === 'DAILY'
                          ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white border-transparent shadow'
                          : 'bg-white text-gray-700 border-gray-300'
                      } ${selectedRoomSellType !== 'DAILY' ? 'opacity-40 cursor-not-allowed' : ''}`}
                      onClick={() => handleWalkinTypeChange('DAILY')}
                    >
                      Daily
                    </button>
                    <button
                      type="button"
                      disabled={selectedRoomSellType !== 'MONTHLY'}
                      className={`px-3 py-1 rounded-xl border ${
                        walkinType === 'MONTHLY'
                          ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white border-transparent shadow'
                          : 'bg-white text-gray-700 border-gray-300'
                      } ${selectedRoomSellType !== 'MONTHLY' ? 'opacity-40 cursor-not-allowed' : ''}`}
                      onClick={() => handleWalkinTypeChange('MONTHLY')}
                    >
                      Monthly
                    </button>
                  </div>
                </div>
                {walkinType === 'MONTHLY' ? (
                  <div>
                    <label className="block text-sm">Stay month</label>
                    <input
                      type="month"
                      className="border px-2 py-1 w-full"
                      value={monthlyMonth}
                      onChange={(e) => handleMonthlyMonthChange(e.target.value)}
                    />
                    {bookForm.start_date && bookForm.end_date && (
                      <p className="text-xs text-gray-500 mt-1">
                        {bookForm.start_date} → {bookForm.end_date}
                      </p>
                    )}
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="block text-sm">Start</label>
                      <input
                        type="date"
                        className="border px-2 py-1 w-full"
                        value={bookForm.start_date}
                        onChange={(e) => setBookForm((f) => ({ ...f, start_date: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="block text-sm">End</label>
                      <input
                        type="date"
                        className="border px-2 py-1 w-full"
                        value={bookForm.end_date}
                        onChange={(e) => setBookForm((f) => ({ ...f, end_date: e.target.value }))}
                      />
                    </div>
                  </>
                )}
                <div>
                  <label className="block text-sm">Note</label>
                  <textarea
                    className="border px-2 py-1 w-full"
                    rows={2}
                    value={bookForm.note}
                    onChange={(e) => setBookForm((f) => ({ ...f, note: e.target.value }))}
                  />
                </div>
              </div>

              <div className="mt-3 flex justify-end gap-2">
                <button className="border px-3 py-1 rounded hover:bg-gray-50" onClick={closeBook}>
                  Cancel
                </button>
                <button className="px-3 py-1 rounded-xl border border-transparent bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow hover:shadow-lg" onClick={submitBooking}>
                  Book
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      {onlineOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded shadow p-4 w-[520px]">
            <h3 className="font-semibold text-lg mb-3">Request Online Booking</h3>
            <div className="space-y-2">
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-sm">Sell Type</label>
                  <select
                    className="border px-2 py-1 w-full"
                    value={onlineForm.sell_type}
                    onChange={(e) => handleOnlineTypeChange(e.target.value)}
                  >
                    <option value="DAILY">DAILY</option>
                    <option value="MONTHLY">MONTHLY</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-sm">Room Type</label>
                  <select
                    className="border px-2 py-1 w-full"
                    value={onlineForm.room_type}
                    onChange={(e) => setOnlineForm((f) => ({ ...f, room_type: e.target.value }))}
                  >
                    <option value="STANDARD">STANDARD</option>
                    <option value="DELUXE">DELUXE</option>
                    <option value="SUITE">SUITE</option>
                  </select>
                </div>
              </div>
              {onlineForm.sell_type === "MONTHLY" ? (
                <div>
                  <label className="block text-sm">Stay Month</label>
                  <input
                    type="month"
                    className="border px-2 py-1 w-full"
                    value={onlineMonth}
                    onChange={(e) => {
                      const value = e.target.value;
                      setOnlineMonth(value);
                      const range = computeMonthRange(value);
                      if (range.start && range.end) {
                        setOnlineForm((f) => ({ ...f, start_date: range.start, end_date: range.end }));
                      }
                    }}
                  />
                  {onlineForm.start_date && onlineForm.end_date && (
                    <p className="text-xs text-gray-500 mt-1">
                      {onlineForm.start_date} → {onlineForm.end_date}
                    </p>
                  )}
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-sm">Start</label>
                    <input
                      type="date"
                      className="border px-2 py-1 w-full"
                      value={onlineForm.start_date}
                      onChange={(e) => setOnlineForm((f) => ({ ...f, start_date: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="block text-sm">End</label>
                    <input
                      type="date"
                      className="border px-2 py-1 w-full"
                      value={onlineForm.end_date}
                      onChange={(e) => setOnlineForm((f) => ({ ...f, end_date: e.target.value }))}
                    />
                  </div>
                </>
              )}
              <div>
                <label className="block text-sm">Note</label>
                <textarea
                  className="border px-2 py-1 w-full"
                  rows={2}
                  value={onlineForm.note}
                  onChange={(e) => setOnlineForm((f) => ({ ...f, note: e.target.value }))}
                />
              </div>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button
                className="border px-3 py-1 rounded hover:bg-gray-50"
                onClick={() => {
                  setOnlineOpen(false);
                  setOnlineForm({ sell_type: "DAILY", room_type: "STANDARD", start_date: "", end_date: "", note: "" });
                  setOnlineMonth("");
                }}
              >
                Cancel
              </button>
              <button className="px-3 py-1 rounded-xl border border-transparent bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow hover:shadow-lg" onClick={submitOnline}>
                Request
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default RoomBrowser;
