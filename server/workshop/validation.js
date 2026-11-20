export function requireValue(condition, message, status = 400) {
  if (!condition) throw Object.assign(new Error(message), { status });
}

export function str(value, label, { optional = false, limit = 1600 } = {}) {
  const clean = typeof value === 'string' ? value.trim() : '';
  requireValue((optional || clean.length > 0) && clean.length <= limit, `Проверьте поле «${label}».`);
  return clean || null;
}

export function integer(value, label, min = 1, max = 10_000_000) {
  const number = typeof value === 'number' || typeof value === 'string' && value.trim() ? Number(value) : NaN;
  requireValue(Number.isSafeInteger(number) && number >= min && number <= max, `Проверьте поле «${label}».`);
  return number;
}

export function date(value, label, optional = false, time = false) {
  const clean = str(value, label, { optional, limit: 16 });
  if (!clean) return null;
  const re = time ? /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/ : /^\d{4}-\d{2}-\d{2}$/;
  const parsed = new Date(time ? clean + ':00Z' : clean + 'T00:00:00Z');
  requireValue(re.test(clean) && Number.isFinite(+parsed) && parsed.toISOString().slice(0, clean.length) === clean,
    `Проверьте поле «${label}».`);
  return clean;
}
