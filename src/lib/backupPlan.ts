import { pad } from './dates';

/** Automatic backups run when the app opens, at most once per this interval. */
export const AUTO_BACKUP_INTERVAL_DAYS = 6;
/** Only the newest automatic backups are kept; older files are deleted automatically. */
export const AUTO_BACKUP_KEEP = 2;
export const AUTO_BACKUP_PREFIX = 'auto-backup-';

/** Sortable, filesystem-safe (no colons) name, e.g. auto-backup-2026-10-11T14-30-05.csv */
export function autoBackupFileName(now: Date): string {
  return `${AUTO_BACKUP_PREFIX}${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}.csv`;
}

/** A backup is due when none has been made yet, or the last one is 6+ days old. */
export function shouldAutoBackup(lastAtIso: string | null, now: Date): boolean {
  if (!lastAtIso) return true;
  const last = Date.parse(lastAtIso);
  if (Number.isNaN(last)) return true;
  return now.getTime() - last >= AUTO_BACKUP_INTERVAL_DAYS * 86_400_000;
}

/** Given any order of sortable backup names, returns the oldest ones beyond `keep` (the ones to delete). */
export function backupsToDelete(names: string[], keep: number = AUTO_BACKUP_KEEP): string[] {
  return names.slice().sort().reverse().slice(keep);
}