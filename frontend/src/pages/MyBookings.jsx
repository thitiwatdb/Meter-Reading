import { useEffect, useMemo, useState } from 'react';
import api from '../axios';

const statusBadges = {
  PENDING: 'bg-amber-100 text-amber-700',
  APPROVED: 'bg-sky-100 text-sky-700',
  CHECKED_IN: 'bg-emerald-100 text-emerald-700',
  CHECKED_OUT: 'bg-slate-200 text-slate-700',
  CANCELLED: 'bg-rose-100 text-rose-700',
  REJECTED: 'bg-rose-100 text-rose-700',
};

const phaseLabels = {
  UPCOMING: 'Upcoming',
  CURRENT: 'In Stay',
};

const currency = (value) =>
  Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function MyBookings() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshFlag, setRefreshFlag] = useState(0);
  const [historyQuery, setHistoryQuery] = useState('');
  const [historyStatus, setHistoryStatus] = useState('all');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await api.get('/bookings/mine');
        const list = res.data || [];
        setItems(list);
        if (typeof window !== 'undefined') {
          const outstandingPrepay = list.filter((booking) => {
            const status = String(booking.status || '').toUpperCase();
            return ['PENDING', 'APPROVED'].includes(status) && Number(booking.prepayment_outstanding_amount || 0) > 0.009;
          }).length;
          window.dispatchEvent(new CustomEvent('tenant-bookings:pending', { detail: { count: outstandingPrepay } }));
        }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [refreshFlag]);

  const { active, history } = useMemo(() => {
    const activeList = [];
    const historyList = [];
    const todayStr = new Date().toISOString().slice(0, 10);

    (items || []).forEach((booking) => {
      const status = String(booking.status || '').toUpperCase();
      const startStr = typeof booking.start_date === 'string' ? booking.start_date.slice(0, 10) : '';
      const endStr = typeof booking.end_date === 'string' ? booking.end_date.slice(0, 10) : '';

      let phase = 'HISTORY';
      if (['CANCELLED', 'REJECTED', 'CHECKED_OUT'].includes(status)) {
        phase = 'HISTORY';
      } else if (status === 'CHECKED_IN') {
        phase = 'CURRENT';
      } else if (['APPROVED', 'PENDING'].includes(status)) {
        if (startStr && startStr > todayStr) {
          phase = 'UPCOMING';
        } else if (startStr && endStr && endStr < todayStr) {
          phase = 'HISTORY';
        } else {
          phase = 'CURRENT';
        }
      }

      if (phase === 'HISTORY') {
        historyList.push({ ...booking, phase });
      } else {
        activeList.push({ ...booking, phase });
      }
    });

    return { active: activeList, history: historyList };
  }, [items]);

  const filteredHistory = useMemo(() => {
    const term = historyQuery.trim().toLowerCase();
    const statusFilter = historyStatus.trim().toUpperCase();
    return history.filter((booking) => {
      const status = String(booking.status || '').toUpperCase();
      if (statusFilter && statusFilter !== 'ALL' && status !== statusFilter) return false;
      if (!term) return true;
      const fields = [
        booking.booking_code,
        booking.room_no,
        booking.building_code,
        booking.sell_type,
        status,
        booking.id
      ];
      return fields
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    });
  }, [history, historyQuery, historyStatus]);

  const reload = () => setRefreshFlag((v) => v + 1);

  if (loading) {
    return (
      <div className="p-4 space-y-4 animate-pulse">
        <div className="h-10 w-40 bg-slate-200/70 rounded-2xl" />
        <div className="grid gap-4 md:grid-cols-2">
          {[...Array(2)].map((_, idx) => (
            <div key={idx} className="h-48 rounded-2xl bg-slate-200/50" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <header className="flex items-center justify-between flex-wrap gap-3">
          <h2 className="text-2xl font-semibold text-slate-900 flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-cyan-500 text-white shadow-lg">
              &#127968;
            </span>
            Active Bookings
          </h2>
          <p className="text-sm text-slate-500">
            Upcoming reservations and stays currently in-house.
          </p>
        </header>
        {active.length === 0 ? (
          <EmptyState message="No active bookings right now. Start a new reservation to see it here." />
        ) : (
          <div className="grid gap-4">
            {active.map((booking) => (
              <BookingCard key={booking.id} booking={booking} onChanged={reload} />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <header className="flex items-center justify-between flex-wrap gap-3">
          <h2 className="text-2xl font-semibold text-slate-900 flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-lg">
              &#128218;
            </span>
            Booking History
          </h2>
          <p className="text-sm text-slate-500">
            Completed, cancelled or past bookings stay available for reference.
          </p>
        </header>
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm w-full sm:w-64"
            placeholder="Search history (code, room, status)"
            value={historyQuery}
            onChange={(e) => setHistoryQuery(e.target.value)}
          />
          <select
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
            value={historyStatus}
            onChange={(e) => setHistoryStatus(e.target.value)}
          >
            <option value="all">All statuses</option>
            <option value="approved">Approved</option>
            <option value="checked_in">Checked in</option>
            <option value="checked_out">Checked out</option>
            <option value="cancelled">Cancelled</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
        {filteredHistory.length === 0 ? (
          <EmptyState message="No booking history yet." />
        ) : (
          <div className="grid gap-4">
            {filteredHistory.map((booking) => (
              <BookingCard key={booking.id} booking={booking} onChanged={reload} showHistory />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function BookingCard({ booking, onChanged, showHistory = false }) {
  const status = String(booking.status || '').toUpperCase();
  const phase = booking.phase || (showHistory ? 'HISTORY' : 'UPCOMING');
  const badgeClass = statusBadges[status] || 'bg-slate-200 text-slate-700';
  const prepayBillId = booking.prepayment_bill_id;
  const prepayOutstanding = Number(booking.prepayment_outstanding_amount || 0);
  const prepayTotal = Number(booking.prepayment_total_amount || 0);
  const prepayPaid = Number(booking.prepayment_paid_amount || 0);
  const outstanding = Number(booking.bill_outstanding_amount || 0);
  const billsSettled =
    outstanding <= 0.001 && prepayOutstanding <= 0.001 && Boolean(booking.bills_all_paid);
  const hasTenancy = Boolean(booking.tenancy_id);

  return (
    <article className="glass-card p-5 shadow-lg">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-lg font-semibold text-slate-900">
              {booking.booking_code || booking.id.slice(0, 8)}
            </span>
            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold ${badgeClass}`}>
              <span className="uppercase">{status.replace('_', ' ')}</span>
            </span>
            {!showHistory && phase !== 'HISTORY' && (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-700">
                {phaseLabels[phase]}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            ID: {booking.id.slice(0, 8)}...
          </p>
        </div>
        <div className="text-right">
          <div className="text-sm text-slate-500">Stay</div>
          <div className="font-medium text-slate-700">
            {formatDate(booking.start_date)} &rarr; {formatDate(booking.end_date)}
          </div>
          <div className="text-xs text-slate-500">
            {booking.is_monthly ? 'Monthly contract' : 'Daily stay'}
          </div>
        </div>
      </header>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <InfoBlock
          label="Room"
          value={
            booking.room_no
              ? `${booking.building_code ? `${booking.building_code}-` : ''}${booking.room_no}`
              : 'Unassigned'
          }
        />
        <InfoBlock
          label="Room Type"
          value={booking.room_type || booking.type || '-'}
        />
        <InfoBlock
          label="Check-in/out tracking"
          value={
            <div className="space-y-1 text-xs">
              <div>
                Check-in: {booking.checked_in_at ? new Date(booking.checked_in_at).toLocaleString() : '-'}
              </div>
              <div>
                Check-out: {booking.checked_out_at ? new Date(booking.checked_out_at).toLocaleString() : '-'}
              </div>
            </div>
          }
        />
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <InfoBlock
          label="Prepayment"
          value={
            prepayBillId ? (
              <div className="space-y-1 text-xs">
                <span
                  className={`inline-flex items-center gap-2 rounded-full px-3 py-1 font-semibold ${
                    prepayOutstanding > 0.009 ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
                  }`}
                >
                  {prepayOutstanding > 0.009 ? `Due THB ${currency(prepayOutstanding)}` : 'Paid in full'}
                </span>
                <div className="text-slate-500">
                  Bill {booking.prepayment_bill_no || prepayBillId.slice(0, 8)} · THB {currency(prepayTotal)}
                </div>
              </div>
            ) : (
              <span className="text-slate-500 text-sm">Awaiting issuance</span>
            )
          }
        />
        <InfoBlock
          label="Tenancy bills"
          value={
            outstanding > 0
              ? <span className="text-rose-600 font-semibold">THB {currency(outstanding)}</span>
              : <span className="text-emerald-600 font-semibold">Settled</span>
          }
        />
        <InfoBlock
          label="Tenancy"
          value={
            hasTenancy
              ? <span className="text-slate-700 text-sm">Linked tenancy ({booking.tenancy_status})</span>
              : <span className="text-slate-500 text-sm">Not checked-in yet</span>
          }
        />
      </div>

      <footer className="mt-4 flex flex-wrap items-center gap-2">
        {['PENDING'].includes(status) && (
          <CancelButton id={booking.id} onSuccess={onChanged} />
        )}
        {showHistory && (
          <span className="ml-auto text-xs text-slate-400">
            Created at {new Date(booking.created_at).toLocaleString()}
          </span>
        )}
      </footer>
    </article>
  );
}

function InfoBlock({ label, value }) {
  return (
    <div className="rounded-xl border border-white/60 bg-white/70 px-4 py-3 shadow-sm">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-sm text-slate-800">{value || '-'}</div>
    </div>
  );
}

function CancelButton({ id, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');

  const submit = async () => {
    if (!reason.trim()) {
      alert('Please provide a cancellation reason.');
      return;
    }
    setLoading(true);
    try {
      await api.post(`/bookings/${id}/cancel`, { reason: reason.trim() });
      setOpen(false);
      setReason('');
      onSuccess?.();
    } catch (e) {
      alert(e.response?.data?.message || 'Cancel failed');
    } finally {
      setLoading(false);
    }
  };

  const close = () => {
    if (loading) return;
    setOpen(false);
    setReason('');
  };

  return (
    <>
      <button
        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-rose-200 text-rose-600 text-sm hover:bg-rose-50 disabled:opacity-60"
        disabled={loading}
        onClick={() => {
          setReason('');
          setOpen(true);
        }}
      >
        {loading ? 'Cancelling...' : 'Cancel Booking'}
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-[360px] p-5 space-y-3">
            <h3 className="text-lg font-semibold text-slate-900">Cancel booking</h3>
            <p className="text-sm text-slate-600">
              Please provide the reason for cancelling this booking.
            </p>
            <textarea
              className="w-full border rounded-lg px-3 py-2 text-sm"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Cancellation reason"
              disabled={loading}
            />
            <div className="flex justify-end gap-2">
              <button
                className="px-3 py-1.5 rounded border border-slate-300 text-slate-600 hover:bg-slate-100 disabled:opacity-60"
                onClick={close}
                disabled={loading}
              >
                Back
              </button>
              <button
                className="px-3 py-1.5 rounded bg-rose-600 text-white disabled:opacity-60"
                onClick={submit}
                disabled={loading || !reason.trim()}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function EmptyState({ message }) {
  return (
    <div className="glass-card border border-dashed border-slate-300 text-center py-10 text-slate-500">
      {message}
    </div>
  );
}

function formatDate(value) {
  if (!value) return '-';
  return value.slice(0, 10);
}



