export const MAX_PAISE = 100_000_000_000; // Rs 100 crore safety cap

export function parseRupeesToPaise(input: string): number | null {
  if (typeof input !== 'string') return null;
  const s = input.trim().replace(/^(?:₹|rs\.?|inr)\s*/i, '').replace(/\s+/g, '');
  const m = /^(\d[\d,]*)(?:\.(\d{0,2}))?$/.exec(s);
  if (!m || /,,|,$/.test(m[1])) return null;
  const whole = m[1].replace(/,/g, '');
  if (whole.length > 12) return null;
  const paise = Number(whole) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
  return Number.isSafeInteger(paise) && paise <= MAX_PAISE ? paise : null;
}

/** Accepts "-₹2,377.80" or "(₹100)" style negatives (used for CSV validation). */
export function parseSignedAmount(input: string): number | null {
  let s = (input ?? '').trim();
  let negative = false;
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1).trim(); }
  if (s.startsWith('-') || s.startsWith('−')) { negative = true; s = s.slice(1).trim(); }
  const p = parseRupeesToPaise(s);
  return p === null ? null : negative ? -p : p;
}

function groupIndian(digits: string): string {
  if (digits.length <= 3) return digits;
  const last3 = digits.slice(-3);
  let rest = digits.slice(0, -3);
  const parts: string[] = [];
  while (rest.length > 2) { parts.unshift(rest.slice(-2)); rest = rest.slice(0, -2); }
  if (rest) parts.unshift(rest);
  return `${parts.join(',')},${last3}`;
}

export function formatINR(paise: number, opts: { showPlus?: boolean; hideZeroPaise?: boolean } = {}): string {
  const negative = paise < 0;
  const abs = Math.abs(Math.trunc(paise));
  const rupees = groupIndian(String(Math.floor(abs / 100)));
  const p = abs % 100;
  const dec = opts.hideZeroPaise && p === 0 ? '' : `.${String(p).padStart(2, '0')}`;
  const sign = negative ? '-' : opts.showPlus && abs > 0 ? '+' : '';
  return `${sign}₹${rupees}${dec}`;
}

/** "3700.00" - exact, integer based. Used for CSV and form fields. */
export function paiseToPlain(paise: number): string {
  const abs = Math.abs(Math.trunc(paise));
  return `${paise < 0 ? '-' : ''}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** Display-only compact labels for charts: ₹950, ₹4.7K, ₹2.1L, ₹1.2Cr */
export function formatCompactINR(paise: number): string {
  const r = Math.abs(paise) / 100;
  const sign = paise < 0 ? '-' : '';
  const trim = (n: number) => n.toFixed(1).replace(/\.0$/, '');
  if (r < 1000) return `${sign}₹${Math.round(r)}`;
  if (r < 100000) return `${sign}₹${trim(r / 1000)}K`;
  if (r < 10000000) return `${sign}₹${trim(r / 100000)}L`;
  return `${sign}₹${trim(r / 10000000)}Cr`;
}