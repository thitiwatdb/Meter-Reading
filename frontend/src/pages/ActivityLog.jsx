import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import api from '../axios';

export default function ActivityLog() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const loc = useLocation();
  const qp = new URLSearchParams(loc.search);
  const [filter, setFilter] = useState({ entity_type: qp.get('entity_type') || '', entity_id: qp.get('entity_id') || '' });

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/activity', { params: { ...filter, limit: 200 } });
      setItems(res.data || []);
    } finally {
      setLoading(false);
    }
  };
  useEffect(()=>{ load(); }, []);

  return (
    <div className="p-4 max-w-6xl mx-auto space-y-4">
      <h2 className="text-xl font-semibold">Activity Log</h2>
      <div className="flex gap-2 items-end">
        <div>
          <label className="block text-sm">Entity Type</label>
          <input className="border px-2 py-1" value={filter.entity_type} onChange={(e)=>setFilter(f=>({...f, entity_type: e.target.value}))} />
        </div>
        <div>
          <label className="block text-sm">Entity ID</label>
          <input className="border px-2 py-1 w-[340px]" value={filter.entity_id} onChange={(e)=>setFilter(f=>({...f, entity_id: e.target.value}))} />
        </div>
        <button className="px-3 py-1 border rounded hover:bg-gray-50" onClick={load}>Filter</button>
      </div>

      {loading ? (
        <div>Loading…</div>
      ) : (
        <div className="overflow-x-auto rounded border">
          <table className="min-w-[900px] w-full">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="p-2 border-b">Time</th>
                <th className="p-2 border-b">Actor</th>
                <th className="p-2 border-b">Action</th>
                <th className="p-2 border-b">Entity</th>
                <th className="p-2 border-b">Details</th>
              </tr>
            </thead>
            <tbody>
              {items.map(it => (
                <tr key={it.id} className="odd:bg-white even:bg-gray-50">
                  <td className="p-2 border-b">{new Date(it.created_at).toLocaleString()}</td>
                  <td className="p-2 border-b">{it.actor_username || '-'}</td>
                  <td className="p-2 border-b">{it.action}</td>
                  <td className="p-2 border-b">{it.entity_type}:{it.entity_id?.slice(0,8)}…</td>
                  <td className="p-2 border-b text-xs text-gray-600">{it.details ? JSON.stringify(it.details) : '-'}</td>
                </tr>
              ))}
              {items.length===0 && (<tr><td className="p-3 text-center" colSpan={5}>No activity</td></tr>)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

