import { useEffect, useState } from 'react';
import api from '../axios';

export default function Settings() {
  const [values, setValues] = useState({
    WATER_RATE: '',
    ELECTRIC_RATE: '',
    BANK_ACCOUNT_NAME: '',
    BANK_ACCOUNT_NUMBER: '',
    PROMPTPAY_ID: ''
  });
  const [loading, setLoading] = useState(true);

  const toFixed2 = (n) => {
    const x = Number.isFinite(+n) ? Number(n) : 0;
    return x.toFixed(2);
  };
  const normalizeText = (value) => (value === null || value === undefined ? '' : String(value));

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/settings');
      setValues({
        WATER_RATE: toFixed2(res.data.WATER_RATE ?? 0),
        ELECTRIC_RATE: toFixed2(res.data.ELECTRIC_RATE ?? 0),
        BANK_ACCOUNT_NAME: normalizeText(res.data.BANK_ACCOUNT_NAME),
        BANK_ACCOUNT_NUMBER: normalizeText(res.data.BANK_ACCOUNT_NUMBER),
        PROMPTPAY_ID: normalizeText(res.data.PROMPTPAY_ID),
      });
    } finally {
      setLoading(false);
    }
  };
  useEffect(()=>{ load(); }, []);

  const setWater = (val) => setValues(v => ({ ...v, WATER_RATE: toFixed2(val) }));
  const setElectric = (val) => setValues(v => ({ ...v, ELECTRIC_RATE: toFixed2(val) }));
  const setBankName = (val) => setValues(v => ({ ...v, BANK_ACCOUNT_NAME: val }));
  const setBankNumber = (val) => setValues(v => ({ ...v, BANK_ACCOUNT_NUMBER: val }));
  const setPromptPay = (val) => setValues(v => ({ ...v, PROMPTPAY_ID: val }));

  const save = async () => {
    const payload = {
      ...values,
      BANK_ACCOUNT_NAME: values.BANK_ACCOUNT_NAME.trim(),
      BANK_ACCOUNT_NUMBER: values.BANK_ACCOUNT_NUMBER.trim(),
      PROMPTPAY_ID: values.PROMPTPAY_ID.trim()
    };
    await api.post('/settings', payload);
    await load();
  };

  if (loading) return <div className="p-4">Loading…</div>;

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-lg font-semibold">Utility Rate Settings</h2>
      <div className="border rounded p-3 space-y-5 max-w-[640px]">
        <div>
          <div className="flex items-baseline justify-between">
            <label className="block text-sm font-medium">Water rate (per unit)</label>
            <div className="text-xs text-gray-600">Current: <span className="font-semibold">{values.WATER_RATE}</span> per unit</div>
          </div>
          <div className="mt-2 grid grid-cols-5 gap-2">
            <input
              type="number"
              step="0.10"
              min="0"
              className="border px-2 py-1 col-span-2"
              value={values.WATER_RATE}
              onChange={(e)=> setWater(e.target.value)}
            />
            <div className="col-span-3 flex items-center gap-2">
              <input
                type="range"
                min="0"
                max="100"
                step="0.5"
                className="w-full"
                value={Number(values.WATER_RATE)}
                onChange={(e)=> setWater(e.target.value)}
              />
              <span className="text-sm text-gray-700 w-16 text-right">{values.WATER_RATE}</span>
            </div>
          </div>
        </div>

        <div>
          <div className="flex items-baseline justify-between">
            <label className="block text-sm font-medium">Electricity rate (per unit)</label>
            <div className="text-xs text-gray-600">Current: <span className="font-semibold">{values.ELECTRIC_RATE}</span> per unit</div>
          </div>
          <div className="mt-2 grid grid-cols-5 gap-2">
            <input
              type="number"
              step="0.10"
              min="0"
              className="border px-2 py-1 col-span-2"
              value={values.ELECTRIC_RATE}
              onChange={(e)=> setElectric(e.target.value)}
            />
            <div className="col-span-3 flex items-center gap-2">
              <input
                type="range"
                min="0"
                max="100"
                step="0.5"
                className="w-full"
                value={Number(values.ELECTRIC_RATE)}
                onChange={(e)=> setElectric(e.target.value)}
              />
              <span className="text-sm text-gray-700 w-16 text-right">{values.ELECTRIC_RATE}</span>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-200 pt-4">
          <h3 className="text-sm font-semibold text-gray-800">Transfer & PromptPay details</h3>
          <div className="mt-3 space-y-3">
            <div>
              <label className="block text-sm text-gray-700">Bank account name</label>
              <input
                className="mt-1 w-full border px-2 py-1 rounded"
                value={values.BANK_ACCOUNT_NAME}
                onChange={(e) => setBankName(e.target.value)}
                placeholder=""
              />
            </div>
            <div>
              <label className="block text-sm text-gray-700">Bank account number</label>
              <input
                className="mt-1 w-full border px-2 py-1 rounded"
                value={values.BANK_ACCOUNT_NUMBER}
                onChange={(e) => setBankNumber(e.target.value)}
                placeholder=""
              />
            </div>
            <div>
              <label className="block text-sm text-gray-700">PromptPay ID</label>
              <input
                className="mt-1 w-full border px-2 py-1 rounded"
                value={values.PROMPTPAY_ID}
                onChange={(e) => setPromptPay(e.target.value)}
                placeholder=""
              />              
            </div>
          </div>
        </div>

        <div className="flex gap-2 justify-end">
          <button className="border px-3 py-1" onClick={load}>Reset</button>
          <button
            className="px-3 py-1 rounded border border-indigo-600 bg-indigo-600 text-white shadow hover:bg-indigo-700"
            onClick={save}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

