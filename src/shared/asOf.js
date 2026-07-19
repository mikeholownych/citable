/** Strict, reproducible date parsing for temporal commands. */
export function parseAsOf(args, fallback = new Date()) {
  const i = args.indexOf('--as-of');
  if (i < 0) return fallback;
  const value = args[i + 1];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) {
    throw new Error(`--as-of must be a valid YYYY-MM-DD date, got: ${value ?? ''}`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error(`--as-of must be a valid YYYY-MM-DD date, got: ${value}`);
  }
  return date;
}

export function dateOnly(date) {
  return date.toISOString().slice(0, 10);
}
