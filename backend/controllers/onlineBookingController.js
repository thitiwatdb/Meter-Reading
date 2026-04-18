const settingsController = require('./settingsController');

const ONLINE_BOOKING_PACKAGES_KEY = 'ONLINE_BOOKING_PACKAGES';

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

const sanitizeNumber = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return 0;
  return Math.round(num * 100) / 100;
};

const sanitizeId = (value, idx) => {
  const base = String(value || '').trim();
  if (base) return base;
  return `PKG_${idx + 1}`;
};

const sanitizePackage = (pkg, idx) => {
  const name = String(pkg?.name || '').trim();
  const description = String(pkg?.description || '').trim();
  const image = String(pkg?.image || '').trim();
  return {
    id: sanitizeId(pkg?.id, idx),
    name,
    description,
    daily: sanitizeNumber(pkg?.daily),
    monthly: sanitizeNumber(pkg?.monthly),
    image
  };
};

const parseStoredPackages = (raw) => {
  if (!raw) return DEFAULT_PACKAGES;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_PACKAGES;
    const cleaned = parsed.map((pkg, idx) => sanitizePackage(pkg, idx));
    return cleaned.length ? cleaned : DEFAULT_PACKAGES;
  } catch (_e) {
    return DEFAULT_PACKAGES;
  }
};

exports.getPackages = async (req, res) => {
  try {
    let stored = null;
    try {
      stored = await settingsController.get(ONLINE_BOOKING_PACKAGES_KEY);
    } catch (inner) {
      if (!inner.code || !['42P01', '42501'].includes(inner.code)) {
        throw inner;
      }
    }
    const packages = parseStoredPackages(stored);
    return res.json({ packages });
  } catch (e) {
    console.error('onlineBooking.getPackages error:', e);
    return res.status(500).json({ message: 'Unable to load online booking packages' });
  }
};

exports.updatePackages = async (req, res) => {
  try {
    const data = req.body || {};
    const incoming = Array.isArray(data.packages) ? data.packages : [];
    if (!incoming.length) {
      return res.status(400).json({ message: 'At least one package is required' });
    }
    const sanitized = incoming
      .map((pkg, idx) => sanitizePackage(pkg, idx))
      .filter((pkg) => pkg.name);
    if (!sanitized.length) {
      return res.status(400).json({ message: 'All packages are invalid' });
    }
    await settingsController.setValue(
      ONLINE_BOOKING_PACKAGES_KEY,
      JSON.stringify(sanitized)
    );
    return res.json({ packages: sanitized });
  } catch (e) {
    if (e.status === 403 || e.code === 'SETTINGS_PRIVILEGE_DENIED') {
      return res.status(403).json({ message: 'Insufficient privilege to update packages' });
    }
    console.error('onlineBooking.updatePackages error:', e);
    return res.status(500).json({ message: 'Unable to update online booking packages' });
  }
};

exports.DEFAULT_PACKAGES = DEFAULT_PACKAGES;
exports.ONLINE_BOOKING_PACKAGES_KEY = ONLINE_BOOKING_PACKAGES_KEY;
