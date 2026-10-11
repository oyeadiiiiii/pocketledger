import { AccountKind, TxType, isTxType } from './types';
import { isValidLocalIso, parseDMY, ymdToDMY } from './dates';
import { formatINR, paiseToPlain, parseRupeesToPaise, parseSignedAmount } from './money';
import { dedupeKeyOf, needsCategory } from './validation';

export class CsvError extends Error {}
export type ImportFormat = 'legacy' | 'backup';

export interface ImportRow {
  line: number;
  id: string | null;
  type: TxType;
  title: string;
  occurredAt: string;
  categoryName: string | null;
  accountKind: AccountKind;
  toAccountKind: AccountKind | null;
  amountPaise: number;
  remark: string | null;
  errors: string[];
  warnings: string[];
  duplicate: boolean;
  include: boolean;
}

export interface ExportTx {
  id: string;
  type: TxType;
  title: string;
  occurred_at: string;
  category_name: string | null;
  account_kind: AccountKind;
  to_account_kind: AccountKind | null;
  amount_paise: number;
  remark: string | null;
  source: string;
  created_at: string;
}

export function detectDelimiter(text: string): ',' | '\t' | ';' {
  const first = text.replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0] ?? '';
  const count = (c: string) => first.split(c).length - 1;
  const tabs = count('\t');
  const commas = count(',');
  const semis = count(';');
  if (tabs > commas && tabs >= semis) return '\t';
  if (semis > commas) return ';';
  return ',';
}

/** RFC 4180 parser: quoted fields, escaped quotes, CRLF, BOM. */
export function parseCsv(text: string, delimiter: string = detectDelimiter(text)): string[][] {
  const s = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"' && field === '') { inQuotes = true; continue; }
    if (ch === delimiter) { row.push(field); field = ''; continue; }
    if (ch === '\r') continue;
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += ch;
  }
  if (inQuotes) throw new CsvError('The file has an unterminated quoted field.');
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

export function toCsv(rows: string[][]): string {
  const esc = (v: string) => (/[",\r\n]/.test(v) || /^\s|\s$/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return '\uFEFF' + rows.map((r) => r.map(esc).join(',')).join('\r\n') + '\r\n';
}

/** Prevent spreadsheet formula injection on export; reversed on import. */
export const safeCell = (v: string): string => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v);
export const unescapeCell = (v: string): string => (/^'[=+\-@]/.test(v) ? v.slice(1) : v);

const norm = (h: string) => h.toLowerCase().replace(/[^a-z]/g, '');
const kindLabel = (k: AccountKind) => (k === 'cash' ? 'Cash' : 'Online');

type LegacyKey = 'title' | 'date' | 'category' | 'amount' | 'mode' | 'remark';
const LEGACY_ALIASES: Record<LegacyKey, string[]> = {
  title: ['title', 'name', 'description', 'particulars', 'item', 'merchant'],
  date: ['date', 'txndate', 'transactiondate'],
  category: ['use', 'category', 'cat'],
  amount: ['amount', 'amt', 'amountinr', 'amountrs', 'rs', 'inr'],
  mode: ['mode', 'paymentmode', 'paidvia', 'method', 'account'],
  remark: ['remark', 'remarks', 'note', 'notes', 'comment', 'comments'],
};

function findCol(header: string[], aliases: string[]): number {
  const n = header.map(norm);
  for (const a of aliases) { const i = n.indexOf(a); if (i >= 0) return i; }
  return -1;
}

function canonicalCategory(name: string, known: string[], warnings: string[]): string {
  const hit = known.find((k) => k.toLowerCase() === name.toLowerCase());
  if (hit) return hit;
  warnings.push(`New category "${name}" will be created`);
  return name;
}

function parseKind(v: string): AccountKind | null {
  const s = v.trim().toLowerCase();
  if (s === 'cash') return 'cash';
  if (s === 'online') return 'online';
  return null;
}

/** Spreadsheet rows are expenses unless the title or category says income or loan. */
export function classifyLegacyRow(title: string, category: string): TxType {
  const s = `${title} ${category}`.toLowerCase();
  if (/\bloan\b/.test(s) && /\b(repaid|repay|repayment|returned|emi)\b/.test(s)) return 'loan_repaid';
  if (/\bloan\b/.test(s) || /\bborrow/.test(s)) return 'loan_taken';
  if (/\b(salary|income|stipend|credited)\b/.test(s) || /\bcredit\b(?!\s*card)/.test(s)) return 'income';
  return 'expense';
}
const LEGACY_KEYS: LegacyKey[] = ['title', 'date', 'category', 'amount', 'mode', 'remark'];

/**
 * Monthly tabs keep Salary Credit / Loan Taken / Loan Repaid as label + value cells beside the
 * table (e.g. K8 "Salary Credit", L8 "₹9,677.00"). Calculated cells (IN, Save, Total Expense,
 * Had/Used/Left, category totals) are deliberately ignored.
 */
const SUMMARY_LABELS: Array<{ re: RegExp; type: TxType; title: string; category: string | null }> = [
  { re: /^salary( credit(ed)?)?$/, type: 'income', title: 'Salary Credit', category: 'Salary' },
  { re: /^loan taken$/, type: 'loan_taken', title: 'Loan Taken', category: null },
  { re: /^loan (repaid|repayment|returned)$/, type: 'loan_repaid', title: 'Loan Repaid', category: null },
];

function parseSummaryCells(table: string[][], idx: Record<LegacyKey, number>, txRows: ImportRow[]): ImportRow[] {
  const tableCols = new Set(LEGACY_KEYS.map((k) => idx[k]).filter((c) => c >= 0));
  const dates = txRows.filter((r) => r.occurredAt).map((r) => r.occurredAt.slice(0, 10)).sort();
  const firstDate = dates[0] ?? null;
  const out: ImportRow[] = [];
  table.forEach((r, rowIndex) => {
    if (rowIndex === 0) return;
    r.forEach((cell, c) => {
      if (tableCols.has(c)) return;
      const label = cell.trim().toLowerCase().replace(/\s+/g, ' ');
      const match = SUMMARY_LABELS.find((l) => l.re.test(label));
      if (!match) return;
      const valueCell = r.slice(c + 1).find((x) => x.trim() !== '') ?? '';
      const amount = parseSignedAmount(valueCell.trim());
      if (amount === null || amount === 0) return;
      const errors: string[] = [];
      const warnings = ['From the summary cells beside the table'];
      if (amount < 0) errors.push('Amount must be greater than ₹0');
      if (firstDate) warnings.push('Date estimated from the first transaction in this tab; edit it after import if needed');
      else errors.push('No transaction dates in this file to place it on');
      out.push({
        line: rowIndex + 1, id: null, type: match.type, title: match.title,
        occurredAt: firstDate ? `${firstDate}T09:00` : '', categoryName: match.category,
        accountKind: 'online', toAccountKind: null, amountPaise: Math.abs(amount), remark: 'Imported from spreadsheet summary',
        errors, warnings, duplicate: false, include: errors.length === 0,
      });
    });
  });
  return out;
}
function parseLegacy(table: string[][], idx: Record<LegacyKey, number>, known: string[]): ImportRow[] {
  const rows: ImportRow[] = [];
  table.slice(1).forEach((r, i) => {
    if (LEGACY_KEYS.every((k) => idx[k] < 0 || !(r[idx[k]] ?? '').trim())) return;
    const get = (k: LegacyKey) => (idx[k] >= 0 ? (r[idx[k]] ?? '').trim() : '');
    const errors: string[] = [];
    const warnings: string[] = [];

    const title = unescapeCell(get('title'));
    if (!title) errors.push('Missing title');
    else if (title.length > 120) errors.push('Title longer than 120 characters');
    if (/^(total|grand\s*total|sum)\b/i.test(title)) errors.push('Looks like a summary row, not a transaction');

    const ymd = parseDMY(get('date'));
    if (!ymd) errors.push(`Invalid date "${get('date')}" (expected DD/MM/YYYY)`);

    const amount = parseSignedAmount(get('amount'));
    if (amount === null) errors.push(`Invalid amount "${get('amount')}"`);
    else if (amount <= 0) errors.push('Amount must be greater than ₹0');

    const modeRaw = get('mode');
    let accountKind: AccountKind = 'online';
    const kind = parseKind(modeRaw);
    if (kind) accountKind = kind;
    else if (!modeRaw) warnings.push('No mode given, treated as Online');
    else if (/upi|card|bank|net|gpay|paytm|phonepe/i.test(modeRaw)) warnings.push(`Mode "${modeRaw}" treated as Online`);
    else errors.push(`Unknown mode "${modeRaw}" (expected Cash or Online)`);

    const rawCat = get('category');
    const type = classifyLegacyRow(title, rawCat);
    let cat: string | null;
    if (type === 'loan_taken' || type === 'loan_repaid') {
      cat = null;
    } else if (type === 'income') {
      cat = /salary/i.test(`${title} ${rawCat}`) ? 'Salary' : 'Income';
    } else {
      let c = rawCat;
      if (!c) { c = 'Misc.'; warnings.push('No category given, using Misc.'); }
      if (c.length > 40) errors.push('Category name longer than 40 characters');
      cat = canonicalCategory(c, known, warnings);
    }

    rows.push({
      line: i + 2, id: null, type, title, occurredAt: ymd ? `${ymd}T12:00` : '', categoryName: cat,
      accountKind, toAccountKind: null, amountPaise: amount ?? 0, remark: unescapeCell(get('remark')) || null,
      errors, warnings, duplicate: false, include: errors.length === 0,
    });
  });
  return rows;
}

function parseBackup(table: string[][], known: string[]): ImportRow[] {
  const header = table[0].map(norm);
  const col = (name: string) => header.indexOf(name);
  const rows: ImportRow[] = [];
  table.slice(1).forEach((r, i) => {
    if (r.every((c) => !c.trim())) return;
    const get = (name: string) => { const c = col(name); return c >= 0 ? (r[c] ?? '').trim() : ''; };
    const errors: string[] = [];
    const warnings: string[] = [];

    const id = get('id');
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) errors.push('Invalid id');
    const typeRaw = get('type').toLowerCase();
    const type: TxType = isTxType(typeRaw) ? typeRaw : 'expense';
    if (!isTxType(typeRaw)) errors.push(`Unknown type "${typeRaw}"`);

    const title = unescapeCell(get('title'));
    if (!title) errors.push('Missing title');

    const time = get('time') || '12:00';
    const occurredAt = `${get('date')}T${time}`;
    if (!isValidLocalIso(occurredAt)) errors.push('Invalid date/time (expected YYYY-MM-DD and HH:MM)');

    const accountKind = parseKind(get('account'));
    if (!accountKind) errors.push(`Unknown account "${get('account')}"`);
    const toRaw = get('toaccount');
    const toAccountKind = toRaw ? parseKind(toRaw) : null;
    if (toRaw && !toAccountKind) errors.push(`Unknown destination account "${toRaw}"`);
    if (type === 'transfer' && !toAccountKind) errors.push('Transfer needs a destination account');

    const amount = parseRupeesToPaise(get('amount'));
    if (!amount) errors.push(`Invalid amount "${get('amount')}"`);

    let categoryName: string | null = get('category') || null;
    if (needsCategory(type) && !categoryName) errors.push('Missing category');
    if (!needsCategory(type)) categoryName = null;
    if (categoryName) categoryName = canonicalCategory(categoryName, known, warnings);

    rows.push({
      line: i + 2, id: id || null, type, title, occurredAt, categoryName,
      accountKind: accountKind ?? 'online', toAccountKind: type === 'transfer' ? toAccountKind : null,
      amountPaise: amount ?? 0, remark: unescapeCell(get('remark')) || null,
      errors, warnings, duplicate: false, include: errors.length === 0,
    });
  });
  return rows;
}

export function parseImportTable(table: string[][], ctx: { knownCategories: string[] }): { format: ImportFormat; rows: ImportRow[] } | null {
  const header = table[0] ?? [];
  const n = header.map(norm);
  if (['id', 'type', 'title', 'date', 'account', 'amount'].every((k) => n.includes(k))) {
    return { format: 'backup', rows: parseBackup(table, ctx.knownCategories) };
  }
  const idx = {} as Record<LegacyKey, number>;
  (Object.keys(LEGACY_ALIASES) as LegacyKey[]).forEach((k) => { idx[k] = findCol(header, LEGACY_ALIASES[k]); });
  if (idx.title < 0 || idx.date < 0 || idx.amount < 0 || idx.category < 0 || idx.mode < 0) return null;
  const legacyRows = parseLegacy(table, idx, ctx.knownCategories);
  return { format: 'legacy', rows: [...legacyRows, ...parseSummaryCells(table, idx, legacyRows)] };
}

export function markDuplicates(
  rows: ImportRow[],
  existing: { keys: Set<string>; ids: Set<string> },
  accountIds: Record<AccountKind, string>,
): void {
  const seen = new Set<string>();
  for (const r of rows) {
    if (r.errors.length) continue;
    const key = dedupeKeyOf({ type: r.type, occurredAt: r.occurredAt, title: r.title, amountPaise: r.amountPaise, accountId: accountIds[r.accountKind] });
    if ((r.id && existing.ids.has(r.id)) || existing.keys.has(key)) {
      r.duplicate = true;
      r.include = false;
      r.warnings.push('Already in your ledger, skipped by default');
    } else if (seen.has(key)) {
      r.warnings.push('Same date, title and amount appears earlier in this file');
    }
    seen.add(key);
  }
}

export const BACKUP_HEADER = ['id', 'type', 'title', 'date', 'time', 'category', 'account', 'to_account', 'amount', 'remark', 'source', 'created_at'];

export function buildBackupCsv(rows: ExportTx[]): string {
  const out: string[][] = [BACKUP_HEADER];
  for (const r of rows) {
    out.push([
      r.id, r.type, safeCell(r.title), r.occurred_at.slice(0, 10), r.occurred_at.slice(11, 16),
      r.category_name ?? '', kindLabel(r.account_kind), r.to_account_kind ? kindLabel(r.to_account_kind) : '',
      paiseToPlain(r.amount_paise), safeCell(r.remark ?? ''), r.source, r.created_at,
    ]);
  }
  return toCsv(out);
}

/** Your original six-column spreadsheet format (expenses only). */
export function buildLegacyCsv(rows: ExportTx[]): string {
  const out: string[][] = [['Title', 'Date', 'Use', 'Amount', 'Mode', 'Remark']];
  for (const r of rows) {
    if (r.type !== 'expense') continue;
    out.push([
      safeCell(r.title), ymdToDMY(r.occurred_at.slice(0, 10)), r.category_name ?? '',
      formatINR(r.amount_paise), kindLabel(r.account_kind), safeCell(r.remark ?? ''),
    ]);
  }
  return toCsv(out);
}