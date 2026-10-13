import type { SqlDriver, SqlParam } from './driver';
import { newId } from '../lib/ids';
import type { AccountKind, CategoryKind, TxSource, TxType } from '../lib/types';
import { type TxInput, dedupeKeyOf, firstError, needsCategory, validateTxInput } from '../lib/validation';
import { isValidLocalIso, localIsoToDate, shiftMonth, toLocalIso } from '../lib/dates';
import { MAX_PAISE } from '../lib/money';
import { fingerprint } from '../lib/hash';
import { type ExportTx, type ImportFormat, type ImportRow, markDuplicates, parseCsv, parseImportTable } from '../lib/csv';

export class LedgerError extends Error {}
const stamp = (): string => new Date().toISOString();

// ======================= Types =======================
export interface Account {
  id: string;
  name: string;
  kind: AccountKind;
  opening_balance_paise: number;
  opening_as_of: string;
  sort_order: number;
}
export interface AccountWithBalance extends Account { balance_paise: number }

export interface Category {
  id: string;
  name: string;
  kind: CategoryKind;
  icon: string;
  color: string;
  is_system: number;
}
export interface CategoryWithUsage extends Category { usage: number }

export interface TxView {
  id: string;
  type: TxType;
  amount_paise: number;
  title: string;
  occurred_at: string;
  month_key: string;
  category_id: string | null;
  account_id: string;
  to_account_id: string | null;
  remark: string | null;
  source: TxSource;
  source_pending_id: string | null;
  import_id: string | null;
  external_ref: string | null;
  dedupe_key: string;
  created_at: string;
  updated_at: string;
  category_name: string | null;
  category_color: string | null;
  category_icon: string | null;
  account_name: string;
  account_kind: AccountKind;
  to_account_name: string | null;
  to_account_kind: AccountKind | null;
}

export interface MonthSummary {
  income: number;
  expenses: number;      // expenses minus refunds
  grossExpenses: number;
  refunds: number;
  loanTaken: number;
  loanRepaid: number;
  transfers: number;
  savings: number;       // income - expenses (loans excluded)
  netCashFlow: number;   // everything that moved money in/out of your accounts
}

// ======================= Settings =======================
export function getSetting(db: SqlDriver, key: string): string | null {
  return db.first<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key])?.value ?? null;
}

export function setSetting(db: SqlDriver, key: string, value: string): void {
  db.run(
    'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
    [key, value, stamp()],
  );
}

// ======================= Accounts =======================
export function listAccounts(db: SqlDriver): Account[] {
  return db.all<Account>('SELECT * FROM accounts ORDER BY sort_order');
}

export function accountIdByKind(db: SqlDriver, kind: AccountKind): string {
  const row = db.first<{ id: string }>('SELECT id FROM accounts WHERE kind = ? ORDER BY sort_order LIMIT 1', [kind]);
  if (!row) throw new LedgerError(`No ${kind} account exists.`);
  return row.id;
}

/** Balance = opening balance + every transaction dated on/after the opening "as of" date. */
export function accountBalances(db: SqlDriver): AccountWithBalance[] {
  return db.all<AccountWithBalance>(`
    SELECT a.*, a.opening_balance_paise + COALESCE((
      SELECT SUM(CASE
        WHEN t.type = 'transfer' AND t.to_account_id = a.id THEN t.amount_paise
        WHEN t.type = 'transfer' THEN -t.amount_paise
        WHEN t.type IN ('income', 'loan_taken', 'refund') THEN t.amount_paise
        ELSE -t.amount_paise END)
      FROM transactions t
      WHERE (t.account_id = a.id OR t.to_account_id = a.id) AND t.occurred_at >= a.opening_as_of
    ), 0) AS balance_paise
    FROM accounts a
    ORDER BY a.sort_order`);
}

export function updateAccountOpening(db: SqlDriver, id: string, openingPaise: number, asOf: string): void {
  if (!Number.isSafeInteger(openingPaise) || Math.abs(openingPaise) > MAX_PAISE) throw new LedgerError('Enter a valid opening balance.');
  if (!isValidLocalIso(asOf)) throw new LedgerError('Enter a valid "as of" date.');
  const r = db.run('UPDATE accounts SET opening_balance_paise = ?, opening_as_of = ? WHERE id = ?', [openingPaise, asOf, id]);
  if (r.changes !== 1) throw new LedgerError('Account not found.');
}

// ======================= Categories =======================
const CATEGORY_COLORS = ['#3B82F6', '#F97316', '#8B5CF6', '#EC4899', '#14B8A6', '#EAB308', '#6366F1', '#22C55E', '#EF4444', '#0EA5E9'];

function cleanCategoryName(name: string): string {
  const n = (name ?? '').trim().replace(/\s+/g, ' ');
  if (!n || n.length > 40) throw new LedgerError('Category name must be 1 to 40 characters.');
  return n;
}

export function listCategories(db: SqlDriver): CategoryWithUsage[] {
  return db.all<CategoryWithUsage>(`
    SELECT c.*, (SELECT COUNT(*) FROM transactions t WHERE t.category_id = c.id) AS usage
    FROM categories c
    ORDER BY CASE c.kind WHEN 'income' THEN 1 ELSE 0 END, c.name COLLATE NOCASE`);
}

export function categoryIdByName(db: SqlDriver, name: string): string | null {
  return db.first<{ id: string }>('SELECT id FROM categories WHERE name = ?', [name.trim()])?.id ?? null;
}

export function addCategory(db: SqlDriver, name: string, kind: CategoryKind = 'expense'): string {
  const n = cleanCategoryName(name);
  if (categoryIdByName(db, n)) throw new LedgerError(`A category named "${n}" already exists.`);
  const id = newId();
  const color = CATEGORY_COLORS[parseInt(fingerprint(n).slice(0, 4), 16) % CATEGORY_COLORS.length];
  db.run('INSERT INTO categories (id, name, kind, icon, color, is_system, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)', [
    id, n, kind, kind === 'income' ? 'wallet' : 'pricetag', color, stamp(),
  ]);
  return id;
}

export function renameCategory(db: SqlDriver, id: string, name: string): void {
  const n = cleanCategoryName(name);
  const clash = db.first<{ id: string }>('SELECT id FROM categories WHERE name = ? AND id <> ?', [n, id]);
  if (clash) throw new LedgerError(`A category named "${n}" already exists. Use Merge instead.`);
  const r = db.run('UPDATE categories SET name = ? WHERE id = ?', [n, id]);
  if (r.changes !== 1) throw new LedgerError('Category not found.');
}

/** Moves every transaction (and pending item) from source to target, then removes source. History is kept. */
export function mergeCategories(db: SqlDriver, sourceId: string, targetId: string): void {
  if (sourceId === targetId) throw new LedgerError('Choose a different category to merge into.');
  db.transaction(() => {
    if (!db.first<{ id: string }>('SELECT id FROM categories WHERE id = ?', [targetId])) throw new LedgerError('Target category not found.');
    db.run('UPDATE transactions SET category_id = ?, updated_at = ? WHERE category_id = ?', [targetId, stamp(), sourceId]);
    db.run('UPDATE pending_transactions SET category_id = ? WHERE category_id = ?', [targetId, sourceId]);
    const r = db.run('DELETE FROM categories WHERE id = ?', [sourceId]);
    if (r.changes !== 1) throw new LedgerError('Category not found.');
  });
}

/** Deleting a used category requires choosing where its transactions go. Nothing is ever orphaned. */
export function deleteCategory(db: SqlDriver, id: string, reassignToId: string | null): void {
  const used = db.first<{ n: number }>('SELECT COUNT(*) AS n FROM transactions WHERE category_id = ?', [id])?.n ?? 0;
  if (used > 0) {
    if (!reassignToId) throw new LedgerError(`${used} transactions use this category. Choose a category to move them to.`);
    mergeCategories(db, id, reassignToId);
    return;
  }
  db.transaction(() => {
    db.run('UPDATE pending_transactions SET category_id = NULL WHERE category_id = ?', [id]);
    const r = db.run('DELETE FROM categories WHERE id = ?', [id]);
    if (r.changes !== 1) throw new LedgerError('Category not found.');
  });
}

// ======================= Transactions =======================
function normalize(i: TxInput): TxInput {
  const remark = i.remark?.trim();
  return {
    ...i,
    title: (i.title ?? '').trim().replace(/\s+/g, ' '),
    remark: remark ? remark : null,
    categoryId: needsCategory(i.type) ? i.categoryId : null,
    toAccountId: i.type === 'transfer' ? i.toAccountId : null,
  };
}

function assertValid(i: TxInput): void {
  const e = firstError(validateTxInput(i));
  if (e) throw new LedgerError(e);
}

export interface InsertMeta {
  source: TxSource;
  id?: string;
  sourcePendingId?: string | null;
  importId?: string | null;
  externalRef?: string | null;
}

export function insertTransaction(db: SqlDriver, raw: TxInput, meta: InsertMeta = { source: 'manual' }): string {
  const i = normalize(raw);
  assertValid(i);
  const id = meta.id ?? newId();
  const ts = stamp();
  db.run(
    `INSERT INTO transactions (id, type, amount_paise, title, occurred_at, month_key, category_id, account_id, to_account_id,
       remark, source, source_pending_id, import_id, external_ref, dedupe_key, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, i.type, i.amountPaise, i.title, i.occurredAt, i.occurredAt.slice(0, 7), i.categoryId, i.accountId, i.toAccountId,
      i.remark, meta.source, meta.sourcePendingId ?? null, meta.importId ?? null, meta.externalRef ?? null, dedupeKeyOf(i), ts, ts,
    ],
  );
  return id;
}

export function updateTransaction(db: SqlDriver, id: string, raw: TxInput): void {
  const i = normalize(raw);
  assertValid(i);
  const r = db.run(
    `UPDATE transactions SET type = ?, amount_paise = ?, title = ?, occurred_at = ?, month_key = ?, category_id = ?,
       account_id = ?, to_account_id = ?, remark = ?, dedupe_key = ?, updated_at = ? WHERE id = ?`,
    [i.type, i.amountPaise, i.title, i.occurredAt, i.occurredAt.slice(0, 7), i.categoryId, i.accountId, i.toAccountId, i.remark, dedupeKeyOf(i), stamp(), id],
  );
  if (r.changes !== 1) throw new LedgerError('Transaction not found.');
}

export function deleteTransaction(db: SqlDriver, id: string): void {
  const r = db.run('DELETE FROM transactions WHERE id = ?', [id]);
  if (r.changes !== 1) throw new LedgerError('Transaction not found.');
}

const TX_SELECT = `
  SELECT t.*, c.name AS category_name, c.color AS category_color, c.icon AS category_icon,
         a.name AS account_name, a.kind AS account_kind, ta.name AS to_account_name, ta.kind AS to_account_kind
  FROM transactions t
  LEFT JOIN categories c ON c.id = t.category_id
  JOIN accounts a ON a.id = t.account_id
  LEFT JOIN accounts ta ON ta.id = t.to_account_id`;

export function getTransaction(db: SqlDriver, id: string): TxView | null {
  return db.first<TxView>(`${TX_SELECT} WHERE t.id = ?`, [id]);
}

export interface TxFilter {
  search?: string;
  monthKey?: string | null;
  categoryIds?: string[];
  accountKind?: AccountKind | null;
  types?: TxType[];
  limit?: number;
  ascending?: boolean;
}

const escapeLike = (s: string): string => s.replace(/[\\%_]/g, (m) => '\\' + m);

export function listTransactions(db: SqlDriver, f: TxFilter = {}): TxView[] {
  const where: string[] = [];
  const params: SqlParam[] = [];
  const search = f.search?.trim();
  if (search) {
    const like = `%${escapeLike(search)}%`;
    where.push("(t.title LIKE ? ESCAPE '\\' OR t.remark LIKE ? ESCAPE '\\' OR c.name LIKE ? ESCAPE '\\')");
    params.push(like, like, like);
  }
  if (f.monthKey) { where.push('t.month_key = ?'); params.push(f.monthKey); }
  if (f.categoryIds?.length) { where.push(`t.category_id IN (${f.categoryIds.map(() => '?').join(',')})`); params.push(...f.categoryIds); }
  if (f.accountKind) { where.push('(a.kind = ? OR ta.kind = ?)'); params.push(f.accountKind, f.accountKind); }
  if (f.types?.length) { where.push(`t.type IN (${f.types.map(() => '?').join(',')})`); params.push(...f.types); }
  const dir = f.ascending ? 'ASC' : 'DESC';
  const sql = `${TX_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY t.occurred_at ${dir}, t.created_at ${dir} LIMIT ?`;
  params.push(f.limit ?? 500);
  return db.all<TxView>(sql, params);
}

export function exportRows(db: SqlDriver): ExportTx[] {
  return listTransactions(db, { ascending: true, limit: 10_000_000 });
}

// ======================= Summaries =======================
type Totals = Record<TxType, number>;
const emptyTotals = (): Totals => ({ expense: 0, income: 0, loan_taken: 0, loan_repaid: 0, transfer: 0, refund: 0 });

function summarize(t: Totals): MonthSummary {
  const expenses = t.expense - t.refund;
  return {
    income: t.income,
    expenses,
    grossExpenses: t.expense,
    refunds: t.refund,
    loanTaken: t.loan_taken,
    loanRepaid: t.loan_repaid,
    transfers: t.transfer,
    savings: t.income - expenses,
    netCashFlow: t.income + t.loan_taken + t.refund - t.expense - t.loan_repaid,
  };
}

export function monthSummary(db: SqlDriver, monthKey: string): MonthSummary {
  const totals = emptyTotals();
  for (const r of db.all<{ type: TxType; total: number }>('SELECT type, SUM(amount_paise) AS total FROM transactions WHERE month_key = ? GROUP BY type', [monthKey])) {
    totals[r.type] = r.total;
  }
  return summarize(totals);
}

export function monthlySeries(db: SqlDriver, endKey: string, count: number): { key: string; summary: MonthSummary }[] {
  const startKey = shiftMonth(endKey, -(count - 1));
  const rows = db.all<{ month_key: string; type: TxType; total: number }>(
    'SELECT month_key, type, SUM(amount_paise) AS total FROM transactions WHERE month_key BETWEEN ? AND ? GROUP BY month_key, type',
    [startKey, endKey],
  );
  return Array.from({ length: count }, (_, i) => {
    const key = shiftMonth(startKey, i);
    const totals = emptyTotals();
    for (const r of rows) if (r.month_key === key) totals[r.type] = r.total;
    return { key, summary: summarize(totals) };
  });
}

export interface CategorySpend { id: string; name: string; color: string; icon: string; total: number }

export function categorySpend(db: SqlDriver, monthKey: string): CategorySpend[] {
  return db.all<CategorySpend>(`
    SELECT c.id, c.name, c.color, c.icon,
           SUM(CASE WHEN t.type = 'expense' THEN t.amount_paise ELSE -t.amount_paise END) AS total
    FROM transactions t JOIN categories c ON c.id = t.category_id
    WHERE t.month_key = ? AND t.type IN ('expense', 'refund')
    GROUP BY c.id HAVING total > 0 ORDER BY total DESC`, [monthKey]);
}

export function modeSplit(db: SqlDriver, monthKey: string): { cash: number; online: number } {
  const out = { cash: 0, online: 0 };
  for (const r of db.all<{ kind: AccountKind; total: number }>(`
    SELECT a.kind, SUM(CASE WHEN t.type = 'expense' THEN t.amount_paise ELSE -t.amount_paise END) AS total
    FROM transactions t JOIN accounts a ON a.id = t.account_id
    WHERE t.month_key = ? AND t.type IN ('expense', 'refund') GROUP BY a.kind`, [monthKey])) {
    out[r.kind] = r.total;
  }
  return out;
}

export function loanStatus(db: SqlDriver): { taken: number; repaid: number; outstanding: number } {
  const r = db.first<{ taken: number; repaid: number }>(`
    SELECT COALESCE(SUM(CASE WHEN type = 'loan_taken' THEN amount_paise END), 0) AS taken,
           COALESCE(SUM(CASE WHEN type = 'loan_repaid' THEN amount_paise END), 0) AS repaid
    FROM transactions`) ?? { taken: 0, repaid: 0 };
  return { taken: r.taken, repaid: r.repaid, outstanding: r.taken - r.repaid };
}

export function ledgerStats(db: SqlDriver): { transactions: number; pending: number; categories: number; imports: number } {
  const n = (sql: string) => db.first<{ n: number }>(sql)?.n ?? 0;
  return {
    transactions: n('SELECT COUNT(*) AS n FROM transactions'),
    pending: n("SELECT COUNT(*) AS n FROM pending_transactions WHERE status = 'pending'"),
    categories: n('SELECT COUNT(*) AS n FROM categories'),
    imports: n('SELECT COUNT(*) AS n FROM import_history'),
  };
}

// ======================= CSV import / restore =======================
export interface ImportPreview {
  format: ImportFormat;
  rows: ImportRow[];
  fileHash: string;
  previouslyImportedAt: string | null;
}

export function previewImport(db: SqlDriver, text: string): ImportPreview {
  if (text.length > 5_000_000) throw new LedgerError('File is too large (maximum 5 MB).');
  const table = parseCsv(text);
  if (table.length < 2) throw new LedgerError('The file has no data rows.');
  const parsed = parseImportTable(table, { knownCategories: listCategories(db).map((c) => c.name) });
  if (!parsed) {
    throw new LedgerError('Unrecognised columns. Expected Title, Date, Use, Amount, Mode, Remark, or a PocketLedger backup file.');
  }
  const keys = new Set(db.all<{ dedupe_key: string }>('SELECT dedupe_key FROM transactions').map((r) => r.dedupe_key));
  const ids = new Set(db.all<{ id: string }>('SELECT id FROM transactions').map((r) => r.id));
  markDuplicates(parsed.rows, { keys, ids }, { cash: accountIdByKind(db, 'cash'), online: accountIdByKind(db, 'online') });
  const fileHash = fingerprint(text);
  const prev = db.first<{ created_at: string }>('SELECT created_at FROM import_history WHERE file_hash = ? ORDER BY created_at DESC LIMIT 1', [fileHash]);
  return { format: parsed.format, rows: parsed.rows, fileHash, previouslyImportedAt: prev?.created_at ?? null };
}

/** Appends selected rows only. Never overwrites or deletes existing data. All-or-nothing. */
export function commitImport(db: SqlDriver, preview: ImportPreview, fileName: string | null): { imported: number; skipped: number; importId: string } {
  const chosen = preview.rows.filter((r) => r.include && r.errors.length === 0);
  return db.transaction(() => {
    const importId = newId();
    db.run(
      'INSERT INTO import_history (id, kind, file_name, file_hash, rows_total, rows_imported, rows_skipped, created_at) VALUES (?, ?, ?, ?, ?, 0, 0, ?)',
      [importId, preview.format === 'legacy' ? 'legacy_csv' : 'backup_csv', fileName, preview.fileHash, preview.rows.length, stamp()],
    );
    const accountIds: Record<AccountKind, string> = { cash: accountIdByKind(db, 'cash'), online: accountIdByKind(db, 'online') };
    let imported = 0;
    for (const r of chosen) {
      if (r.id && db.first<{ id: string }>('SELECT id FROM transactions WHERE id = ?', [r.id])) continue; // never overwrite
      let categoryId: string | null = null;
      if (r.categoryName && needsCategory(r.type)) {
        categoryId = categoryIdByName(db, r.categoryName) ?? addCategory(db, r.categoryName, r.type === 'income' ? 'income' : 'expense');
      }
      const input: TxInput = {
        type: r.type, amountPaise: r.amountPaise, title: r.title, occurredAt: r.occurredAt, categoryId,
        accountId: accountIds[r.accountKind], toAccountId: r.toAccountKind ? accountIds[r.toAccountKind] : null, remark: r.remark,
      };
      insertTransaction(db, input, { source: preview.format === 'legacy' ? 'csv' : 'restore', id: r.id ?? undefined, importId });
      imported++;
    }
    const skipped = preview.rows.length - imported;
    db.run('UPDATE import_history SET rows_imported = ?, rows_skipped = ? WHERE id = ?', [imported, skipped, importId]);
    return { imported, skipped, importId };
  });
}