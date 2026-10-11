export const pad = (n: number, width = 2): string => String(n).padStart(width, '0');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const LOCAL_ISO_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

export function isValidYmd(y: number, m: number, d: number): boolean {
  if (![y, m, d].every(Number.isInteger)) return false;
  if (y < 1970 || y > 2100 || m < 1 || m > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function toLocalIso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export const nowLocalIso = (): string => toLocalIso(new Date());
export const currentMonthKey = (): string => nowLocalIso().slice(0, 7);

export function isValidLocalIso(s: string): boolean {
  const m = LOCAL_ISO_RE.exec(s ?? '');
  if (!m) return false;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  return isValidYmd(y, mo, d) && h < 24 && mi < 60;
}

export function localIsoToDate(s: string): Date {
  const m = LOCAL_ISO_RE.exec(s);
  if (!m) return new Date(NaN);
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  return new Date(y, mo - 1, d, h, mi);
}

/** "19/04/2026" -> "2026-04-19" (also - and . separators, 2-digit years) */
export function parseDMY(s: string): string | null {
  const m = /^\s*(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4}|\d{2})\s*$/.exec(s ?? '');
  if (!m) return null;
  const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const mo = Number(m[2]);
  const d = Number(m[1]);
  return isValidYmd(y, mo, d) ? `${y}-${pad(mo)}-${pad(d)}` : null;
}

export function ymdToDMY(ymd: string): string {
  const [y, m, d] = ymd.split('-');
  return `${d}/${m}/${y}`;
}

export function addDays(iso: string, days: number): string {
  const d = localIsoToDate(iso);
  d.setDate(d.getDate() + days);
  return toLocalIso(d);
}

export function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number);
  const idx = y * 12 + (m - 1) + delta;
  return `${Math.floor(idx / 12)}-${pad((idx % 12) + 1)}`;
}

export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}
export const shortMonth = (key: string): string => MONTHS[Number(key.slice(5, 7)) - 1] ?? key;

export function formatDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : iso;
}
export const formatDateTime = (iso: string): string => `${formatDate(iso)}, ${iso.slice(11, 16)}`;