export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const intl0 = new Intl.NumberFormat('en', { maximumFractionDigits: 0 });
const intl1 = new Intl.NumberFormat('en', { maximumFractionDigits: 1 });
export const number = value => intl0.format(value);
export const decimal = value => intl1.format(value);
export const percent = (value, digits = 0) => `${(value * 100).toFixed(digits)}%`;
export const hours = ms => ms / 3600000;
export const plural = (n, word, many = `${word}s`) => `${number(n)} ${n === 1 ? word : many}`;
export const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
export const DAY = 86400000;

export function duration(ms) {
  const minutes = ms / 60000;
  if (minutes < 1) return `${Math.round(ms / 1000)} sec`;
  if (minutes < 60) return `${Math.round(minutes)} min`;
  return `${hours(ms) < 100 ? decimal(hours(ms)) : number(hours(ms))} hrs`;
}
export function clockDuration(ms) {
  const total = Math.round(ms / 60000), h = Math.floor(total / 60), m = total % 60;
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m} min`;
}

// Dates follow the "time zone" setting: this device, or UTC.
let utc = false;
export const useUTC = value => { utc = value; };
export const formatDate = (ts, options = { month: 'short', day: 'numeric', year: 'numeric' }) => new Date(ts).toLocaleDateString('en', { ...options, ...(utc ? { timeZone: 'UTC' } : {}) });
export const dayLabel = (key, options = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) => new Date(`${key}T12:00:00Z`).toLocaleDateString('en', { ...options, timeZone: 'UTC' });
export const monthLabel = (key, long = false) => new Date(`${key}-01T12:00:00Z`).toLocaleDateString('en', { month: long ? 'long' : 'short', year: long ? 'numeric' : '2-digit', timeZone: 'UTC' });
export const hourLabel = hour => `${hour % 12 || 12}${hour >= 12 ? 'pm' : 'am'}`;
export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Round chart maximums up to friendly numbers (1, 2, 2.5, 5, 10 × 10ⁿ per tick).
export function niceMax(value, ticks = 4) {
  if (!(value > 0)) return ticks;
  const raw = value / ticks, pow = 10 ** Math.floor(Math.log10(raw)), f = raw / pow;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * pow * ticks;
}
export const axisNumber = value => value >= 10000 ? `${decimal(value / 1000)}k` : number(value);
