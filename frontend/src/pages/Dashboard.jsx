import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../axios';

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedDate, setSelectedDate] = useState(() => {
    const now = new Date();
    return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())).toISOString().slice(0, 10);
  });

  const numberFormat = useMemo(() => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }), []);
  const currencyFormat = useMemo(
    () => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    []
  );

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await api.get('/dashboard/summary', {
          params: selectedDate ? { date: selectedDate } : undefined
        });
        setData(res.data);
        setError('');
      } catch (e) {
        setData(null);
        setError(e.response?.data?.message || 'Unable to load dashboard summary.');
      } finally {
        setLoading(false);
      }
    })();
  }, [selectedDate]);

  if (loading) {
    return (
      <div className="p-4 max-w-6xl mx-auto space-y-4">
        <div className="h-10 w-1/3 rounded-2xl bg-slate-200/70 animate-pulse" />
        <div className="grid gap-4 md:grid-cols-3">
          {[...Array(6)].map((_, idx) => (
            <div key={idx} className="rounded-2xl border border-slate-200 bg-white/60 h-32 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 max-w-6xl mx-auto">
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-700">{error}</div>
      </div>
    );
  }

  const stats = data || {};
  const rooms = stats.rooms || {};
  const bookings = stats.bookings || {};
  const tenancies = stats.tenancies || {};
  const billing = stats.billing || {};
  const maintenance = stats.maintenance || {};
  const prepayments = stats.prepayments || {};

  const formatNumber = (value) => numberFormat.format(Number(value || 0));
  const formatCurrency = (value) => currencyFormat.format(Number(value || 0));

  const quickCards = [
    {
      key: 'roomsAvailable',
      title: `Rooms available (${rooms.date || selectedDate})`,
      value: rooms.available,
      subtitle: `${formatNumber(rooms.reserved)} reserved • ${formatNumber(rooms.occupied)} occupied`,
      to: '/browse-rooms'
    },
    {
      key: 'pendingBookings',
      title: 'Pending bookings',
      value: bookings.pending,
      subtitle: `${formatNumber(bookings.pending_allocation)} without room`,
      to: '/bookingmanagement'
    },
    {
      key: 'checkinsToday',
      title: 'Today check-ins',
      value: bookings.today_checkins,
      subtitle: `${formatNumber(bookings.today_checkouts)} expected check-outs`,
      to: '/bookingmanagement'
    },
    {
      key: 'outstanding',
      title: 'Outstanding balance',
      value: `THB ${formatCurrency(billing.outstanding_total)}`,
      subtitle: `${formatNumber(billing.pending_count)} open bills`,
      to: '/billing-payments'
    },
    {
      key: 'overdueBills',
      title: 'Overdue bills',
      value: billing.overdue_count,
      subtitle: `${formatNumber(billing.due_today_count)} due today`,
      to: '/billing-payments'
    },
    {
      key: 'openMaintenance',
      title: 'Open maintenance',
      value: maintenance.open,
      subtitle: `${formatNumber(maintenance.aging)} aging >3 days`,
      to: '/maintenance'
    },
    {
      key: 'pendingPrepayments',
      title: 'Pending prepayments',
      value: prepayments.pending_count,
      subtitle: `THB ${formatCurrency(prepayments.pending_amount)} waiting`,
      to: '/billing-payments'
    }
  ];

  const alerts = [];
  if ((bookings.pending || 0) > 0) {
    alerts.push({
      message: `${formatNumber(bookings.pending)} bookings waiting for approval.`,
      to: '/bookingmanagement'
    });
  }
  if ((billing.overdue_count || 0) > 0) {
    alerts.push({
      message: `${formatNumber(billing.overdue_count)} bills overdue. Follow up with tenants.`,
      to: '/billing-payments'
    });
  }
  if ((maintenance.aging || 0) > 0) {
    alerts.push({
      message: `${formatNumber(maintenance.aging)} maintenance jobs older than 3 days.`,
      to: '/maintenance'
    });
  }
  if ((tenancies.ending_soon || 0) > 0) {
    alerts.push({
      message: `${formatNumber(tenancies.ending_soon)} tenancies ending within 7 days.`,
      to: '/tenancymanagement'
    });
  }

  return (
    <div className="p-4 max-w-6xl mx-auto space-y-4">
      <header className="space-y-1">
        <h2 className="text-3xl font-bold text-slate-900">Staff Command Center</h2>
        <p className="text-sm text-slate-500">Monitor occupancy, bookings, billing and issues at a glance.</p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-slate-500" htmlFor="dashboard-overview-date">
          Overview date
        </label>
        <input
          id="dashboard-overview-date"
          type="date"
          className="border rounded-lg px-3 py-1.5 text-sm"
          value={selectedDate}
          onChange={(e) => {
            if (e.target.value) {
              setSelectedDate(e.target.value);
            }
          }}
        />
        <span className="text-xs text-slate-400">
          Updated snapshot for {stats?.date || selectedDate}
        </span>
      </div>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {quickCards.map((card) => (
          <Link
            key={card.key}
            to={card.to}
            className="group rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm hover:shadow-xl transition"
          >
            <div className="text-xs uppercase tracking-wide text-slate-500">{card.title}</div>
            <div className="mt-2 text-3xl font-semibold text-slate-900">
              {typeof card.value === 'string' ? card.value : formatNumber(card.value)}
            </div>
            <div className="mt-1 text-sm text-slate-500">{card.subtitle}</div>
            <div className="mt-3 text-xs font-semibold text-indigo-600 group-hover:underline">View details →</div>
          </Link>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-900">Rooms overview</h3>
            <span className="text-sm text-slate-500">
              {rooms.date || selectedDate} · {formatNumber(rooms.total || 0)} rooms
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              { label: 'Available', value: rooms.available, color: 'bg-emerald-100 text-emerald-700' },
              { label: 'Occupied', value: rooms.occupied, color: 'bg-indigo-100 text-indigo-700' },
              { label: 'Reserved', value: rooms.reserved, color: 'bg-amber-100 text-amber-700' },
              { label: 'Maintenance', value: rooms.maintenance, color: 'bg-rose-100 text-rose-700' }
            ].map((chip) => (
              <div key={chip.label} className={`px-3 py-1 rounded-full text-sm font-medium ${chip.color}`}>
                {chip.label}: {formatNumber(chip.value || 0)}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-900">Tenancy health</h3>
            <Link to="/tenancymanagement" className="text-xs font-semibold text-indigo-600 hover:underline">
              Manage tenancies →
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-slate-200 p-3">
              <div className="text-xs text-slate-500 uppercase">Active</div>
              <div className="mt-1 text-2xl font-semibold text-slate-900">{formatNumber(tenancies.active)}</div>
            </div>
            <div className="rounded-xl border border-slate-200 p-3">
              <div className="text-xs text-slate-500 uppercase">Moving out</div>
              <div className="mt-1 text-2xl font-semibold text-slate-900">{formatNumber(tenancies.moving_out)}</div>
            </div>
            <div className="rounded-xl border border-slate-200 p-3">
              <div className="text-xs text-slate-500 uppercase">Ending soon (7d)</div>
              <div className="mt-1 text-2xl font-semibold text-slate-900">{formatNumber(tenancies.ending_soon)}</div>
            </div>
            <div className="rounded-xl border border-slate-200 p-3">
              <div className="text-xs text-slate-500 uppercase">Ended (30d)</div>
              <div className="mt-1 text-2xl font-semibold text-slate-900">{formatNumber(tenancies.ended_recent)}</div>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white/70 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">Attention center</h3>
          <span className="text-xs text-slate-500">Quick links to resolve issues</span>
        </div>
        {alerts.length === 0 ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            All clear — no outstanding alerts right now.
          </div>
        ) : (
          <ul className="space-y-2">
            {alerts.map((alert, idx) => (
              <li key={idx}>
                <Link
                  to={alert.to}
                  className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 hover:bg-amber-100"
                >
                  <span>{alert.message}</span>
                  <span className="text-xs font-semibold text-amber-700">Go →</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

