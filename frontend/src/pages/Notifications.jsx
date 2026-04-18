import { useEffect, useState } from 'react';
import api from '../axios';

export default function Notifications() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await api.get('/notifications/mine');
        setItems(res.data || []);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="animate-pulse space-y-3">
          <div className="h-10 w-2/3 rounded-2xl bg-slate-200/60" />
          <div className="glass-card p-4 space-y-2">
            <div className="h-4 w-1/2 bg-slate-200/70 rounded-full" />
            <div className="h-4 w-2/3 bg-slate-200/70 rounded-full" />
            <div className="h-3 w-1/3 bg-slate-200/60 rounded-full" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-2 md:p-4 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-rose-500 text-white shadow-lg">
            🔔
          </span>
          Notifications
        </h2>
        <p className="text-sm text-slate-500">
          Stay up to date with your bookings, billing, and maintenance.
        </p>
      </div>
      <div className="space-y-3">
        {items.map((item) => (
          <article
            key={item.id}
            className="glass-card p-4 transition hover:shadow-2xl hover:translate-y-[-2px]"
          >
            <header className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">{item.title}</h3>
                <span className="text-xs text-slate-500">
                  {new Date(item.created_at).toLocaleString()}
                </span>
              </div>
              {item.type && (
                <span className="text-xs font-semibold uppercase tracking-wide px-3 py-1 rounded-full bg-gradient-to-r from-indigo-500/20 to-purple-500/20 text-indigo-700 border border-indigo-200">
                  {item.type}
                </span>
              )}
            </header>
            {item.body && <p className="text-sm text-slate-700 mt-2">{item.body}</p>}
            <footer className="mt-3 text-xs text-slate-500 flex items-center gap-3">
              {item.link && (
                <a
                  href={item.link}
                  className="inline-flex items-center gap-1 text-indigo-600 font-semibold hover:text-indigo-700"
                >
                  View details
                  <span aria-hidden>→</span>
                </a>
              )}
            </footer>
          </article>
        ))}
        {items.length === 0 && (
          <div className="glass-card px-6 py-8 text-center text-slate-500">
            No notifications yet. When actions occur, you’ll see them here.
          </div>
        )}
      </div>
    </div>
  );
}
