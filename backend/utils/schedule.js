const DAY_MS = 24 * 60 * 60 * 1000;
const pad = (n) => String(n).padStart(2, '0');

export const httpError = (status, message) => Object.assign(new Error(message), { status });

export const toMinutes = (time) => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};

export const toClock = (minutes) => `${pad(Math.floor((minutes % 1440) / 60))}:${pad(minutes % 60)}`;

// Local date, matching MySQL's CURDATE()
export const today = () => new Date().toLocaleDateString('en-CA');

export const addDays = (date, days) => new Date(Date.parse(date) + days * DAY_MS).toISOString().slice(0, 10);

export const daysUntil = (date) => Math.floor((Date.parse(date) - Date.now()) / DAY_MS);

// ISO weekday: 1 = Monday ... 7 = Sunday
export const isoWeekday = (date) => new Date(Date.parse(date)).getUTCDay() || 7;

export const weekdayAfter = (weekday, days) => ((weekday - 1 + days) % 7) + 1;

// '6E', '0123' / '6E 123' / '6E123' -> '6E123', so schedule and fare sources agree on flight identity
export function normalizeFlightNo(carrier, number) {
  const code = String(carrier).toUpperCase();
  let rest = String(number).toUpperCase().replace(/[\s-]/g, '');
  if (rest.startsWith(code) && rest.length > code.length) rest = rest.slice(code.length);
  return code + rest.replace(/^0+(?=\d)/, '');
}
