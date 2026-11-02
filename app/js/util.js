// Small shared helpers: dates, times and safe text

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

const pad = (n) => String(n).padStart(2, '0');

// "2026-11-02" in local time, used to group entries by day
export function dayKey(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function dateFromKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// "Monday 2 November"
export function formatDay(d) {
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

// "Today", "Yesterday" or "Monday 2 November"
export function friendlyDay(key) {
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (key === dayKey(today)) return 'Today';
  if (key === dayKey(yesterday)) return 'Yesterday';
  return formatDay(dateFromKey(key));
}

// "3:00pm"
export function formatTime(d) {
  const h = d.getHours();
  return `${h % 12 || 12}:${pad(d.getMinutes())}${h < 12 ? 'am' : 'pm'}`;
}

// Values for <input type="time"> and <input type="date">
export const timeValue = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const dateValue = (d) => dayKey(d);

export function fromInputs(dateStr, timeStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [h, mi] = timeStr.split(':').map(Number);
  return new Date(y, m - 1, d, h, mi);
}

// A reflection done after midnight but before 4am belongs to the evening before
export function reflectionDay(d = new Date()) {
  const shifted = new Date(d);
  if (shifted.getHours() < 4) shifted.setDate(shifted.getDate() - 1);
  return dayKey(shifted);
}

// Tablets as "1", "½" or "1½"
export function formatTablets(n) {
  if (n == null) return '';
  const whole = Math.floor(n);
  return n % 1 ? `${whole || ''}½` : String(n);
}

export const uid = () => crypto.randomUUID();

// Makes user text safe to put inside HTML
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

// Tablet buttons: "+" and "−" change whole tablets; the half button adds or removes a half
export function stepTablets(n, change) {
  const half = n % 1;
  const whole = Math.min(20, Math.max(half ? 0 : 1, Math.floor(n) + change));
  return whole + half;
}

export function toggleHalf(n) {
  return n % 1 ? Math.max(1, Math.floor(n)) : n + 0.5;
}
