import { Directory, File, Paths } from 'expo-file-system';
import type { SqlDriver } from '../db/driver';
import { exportRows, getSetting, setSetting } from '../db/repo';
import { buildBackupCsv } from './csv';
import { AUTO_BACKUP_PREFIX, autoBackupFileName, backupsToDelete, shouldAutoBackup } from './backupPlan';

export { AUTO_BACKUP_INTERVAL_DAYS } from './backupPlan';

export const AUTO_BACKUP_ENABLED_KEY = 'auto_backup_enabled';
export const AUTO_BACKUP_LAST_KEY = 'auto_backup_last_at';

function backupDir(): Directory {
  const dir = new Directory(Paths.document, 'backups');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

/** Sortable backup file names currently on disk, newest first. Never throws. */
export function listAutoBackups(): string[] {
  try {
    const dir = backupDir();
    if (!dir.exists) return [];
    return dir.list()
      .filter((e): e is File => !(e instanceof Directory) && e.name.startsWith(AUTO_BACKUP_PREFIX))
      .map((f) => f.name)
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

export function isAutoBackupEnabled(db: SqlDriver): boolean {
  return getSetting(db, AUTO_BACKUP_ENABLED_KEY) !== 'off';
}

export function setAutoBackupEnabled(db: SqlDriver, enabled: boolean): void {
  setSetting(db, AUTO_BACKUP_ENABLED_KEY, enabled ? 'on' : 'off');
}

export function lastAutoBackupAt(db: SqlDriver): string | null {
  return getSetting(db, AUTO_BACKUP_LAST_KEY);
}

/** Writes a full backup CSV and prunes everything beyond the newest AUTO_BACKUP_KEEP files. */
export function writeAutoBackup(db: SqlDriver, now: Date = new Date()): string | null {
  const rows = exportRows(db);
  if (!rows.length) return null; // nothing to protect yet
  const dir = backupDir();
  const file = new File(dir, autoBackupFileName(now));
  file.create({ intermediates: true, overwrite: true });
  file.write(buildBackupCsv(rows));
  for (const name of backupsToDelete(listAutoBackups())) {
    const old = new File(dir, name);
    if (old.exists) old.delete();
  }
  setSetting(db, AUTO_BACKUP_LAST_KEY, now.toISOString());
  return file.name;
}

/** Called when the app opens: makes a backup if enabled and the last one is 6+ days old. Never throws. */
export function runAutoBackupIfDue(db: SqlDriver, now: Date = new Date()): string | null {
  try {
    if (!isAutoBackupEnabled(db)) return null;
    if (!shouldAutoBackup(lastAutoBackupAt(db), now)) return null;
    return writeAutoBackup(db, now);
  } catch {
    return null; // a failed backup must never block app startup
  }
}

/** Shares a kept backup file through the iOS share sheet. Returns false when nothing exists yet. */
export async function shareAutoBackup(name: string): Promise<boolean> {
  const file = new File(backupDir(), name);
  if (!file.exists) return false;
  const Sharing = await import('expo-sharing');
  if (!(await Sharing.isAvailableAsync())) return false;
  await Sharing.shareAsync(file.uri, {
    mimeType: 'text/csv',
    UTI: 'public.comma-separated-values-text',
    dialogTitle: 'Save your PocketLedger backup',
  });
  return true;
}

export function formatBackupTime(iso: string | null): string {
  if (!iso) return 'never';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 'never' : d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}