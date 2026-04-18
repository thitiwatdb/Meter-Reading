const { randomBytes } = require('crypto');

function randomDigits(length = 6) {
  if (length <= 0) return '';
  let digits = '';
  while (digits.length < length) {
    const chunk = randomBytes(4).readUInt32BE().toString();
    digits += chunk.replace(/\D/g, '');
  }
  return digits.slice(0, length);
}

function normalizeScope(scope) {
  return typeof scope === 'string' && scope.trim()
    ? scope.trim().toUpperCase()
    : '';
}

function resolveScope(baseScope, { hasRent, hasUtility }) {
  const normalized = normalizeScope(baseScope);
  if (normalized === 'BOOKING') return 'BOOKING';
  if (hasRent && hasUtility) return normalized && normalized !== 'UTILITY' ? normalized : 'MIXED';
  if (!hasRent && hasUtility) return 'UTILITY';
  if (normalized) return normalized;
  return 'TENANCY';
}

function fallbackSuffix(reference, length) {
  const refDigits = typeof reference === 'string' ? reference.replace(/\D/g, '') : '';
  const suffix = `${refDigits}${randomDigits(length)}`;
  return suffix.slice(-length);
}

function buildBillNo(scope, { hasRent, hasUtility, reference }) {
  switch (scope) {
    case 'BOOKING':
      return `ROOM-${fallbackSuffix(reference, 6)}-${randomDigits(6)}`;
    case 'MIXED':
      return `MIX-${fallbackSuffix(reference, 6)}`;
    case 'UTILITY':
      return `UTIL-${fallbackSuffix(reference, 6)}`;
    case 'TENANCY':
      if (hasRent && hasUtility) {
        return `TEN-${fallbackSuffix(reference, 6)}`;
      }
      if (hasRent) {
        return `ROOM-${fallbackSuffix(reference, 6)}-${randomDigits(4)}`;
      }
      return `UTIL-${fallbackSuffix(reference, 6)}`;
    default:
      return `BILL-${fallbackSuffix(reference, 6)}`;
  }
}

function generateBillIdentity({
  baseScope = 'TENANCY',
  hasRent = false,
  hasUtility = false,
  reference = ''
} = {}) {
  const scope = resolveScope(baseScope, { hasRent, hasUtility });
  const bill_no = buildBillNo(scope, { hasRent, hasUtility, reference });
  return { bill_no, bill_scope: scope };
}

module.exports = {
  generateBillIdentity
};
