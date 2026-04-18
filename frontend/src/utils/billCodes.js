export function formatBillDisplayCode(bill) {
  if (!bill) return '';
  const raw = typeof bill?.bill_no === 'string' ? bill.bill_no.trim() : '';
  if (raw) return raw;

  const hasRent = Boolean(bill?.has_rent);
  const hasUtility = Boolean(bill?.has_utility);

  let prefix = 'BILL';
  if (hasRent && hasUtility) {
    prefix = 'MIX';
  } else if (hasRent) {
    prefix = 'ROOM';
  } else if (hasUtility) {
    prefix = 'UTIL';
  }

  const normalized = raw.replace(/[^A-Z0-9]/gi, '');
  const fallback = typeof bill?.id === 'string' ? bill.id.replace(/[^A-Z0-9]/gi, '') : '';
  const suffix = (normalized || fallback).slice(-6).toUpperCase();

  return suffix ? `${prefix}-${suffix}` : prefix;
}
