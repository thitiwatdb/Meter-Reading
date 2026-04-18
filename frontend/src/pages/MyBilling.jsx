
import { useEffect, useMemo, useState } from 'react';
import { DollarCircleOutlined } from '@ant-design/icons';
import api from '../axios';
import { formatBillDisplayCode } from '../utils/billCodes';
import { getScopeBadge, getScopeLabel } from '../utils/billScopes';

const resolveSlipUrl = (path) => {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  const apiBase = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000')
    .replace(/\/+$/, '');
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return apiBase ? `${apiBase}${normalized}` : normalized;
};

const imageExtPattern = /\.(png|jpe?g|gif|bmp|webp|svg|heic|heif)$/i;

const isImageLike = (input) => {
  if (!input) return false;
  if (typeof input === 'string') {
    const normalized = input.split('?')[0] || '';
    return imageExtPattern.test(normalized);
  }
  if (typeof input.type === 'string' && input.type.startsWith('image/')) {
    return true;
  }
  if (typeof input.name === 'string') {
    return imageExtPattern.test(input.name);
  }
  return false;
};

const currency = (value) =>
  Number(value || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

const defaultSummary = {
  outstanding_total: 0,
  precheckin_total: 0,
  precheckin_paid_total: 0,
  precheckin_outstanding_total: 0,
  rent_charge_total: 0,
  utility_charge_total: 0,
  all_cleared: false
};

export default function MyBilling() {
  const [summary, setSummary] = useState(defaultSummary);
  const [openBills, setOpenBills] = useState([]);
  const [historyBills, setHistoryBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(null);
  const [pay, setPay] = useState({ method: 'QR', amount: '', note: '', slip_path: '', slip_preview: '', uploading: false, ready: false });
  const [detailBill, setDetailBill] = useState(null);
  const [detailItems, setDetailItems] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [utilityHistory, setUtilityHistory] = useState([]);
  const [utilityRoomFilter, setUtilityRoomFilter] = useState("all");
  const [utilityTypeFilter, setUtilityTypeFilter] = useState("all");
  const [paymentSettings, setPaymentSettings] = useState({
    promptpay_id: '',
    bank_account_name: '',
    bank_account_number: ''
  });
  const [qrPreview, setQrPreview] = useState({ dataUrl: '', error: '', loading: false });
  const legacyQrUrl = import.meta.env?.VITE_PAYMENT_QR_URL || '';

  const load = async () => {
    setLoading(true);
    try {
    const res = await api.get('/billing/mine/overview');
    const data = res.data || {};
    setSummary(data.summary || defaultSummary);
    setOpenBills(data.open_bills || []);
      setHistoryBills(data.history_bills || []);
      const openCount = Array.isArray(data.open_bills) ? data.open_bills.length : 0;
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('tenant-billing:pending', { detail: { count: openCount } }));
      }
      setPaymentSettings({
        promptpay_id: data.payment_settings?.promptpay_id || '',
        bank_account_name: data.payment_settings?.bank_account_name || '',
      bank_account_number: data.payment_settings?.bank_account_number || ''
    });
    const usageRes = await api.get('/meters/mine').catch(() => ({ data: [] }));
    setUtilityHistory(usageRes.data || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (pay.method !== 'QR' || !paying) {
      setQrPreview((prev) => (prev.dataUrl || prev.error ? { dataUrl: '', error: '', loading: false } : prev));
      return;
    }
    const amountNumber = Number(pay.amount);
    if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
      setQrPreview((prev) => (prev.dataUrl || prev.error ? { dataUrl: '', error: '', loading: false } : prev));
      return;
    }
    let cancelled = false;
    setQrPreview({ dataUrl: '', error: '', loading: true });
    const normalizedAmount = Number(amountNumber.toFixed(2));
    api
      .get('/payments/qr/preview', { params: { amount: normalizedAmount } })
      .then((res) => {
        if (cancelled) return;
        setQrPreview({
          dataUrl: res.data?.dataUrl || res.data?.imageUrl || '',
          error: '',
          loading: false
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setQrPreview({
          dataUrl: '',
          error: err.response?.data?.message || 'Unable to generate QR',
          loading: false
        });
      });
    return () => {
      cancelled = true;
    };
  }, [pay.method, pay.amount, paying?.id]);

  const billLookup = useMemo(() => {
    const map = {};
    [...openBills, ...historyBills].forEach((bill) => {
      map[bill.id] = bill;
    });
    return map;
  }, [openBills, historyBills]);

  const utilityRooms = useMemo(() => {
    const set = new Map();
    utilityHistory.forEach((entry) => {
      const key = entry.room_id;
      const label = entry.building_code ? `${entry.building_code}-${entry.room_no}` : entry.room_no || key;
      if (!set.has(key)) {
        set.set(key, label);
      }
    });
    return Array.from(set.entries());
  }, [utilityHistory]);

  const filteredUtility = useMemo(() => {
    return utilityHistory.filter((entry) => {
      if (utilityRoomFilter !== "all" && String(entry.room_id) !== utilityRoomFilter) return false;
      if (utilityTypeFilter !== "all" && String(entry.type).toUpperCase() !== utilityTypeFilter) return false;
      return true;
    });
  }, [utilityHistory, utilityRoomFilter, utilityTypeFilter]);

  const startPay = (bill) => {
    setPaying(bill);
    setPay({
      method: 'QR',
      amount: Number(bill.outstanding_amount || bill.total_amount || 0).toFixed(2),
      note: '',
      slip_path: '',
      slip_preview: '',
      uploading: false,
      ready: false
    });
  };

  const handleMethodChange = (method) => {
    const upper = method.toUpperCase();
    setPay((prev) => ({
      ...prev,
      method: upper,
      ready: false,
      slip_path: '',
      slip_preview: '',
    }));
  };

  const markPaymentReady = () => {
    setPay((prev) => ({ ...prev, ready: true }));
  };

  const readFileAsBase64 = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result === 'string') {
          const [prefix, data] = result.split(',');
          resolve({
            base64: data || result,
            dataUrl: result,
            mimePrefix: prefix || '',
          });
        } else {
          reject(new Error('Unable to read file'));
        }
      };
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });

  const handleSlipFile = async (file) => {
    if (!file) {
      setPay((p) => ({ ...p, slip_path: '', slip_preview: '', uploading: false }));
      return;
    }
    setPay((p) => ({ ...p, uploading: true }));
    try {
      const { base64, dataUrl } = await readFileAsBase64(file);
      const previewable = isImageLike(file);
      if (previewable && typeof dataUrl === 'string') {
        setPay((p) => ({ ...p, slip_preview: dataUrl }));
      } else {
        setPay((p) => ({ ...p, slip_preview: '' }));
      }
      const res = await api.post('/uploads/base64', {
        filename: file.name,
        contentBase64: base64,
      });
      const uploadedPath = res.data?.path || '';
      const resolvedPreview =
        previewable && typeof dataUrl === 'string'
          ? dataUrl
          : isImageLike(uploadedPath)
          ? resolveSlipUrl(uploadedPath)
          : '';
      setPay((p) => ({
        ...p,
        slip_path: uploadedPath,
        slip_preview: resolvedPreview,
        uploading: false
      }));
    } catch (e) {
      console.error(e);
      setPay((p) => ({ ...p, uploading: false }));
      alert(e.response?.data?.message || 'Upload failed');
    }
  };

  const submitPay = async () => {
    try {
      if (pay.uploading) {
        return alert('Please wait for slip upload to finish');
      }
      const amountNumber = Number(pay.amount);
      if (!amountNumber || amountNumber <= 0) {
        return alert('Enter a valid amount');
      }
      const methodUpper = pay.method.toUpperCase();
      if (['QR', 'TRANSFER'].includes(methodUpper)) {
        if (!pay.ready) {
          return alert('Please confirm that you have completed the transfer');
        }
        if (!pay.slip_path) {
          return alert('Please upload the transfer slip');
        }
      }
      await api.post('/payments/mine', {
        bill_id: paying.id,
        paid_amount: amountNumber,
        method: methodUpper,
        slip_path: pay.slip_path || null,
        note: pay.note || null
      });
      setPaying(null);
      setPay({ method: 'QR', amount: '', note: '', slip_path: '', slip_preview: '', uploading: false, ready: false });
      await load();
      alert('Payment submitted');
    } catch (e) {
      alert(e.response?.data?.message || 'Payment failed');
    }
  };

  const requiresSlip = ['QR', 'TRANSFER'].includes(pay.method);
  const submitDisabled = requiresSlip && (!pay.ready || !pay.slip_path || pay.uploading);

  const showDetails = async (bill) => {
    setDetailBill(bill);
    setDetailItems([]);
    setDetailLoading(true);
    try {
      const res = await api.get(`/billing/mine/${bill.id}/items`);
      setDetailItems(res.data || []);
    } catch (e) {
      alert(e.response?.data?.message || 'Unable to load bill details');
      setDetailBill(null);
    } finally {
      setDetailLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-4 max-w-6xl mx-auto space-y-4 animate-pulse">
        <div className="h-10 w-1/3 bg-slate-200/60 rounded-2xl" />
        <div className="h-24 rounded-2xl bg-slate-200/50" />
        <div className="grid gap-3 md:grid-cols-2">
          {[...Array(4)].map((_, idx) => (
            <div key={idx} className="h-40 rounded-2xl bg-slate-200/40" />
          ))}
        </div>
      </div>
    );
  }

  const totalOutstanding = Number(summary?.outstanding_total || 0);
  const hasOutstanding = totalOutstanding > 0.009;
  const paymentInstruction =
    pay.method === 'QR'
      ? 'Scan the QR code and complete the PromptPay payment.'
      : 'Complete the bank transfer using the details above.';
  const paymentConfirmLabel = pay.method === 'QR' ? 'I paid via QR' : 'I already transferred';
  const slipLabel = pay.method === 'QR' ? 'Payment slip (PromptPay)' : 'Payment slip (Transfer)';
  const qrImageSrc = qrPreview.dataUrl || legacyQrUrl;
  const qrStatusMessage = qrImageSrc
    ? ''
    : qrPreview.loading
    ? 'Generating QR code...'
    : qrPreview.error ||
      (paymentSettings.promptpay_id
        ? 'Enter a valid amount to generate the QR code.'
        : 'PromptPay ID is not configured yet. Please contact staff.');

  return (
    <div className="p-4 max-w-6xl mx-auto space-y-8">
      <header className="space-y-2">
        <h2 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-500 text-white shadow-lg">
            <DollarCircleOutlined style={{ fontSize: 22 }} />
          </span>
          My Billing
        </h2>
        {!hasOutstanding ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            All pre-checkin payments and tenancy bills are fully settled. Thank you!
          </div>
        ) : (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600 space-y-1">
            Outstanding balance: THB {currency(totalOutstanding)}
            <div className="text-xs text-rose-500">
              Upload payment slips so staff can confirm your payments promptly.
            </div>
          </div>
        )}
      </header>

      <section className="grid gap-3">
        <SummaryCard
          title="Outstanding balance"
          value={`THB ${currency(totalOutstanding)}`}
          subtitle={hasOutstanding ? 'Pending amount to settle' : 'All settled'}
          intent={hasOutstanding ? 'warn' : 'ok'}
        />
      </section>

      <section className="space-y-3">
        <h3 className="text-xl font-semibold text-slate-900">Outstanding Bills</h3>
        {openBills.length === 0 ? (
          <div className="glass-card border border-dashed border-slate-300 text-center py-10 text-slate-500">
            No outstanding bills
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-white/60 shadow-lg">
            <table className="min-w-[960px] w-full">
              <thead className="bg-gradient-to-r from-indigo-500/90 to-purple-500/90 text-left text-white">
                <tr>
                  <th className="p-2 border-b">Bill No</th>
                  <th className="p-2 border-b">Room</th>
                  <th className="p-2 border-b">Scope</th>
                  <th className="p-2 border-b">Period</th>
                  <th className="p-2 border-b">Breakdown</th>
                  <th className="p-2 border-b">Amount</th>
                  <th className="p-2 border-b">Outstanding</th>
                  <th className="p-2 border-b">Status</th>
                  <th className="p-2 border-b">Action</th>
                </tr>
              </thead>
              <tbody className="text-slate-800">
                {openBills.map((bill) => (
                  <tr key={bill.id} className="odd:bg-white/85 even:bg-white/70 backdrop-blur">
                    <td className="p-2 border-b">
                      <div className="font-medium">{formatBillDisplayCode(bill)}</div>
                      <div className="text-[11px] uppercase tracking-wide text-gray-500">
                        Ref: {bill.bill_no}
                      </div>
                      <div className="text-xs text-gray-500">
                        {new Date(bill.issued_at).toLocaleString()}
                      </div>
                    </td>
                    <td className="p-2 border-b">
                      {bill.building_code ? `${bill.building_code}-${bill.room_no}` : bill.room_no || '-'}
                    </td>
                    <td className="p-2 border-b">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold ${getScopeBadge(bill.bill_scope)}`}
                      >
                        {getScopeLabel(bill.bill_scope)}
                      </span>
                    </td>
                    <td className="p-2 border-b">
                      {bill.period_start?.slice(0, 10)}  &rarr;  {bill.period_end?.slice(0, 10)}
                    </td>
                    <td className="p-2 border-b text-xs text-slate-600 space-y-1">
                      {Number(bill.rent_amount || 0) > 0 && (
                        <div>Rent THB {currency(bill.rent_amount)}</div>
                      )}
                      {Number(bill.utility_amount || 0) > 0 && (
                        <div>Utilities THB {currency(bill.utility_amount)}</div>
                      )}
                      {Number(bill.rent_amount || 0) <= 0 && Number(bill.utility_amount || 0) <= 0 && (
                        <span>-</span>
                      )}
                    </td>
                    <td className="p-2 border-b text-slate-700">THB {currency(bill.total_amount)}</td>
                    <td className="p-2 border-b text-rose-600 font-semibold">
                      THB {currency(bill.outstanding_amount)}
                    </td>
                    <td className="p-2 border-b">{bill.status}</td>
                    <td className="p-2 border-b space-x-2">
                      <button
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 text-slate-700 text-xs hover:bg-slate-100"
                        onClick={() => showDetails(bill)}
                      >
                        Details
                      </button>
                      {bill.outstanding_amount > 0 && (
                        <button
                          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 text-white text-xs shadow hover:shadow-2xl"
                          onClick={() => startPay(bill)}
                        >
                          Pay THB {currency(bill.outstanding_amount)}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="text-xl font-semibold text-slate-900">Billing History</h3>
        {historyBills.length === 0 ? (
          <div className="glass-card border border-dashed border-slate-300 text-center py-10 text-slate-500">
            No billing history yet
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-white/60 shadow">
            <table className="min-w-[960px] w-full">
              <thead className="bg-slate-100 text-left text-slate-700">
                <tr>
                  <th className="p-2 border-b">Bill No</th>
                  <th className="p-2 border-b">Room</th>
                  <th className="p-2 border-b">Scope</th>
                  <th className="p-2 border-b">Period</th>
                  <th className="p-2 border-b">Breakdown</th>
                  <th className="p-2 border-b">Amount</th>
                  <th className="p-2 border-b">Paid</th>
                  <th className="p-2 border-b">Action</th>
                </tr>
              </thead>
              <tbody className="text-slate-800">
                {historyBills.map((bill) => (
                  <tr key={bill.id} className="odd:bg-white even:bg-slate-50">
                    <td className="p-2 border-b">
                      <div className="font-medium">{formatBillDisplayCode(bill)}</div>
                      <div className="text-[11px] uppercase tracking-wide text-gray-500">
                        Ref: {bill.bill_no}
                      </div>
                      <div className="text-xs text-gray-500">
                        {new Date(bill.issued_at).toLocaleString()}
                      </div>
                    </td>
                    <td className="p-2 border-b">
                      {bill.building_code ? `${bill.building_code}-${bill.room_no}` : bill.room_no || '-'}
                    </td>
                    <td className="p-2 border-b">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold ${getScopeBadge(bill.bill_scope)}`}
                      >
                        {getScopeLabel(bill.bill_scope)}
                      </span>
                    </td>
                    <td className="p-2 border-b">
                      {bill.period_start?.slice(0, 10)}  &rarr;  {bill.period_end?.slice(0, 10)}
                    </td>
                    <td className="p-2 border-b text-xs text-slate-600 space-y-1">
                      {Number(bill.rent_amount || 0) > 0 && (
                        <div>Rent THB {currency(bill.rent_amount)}</div>
                      )}
                      {Number(bill.utility_amount || 0) > 0 && (
                        <div>Utilities THB {currency(bill.utility_amount)}</div>
                      )}
                      {Number(bill.rent_amount || 0) <= 0 && Number(bill.utility_amount || 0) <= 0 && (
                        <span>-</span>
                      )}
                    </td>
                    <td className="p-2 border-b text-slate-700">THB {currency(bill.total_amount)}</td>
                    <td className="p-2 border-b text-emerald-600 font-semibold">
                      THB {currency(bill.paid_amount)}
                    </td>
                    <td className="p-2 border-b">
                      <button
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 text-slate-700 text-xs hover:bg-slate-100"
                        onClick={() => showDetails(bill)}
                      >
                        Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
      )}
    </section>

      <section className="space-y-3">
        <h3 className="text-xl font-semibold text-slate-900">Utility Usage History</h3>
        {utilityHistory.length === 0 ? (
          <div className="glass-card border border-dashed border-slate-300 text-center py-10 text-slate-500">
            No utility readings available yet.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <label className="block text-sm text-slate-600">Room</label>
                <select
                  className="border rounded-lg px-3 py-2"
                  value={utilityRoomFilter}
                  onChange={(e) => setUtilityRoomFilter(e.target.value)}
                >
                  <option value="all">All rooms</option>
                  {utilityRooms.map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-slate-600">Type</label>
                <select
                  className="border rounded-lg px-3 py-2"
                  value={utilityTypeFilter}
                  onChange={(e) => setUtilityTypeFilter(e.target.value)}
                >
                  <option value="all">All</option>
                  <option value="WATER">Water</option>
                  <option value="ELECTRIC">Electric</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-white/60 shadow">
              <table className="min-w-[720px] w-full">
                <thead className="bg-slate-100 text-left text-slate-700">
                  <tr>
                    <th className="p-2 border-b">Date</th>
                    <th className="p-2 border-b">Room</th>
                    <th className="p-2 border-b">Type</th>
                    <th className="p-2 border-b">Reading</th>
                  </tr>
                </thead>
                <tbody className="text-slate-800">
                  {filteredUtility.map((entry) => (
                    <tr key={`${entry.id}-${entry.reading_date}`} className="odd:bg-white even:bg-slate-50">
                      <td className="p-2 border-b text-sm text-slate-600">{entry.reading_date?.slice(0, 10)}</td>
                      <td className="p-2 border-b">{entry.building_code ? `${entry.building_code}-${entry.room_no}` : entry.room_no}</td>
                      <td className="p-2 border-b">{entry.type}</td>
                      <td className="p-2 border-b">{Number(entry.value_unit || 0).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      
      {paying && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-[420px] space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-slate-900">
              Pay Bill {formatBillDisplayCode(paying)}
            </h3>
            <div className="text-xs uppercase tracking-wide text-slate-500">
              Ref: {paying.bill_no}
            </div>
            <div className="space-y-2">
              <div className="text-sm text-slate-600">
                Outstanding: THB {currency(paying.outstanding_amount)}
              </div>
              <div className="space-y-1">
                <label className="block text-sm text-slate-600" htmlFor="pay-amount">
                  Amount
                </label>
                <input
                  id="pay-amount"
                  className="border rounded-lg px-3 py-2 w-full"
                  value={pay.amount}
                  onChange={(e) => setPay((p) => ({ ...p, amount: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <label className="block text-sm text-slate-600" htmlFor="pay-method">
                  Method
                </label>
                <select
                  id="pay-method"
                  className="border rounded-lg px-3 py-2 w-full"
                  value={pay.method}
                  onChange={(e) => handleMethodChange(e.target.value)}
                >
                  <option value="QR">QR</option>
                  <option value="TRANSFER">Transfer</option>
                </select>
              </div>

              {pay.method === 'QR' && (
                <div className="space-y-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-3 text-indigo-700">
                  <div className="text-xs">
                    PromptPay ID:{' '}
                    <span className={`font-semibold ${paymentSettings.promptpay_id ? 'text-indigo-900' : 'text-rose-600'}`}>
                      {paymentSettings.promptpay_id || 'Not configured'}
                    </span>
                  </div>
                  {qrImageSrc ? (
                    <img
                      src={qrImageSrc}
                      alt="PromptPay QR code"
                      className="mx-auto h-48 w-48 rounded-2xl border border-white object-contain shadow"
                    />
                  ) : (
                    <div className="rounded-lg bg-white/70 px-3 py-2 text-xs text-indigo-600">
                      {qrStatusMessage || 'QR code preview unavailable.'}
                    </div>
                  )}
                </div>
              )}

              {pay.method === 'TRANSFER' && (
                <div className="space-y-1 rounded-xl border border-blue-200 bg-blue-50 px-3 py-3 text-xs text-blue-700">
                  <div>
                    Account name:{' '}
                    <span className={`font-semibold ${paymentSettings.bank_account_name ? 'text-blue-900' : 'text-rose-600'}`}>
                      {paymentSettings.bank_account_name || 'Not configured'}
                    </span>
                  </div>
                  <div>
                    Account number:{' '}
                    <span className={`font-mono text-base ${paymentSettings.bank_account_number ? 'text-blue-900' : 'text-rose-600'}`}>
                      {paymentSettings.bank_account_number || 'Not configured'}
                    </span>
                  </div>
                </div>
              )}

              {['QR', 'TRANSFER'].includes(pay.method) && (
                <div className="space-y-2">
                  <div className="text-xs text-slate-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    1. {paymentInstruction}
                    <br />
                    2. Click "{paymentConfirmLabel}" and upload the slip so staff can confirm it.
                  </div>
                  <button
                    type="button"
                    className={`px-3 py-1 text-xs rounded border ${pay.ready ? 'border-emerald-400 text-emerald-600 bg-emerald-50' : 'border-slate-300 text-slate-600 hover:bg-slate-100'}`}
                    onClick={markPaymentReady}
                  >
                    {pay.ready ? 'Ready to upload slip' : paymentConfirmLabel}
                  </button>
                  <div className="space-y-1">
                    <label className="block text-sm text-slate-600" htmlFor="pay-slip">
                      {slipLabel} (required)
                    </label>
                    <input
                      id="pay-slip"
                      type="file"
                      accept="image/*"
                      key={pay.slip_path || 'empty'}
                      disabled={!pay.ready}
                      onChange={(e) => handleSlipFile(e.target.files?.[0] || null)}
                      className="block w-full text-sm text-slate-600 disabled:opacity-50"
                    />
                    {pay.uploading && (
                      <div className="text-xs text-slate-500">Uploading slip...</div>
                    )}
                    {!pay.uploading && (
                      <>
                        {(pay.slip_preview ||
                          (pay.slip_path && isImageLike(pay.slip_path))) && (
                          <div className="mt-2 rounded-xl border border-slate-200 bg-white p-2">
                            <img
                              src={pay.slip_preview || resolveSlipUrl(pay.slip_path)}
                              alt="Payment slip preview"
                              className="max-h-56 w-full rounded-lg object-contain"
                            />
                            <div className="mt-2 flex items-center justify-between text-xs text-slate-600">
                              {pay.slip_path ? (
                                <a
                                  href={resolveSlipUrl(pay.slip_path)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-emerald-600 underline"
                                >
                                  Open full image
                                </a>
                              ) : (
                                <span className="text-slate-400">Uploading...</span>
                              )}
                              <button
                                type="button"
                                className="text-slate-500 hover:text-slate-700"
                                onClick={() => handleSlipFile(null)}
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        )}
                        {!pay.slip_preview &&
                          pay.slip_path &&
                          !isImageLike(pay.slip_path) && (
                            <div className="mt-2 flex items-center gap-3 text-xs text-slate-600">
                              <span>Slip attached</span>
                              <a
                                href={resolveSlipUrl(pay.slip_path)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-emerald-600 underline"
                              >
                                Download file
                              </a>
                              <button
                                type="button"
                                className="text-slate-500 hover:text-slate-700"
                                onClick={() => handleSlipFile(null)}
                              >
                                Remove
                              </button>
                            </div>
                          )}
                      </>
                    )}
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <label className="block text-sm text-slate-600" htmlFor="pay-note">
                  Note
                </label>
                <textarea
                  id="pay-note"
                  className="border rounded-lg px-3 py-2 w-full"
                  rows={2}
                  value={pay.note}
                  onChange={(e) => setPay((p) => ({ ...p, note: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                className="px-3 py-1.5 rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-100"
                onClick={() => setPaying(null)}
              >
                Cancel
              </button>
              <button
                className={`px-3 py-1.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 text-white hover:shadow-xl ${submitDisabled ? 'opacity-60 cursor-not-allowed hover:shadow-none' : ''}`}
                onClick={submitPay}
                disabled={submitDisabled}
              >
                Submit payment
              </button>
            </div>
          </div>
        </div>
      )}

      {detailBill && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-[420px] space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  Bill details - {formatBillDisplayCode(detailBill)}
                </h3>
                <div className="text-xs uppercase tracking-wide text-slate-500">
                  Ref: {detailBill.bill_no}
                </div>
              </div>
              <button
                className="text-sm text-slate-500 hover:text-slate-700"
                onClick={() => {
                  setDetailBill(null);
                  setDetailItems([]);
                }}
              >
                Close
              </button>
            </div>
            {detailLoading ? (
              <div className="text-sm text-slate-500">Loading...</div>
            ) : detailItems.length === 0 ? (
              <div className="text-sm text-slate-500">No items on this bill.</div>
            ) : (
              <ul className="space-y-2 text-sm text-slate-700">
                {detailItems.map((item, idx) => (
                  <li
                    key={`${item.item_type}-${idx}`}
                    className="border border-slate-200 rounded-xl px-3 py-2"
                  >
                    <div className="font-semibold">{item.item_type}</div>
                    {item.description && (
                      <div className="text-xs text-slate-500 mb-1">{item.description}</div>
                    )}
                    <div className="text-sm">
                      {Number(item.qty || 0)} x THB {currency(item.unit_price)} = THB{' '}
                      {currency(item.amount)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ title, value, subtitle, intent = 'neutral' }) {
  const palette =
    intent === 'warn'
      ? 'border-rose-200 bg-rose-50 text-rose-700'
      : intent === 'ok'
        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
        : 'border-slate-200 bg-white text-slate-700';
  return (
    <div className={`rounded-2xl border px-4 py-3 shadow-sm ${palette}`}>
      <div className="text-xs uppercase tracking-wide opacity-70">{title}</div>
      <div className="text-lg font-semibold">{value}</div>
      {subtitle && <div className="text-xs opacity-70">{subtitle}</div>}
    </div>
  );
}

