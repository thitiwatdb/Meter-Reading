import { useEffect, useMemo, useState } from "react";
import api from "../axios";

const formatDateTime = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
};

const TenancyManagement = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const [approvedBookings, setApprovedBookings] = useState([]);
  const [q, setQ] = useState("");
  const [startMsg, setStartMsg] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [activeBuilding, setActiveBuilding] = useState("all");
  const [historySearch, setHistorySearch] = useState("");
  const [historyBuilding, setHistoryBuilding] = useState("all");
  const [historyStatus, setHistoryStatus] = useState("all");

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get("/tenancies", { params: { } }); 
      setItems(res.data || []);
      const app = await api.get('/bookings', { params: { status: 'APPROVED', q, ready_for_checkin: true } });
      const approvedList = app.data || [];
      setApprovedBookings(approvedList);
      window.dispatchEvent(new CustomEvent('ready-checkin:changed', { detail: { count: approvedList.length } }));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { load(); }, [q]);

  const buildingOptions = useMemo(() => {
    const set = new Set();
    items.forEach((t) => {
      if (t.building_code) set.add(t.building_code);
    });
    return Array.from(set).sort();
  }, [items]);

  const activeTenancies = useMemo(
    () => items.filter((t) => t.status !== "ENDED"),
    [items]
  );

  const historyTenancies = useMemo(
    () => items.filter((t) => t.status === "ENDED"),
    [items]
  );

  const filteredActive = useMemo(() => {
    const term = activeSearch.trim().toLowerCase();
    return activeTenancies.filter((t) => {
      if (activeBuilding !== "all" && t.building_code !== activeBuilding) return false;
      if (!term) return true;
      const haystacks = [t.room_no, t.building_code, t.booking_code, t.tenant_username, t.tenant_full_name, t.tenant_phone]
        .map((v) => String(v || "").toLowerCase());
      return haystacks.some((value) => value.includes(term));
    });
  }, [activeTenancies, activeBuilding, activeSearch]);

  const historyStatuses = useMemo(() => {
    const set = new Set();
    historyTenancies.forEach((t) => set.add(t.status));
    return Array.from(set).sort();
  }, [historyTenancies]);

  const filteredHistory = useMemo(() => {
    const term = historySearch.trim().toLowerCase();
    return historyTenancies.filter((t) => {
      if (historyBuilding !== "all" && t.building_code !== historyBuilding) return false;
      if (historyStatus !== "all" && t.status !== historyStatus) return false;
      if (!term) return true;
      const haystacks = [t.room_no, t.building_code, t.booking_code, t.tenant_username, t.tenant_full_name, t.tenant_phone]
        .map((v) => String(v || "").toLowerCase());
      return haystacks.some((value) => value.includes(term));
    });
  }, [historyTenancies, historyBuilding, historySearch, historyStatus]);

  const startFromBooking = async () => {
    if (!bookingId.trim()) return alert("booking_id required");
    try {
      await api.post("/tenancies/from-booking", {
        booking_id: bookingId.trim()
      });
      setBookingId("");
      await load();
      alert("Tenancy started");
    } catch (e) {
      alert(e?.response?.data?.message || "Start tenancy failed");
    }
  };

  const markMovingOut = async (id) => {
    try {
      const res = await api.post(`/tenancies/${id}/moving-out`);
      setItems((curr)=> curr.map(t => t.id === id ? res.data : t));
      await load();
    } catch (e) {
      alert(e.response?.data?.message || 'Mark moving out failed');
    }
  };

  const endTenancy = async (id) => {
    if (!window.confirm("Confirm end this tenancy?")) return;
    try {
      const res = await api.post(`/tenancies/${id}/end`, {});
      setItems((curr)=> curr.map(t => t.id === id ? res.data : t));
      await load();
    } catch (e) {
      alert(e.response?.data?.message || 'End tenancy failed');
    }
  };

  const initialLoading = loading && items.length === 0 && approvedBookings.length === 0;
  const isRefreshing = loading && !initialLoading;

  if (initialLoading) return <div className="p-4 max-w-6xl mx-auto">Loading…</div>;

  return (
    <div className="p-4 max-w-6xl mx-auto space-y-4">
      <h2 className="text-xl font-semibold">Tenancy Management</h2>

      <div className="border p-3 rounded">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-medium">Approved Bookings (Ready to Check‑in)</h3>
          {isRefreshing && (
            <span className="text-xs text-slate-500 italic">Updating…</span>
          )}
        </div>
        {startMsg && <div className="text-green-700 text-sm mb-2">{startMsg}</div>}
        <div className="flex items-center gap-2 mb-2">
          <input className="border px-2 py-1 w-80" placeholder="Search booking code / id / username" value={q} onChange={(e)=>setQ(e.target.value)} />
        </div>
        <div className="overflow-x-auto rounded border">
          <table className="min-w-[900px] w-full">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="p-2 border-b">Booking</th>
                <th className="p-2 border-b">Room</th>
                <th className="p-2 border-b">Tenant</th>
                <th className="p-2 border-b">Period</th>
                <th className="p-2 border-b">Prepayment</th>
                <th className="p-2 border-b">Action</th>
              </tr>
            </thead>
            <tbody>
              {approvedBookings.map(b => (
                <tr key={b.id} className="odd:bg-white even:bg-gray-50">
                  <td className="p-2 border-b text-xs text-gray-600">
                    <div className="text-sm font-medium">{b.booking_code || b.id.slice(0,8)}</div>
                    <div className="text-xs text-gray-500">{b.id.slice(0,8)}…</div>
                  </td>
                  <td className="p-2 border-b">{b.building_code && b.room_no ? `${b.building_code}-${b.room_no}` : '-'}</td>
                  <td className="p-2 border-b">{b.tenant_username || b.tenant_id.slice(0,6)}</td>
                  <td className="p-2 border-b">{b.start_date?.slice(0,10)} → {b.end_date?.slice(0,10)}</td>
                  <td className="p-2 border-b">
                    {b.prepayment_bill_id ? (
                      <div className="text-xs space-y-0.5">
                        <div
                          className={`font-semibold ${
                            Number(b.prepayment_outstanding_amount || 0) > 0.009 ? 'text-rose-600' : 'text-emerald-600'
                          }`}
                        >
                          {Number(b.prepayment_outstanding_amount || 0) > 0.009
                            ? `Due THB ${Number(b.prepayment_outstanding_amount || 0).toFixed(2)}`
                            : 'Paid'}
                        </div>
                        <div className="text-gray-500">
                          Bill {b.prepayment_bill_no || b.prepayment_bill_id.slice(0, 8)}
                        </div>
                      </div>
                    ) : (
                      <span className="text-gray-500 text-xs">Pending billing</span>
                    )}
                  </td>
                  <td className="p-2 border-b">
                    <button className="px-2 py-1 border rounded hover:bg-gray-50" onClick={async()=>{
                      try {
                        const res = await api.post('/tenancies/from-booking', { booking_id: b.id });
                        setStartMsg(`Started tenancy from booking ${b.id.slice(0,8)}…`)
                        // Optimistically update UI
                        setApprovedBookings((curr)=> curr.filter(x => x.id !== b.id));
                        setItems((curr)=> [res.data, ...curr]);
                        await load();
                      } catch (e) { alert(e.response?.data?.message || 'Start failed'); }
                    }}>Check‑in</button>
                  </td>
                </tr>
              ))}
              {approvedBookings.length===0 && (<tr><td className="p-3 text-center" colSpan={6}>No approved bookings</td></tr>)}
            </tbody>
          </table>
        </div>
      </div>

      <div className="border p-3 rounded space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">Current Tenancies</h3>
        </div>
        <div className="flex flex-wrap gap-2 items-end">
          <div>
            <label className="block text-sm">Search</label>
            <input
              className="border px-2 py-1"
              placeholder="room / tenant / booking / phone"
              value={activeSearch}
              onChange={(e) => setActiveSearch(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm">Building</label>
            <select
              className="border px-2 py-1"
              value={activeBuilding}
              onChange={(e) => setActiveBuilding(e.target.value)}
            >
              <option value="all">All</option>
              {buildingOptions.map((code) => (
                <option key={code} value={code}>{code}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="overflow-x-auto rounded border">
          <table className="min-w-[900px] w-full">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="p-2 border-b">Building</th>
                <th className="p-2 border-b">Room</th>
                <th className="p-2 border-b">Booking</th>
                <th className="p-2 border-b">Tenant</th>
                <th className="p-2 border-b">Period</th>
                <th className="p-2 border-b">Type</th>
                <th className="p-2 border-b">Status</th>
                <th className="p-2 border-b">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredActive.map((t) => {
                const checkInDisplay = t.checked_in_at ? formatDateTime(t.checked_in_at) : "-";
                const checkOutDisplay = t.checked_out_at ? formatDateTime(t.checked_out_at) : "-";
                return (
                  <tr key={t.id} className="odd:bg-white even:bg-gray-50">
                    <td className="p-2 border-b">{t.building_code}</td>
                    <td className="p-2 border-b">{t.room_no}</td>
                    <td className="p-2 border-b text-xs text-gray-600">
                      {t.booking_code ? (
                        <span className="font-semibold text-slate-700">{t.booking_code}</span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="p-2 border-b">
                      <div className="text-sm font-medium">{t.tenant_full_name || t.tenant_username}</div>
                      <div className="text-xs text-gray-500">{t.tenant_username}</div>
                      <div className="text-xs text-gray-500">{t.tenant_phone || '-'}</div>
                    </td>
                    <td className="p-2 border-b">
                      <div>{t.start_date?.slice(0, 10)} → {t.end_date ? t.end_date.slice(0, 10) : "-"}</div>
                      <div className="text-xs text-gray-500">Check‑in {checkInDisplay}</div>
                      <div className="text-xs text-gray-500">Check‑out {checkOutDisplay}</div>
                    </td>
                    <td className="p-2 border-b">{t.is_monthly ? <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-800 text-xs">Monthly</span> : <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 text-xs">Daily</span>}</td>
                    <td className="p-2 border-b">{t.status}</td>
                    <td className="p-2 border-b space-x-2">
                      {t.status === "ACTIVE" && (
                        <button className="px-2 py-1 border rounded hover:bg-gray-50" onClick={() => markMovingOut(t.id)}>
                          Schedule Move‑out
                        </button>
                      )}
                      {["ACTIVE", "MOVING_OUT"].includes(t.status) && (
                        <button className="px-2 py-1 border rounded hover:bg-gray-50" onClick={() => endTenancy(t.id)}>
                          Check‑out
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filteredActive.length === 0 && (
                <tr>
                  <td className="p-3 text-center" colSpan={8}>No active tenancies</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="border p-3 rounded space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">Tenancy History</h3>
        </div>
        <div className="flex flex-wrap gap-2 items-end">
          <div>
            <label className="block text-sm">Search</label>
            <input
              className="border px-2 py-1"
              placeholder="room / tenant / booking / phone"
              value={historySearch}
              onChange={(e) => setHistorySearch(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm">Building</label>
            <select
              className="border px-2 py-1"
              value={historyBuilding}
              onChange={(e) => setHistoryBuilding(e.target.value)}
            >
              <option value="all">All</option>
              {buildingOptions.map((code) => (
                <option key={code} value={code}>{code}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm">Status</label>
            <select
              className="border px-2 py-1"
              value={historyStatus}
              onChange={(e) => setHistoryStatus(e.target.value)}
            >
              <option value="all">All</option>
              {historyStatuses.map((st) => (
                <option key={st} value={st}>{st}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="overflow-x-auto rounded border">
          <table className="min-w-[900px] w-full">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="p-2 border-b">Building</th>
                <th className="p-2 border-b">Room</th>
                <th className="p-2 border-b">Booking</th>
                <th className="p-2 border-b">Tenant</th>
                <th className="p-2 border-b">Period</th>
                <th className="p-2 border-b">Type</th>
                <th className="p-2 border-b">Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredHistory.map((t) => {
                const checkInDisplay = t.checked_in_at ? formatDateTime(t.checked_in_at) : "-";
                const checkOutDisplay = t.checked_out_at ? formatDateTime(t.checked_out_at) : "-";
                return (
                  <tr key={t.id} className="odd:bg-white even:bg-gray-50">
                    <td className="p-2 border-b">{t.building_code}</td>
                    <td className="p-2 border-b">{t.room_no}</td>
                    <td className="p-2 border-b text-xs text-gray-600">
                      {t.booking_code ? (
                        <span className="font-semibold text-slate-700">{t.booking_code}</span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="p-2 border-b">
                      <div className="text-sm font-medium">{t.tenant_full_name || t.tenant_username}</div>
                      <div className="text-xs text-gray-500">{t.tenant_username}</div>
                      <div className="text-xs text-gray-500">{t.tenant_phone || '-'}</div>
                    </td>
                    <td className="p-2 border-b">
                      <div>{t.start_date?.slice(0, 10)} → {t.end_date ? t.end_date.slice(0, 10) : "-"}</div>
                      <div className="text-xs text-gray-500">Check‑in {checkInDisplay}</div>
                      <div className="text-xs text-gray-500">Check‑out {checkOutDisplay}</div>
                    </td>
                    <td className="p-2 border-b">{t.is_monthly ? <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-800 text-xs">Monthly</span> : <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 text-xs">Daily</span>}</td>
                    <td className="p-2 border-b">{t.status}</td>
                  </tr>
                );
              })}
              {filteredHistory.length === 0 && (
                <tr>
                  <td className="p-3 text-center" colSpan={7}>No history records</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default TenancyManagement;
