import { useEffect, useMemo, useState } from "react";
import api from "../axios";

const Bookingmanagement = () => {
  const [items, setItems] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [historySearch, setHistorySearch] = useState("");
  const [historyStatus, setHistoryStatus] = useState("all");
  const [historyType, setHistoryType] = useState("all");
  const [allocOpen, setAllocOpen] = useState(false);
  const [allocRooms, setAllocRooms] = useState([]);
  const [allocRoomId, setAllocRoomId] = useState("");
  const [allocBooking, setAllocBooking] = useState(null);
  const [actionModal, setActionModal] = useState(null);
  const [actionReason, setActionReason] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get("/bookings", { params: q ? { q } : {} });
      const rows = res.data || [];
      const pending = rows.filter((b) => String(b.status || "").toUpperCase() === "PENDING");
      setItems(pending);
      const historic = rows.filter((b) => String(b.status || "").toUpperCase() !== "PENDING");
      setHistory(historic);
      window.dispatchEvent(new CustomEvent('pending-bookings:changed', { detail: { count: pending.length } }));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const approve = async (id) => {
    try {
      await api.post(`/bookings/${id}/approve`);
      await load();
      window.dispatchEvent(new CustomEvent('ready-checkin:changed'));
    } catch (err) {
        console.error('approve error', err.response?.data || err.message)
        alert(err.response?.data?.message || 'Approve failed')
    }
  };
  const openAllocate = async (b) => {
    setAllocBooking(b);
    setAllocRoomId("");
    try {
      const res = await api.get(`/bookings/${b.id}/allocatable-rooms`);
      setAllocRooms(res.data || []);
      setAllocOpen(true);
    } catch (e) {
      alert(e.response?.data?.message || 'Failed to list rooms');
    }
  };
  const closeAllocate = () => { setAllocOpen(false); setAllocBooking(null); setAllocRooms([]); setAllocRoomId(""); };
  const confirmAllocate = async () => {
    if (!allocBooking || !allocRoomId) return;
    try {
      const endpoint = allocBooking.room_id ? 'reallocate' : 'allocate';
      await api.post(`/bookings/${allocBooking.id}/${endpoint}`, { room_id: allocRoomId });
      closeAllocate();
      await load();
    } catch (e) {
      alert(e.response?.data?.message || 'Allocate failed');
    }
  };
  const reject = async (id) => {
    setActionModal({ type: "REJECT", bookingId: id });
    setActionReason("");
  };
  const cancel = async (id) => {
    setActionModal({ type: "CANCEL", bookingId: id });
    setActionReason("");
  };

  const filteredHistory = useMemo(() => {
    const term = historySearch.trim().toLowerCase();
    const statusFilter = historyStatus.toUpperCase();
    const typeFilter = historyType.toUpperCase();
    return history.filter((b) => {
      const status = String(b.status || "").toUpperCase();
      if (historyStatus !== "all" && status !== statusFilter) return false;
      const monthly = Boolean(b.is_monthly);
      if (historyType !== "all") {
        if (historyType === "monthly" && !monthly) return false;
        if (historyType === "daily" && monthly) return false;
      }
      if (!term) return true;
      const fields = [
        b.booking_code,
        b.id,
        b.tenant_username,
        b.room_no,
        b.building_code,
        status
      ].filter(Boolean);
      return fields.some((field) => String(field).toLowerCase().includes(term));
    });
  }, [history, historySearch, historyStatus, historyType]);

  const historyStatusOptions = useMemo(() => {
    const set = new Set(history.map((b) => String(b.status || "").toUpperCase()));
    return Array.from(set).sort();
  }, [history]);

  if (loading) return <div className="p-4 max-w-6xl mx-auto">Loading…</div>;

  const confirmAction = async () => {
    if (!actionModal) return;
    if (!actionReason.trim()) return;
    try {
      if (actionModal.type === "REJECT") {
        await api.post(`/bookings/${actionModal.bookingId}/reject`, { reason: actionReason.trim() });
      } else if (actionModal.type === "CANCEL") {
        await api.post(`/bookings/${actionModal.bookingId}/cancel`, { reason: actionReason.trim() });
      }
      setActionModal(null);
      setActionReason("");
      await load();
    } catch (e) {
      alert(e.response?.data?.message || "Action failed");
    }
  };

  return (
    <div className="p-4 max-w-6xl mx-auto space-y-4">
      <h2 className="text-xl font-semibold">Booking Approvals</h2>

      <div className="flex items-center gap-2">
        <input
          className="border px-2 py-1 w-80"
          placeholder="Search booking code / id / username"
          value={q}
          onChange={(e)=>setQ(e.target.value)}
        />
        <button className="border px-3 py-1" onClick={load}>
          Refresh
        </button>
      </div>

      <div className="overflow-x-auto rounded border">
        <table className="min-w-[900px] w-full">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="p-2 border-b">Booking</th>
              <th className="p-2 border-b">ID</th>
              <th className="p-2 border-b">Room</th>
              <th className="p-2 border-b">Tenant</th>
              <th className="p-2 border-b">Period</th>
              <th className="p-2 border-b">Type</th>
              <th className="p-2 border-b">Prepayment</th>
              <th className="p-2 border-b">Status</th>
              <th className="p-2 border-b">Action</th>
            </tr>
          </thead>
          <tbody>
            {items.map((b) => (
              <tr key={b.id} className="odd:bg-white even:bg-gray-50">
                <td className="p-2 border-b">
                  <div className="text-sm font-medium">{b.booking_code || b.id?.slice(0,8)}</div>
                  <div className="text-xs text-gray-500">{b.id?.slice(0,8)}…</div>
                </td>
                <td className="p-2 border-b text-xs text-gray-600">{b.id?.slice(0,8)}…</td>
                <td className="p-2 border-b">{b.room_no ? `${b.building_code}-${b.room_no}` : <span className="text-gray-500">Unallocated</span>}</td>
                <td className="p-2 border-b">
                  {b.tenant_username || b.tenant_id?.slice(0, 6)}
                </td>
                <td className="p-2 border-b">
                  {b.start_date?.slice(0, 10)} → {b.end_date?.slice(0, 10)}
                </td>
                <td className="p-2 border-b">{b.is_monthly ? <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-800 text-xs">Monthly</span> : <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 text-xs">Daily</span>}</td>
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
                    <span className="text-gray-500 text-xs">Awaiting billing</span>
                  )}
                </td>
                <td className="p-2 border-b">{b.status}</td>
                <td className="p-2 border-b space-x-2">
                  {!b.room_id && (
                    <button className="px-2 py-1 border rounded hover:bg-gray-50" onClick={() => openAllocate(b)}>Allocate</button>
                  )}
                  {b.room_id && (
                    <button className="px-2 py-1 border rounded hover:bg-gray-50" onClick={() => openAllocate(b)}>Reallocate</button>
                  )}
                  <button
                    className={`px-2 py-1 border rounded ${b.room_id ? 'hover:bg-green-50' : 'opacity-50 cursor-not-allowed'}`}
                    disabled={!b.room_id}
                    onClick={() => approve(b.id)}
                  >
                    Approve
                  </button>
                  <button
                    className="px-2 py-1 border rounded hover:bg-yellow-50"
                    onClick={() => reject(b.id)}
                  >
                    Reject
                  </button>
                  <button
                    className="px-2 py-1 border rounded hover:bg-red-50"
                    onClick={() => cancel(b.id)}
                  >
                    Cancel
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td className="p-3 text-center" colSpan={9}>
                  No pending bookings
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {history.length > 0 && (
        <div className="space-y-2">
          <div className="rounded border px-3 py-2 flex flex-wrap gap-2 text-sm bg-slate-50">
            <span className="font-semibold text-slate-700">History filters:</span>
            <input
              className="border px-2 py-1 rounded"
              placeholder="Search history"
              value={historySearch}
              onChange={(e) => setHistorySearch(e.target.value)}
            />
            <select
              className="border px-2 py-1 rounded"
              value={historyStatus}
              onChange={(e) => setHistoryStatus(e.target.value)}
            >
              <option value="all">All status</option>
              {historyStatusOptions.map((st) => (
                <option key={st} value={st.toLowerCase()}>
                  {st}
                </option>
              ))}
            </select>
            <select
              className="border px-2 py-1 rounded"
              value={historyType}
              onChange={(e) => setHistoryType(e.target.value)}
            >
              <option value="all">All types</option>
              <option value="monthly">Monthly</option>
              <option value="daily">Daily</option>
            </select>
          </div>
          <div className="overflow-x-auto rounded border">
          <table className="min-w-[900px] w-full">
            <thead className="bg-slate-100 text-left text-slate-700">
              <tr>
                <th className="p-2 border-b">Booking</th>
                <th className="p-2 border-b">Room</th>
                <th className="p-2 border-b">Tenant</th>
                <th className="p-2 border-b">Period</th>
                <th className="p-2 border-b">Type</th>
                <th className="p-2 border-b">Status</th>
                <th className="p-2 border-b">Reason</th>
              </tr>
            </thead>
            <tbody>
              {filteredHistory.map((b) => (
                <tr key={b.id} className="odd:bg-white even:bg-slate-50">
                  <td className="p-2 border-b">
                    <div className="text-sm font-medium">{b.booking_code || b.id?.slice(0,8)}</div>
                    <div className="text-xs text-gray-500">{b.id?.slice(0,8)}…</div>
                  </td>
                  <td className="p-2 border-b">{b.room_no ? `${b.building_code}-${b.room_no}` : <span className="text-gray-500">Unallocated</span>}</td>
                  <td className="p-2 border-b">{b.tenant_username || b.tenant_id?.slice(0, 6)}</td>
                  <td className="p-2 border-b">
                    {b.start_date?.slice(0, 10)} → {b.end_date?.slice(0, 10)}
                  </td>
                  <td className="p-2 border-b">
                    {b.is_monthly ? (
                      <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-800 text-xs">Monthly</span>
                    ) : (
                      <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 text-xs">Daily</span>
                    )}
                  </td>
                  <td className="p-2 border-b">{b.status}</td>
                  <td className="p-2 border-b text-xs text-gray-600">{b.cancel_reason || '-'}</td>
                </tr>
              ))}
              {filteredHistory.length === 0 && (
                <tr>
                  <td className="p-3 text-center text-gray-500" colSpan={7}>
                    No history records
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {allocOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded shadow p-4 w-[520px]">
            <h3 className="font-semibold text-lg mb-3">Allocate Room</h3>
            <div className="space-y-2">
              <div>
                <div className="text-sm text-gray-600">Booking: {allocBooking?.start_date?.slice(0,10)} → {allocBooking?.end_date?.slice(0,10)}</div>
                <label className="block text-sm">Select Room</label>
                <select className="border px-2 py-1 w-full" value={allocRoomId} onChange={(e)=>setAllocRoomId(e.target.value)}>
                  <option value="">Available rooms</option>
                  {allocRooms.map(r => (
                    <option key={r.id} value={r.id}>{r.building_code}-{r.room_no} ({r.sell_type})</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button className="border px-3 py-1" onClick={closeAllocate}>Cancel</button>
              <button className="border px-3 py-1" onClick={confirmAllocate}>Allocate</button>
            </div>
          </div>
        </div>
      )}

      {actionModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-5 w-[380px] space-y-3">
            <h3 className="text-lg font-semibold text-slate-900">
              {actionModal.type === "REJECT" ? "Reject booking" : "Cancel booking"}
            </h3>
            <p className="text-sm text-slate-600">
              Please provide a reason so it can be recorded in the system.
            </p>
            <textarea
              className="w-full border rounded-lg px-3 py-2 text-sm"
              rows={3}
              value={actionReason}
              onChange={(e) => setActionReason(e.target.value)}
              placeholder="Enter a reason"
            />
            <div className="flex justify-end gap-2">
              <button
                className="px-3 py-1.5 rounded border border-slate-300 text-slate-600 hover:bg-slate-100"
                onClick={() => {
                  setActionModal(null);
                  setActionReason("");
                }}
              >
                Cancel
              </button>
              <button
                className={`px-3 py-1.5 rounded bg-rose-600 text-white ${actionReason.trim() ? 'hover:bg-rose-700' : 'opacity-60 cursor-not-allowed'}`}
                onClick={confirmAction}
                disabled={!actionReason.trim()}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default Bookingmanagement;
