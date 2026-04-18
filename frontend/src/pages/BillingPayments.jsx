import { useCallback, useEffect, useState } from "react";
import { Image } from "antd";
import api from "../axios";
import { formatBillDisplayCode } from "../utils/billCodes";
import { getScopeBadge, getScopeLabel } from "../utils/billScopes";

const imageExtPattern = /\.(png|jpe?g|gif|bmp|webp|svg|heic|heif)$/i;

const resolveSlipUrl = (path) => {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  const apiBase = (import.meta.env.VITE_API_BASE_URL || "http://localhost:5000")
    .replace(/\/+$/, "");
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return apiBase ? `${apiBase}${normalized}` : normalized;
};

const isImageLike = (path = "") => {
  if (!path) return false;
  const normalized = path.split("?")[0] || "";
  return imageExtPattern.test(normalized);
};

export default function BillingPayments() {
  const [payForm, setPayForm] = useState({ paid_amount: "", method: "CASH" });
  const [pendingFilters, setPendingFilters] = useState({
    scope: "all",
    type: "all",
    status: "all",
    q: "",
  });
  const [paidFilters, setPaidFilters] = useState({
    scope: "all",
    type: "all",
    q: "",
  });
  const [pendingBills, setPendingBills] = useState([]);
  const [paidBills, setPaidBills] = useState([]);
  const [loadingPending, setLoadingPending] = useState(false);
  const [loadingPaid, setLoadingPaid] = useState(false);
  const [pendingDetail, setPendingDetail] = useState({
    bill: null,
    items: [],
    payments: [],
  });
  const [paidDetail, setPaidDetail] = useState({
    bill: null,
    items: [],
    payments: [],
  });
  const pendingBillId = pendingDetail.bill?.id || null;
  const paidBillId = paidDetail.bill?.id || null;

  const fetchBills = useCallback(async ({ scope, type, status, q } = {}) => {
    const params = {};
    if (scope && scope !== "all") params.scope = scope.toUpperCase();
    if (type && type !== "all") params.type = type.toUpperCase();
    if (status && status !== "all") params.status = status.toUpperCase();
    if (q && q.trim()) params.q = q.trim();
    const rs = await api.get("/billing", { params });
    return rs.data || [];
  }, []);

  const loadPending = useCallback(async () => {
    setLoadingPending(true);
    try {
      const data = await fetchBills({
        scope: pendingFilters.scope,
        type: pendingFilters.type,
        status: pendingFilters.status === "all" ? undefined : pendingFilters.status,
        q: pendingFilters.q,
      });
      const normalized = data.filter((bill) => {
        const status = String(bill.status || "").toUpperCase();
        if (pendingFilters.status === "pending") return status === "PENDING";
        if (pendingFilters.status === "overdue") return status === "OVERDUE";
        return status === "PENDING" || status === "OVERDUE";
      });
      setPendingBills(normalized);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('billing:pending', { detail: { count: normalized.length, scope: 'staff' } }));
      }
      if (
        pendingDetail.bill &&
        !normalized.some((b) => b.id === pendingDetail.bill.id)
      ) {
        setPendingDetail({ bill: null, items: [], payments: [] });
        setPayForm((prev) => ({ ...prev, paid_amount: "" }));
      }
      return normalized;
    } finally {
      setLoadingPending(false);
    }
  }, [fetchBills, pendingFilters, pendingBillId]);

  const loadPaid = useCallback(async () => {
    setLoadingPaid(true);
    try {
      const data = await fetchBills({
        scope: paidFilters.scope,
        type: paidFilters.type,
        status: "PAID",
        q: paidFilters.q,
      });
      const normalized = data.filter(
        (bill) => String(bill.status || "").toUpperCase() === "PAID"
      );
      setPaidBills(normalized);
      if (
        paidDetail.bill &&
        !normalized.some((b) => b.id === paidDetail.bill.id)
      ) {
        setPaidDetail({ bill: null, items: [], payments: [] });
      }
      return normalized;
    } finally {
      setLoadingPaid(false);
    }
  }, [fetchBills, paidFilters, paidBillId]);

  useEffect(() => {
    loadPending();
  }, [loadPending]);

  useEffect(() => {
    loadPaid();
  }, [loadPaid]);

  const openPendingBill = async (bill) => {
    if (!bill) {
      setPendingDetail({ bill: null, items: [], payments: [] });
      setPayForm((prev) => ({ ...prev, paid_amount: "" }));
      return;
    }
    try {
      const [its, pays] = await Promise.all([
        api.get(`/billing/${bill.id}/items`),
        api.get("/payments", { params: { bill_id: bill.id } }),
      ]);
      setPendingDetail({
        bill,
        items: its.data || [],
        payments: pays.data || [],
      });
      setPayForm((prev) => ({ ...prev, paid_amount: "" }));
    } catch (err) {
      console.error("openPendingBill failed", err);
      setPendingDetail({ bill, items: [], payments: [] });
    }
  };

  const openPaidBill = async (bill) => {
    if (!bill) {
      setPaidDetail({ bill: null, items: [], payments: [] });
      return;
    }
    try {
      const [its, pays] = await Promise.all([
        api.get(`/billing/${bill.id}/items`),
        api.get("/payments", { params: { bill_id: bill.id } }),
      ]);
      setPaidDetail({
        bill,
        items: its.data || [],
        payments: pays.data || [],
      });
    } catch (err) {
      console.error("openPaidBill failed", err);
      setPaidDetail({ bill, items: [], payments: [] });
    }
  };

  const pay = async () => {
    if (!pendingDetail.bill) return;
    if (outstandingPending <= 0.009) return;
    await api.post("/payments", {
      bill_id: pendingDetail.bill.id,
      paid_amount: Number(payForm.paid_amount || 0),
      method: payForm.method,
    });
    setPayForm({ paid_amount: "", method: "CASH" });
    const [pendingList, paidList] = await Promise.all([loadPending(), loadPaid()]);
    const freshPending =
      pendingList.find((b) => b.id === pendingDetail.bill.id) || null;
    const freshPaid =
      paidList.find((b) => b.id === pendingDetail.bill.id) || null;
    if (freshPending) {
      await openPendingBill(freshPending);
    } else if (freshPaid) {
      setPendingDetail({ bill: null, items: [], payments: [] });
      setPayForm((prev) => ({ ...prev, paid_amount: "" }));
      await openPaidBill(freshPaid);
    } else {
      setPendingDetail({ bill: null, items: [], payments: [] });
      setPayForm((prev) => ({ ...prev, paid_amount: "" }));
    }
  };

  const confirmPayment = async (paymentId, source) => {
    try {
      await api.post(`/payments/${paymentId}/confirm`);
      const [pendingList, paidList] = await Promise.all([loadPending(), loadPaid()]);
      if (source === "pending" && pendingDetail.bill) {
        const freshPending =
          pendingList.find((b) => b.id === pendingDetail.bill.id) || null;
        const freshPaid =
          paidList.find((b) => b.id === pendingDetail.bill.id) || null;
        if (freshPending) {
          await openPendingBill(freshPending);
        } else if (freshPaid) {
          setPendingDetail({ bill: null, items: [], payments: [] });
          setPayForm((prev) => ({ ...prev, paid_amount: "" }));
          await openPaidBill(freshPaid);
        } else {
          setPendingDetail({ bill: null, items: [], payments: [] });
          setPayForm((prev) => ({ ...prev, paid_amount: "" }));
        }
      } else if (source === "paid" && paidDetail.bill) {
        const freshPaid =
          paidList.find((b) => b.id === paidDetail.bill.id) || null;
        if (freshPaid) {
          await openPaidBill(freshPaid);
        } else {
          setPaidDetail({ bill: null, items: [], payments: [] });
        }
      }
    } catch (err) {
      alert(err.response?.data?.message || "Confirm failed");
    }
  };

  const outstandingPending = pendingDetail.bill
    ? Math.max(
        0,
        Number(pendingDetail.bill.total_amount || 0) -
          Number(pendingDetail.bill.paid_amount || 0)
      )
    : 0;

  return (
    <div className="p-4 max-w-6xl mx-auto space-y-4">
      <h2 className="text-xl font-semibold">Billing & Payments</h2>

      <div className="border p-3 rounded space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">Pending &amp; Overdue Bills</h3>
          {loadingPending && (
            <span className="text-xs text-slate-500 italic">Loading…</span>
          )}
        </div>
        <div className="flex flex-wrap gap-3 items-end text-sm">
          <div>
            <label className="block text-sm">Search</label>
            <input
              className="border px-2 py-1"
              placeholder="room / tenant / bill no"
              value={pendingFilters.q}
              onChange={(e) =>
                setPendingFilters((prev) => ({ ...prev, q: e.target.value }))
              }
            />
          </div>
          <div>
            <label className="block text-sm">Scope</label>
            <select
              className="border px-2 py-1"
              value={pendingFilters.scope}
              onChange={(e) =>
                setPendingFilters((prev) => ({ ...prev, scope: e.target.value }))
              }
            >
              <option value="all">All</option>
              <option value="booking">Pre-checkin</option>
              <option value="tenancy">Tenancy</option>
              <option value="utility">Utility</option>
              <option value="mixed">Mixed</option>
            </select>
          </div>
          <div>
            <label className="block text-sm">Charge type</label>
            <select
              className="border px-2 py-1"
              value={pendingFilters.type}
              onChange={(e) =>
                setPendingFilters((prev) => ({ ...prev, type: e.target.value }))
              }
            >
              <option value="all">All</option>
              <option value="room">Has rent</option>
              <option value="utility">Utilities only</option>
              <option value="mixed">Mixed charges</option>
            </select>
          </div>
          <div>
            <label className="block text-sm">Status</label>
            <select
              className="border px-2 py-1"
              value={pendingFilters.status}
              onChange={(e) =>
                setPendingFilters((prev) => ({ ...prev, status: e.target.value }))
              }
            >
              <option value="all">All</option>
              <option value="pending">Pending</option>
              <option value="overdue">Overdue</option>
            </select>
          </div>
        </div>
        <div className="overflow-x-auto rounded border">
          <table className="min-w-[900px] w-full">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="p-2 border-b">Bill No</th>
                <th className="p-2 border-b">Room</th>
                <th className="p-2 border-b">Scope</th>
                <th className="p-2 border-b">Tenant</th>
                <th className="p-2 border-b">Period</th>
                <th className="p-2 border-b">Breakdown</th>
                <th className="p-2 border-b">Total</th>
                <th className="p-2 border-b">Paid</th>
                <th className="p-2 border-b">Status</th>
                <th className="p-2 border-b">Action</th>
              </tr>
            </thead>
            <tbody>
              {pendingBills.map((bill) => (
                <tr key={bill.id} className="odd:bg-white even:bg-gray-50">
                  <td className="p-2 border-b">
                    <div className="font-medium">{formatBillDisplayCode(bill)}</div>
                    <div className="text-[11px] uppercase tracking-wide text-gray-500">
                      Ref: {bill.bill_no}
                    </div>
                  </td>
                  <td className="p-2 border-b">
                    {bill.building_code ? `${bill.building_code}-${bill.room_no}` : bill.room_no}
                  </td>
                  <td className="p-2 border-b">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold ${getScopeBadge(bill.bill_scope)}`}
                    >
                      {getScopeLabel(bill.bill_scope)}
                    </span>
                  </td>
                  <td className="p-2 border-b">
                    <div className="text-sm font-medium">
                      {bill.tenant_full_name || bill.tenant_username || "-"}
                    </div>
                    <div className="text-xs text-gray-500">{bill.tenant_phone || "-"}</div>
                  </td>
                  <td className="p-2 border-b text-sm text-gray-600">
                    {bill.period_start ? bill.period_start.slice(0, 10) : "-"} &rarr; {bill.period_end ? bill.period_end.slice(0, 10) : "-"}
                  </td>
                  <td className="p-2 border-b text-xs text-gray-600 space-y-1">
                    {Number(bill.rent_amount || 0) > 0 && (
                      <div>Rent THB {Number(bill.rent_amount).toFixed(2)}</div>
                    )}
                    {Number(bill.utility_amount || 0) > 0 && (
                      <div>Utilities THB {Number(bill.utility_amount).toFixed(2)}</div>
                    )}
                    {Number(bill.rent_amount || 0) <= 0 &&
                      Number(bill.utility_amount || 0) <= 0 && <span>-</span>}
                  </td>
                  <td className="p-2 border-b">
                    THB {Number(bill.total_amount || 0).toFixed(2)}
                  </td>
                  <td className="p-2 border-b">
                    THB {Number(bill.paid_amount || 0).toFixed(2)}
                  </td>
                  <td className="p-2 border-b">
                    <span className="text-sm">{bill.status}</span>
                  </td>
                  <td className="p-2 border-b">
                    <button
                      className="px-2 py-1 border rounded hover:bg-gray-50"
                      onClick={() => openPendingBill(bill)}
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
              {loadingPending && (
                <tr>
                  <td className="p-3 text-center text-sm text-gray-500" colSpan={10}>
                    Loading…
                  </td>
                </tr>
              )}
              {!loadingPending && pendingBills.length === 0 && (
                <tr>
                  <td className="p-3 text-center" colSpan={10}>
                    No pending bills
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {pendingDetail.bill && (
          <div className="border rounded p-3 bg-white space-y-3">
            <div className="flex justify-between items-center">
              <div>
                <div className="font-semibold">
                  Bill {formatBillDisplayCode(pendingDetail.bill)}
                  <span className="ml-2 text-sm text-gray-500">
                    {pendingDetail.bill.building_code
                      ? `${pendingDetail.bill.building_code}-${pendingDetail.bill.room_no}`
                      : pendingDetail.bill.room_no}
                  </span>
                </div>
                <div className="text-[11px] uppercase tracking-wide text-gray-500">
                  Ref: {pendingDetail.bill.bill_no}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  Tenant:{" "}
                  {pendingDetail.bill.tenant_full_name ||
                    pendingDetail.bill.tenant_username ||
                    "-"}
                  {pendingDetail.bill.tenant_phone
                    ? ` (${pendingDetail.bill.tenant_phone})`
                    : ""}
                </div>
                <div className="text-xs text-gray-500">
                  Period: {pendingDetail.bill.period_start?.slice(0, 10)} &rarr;{" "}
                  {pendingDetail.bill.period_end?.slice(0, 10)}
                </div>
                <div className="text-xs text-gray-500">
                  Scope: {getScopeLabel(pendingDetail.bill.bill_scope)} | Total THB{" "}
                  {Number(pendingDetail.bill.total_amount || 0).toFixed(2)} | Paid THB{" "}
                  {Number(pendingDetail.bill.paid_amount || 0).toFixed(2)}
                </div>
              </div>
              <div>Status: {pendingDetail.bill.status}</div>
            </div>

            <div>
              <div className="font-medium">Items</div>
              <ul className="list-disc pl-6">
                {pendingDetail.items.map((it) => (
                  <li key={`${it.item_type}-${it.description}`}>
                    {it.item_type}: {it.description || "No description"} - {it.qty} x{" "}
                    {it.unit_price} = {it.amount}
                  </li>
                ))}
                {pendingDetail.items.length === 0 && <li>No items</li>}
              </ul>
            </div>

            <div>
              <div className="font-medium">Payments</div>
              <ul className="list-disc pl-6">
                {pendingDetail.payments.map((p) => (
                  <li key={p.id}>
                    {p.method}: {p.paid_amount} at {new Date(p.paid_at).toLocaleString()} (
                    {p.status || "CONFIRMED"})
                    {p.slip_path &&
                      (isImageLike(p.slip_path) ? (
                        <div className="ml-2 inline-flex items-center gap-2 text-xs text-slate-500">
                          <Image
                            width={72}
                            height={72}
                            src={resolveSlipUrl(p.slip_path)}
                            alt={`Payment slip - ${p.method || "Unknown"}`}
                            style={{ borderRadius: 12, objectFit: "cover" }}
                            className="border border-slate-200 bg-white shadow-sm"
                            preview={{
                              src: resolveSlipUrl(p.slip_path),
                            }}
                          />
                          <span>Click image to enlarge</span>
                        </div>
                      ) : (
                        <a
                          href={resolveSlipUrl(p.slip_path)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-2 text-blue-600 underline hover:text-blue-800"
                        >
                          Download slip
                        </a>
                      ))}
                    {p.status !== "CONFIRMED" && (
                      <button
                        className="ml-2 px-2 py-1 border rounded text-xs"
                        onClick={() => confirmPayment(p.id, "pending")}
                      >
                        Confirm
                      </button>
                    )}
                  </li>
                ))}
                {pendingDetail.payments.length === 0 && <li>No payments</li>}
              </ul>
            </div>

            <div className="mt-3 flex gap-2 items-end flex-wrap">
              <div>
                <label className="block text-sm">Amount</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="border px-2 py-1"
                  value={payForm.paid_amount}
                  onChange={(e) =>
                    setPayForm((f) => ({ ...f, paid_amount: e.target.value }))
                  }
                  disabled={outstandingPending <= 0.009}
                />
              </div>
              <div>
                <label className="block text-sm">Method</label>
                <select
                  className="border px-2 py-1"
                  value={payForm.method}
                  onChange={(e) => setPayForm((f) => ({ ...f, method: e.target.value }))}
                  disabled={outstandingPending <= 0.009}
                >
                  <option value="CASH">CASH</option>
                  <option value="QR">QR</option>
                  <option value="TRANSFER">TRANSFER</option>
                </select>
              </div>
              <button
                className="border px-3 py-1 disabled:opacity-60 disabled:cursor-not-allowed"
                onClick={pay}
                disabled={outstandingPending <= 0.009}
              >
                Add Payment
              </button>
              {outstandingPending <= 0.009 && (
                <span className="text-xs text-emerald-600 font-medium">
                  Bill fully paid
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="border p-3 rounded space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">Paid Bills</h3>
          {loadingPaid && (
            <span className="text-xs text-slate-500 italic">Loading…</span>
          )}
        </div>
        <div className="flex flex-wrap gap-3 items-end text-sm">
          <div>
            <label className="block text-sm">Search</label>
            <input
              className="border px-2 py-1"
              placeholder="room / tenant / bill no"
              value={paidFilters.q}
              onChange={(e) =>
                setPaidFilters((prev) => ({ ...prev, q: e.target.value }))
              }
            />
          </div>
          <div>
            <label className="block text-sm">Scope</label>
            <select
              className="border px-2 py-1"
              value={paidFilters.scope}
              onChange={(e) =>
                setPaidFilters((prev) => ({ ...prev, scope: e.target.value }))
              }
            >
              <option value="all">All</option>
              <option value="booking">Pre-checkin</option>
              <option value="tenancy">Tenancy</option>
              <option value="utility">Utility</option>
              <option value="mixed">Mixed</option>
            </select>
          </div>
          <div>
            <label className="block text-sm">Charge type</label>
            <select
              className="border px-2 py-1"
              value={paidFilters.type}
              onChange={(e) =>
                setPaidFilters((prev) => ({ ...prev, type: e.target.value }))
              }
            >
              <option value="all">All</option>
              <option value="room">Has rent</option>
              <option value="utility">Utilities only</option>
              <option value="mixed">Mixed charges</option>
            </select>
          </div>
        </div>
        <div className="overflow-x-auto rounded border">
          <table className="min-w-[900px] w-full">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="p-2 border-b">Bill No</th>
                <th className="p-2 border-b">Room</th>
                <th className="p-2 border-b">Scope</th>
                <th className="p-2 border-b">Tenant</th>
                <th className="p-2 border-b">Period</th>
                <th className="p-2 border-b">Breakdown</th>
                <th className="p-2 border-b">Total</th>
                <th className="p-2 border-b">Paid</th>
                <th className="p-2 border-b">Status</th>
                <th className="p-2 border-b">Action</th>
              </tr>
            </thead>
            <tbody>
              {paidBills.map((bill) => (
                <tr key={bill.id} className="odd:bg-white even:bg-gray-50">
                  <td className="p-2 border-b">
                    <div className="font-medium">{formatBillDisplayCode(bill)}</div>
                    <div className="text-[11px] uppercase tracking-wide text-gray-500">
                      Ref: {bill.bill_no}
                    </div>
                  </td>
                  <td className="p-2 border-b">
                    {bill.building_code ? `${bill.building_code}-${bill.room_no}` : bill.room_no}
                  </td>
                  <td className="p-2 border-b">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold ${getScopeBadge(bill.bill_scope)}`}
                    >
                      {getScopeLabel(bill.bill_scope)}
                    </span>
                  </td>
                  <td className="p-2 border-b">
                    <div className="text-sm font-medium">
                      {bill.tenant_full_name || bill.tenant_username || "-"}
                    </div>
                    <div className="text-xs text-gray-500">{bill.tenant_phone || "-"}</div>
                  </td>
                  <td className="p-2 border-b text-sm text-gray-600">
                    {bill.period_start ? bill.period_start.slice(0, 10) : "-"} &rarr; {bill.period_end ? bill.period_end.slice(0, 10) : "-"}
                  </td>
                  <td className="p-2 border-b text-xs text-gray-600 space-y-1">
                    {Number(bill.rent_amount || 0) > 0 && (
                      <div>Rent THB {Number(bill.rent_amount).toFixed(2)}</div>
                    )}
                    {Number(bill.utility_amount || 0) > 0 && (
                      <div>Utilities THB {Number(bill.utility_amount).toFixed(2)}</div>
                    )}
                    {Number(bill.rent_amount || 0) <= 0 &&
                      Number(bill.utility_amount || 0) <= 0 && <span>-</span>}
                  </td>
                  <td className="p-2 border-b">
                    THB {Number(bill.total_amount || 0).toFixed(2)}
                  </td>
                  <td className="p-2 border-b">
                    THB {Number(bill.paid_amount || 0).toFixed(2)}
                  </td>
                  <td className="p-2 border-b">
                    <span className="text-sm">{bill.status}</span>
                  </td>
                  <td className="p-2 border-b">
                    <button
                      className="px-2 py-1 border rounded hover:bg-gray-50"
                      onClick={() => openPaidBill(bill)}
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
              {loadingPaid && (
                <tr>
                  <td className="p-3 text-center text-sm text-gray-500" colSpan={10}>
                    Loading…
                  </td>
                </tr>
              )}
              {!loadingPaid && paidBills.length === 0 && (
                <tr>
                  <td className="p-3 text-center" colSpan={10}>
                    No paid bills
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {paidDetail.bill && (
          <div className="border rounded p-3 bg-white space-y-3">
            <div className="flex justify-between items-center">
              <div>
                <div className="font-semibold">
                  Bill {formatBillDisplayCode(paidDetail.bill)}
                  <span className="ml-2 text-sm text-gray-500">
                    {paidDetail.bill.building_code
                      ? `${paidDetail.bill.building_code}-${paidDetail.bill.room_no}`
                      : paidDetail.bill.room_no}
                  </span>
                </div>
                <div className="text-[11px] uppercase tracking-wide text-gray-500">
                  Ref: {paidDetail.bill.bill_no}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  Tenant:{" "}
                  {paidDetail.bill.tenant_full_name ||
                    paidDetail.bill.tenant_username ||
                    "-"}
                  {paidDetail.bill.tenant_phone
                    ? ` (${paidDetail.bill.tenant_phone})`
                    : ""}
                </div>
                <div className="text-xs text-gray-500">
                  Period: {paidDetail.bill.period_start?.slice(0, 10)} &rarr;{" "}
                  {paidDetail.bill.period_end?.slice(0, 10)}
                </div>
                <div className="text-xs text-gray-500">
                  Scope: {getScopeLabel(paidDetail.bill.bill_scope)} | Total THB{" "}
                  {Number(paidDetail.bill.total_amount || 0).toFixed(2)} | Paid THB{" "}
                  {Number(paidDetail.bill.paid_amount || 0).toFixed(2)}
                </div>
              </div>
              <div>Status: {paidDetail.bill.status}</div>
            </div>

            <div>
              <div className="font-medium">Items</div>
              <ul className="list-disc pl-6">
                {paidDetail.items.map((it) => (
                  <li key={`${it.item_type}-${it.description}`}>
                    {it.item_type}: {it.description || "No description"} - {it.qty} x{" "}
                    {it.unit_price} = {it.amount}
                  </li>
                ))}
                {paidDetail.items.length === 0 && <li>No items</li>}
              </ul>
            </div>

            <div>
              <div className="font-medium">Payments</div>
              <ul className="list-disc pl-6">
                {paidDetail.payments.map((p) => (
                  <li key={p.id}>
                    {p.method}: {p.paid_amount} at {new Date(p.paid_at).toLocaleString()} (
                    {p.status || "CONFIRMED"})
                    {p.slip_path &&
                      (isImageLike(p.slip_path) ? (
                        <div className="ml-2 inline-flex items-center gap-2 text-xs text-slate-500">
                          <Image
                            width={72}
                            height={72}
                            src={resolveSlipUrl(p.slip_path)}
                            alt={`Payment slip - ${p.method || "Unknown"}`}
                            style={{ borderRadius: 12, objectFit: "cover" }}
                            className="border border-slate-200 bg-white shadow-sm"
                            preview={{
                              src: resolveSlipUrl(p.slip_path),
                            }}
                          />
                          <span>Click image to enlarge</span>
                        </div>
                      ) : (
                        <a
                          href={resolveSlipUrl(p.slip_path)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-2 text-blue-600 underline hover:text-blue-800"
                        >
                          Download slip
                        </a>
                      ))}
                    {p.status !== "CONFIRMED" && (
                      <button
                        className="ml-2 px-2 py-1 border rounded text-xs"
                        onClick={() => confirmPayment(p.id, "paid")}
                      >
                        Confirm
                      </button>
                    )}
                  </li>
                ))}
                {paidDetail.payments.length === 0 && <li>No payments</li>}
              </ul>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
