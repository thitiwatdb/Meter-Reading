import { useEffect, useMemo, useState } from 'react';
import { Image } from 'antd';
import api from '../axios';
import { fileToBase64, uploadBase64 } from '../utils/uploadBase64';

const imageExtPattern = /\.(png|jpe?g|gif|bmp|webp|svg|heic|heif)$/i;

const resolvePhotoUrl = (path) => {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  const apiBase = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').replace(/\/+$/, '');
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return apiBase ? `${apiBase}${normalized}` : normalized;
};

const isImageLike = (path = '') => {
  if (!path) return false;
  const normalized = path.split('?')[0] || '';
  return imageExtPattern.test(normalized);
};

export default function Maintenance() {
  const [items, setItems] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [form, setForm] = useState({ room_id: '', title: '', description: '' });
  const [file, setFile] = useState(null);
  const [role, setRole] = useState('');
  const [selectedBuilding, setSelectedBuilding] = useState('');
  const [openBuilding, setOpenBuilding] = useState('all');
  const [openRoom, setOpenRoom] = useState('all');
  const [openStatus, setOpenStatus] = useState('all');
  const [historyBuilding, setHistoryBuilding] = useState('all');
  const [historyRoom, setHistoryRoom] = useState('all');
  const [historyStatus, setHistoryStatus] = useState('all');
  const [statusModal, setStatusModal] = useState(null);
  const [statusReason, setStatusReason] = useState('');

  const roleUpper = String(role || '').toUpperCase();
  const canManage = ['ADMIN', 'MANAGER'].includes(roleUpper);
  const inputClasses = "px-3 py-2 rounded-xl border border-slate-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white/80";

  const load = async (currentRole) => {
    const roleUpper = String(currentRole || '').toUpperCase();
    const maintenancePromise = api.get('/maintenance');
    let roomsPromise;
    if (['ADMIN', 'MANAGER'].includes(roleUpper)) {
      roomsPromise = api.get('/rooms');
    } else if (roleUpper === 'TENANT') {
      roomsPromise = api.get('/tenancies/mine/rooms');
    } else {
      roomsPromise = Promise.resolve({ data: [] });
    }
    const [m, r] = await Promise.all([maintenancePromise, roomsPromise]);
    const maintenanceItems = m.data || [];
    setItems(maintenanceItems);
    if (typeof window !== 'undefined') {
      const openCount = maintenanceItems.filter((it) => !['COMPLETED', 'CANCELLED'].includes(String(it.status || '').toUpperCase())).length;
      window.dispatchEvent(
        new CustomEvent('maintenance:changed', {
          detail: { open: openCount, scope: canManage ? 'staff' : 'tenant' }
        })
      );
    }
    const normalizedRooms = Array.isArray(r.data)
      ? r.data.map((room) => ({
          id: room.id ?? room.room_id,
          room_no: room.room_no,
          building_code: room.building_code,
          tenancy_status: room.tenancy_status ?? room.status ?? null
        }))
      : [];
    setRooms(normalizedRooms);
  };

  useEffect(() => {
    const storedRole = localStorage.getItem('role') || '';
    setRole(storedRole);
  }, []);

  useEffect(() => {
    if (!role) return;
    load(role).catch(()=>{});
  }, [role]);

  const buildingOptions = useMemo(() => {
    const set = new Set();
    rooms.forEach((room) => {
      if (room.building_code) {
        set.add(room.building_code);
      }
    });
    return Array.from(set).sort();
  }, [rooms]);

  const roomOptionsFor = (buildingCode) => {
    if (!buildingCode || buildingCode === 'all') return rooms;
    return rooms.filter((room) => room.building_code === buildingCode);
  };

  const openItems = useMemo(
    () => items.filter((it) => !['COMPLETED', 'CANCELLED'].includes(it.status)),
    [items]
  );

  const historyItems = useMemo(
    () => items.filter((it) => ['COMPLETED', 'CANCELLED'].includes(it.status)),
    [items]
  );

  const openStatusOptions = useMemo(() => {
    const set = new Set();
    openItems.forEach((it) => set.add(it.status));
    return Array.from(set).sort();
  }, [openItems]);

  const historyStatusOptions = useMemo(() => {
    const set = new Set();
    historyItems.forEach((it) => set.add(it.status));
    return Array.from(set).sort();
  }, [historyItems]);

  const filteredOpen = useMemo(() => openItems.filter((it) => {
    if (openBuilding !== 'all' && it.building_code !== openBuilding) return false;
    if (openRoom !== 'all' && String(it.room_id) !== openRoom) return false;
    if (openStatus !== 'all' && it.status !== openStatus) return false;
    return true;
  }), [openItems, openBuilding, openRoom, openStatus]);

  const filteredHistory = useMemo(() => historyItems.filter((it) => {
    if (historyBuilding !== 'all' && it.building_code !== historyBuilding) return false;
    if (historyRoom !== 'all' && String(it.room_id) !== historyRoom) return false;
    if (historyStatus !== 'all' && it.status !== historyStatus) return false;
    return true;
  }), [historyItems, historyBuilding, historyRoom, historyStatus]);

  const availableRooms = useMemo(() => roomOptionsFor(selectedBuilding), [selectedBuilding, rooms]);
  const openRoomOptions = useMemo(() => roomOptionsFor(openBuilding), [openBuilding, rooms]);
  const historyRoomOptions = useMemo(() => roomOptionsFor(historyBuilding), [historyBuilding, rooms]);

  const create = async () => {
    let photo_path = null;
    if (file) {
      const b64 = await fileToBase64(file);
      const up = await uploadBase64(b64, file.name);
      photo_path = up.path;
    }
    await api.post('/maintenance', { ...form, photo_path });
    setForm({ room_id: '', title: '', description: '' });
    setFile(null);
    await load(role);
  };

  const changeStatus = async (id, status, reasonText = '') => {
    if (!canManage) return;
    try {
      await api.post(`/maintenance/${id}/status`, { status, reason: reasonText || undefined });
      await load(role);
    } catch (e) {
      alert(e.response?.data?.message || 'Update failed');
    }
  };

  return (
    <>
    <div className="p-2 md:p-4 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-500 text-white shadow-lg">
            🛠️
          </span>
          Maintenance
        </h2>
        <p className="text-sm text-slate-500">
          Submit issues and track progress in real-time.
        </p>
      </div>
      <div className="flex gap-3 items-end flex-wrap bg-white/60 border border-white/70 rounded-2xl p-4 shadow-inner">
        <div>
          <label className="block text-sm">Building</label>
          <select
            className={inputClasses}
            value={selectedBuilding}
            onChange={(e) => {
              const value = e.target.value;
              setSelectedBuilding(value);
              setForm((f) => ({ ...f, room_id: '' }));
            }}
          >
            <option value="">All</option>
            {buildingOptions.map((code) => (
              <option key={code} value={code}>{code}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm">Room</label>
          <select
            className={inputClasses}
            value={form.room_id}
            onChange={(e)=>setForm(f=>({...f, room_id: e.target.value}))}
          >
            <option value="">Select room</option>
            {availableRooms.map(r => (
              <option key={r.id} value={r.id}>
                {r.building_code ? `${r.building_code}-${r.room_no}` : r.room_no}
              </option>
            ))}
          </select>
          {role === 'TENANT' && rooms.length === 0 && (
            <p className="text-xs text-gray-500 mt-1">No active rooms available. Maintenance requests are limited to rooms you are currently checked-in.</p>
          )}
        </div>
        <div>
          <label className="block text-sm">Title</label>
          <input className={inputClasses} value={form.title} onChange={(e)=>setForm(f=>({...f, title: e.target.value}))} />
        </div>
        <div>
          <label className="block text-sm">Description</label>
          <input className={`${inputClasses} w-64`} value={form.description} onChange={(e)=>setForm(f=>({...f, description: e.target.value}))} />
        </div>
        <div>
          <label className="block text-sm">Photo</label>
          <input className="text-sm text-slate-600" type="file" onChange={(e)=> setFile(e.target.files?.[0] || null)} />
        </div>
        <button className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow hover:shadow-lg" onClick={create}>Create</button>
      </div>

      <div className="space-y-4">
        <div className="rounded-2xl border border-white/70 bg-white/70 shadow-lg p-3 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-lg font-semibold text-slate-800">Active Requests</h3>
          </div>
          <div className="flex flex-wrap gap-2 items-end">
            <div>
              <label className="block text-sm">Building</label>
              <select
                className="border px-2 py-1 rounded-lg"
                value={openBuilding}
                onChange={(e) => { setOpenBuilding(e.target.value); setOpenRoom('all'); }}
              >
                <option value="all">All</option>
                {buildingOptions.map((code) => (
                  <option key={code} value={code}>{code}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm">Room</label>
              <select
                className="border px-2 py-1 rounded-lg"
                value={openRoom}
                onChange={(e) => setOpenRoom(e.target.value)}
              >
                <option value="all">All</option>
                {openRoomOptions.map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.building_code ? `${room.building_code}-${room.room_no}` : room.room_no}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm">Status</label>
              <select
                className="border px-2 py-1 rounded-lg"
                value={openStatus}
                onChange={(e) => setOpenStatus(e.target.value)}
              >
                <option value="all">All</option>
                {openStatusOptions.map((st) => (
                  <option key={st} value={st}>{st}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-100">
            <table className="min-w-[900px] w-full">
              <thead className="bg-gradient-to-r from-indigo-500/90 to-purple-500/90 text-left text-white">
                <tr>
                  <th className="p-2 border-b">Room</th>
                  <th className="p-2 border-b">Title</th>
                  <th className="p-2 border-b">Status</th>
                  <th className="p-2 border-b">Photo</th>
                  {canManage && <th className="p-2 border-b">Action</th>}
                </tr>
              </thead>
              <tbody>
                {filteredOpen.map((it) => (
                  <tr key={it.id} className="odd:bg-white/80 even:bg-white/60 backdrop-blur">
                    <td className="p-2 border-b">{it.building_code}-{it.room_no}</td>
                    <td className="p-2 border-b">{it.title}</td>
                    <td className="p-2 border-b">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                        it.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-700' :
                        it.status === 'IN_PROGRESS' ? 'bg-amber-100 text-amber-700' :
                        it.status === 'CANCELLED' ? 'bg-rose-100 text-rose-700' :
                        'bg-sky-100 text-sky-700'
                      }`}>
                        {it.status}
                      </span>
                    </td>
                    <td className="p-2 border-b">
                      {it.photo_path ? (
                        isImageLike(it.photo_path) ? (
                          <Image
                            width={64}
                            height={64}
                            src={resolvePhotoUrl(it.photo_path)}
                            alt={it.title || 'Maintenance photo'}
                            style={{ borderRadius: 10, objectFit: 'cover' }}
                            className="border border-slate-200 bg-white shadow-sm"
                            preview={{ src: resolvePhotoUrl(it.photo_path) }}
                          />
                        ) : (
                          <a
                            className="text-blue-600 underline"
                            href={resolvePhotoUrl(it.photo_path)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Download
                          </a>
                        )
                      ) : (
                        '-'
                      )}
                    </td>
                    {canManage && (
                      <td className="p-2 border-b space-x-2">
                        <button className="px-2 py-1 border rounded hover:bg-gray-50" onClick={()=>changeStatus(it.id,'IN_PROGRESS')}>In-Progress</button>
                        <button className="px-2 py-1 border rounded hover:bg-gray-50" onClick={()=>changeStatus(it.id,'COMPLETED')}>Completed</button>
                        <button
                          className="px-2 py-1 border rounded hover:bg-gray-50"
                          onClick={() => {
                            setStatusModal({ id: it.id, status: 'CANCELLED', title: it.title });
                            setStatusReason('');
                          }}
                        >
                          Cancel
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
                {filteredOpen.length === 0 && (
                  <tr><td className="p-3 text-center text-gray-500" colSpan={canManage ? 5 : 4}>No active maintenance requests</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl border border-white/70 bg-white/70 shadow-lg p-3 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-lg font-semibold text-slate-800">History</h3>
          </div>
          <div className="flex flex-wrap gap-2 items-end">
            <div>
              <label className="block text-sm">Building</label>
              <select
                className="border px-2 py-1 rounded-lg"
                value={historyBuilding}
                onChange={(e) => { setHistoryBuilding(e.target.value); setHistoryRoom('all'); }}
              >
                <option value="all">All</option>
                {buildingOptions.map((code) => (
                  <option key={code} value={code}>{code}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm">Room</label>
              <select
                className="border px-2 py-1 rounded-lg"
                value={historyRoom}
                onChange={(e) => setHistoryRoom(e.target.value)}
              >
                <option value="all">All</option>
                {historyRoomOptions.map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.building_code ? `${room.building_code}-${room.room_no}` : room.room_no}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm">Status</label>
              <select
                className="border px-2 py-1 rounded-lg"
                value={historyStatus}
                onChange={(e) => setHistoryStatus(e.target.value)}
              >
                <option value="all">All</option>
                {historyStatusOptions.map((st) => (
                  <option key={st} value={st}>{st}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-100">
            <table className="min-w-[900px] w-full">
              <thead className="bg-slate-100 text-left text-slate-700">
                <tr>
                  <th className="p-2 border-b">Room</th>
                  <th className="p-2 border-b">Title</th>
                  <th className="p-2 border-b">Status</th>
                  <th className="p-2 border-b">Reason</th>
                  <th className="p-2 border-b">Photo</th>
                </tr>
              </thead>
              <tbody>
                {filteredHistory.map((it) => (
                  <tr key={it.id} className="odd:bg-white even:bg-slate-50">
                    <td className="p-2 border-b">{it.building_code}-{it.room_no}</td>
                    <td className="p-2 border-b">{it.title}</td>
                    <td className="p-2 border-b">{it.status}</td>
                    <td className="p-2 border-b text-xs text-slate-600">{it.cancel_reason || '-'}</td>
                    <td className="p-2 border-b">
                      {it.photo_path ? (
                        isImageLike(it.photo_path) ? (
                          <Image
                            width={72}
                            height={72}
                            src={resolvePhotoUrl(it.photo_path)}
                            alt={it.title || 'Maintenance photo'}
                            style={{ borderRadius: 12, objectFit: 'cover' }}
                            className="border border-slate-200 bg-white shadow-sm"
                            preview={{ src: resolvePhotoUrl(it.photo_path) }}
                          />
                        ) : (
                          <a
                            className="text-blue-600 underline"
                            href={resolvePhotoUrl(it.photo_path)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Download
                          </a>
                        )
                      ) : (
                        '-'
                      )}
                    </td>
                  </tr>
                ))}
                {filteredHistory.length === 0 && (
                  <tr><td className="p-3 text-center text-gray-500" colSpan={5}>No history entries</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    {statusModal && (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl shadow-xl w-[360px] p-5 space-y-3">
          <h3 className="text-lg font-semibold text-slate-900">
            Cancel maintenance request
          </h3>
          <p className="text-sm text-slate-600">
            Please provide a cancellation reason ({statusModal.title || '-'})
          </p>
          <textarea
            className="w-full border rounded-lg px-3 py-2 text-sm"
            rows={3}
            value={statusReason}
            onChange={(e) => setStatusReason(e.target.value)}
            placeholder="Reason"
          />
          <div className="flex justify-end gap-2">
            <button
              className="px-3 py-1.5 rounded border border-slate-300 text-slate-600 hover:bg-slate-100"
              onClick={() => {
                setStatusModal(null);
                setStatusReason('');
              }}
            >
              Back
            </button>
            <button
              className={`px-3 py-1.5 rounded bg-rose-600 text-white ${statusReason.trim() ? 'hover:bg-rose-700' : 'opacity-60 cursor-not-allowed'}`}
              disabled={!statusReason.trim()}
              onClick={async () => {
                await changeStatus(statusModal.id, statusModal.status, statusReason.trim());
                setStatusModal(null);
                setStatusReason('');
              }}
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
