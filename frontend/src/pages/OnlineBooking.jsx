import { useEffect, useMemo, useState } from 'react';
import api from '../axios';

const DEFAULT_PACKAGES = [
  {
    id: 'STANDARD',
    name: 'Standard',
    description: 'Cozy 24 m2 room with essential amenities.',
    daily: 600,
    monthly: 8000,
    image: 'STANDARD.webp'
  },
  {
    id: 'DELUXE',
    name: 'Deluxe',
    description: 'Spacious 28 m2 room with upgraded furnishings.',
    daily: 800,
    monthly: 10000,
    image: 'DELUXE.webp'
  },
  {
    id: 'SUITE',
    name: 'Suite',
    description: 'Premium 35 m2 suite ideal for long stays.',
    daily: 1000,
    monthly: 15000,
    image: 'SUITE.webp'
  }
];

let editablePackageKeyCounter = 0;
const generateEditablePackageKey = (seed = 'pkg') =>
  `${seed}-${Date.now()}-${editablePackageKeyCounter++}`;

const resolveImageUrl = (file) => {
  const explicit = (import.meta.env.VITE_IMAGE_BASE_URL || '').replace(/\/+$/, '');
  if (explicit) return `${explicit}/${file}`;
  const defaultApi =
    import.meta.env.VITE_API_BASE_URL ||
    (import.meta.env.DEV ? 'http://localhost:5000' : '');
  const apiBase = defaultApi.replace(/\/+$/, '');
  if (apiBase) return `${apiBase}/images/${file}`;
  return `/images/${file}`;
};

const isAbsoluteImagePath = (value = '') =>
  /^https?:\/\//i.test(value) || value.startsWith('/') || value.startsWith('data:');

const packageImageUrl = (image) => {
  if (!image) return resolveImageUrl('STANDARD.webp');
  if (isAbsoluteImagePath(image)) return image;
  return resolveImageUrl(image);
};

const currency = (value) =>
  Number(value || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

const coerceNumber = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return 0;
  return Math.round(num * 100) / 100;
};

const normalizePackagesResponse = (list) => {
  if (!Array.isArray(list) || !list.length) return DEFAULT_PACKAGES;
  return list.map((pkg, idx) => ({
    id: (pkg?.id && String(pkg.id)) || `PKG_${idx + 1}`,
    name: pkg?.name || '',
    description: pkg?.description || '',
    daily: coerceNumber(pkg?.daily),
    monthly: coerceNumber(pkg?.monthly),
    image: pkg?.image || ''
  }));
};

const numberToInput = (value) =>
  value === null || value === undefined ? '' : String(value);

const toEditablePackage = (pkg = {}, idx = 0) => ({
  _key: pkg._key || generateEditablePackageKey(pkg.id || `pkg-${idx}`),
  id: pkg.id || '',
  name: pkg.name || '',
  description: pkg.description || '',
  daily: numberToInput(pkg.daily),
  monthly: numberToInput(pkg.monthly),
  image: pkg.image || ''
});

const blankEditablePackage = () => ({
  _key: generateEditablePackageKey('new'),
  id: '',
  name: '',
  description: '',
  daily: '',
  monthly: '',
  image: ''
});

const normalizeIdentifier = (value, fallback) => {
  const trimmed = String(value || '').trim();
  const base = trimmed || fallback;
  return base.replace(/\s+/g, '_').toUpperCase();
};

const computeMonthRange = (value) => {
  if (!value) return { start: '', end: '' };
  const [yearStr, monthStr] = value.split('-') || [];
  const year = Number(yearStr);
  const month = Number(monthStr);
  if (!year || !month) return { start: '', end: '' };
  const padded = String(month).padStart(2, '0');
  const lastDay = new Date(year, month, 0).getDate();
  return {
    start: `${yearStr}-${padded}-01`,
    end: `${yearStr}-${padded}-${String(lastDay).padStart(2, '0')}`
  };
};

export default function OnlineBooking() {
  const role = (localStorage.getItem('role') || '').toUpperCase();
  const isTenant = role === 'TENANT';
  const isAdmin = role === 'ADMIN';

  const [packages, setPackages] = useState(DEFAULT_PACKAGES);
  const [packagesLoading, setPackagesLoading] = useState(true);
  const [packagesError, setPackagesError] = useState('');

  const [form, setForm] = useState({
    sell_type: 'DAILY',
    room_type: '',
    start_date: '',
    end_date: '',
    note: ''
  });
  const [monthlyMonth, setMonthlyMonth] = useState('');
  const [bookingMessage, setBookingMessage] = useState('');
  const [bookingError, setBookingError] = useState('');
  const highlightMonthly = form.sell_type === 'MONTHLY';

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingPackages, setEditingPackages] = useState([]);
  const [editorError, setEditorError] = useState('');
  const [editorSaving, setEditorSaving] = useState(false);

  const loadPackages = async () => {
    setPackagesLoading(true);
    try {
      const res = await api.get('/online-booking/packages');
      setPackages(normalizePackagesResponse(res.data?.packages));
      setPackagesError('');
    } catch (e) {
      console.error('online booking packages load failed', e);
      setPackages(DEFAULT_PACKAGES);
      setPackagesError('Unable to load latest packages. Showing defaults.');
    } finally {
      setPackagesLoading(false);
    }
  };

  useEffect(() => {
    loadPackages();
  }, []);

  if (!isTenant && !isAdmin) {
    return (
      <div className="p-4 max-w-3xl mx-auto space-y-3">
        <h2 className="text-xl font-semibold">Online Booking</h2>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Online booking is only available to tenants. Staff should use the Booking page instead.
        </div>
      </div>
    );
  }

  const displayPackages = useMemo(
    () =>
      (packages || []).map((pkg) => ({
        ...pkg,
        daily: coerceNumber(pkg.daily),
        monthly: coerceNumber(pkg.monthly),
        imageUrl: packageImageUrl(pkg.image)
      })),
    [packages]
  );

  const openEditor = () => {
    setEditingPackages(
      (packages.length ? packages : DEFAULT_PACKAGES).map((pkg, idx) =>
        toEditablePackage(pkg, idx)
      )
    );
    setEditorError('');
    setEditorOpen(true);
  };

  const closeEditor = () => {
    if (editorSaving) return;
    setEditorOpen(false);
  };

  const updateEditingPackage = (idx, field, value) => {
    setEditingPackages((prev) =>
      prev.map((pkg, index) => (index === idx ? { ...pkg, [field]: value } : pkg))
    );
  };

  const addEditingPackage = () => {
    setEditingPackages((prev) => [...prev, blankEditablePackage()]);
  };

  const removeEditingPackage = (idx) => {
    setEditingPackages((prev) => prev.filter((_, index) => index !== idx));
  };

  const saveEditingPackages = async () => {
    if (!editingPackages.length) {
      setEditorError('Please add at least one package.');
      return;
    }
    setEditorSaving(true);
    setEditorError('');
    try {
      const payload = editingPackages
        .map((pkg, idx) => {
          const name = String(pkg.name || '').trim();
          if (!name) return null;
          return {
            id: normalizeIdentifier(pkg.id, `PKG_${idx + 1}`),
            name,
            description: String(pkg.description || '').trim(),
            daily: coerceNumber(pkg.daily),
            monthly: coerceNumber(pkg.monthly),
            image: String(pkg.image || '').trim()
          };
        })
        .filter(Boolean);
      if (!payload.length) {
        setEditorError('Please provide at least one package with a name.');
        setEditorSaving(false);
        return;
      }
      const res = await api.put('/online-booking/packages', { packages: payload });
      setPackages(normalizePackagesResponse(res.data?.packages));
      setEditorOpen(false);
    } catch (e) {
      setEditorError(e.response?.data?.message || 'Unable to save packages.');
    } finally {
      setEditorSaving(false);
    }
  };

  const handleSellTypeChange = (value) => {
    const normalized = value === 'MONTHLY' ? 'MONTHLY' : 'DAILY';
    setForm((prev) => {
      const next = {
        ...prev,
        sell_type: normalized,
        start_date: normalized === 'MONTHLY' ? prev.start_date : '',
        end_date: normalized === 'MONTHLY' ? prev.end_date : ''
      };
      if (normalized === 'MONTHLY') {
        const base = (monthlyMonth || prev.start_date || new Date().toISOString().slice(0, 10)).slice(0, 7);
        setMonthlyMonth(base);
        const range = computeMonthRange(base);
        next.start_date = range.start;
        next.end_date = range.end;
      } else {
        setMonthlyMonth('');
        next.start_date = '';
        next.end_date = '';
      }
      return next;
    });
  };

  const handleRoomTypeChange = (value) => {
    setForm((prev) => ({ ...prev, room_type: value }));
  };

  const submit = async () => {
    if (!isTenant) {
      setBookingError('Only tenants can submit booking requests.');
      return;
    }
    let payload = { ...form };
    if (form.sell_type === 'MONTHLY') {
      if (!monthlyMonth) {
        setBookingError('Please choose the month you want to stay.');
        return;
      }
      const range = computeMonthRange(monthlyMonth);
      if (!range.start || !range.end) {
        setBookingError('Invalid month selection.');
        return;
      }
      payload = { ...payload, start_date: range.start, end_date: range.end };
    } else {
      if (!form.start_date || !form.end_date) {
        setBookingError('Please provide your check-in and check-out dates.');
        return;
      }
      if (new Date(form.start_date) >= new Date(form.end_date)) {
        setBookingError('Check-out date must be after check-in.');
        return;
      }
    }
    try {
      setBookingError('');
      await api.post('/bookings/online', payload);
      setBookingMessage('Booking request submitted. A staff member will allocate a room and confirm.');
      setForm((prev) => ({
        ...prev,
        note: '',
        start_date: '',
        end_date: '',
        sell_type: prev.sell_type
      }));
      setMonthlyMonth('');
    } catch (e) {
      setBookingMessage('');
      setBookingError(e.response?.data?.message || 'Unable to submit booking request.');
    }
  };

  return (
    <div className="p-4 max-w-5xl mx-auto space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Online Booking</h2>
          <p className="text-sm text-slate-500">Choose a preferred package and submit your stay request.</p>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={openEditor}
            className="self-start rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:border-indigo-400 hover:text-indigo-600"
          >
            Edit packages
          </button>
        )}
      </div>

      {packagesError && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-700">
          {packagesError}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {packagesLoading ? (
          <div className="sm:col-span-2 lg:col-span-3 rounded-2xl border border-dashed border-slate-300 p-6 text-center text-slate-500">
            Loading packages...
          </div>
        ) : displayPackages.length ? (
          displayPackages.map((room) => {
            const isActive = form.room_type === room.id;
            const dailyCardClass = highlightMonthly
              ? 'border border-slate-200 bg-white text-slate-700'
              : 'border border-indigo-200 bg-indigo-50 text-indigo-700';
            const monthlyCardClass = highlightMonthly
              ? 'border border-indigo-200 bg-indigo-50 text-indigo-700'
              : 'border border-slate-200 bg-white text-slate-700';
            return (
              <button
                key={room.id}
                type="button"
                onClick={() => handleRoomTypeChange(isActive ? '' : room.id)}
                className={`group text-left rounded-2xl border p-4 transition-all ${
                  isActive
                    ? 'border-indigo-500 shadow-lg ring-1 ring-indigo-200'
                    : 'border-slate-200 shadow-sm hover:border-indigo-300 hover:shadow-md'
                }`}
              >
                <div className="relative overflow-hidden rounded-xl">
                  <img
                    src={room.imageUrl}
                    alt={`${room.name} room`}
                    className="h-36 w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                  />
                </div>
                <div className="mt-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-slate-900">{room.name}</h3>
                    {isActive && (
                      <span className="text-xs font-semibold uppercase text-indigo-600">Selected</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">{room.description}</p>
                  <div className="flex flex-col gap-2 pt-1 text-sm">
                    <div className={`rounded-lg px-3 py-2 ${dailyCardClass}`}>
                      <div className="text-xs uppercase tracking-wide">Daily stay</div>
                      <div className="text-lg font-semibold">THB {currency(room.daily)}</div>
                    </div>
                    <div className={`rounded-lg px-3 py-2 ${monthlyCardClass}`}>
                      <div className="text-xs uppercase tracking-wide">Monthly stay</div>
                      <div className="text-lg font-semibold">THB {currency(room.monthly)}</div>
                    </div>
                  </div>
                </div>
              </button>
            );
          })
        ) : (
          <div className="sm:col-span-2 lg:col-span-3 rounded-2xl border border-dashed border-slate-300 p-6 text-center text-slate-500">
            No packages defined yet.
          </div>
        )}
      </div>

      {!isTenant && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          Booking requests can only be submitted by tenant accounts.
        </div>
      )}

      {isTenant && (
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-sm text-slate-600">Sell type</label>
            <select
              className="border rounded-lg px-3 py-2"
              value={form.sell_type}
              onChange={(e) => handleSellTypeChange(e.target.value)}
            >
              <option value="DAILY">Daily</option>
              <option value="MONTHLY">Monthly</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-slate-600">Preferred room type (optional)</label>
            <select
              className="border rounded-lg px-3 py-2"
              value={form.room_type}
              onChange={(e) => handleRoomTypeChange(e.target.value)}
            >
              <option value="">No preference</option>
              {displayPackages.map((pkg) => (
                <option key={pkg.id} value={pkg.id}>
                  {pkg.name}
                </option>
              ))}
            </select>
          </div>
          {form.sell_type === 'MONTHLY' ? (
            <div>
              <label className="block text-sm text-slate-600">Stay month</label>
              <input
                type="month"
                className="border rounded-lg px-3 py-2"
                value={monthlyMonth}
                onChange={(e) => {
                  const value = e.target.value;
                  setMonthlyMonth(value);
                  const range = computeMonthRange(value);
                  if (range.start && range.end) {
                    setForm((prev) => ({ ...prev, start_date: range.start, end_date: range.end }));
                  }
                }}
              />
            </div>
          ) : (
            <>
              <div>
                <label className="block text-sm text-slate-600">Check-in date</label>
                <input
                  type="date"
                  className="border rounded-lg px-3 py-2"
                  value={form.start_date}
                  onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-sm text-slate-600">Check-out date</label>
                <input
                  type="date"
                  className="border rounded-lg px-3 py-2"
                  value={form.end_date}
                  onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
                />
              </div>
            </>
          )}
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm text-slate-600">Additional note</label>
            <input
              className="border rounded-lg px-3 py-2 w-full"
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              placeholder="Anything we should know?"
            />
          </div>
          <button
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700"
            onClick={submit}
          >
            Submit request
          </button>
        </div>
      )}

      {bookingError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
          {bookingError}
        </div>
      )}
      {bookingMessage && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
          {bookingMessage}
        </div>
      )}

      {isAdmin && editorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 py-6">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b px-5 py-4">
              <h3 className="text-lg font-semibold text-slate-900">Edit online booking packages</h3>
              <button
                type="button"
                onClick={closeEditor}
                className="text-sm text-slate-500 hover:text-slate-700"
                disabled={editorSaving}
              >
                Close
              </button>
            </div>
            <div className="max-h-[65vh] overflow-y-auto px-5 py-4 space-y-4">
              {editingPackages.map((pkg, idx) => (
                <div
                  key={pkg._key || `pkg-${idx}`}
                  className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4"
                >
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600">Display name</label>
                      <input
                        className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                        value={pkg.name}
                        onChange={(e) => updateEditingPackage(idx, 'name', e.target.value)}
                        placeholder="Standard"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600">Reference code (matches room type)</label>
                      <input
                        className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-xs uppercase tracking-wide"
                        value={pkg.id}
                        onChange={(e) => updateEditingPackage(idx, 'id', e.target.value)}
                        placeholder="STANDARD"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600">Description</label>
                    <textarea
                      rows={2}
                      className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                      value={pkg.description}
                      onChange={(e) => updateEditingPackage(idx, 'description', e.target.value)}
                      placeholder="Short highlight shown to tenants"
                    />
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600">Daily rate (THB)</label>
                      <input
                        type="number"
                        min="0"
                        className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                        value={pkg.daily}
                        onChange={(e) => updateEditingPackage(idx, 'daily', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600">Monthly rate (THB)</label>
                      <input
                        type="number"
                        min="0"
                        className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                        value={pkg.monthly}
                        onChange={(e) => updateEditingPackage(idx, 'monthly', e.target.value)}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600">Image file name or URL</label>
                    <input
                      className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-xs"
                      value={pkg.image}
                      onChange={(e) => updateEditingPackage(idx, 'image', e.target.value)}
                      placeholder="STANDARD.webp or https://..."
                    />
                    <p className="mt-1 text-xs text-slate-500">Use a file from /images or paste a full image URL.</p>
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      className="text-xs text-rose-600 hover:text-rose-800"
                      onClick={() => removeEditingPackage(idx)}
                      disabled={editingPackages.length === 1 || editorSaving}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
              <button
                type="button"
                className="w-full rounded-xl border border-dashed border-slate-300 px-4 py-3 text-sm font-semibold text-slate-600 hover:border-indigo-400 hover:text-indigo-600"
                onClick={addEditingPackage}
                disabled={editorSaving}
              >
                + Add package
              </button>
            </div>
            {editorError && (
              <div className="px-5 text-sm text-rose-600">{editorError}</div>
            )}
            <div className="flex justify-end gap-2 border-t px-5 py-4">
              <button
                type="button"
                className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-700"
                onClick={closeEditor}
                disabled={editorSaving}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded border border-indigo-600 bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-700 disabled:opacity-70"
                onClick={saveEditingPackages}
                disabled={editorSaving}
              >
                {editorSaving ? 'Saving...' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

