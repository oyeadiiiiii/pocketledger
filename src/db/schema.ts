import type { SqlDriver } from './driver';
import type { CategoryKind } from '../lib/types';

export interface SeedCategory { id: string; name: string; kind: CategoryKind; icon: string; color: string }

/** Your existing spreadsheet categories (preserved exactly) plus two income categories. */
export const DEFAULT_CATEGORIES: SeedCategory[] = [
  { id: 'cat_transport', name: 'Transport', kind: 'expense', icon: 'car', color: '#3B82F6' },
  { id: 'cat_food', name: 'Food', kind: 'expense', icon: 'fast-food', color: '#F97316' },
  { id: 'cat_home', name: 'Home', kind: 'expense', icon: 'home', color: '#8B5CF6' },
  { id: 'cat_shopping', name: 'Shopping', kind: 'expense', icon: 'bag-handle', color: '#EC4899' },
  { id: 'cat_bills', name: 'Bills', kind: 'expense', icon: 'receipt', color: '#0EA5E9' },
  { id: 'cat_gifts', name: 'Gifts', kind: 'expense', icon: 'gift', color: '#F43F5E' },
  { id: 'cat_essentials', name: 'Essentials', kind: 'expense', icon: 'basket', color: '#14B8A6' },
  { id: 'cat_stationary', name: 'Stationary', kind: 'expense', icon: 'pencil', color: '#94A3B8' },
  { id: 'cat_misc', name: 'Misc.', kind: 'expense', icon: 'ellipsis-horizontal-circle', color: '#64748B' },
  { id: 'cat_education', name: 'Education', kind: 'expense', icon: 'school', color: '#6366F1' },
  { id: 'cat_groceries', name: 'Groceries', kind: 'expense', icon: 'cart', color: '#22C55E' },
  { id: 'cat_medicine', name: 'Medicine', kind: 'expense', icon: 'medkit', color: '#EF4444' },
  { id: 'cat_petrol', name: 'Petrol', kind: 'expense', icon: 'speedometer', color: '#EAB308' },
  { id: 'cat_invest', name: 'Invest', kind: 'any', icon: 'trending-up', color: '#10B981' },
  { id: 'cat_rustnroses', name: 'rustNroses', kind: 'expense', icon: 'rose', color: '#BE123C' },
  { id: 'cat_salary', name: 'Salary', kind: 'income', icon: 'cash', color: '#16A34A' },
  { id: 'cat_income', name: 'Income', kind: 'income', icon: 'wallet', color: '#059669' },
];

export const DEFAULT_ACCOUNTS = [
  { id: 'acc_cash', name: 'Cash', kind: 'cash', sort: 0 },
  { id: 'acc_online', name: 'Online', kind: 'online', sort: 1 },
] as const;

const SCHEMA_V1 = `
CREATE TABLE accounts (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  kind TEXT NOT NULL CHECK (kind IN ('cash','online')),
  opening_balance_paise INTEGER NOT NULL DEFAULT 0,
  opening_as_of TEXT NOT NULL DEFAULT '1970-01-01T00:00',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE categories (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  kind TEXT NOT NULL CHECK (kind IN ('expense','income','any')),
  icon TEXT NOT NULL DEFAULT 'pricetag',
  color TEXT NOT NULL DEFAULT '#64748B',
  is_system INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE import_history (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('legacy_csv','backup_csv')),
  file_name TEXT,
  file_hash TEXT NOT NULL,
  rows_total INTEGER NOT NULL,
  rows_imported INTEGER NOT NULL,
  rows_skipped INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_import_hash ON import_history(file_hash);

CREATE TABLE pending_transactions (
  id TEXT PRIMARY KEY NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('debit','credit')),
  amount_paise INTEGER CHECK (amount_paise IS NULL OR amount_paise > 0),
  alt_amounts TEXT NOT NULL DEFAULT '[]',
  suggested_type TEXT NOT NULL,
  merchant TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
  sms_preview TEXT,
  sms_hash TEXT NOT NULL UNIQUE,
  reference TEXT,
  account_hint TEXT,
  confidence REAL NOT NULL,
  flags TEXT NOT NULL DEFAULT '[]',
  notes TEXT,
  possible_duplicate_of TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','ignored')),
  confirmed_tx_id TEXT,
  created_at TEXT NOT NULL,
  resolved_at TEXT
);
CREATE INDEX idx_pending_status ON pending_transactions(status, created_at);
CREATE INDEX idx_pending_ref ON pending_transactions(reference);
CREATE INDEX idx_pending_amount ON pending_transactions(amount_paise, occurred_at);

CREATE TABLE transactions (
  id TEXT PRIMARY KEY NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('expense','income','investment','loan_taken','loan_repaid','transfer','refund')),
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0 AND amount_paise <= 100000000000),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  occurred_at TEXT NOT NULL,
  month_key TEXT NOT NULL,
  category_id TEXT REFERENCES categories(id) ON DELETE RESTRICT,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  to_account_id TEXT REFERENCES accounts(id) ON DELETE RESTRICT,
  remark TEXT,
  source TEXT NOT NULL CHECK (source IN ('manual','sms','csv','restore')),
  source_pending_id TEXT UNIQUE REFERENCES pending_transactions(id) ON DELETE SET NULL,
  import_id TEXT REFERENCES import_history(id) ON DELETE SET NULL,
  external_ref TEXT,
  dedupe_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK ((type = 'transfer') = (to_account_id IS NOT NULL)),
  CHECK (to_account_id IS NULL OR to_account_id <> account_id)
);
CREATE INDEX idx_tx_occurred ON transactions(occurred_at DESC);
CREATE INDEX idx_tx_month ON transactions(month_key, type);
CREATE INDEX idx_tx_category ON transactions(category_id);
CREATE INDEX idx_tx_account ON transactions(account_id);
CREATE INDEX idx_tx_to_account ON transactions(to_account_id);
CREATE INDEX idx_tx_dedupe ON transactions(dedupe_key);
CREATE INDEX idx_tx_ref ON transactions(external_ref);

CREATE TABLE settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

interface Migration { version: number; up: (db: SqlDriver) => void }

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    up: (db) => {
      db.exec(SCHEMA_V1);
      const now = new Date().toISOString();
      for (const a of DEFAULT_ACCOUNTS) {
        db.run('INSERT INTO accounts (id, name, kind, sort_order, created_at) VALUES (?, ?, ?, ?, ?)', [a.id, a.name, a.kind, a.sort, now]);
      }
      for (const c of DEFAULT_CATEGORIES) {
        db.run('INSERT INTO categories (id, name, kind, icon, color, is_system, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)', [c.id, c.name, c.kind, c.icon, c.color, now]);
      }
      db.run('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)', ['theme', 'system', now]);
    },
  },
  // Future schema changes: add { version: 2, up: ... } here. Never edit version 1.
];

export const LATEST_SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

export function migrate(db: SqlDriver): void {
  db.exec('PRAGMA foreign_keys = ON;');
  const current = db.first<{ user_version: number }>('PRAGMA user_version')?.user_version ?? 0;
  if (current > LATEST_SCHEMA_VERSION) {
    throw new Error(`Database version ${current} is newer than this app (${LATEST_SCHEMA_VERSION}). Install the latest PocketLedger build.`);
  }
  for (const m of MIGRATIONS) {
    if (m.version <= current) continue;
    db.transaction(() => {
      m.up(db);
      db.exec(`PRAGMA user_version = ${m.version};`);
    });
  }
}