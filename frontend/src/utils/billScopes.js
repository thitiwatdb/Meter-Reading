const scopeLabelMap = {
  BOOKING: 'Room',
  TENANCY: 'Tenancy',
  UTILITY: 'Utility',
  MIXED: 'Mixed',
  RENT: 'Rent'
};

const scopeBadgeMap = {
  BOOKING: 'bg-indigo-100 text-indigo-700',
  TENANCY: 'bg-slate-100 text-slate-700',
  UTILITY: 'bg-emerald-100 text-emerald-700',
  MIXED: 'bg-purple-100 text-purple-700',
  RENT: 'bg-blue-100 text-blue-700'
};

export const getScopeLabel = (scope) => {
  const key = String(scope || '').toUpperCase();
  return scopeLabelMap[key] || (key ? key[0] + key.slice(1).toLowerCase() : '-');
};

export const getScopeBadge = (scope) => {
  const key = String(scope || '').toUpperCase();
  return scopeBadgeMap[key] || 'bg-slate-100 text-slate-700';
};
