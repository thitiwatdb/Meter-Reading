const DAY_MS = 24 * 60 * 60 * 1000;

function toDateOnly(value) {
  if (!value) return null;

  let parsed;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    parsed = value;
  } else if (typeof value === 'string' || typeof value === 'number') {
    parsed = new Date(value);
  } else {
    return null;
  }

  if (Number.isNaN(parsed.getTime())) return null;

  return new Date(Date.UTC(
    parsed.getUTCFullYear(),
    parsed.getUTCMonth(),
    parsed.getUTCDate()
  ));
}

function dateToISO(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }
  const date = value instanceof Date ? value : toDateOnly(value);
  if (!date) return null;
  return date.toISOString().slice(0, 10);
}

function nightsInclusive(start, end) {
  const startDate = toDateOnly(start);
  const endDate = toDateOnly(end);
  if (!startDate || !endDate) return 0;
  if (endDate < startDate) return 0;

  const diff = (endDate - startDate) / DAY_MS;
  if (diff === 0) return 1;
  return Math.ceil(diff);
}

function firstDayOfMonthUTC(value) {
  const date = toDateOnly(value);
  if (!date) return null;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function lastDayOfMonthUTC(value) {
  const date = toDateOnly(value);
  if (!date) return null;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
}

module.exports = {
  DAY_MS,
  toDateOnly,
  dateToISO,
  nightsInclusive,
  firstDayOfMonthUTC,
  lastDayOfMonthUTC
};
