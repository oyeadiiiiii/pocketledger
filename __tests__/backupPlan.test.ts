import { describe, expect, test } from '@jest/globals';
import { AUTO_BACKUP_INTERVAL_DAYS, AUTO_BACKUP_KEEP, autoBackupFileName, backupsToDelete, shouldAutoBackup } from '../src/lib/backupPlan';

describe('auto backup plan', () => {
  const now = new Date(2026, 9, 11, 14, 30, 5); // 11 Oct 2026 14:30:05 local

  test('file name is sortable and filesystem-safe', () => {
    const a = autoBackupFileName(new Date(2026, 0, 2, 3, 4, 5));
    const b = autoBackupFileName(new Date(2026, 11, 31, 23, 59, 59));
    expect(a).toBe('auto-backup-2026-01-02T03-04-05.csv');
    expect(b).toBe('auto-backup-2026-12-31T23-59-59.csv');
    expect(a).not.toContain(':');
    expect(a < b).toBe(true); // lexicographic order = chronological order
  });

  test('interval is 6 days and keep-count is 2', () => {
    expect(AUTO_BACKUP_INTERVAL_DAYS).toBe(6);
    expect(AUTO_BACKUP_KEEP).toBe(2);
  });

  test('backup is due when none exists yet', () => {
    expect(shouldAutoBackup(null, now)).toBe(true);
    expect(shouldAutoBackup('', now)).toBe(true);
    expect(shouldAutoBackup('not-a-date', now)).toBe(true);
  });

  test('backup waits until 6 full days have passed', () => {
    const day = 86_400_000;
    expect(shouldAutoBackup(new Date(now.getTime() - 5 * day).toISOString(), now)).toBe(false);
    expect(shouldAutoBackup(new Date(now.getTime() - 6 * day).toISOString(), now)).toBe(true);
    expect(shouldAutoBackup(new Date(now.getTime() - 30 * day).toISOString(), now)).toBe(true);
  });

  test('only the newest 2 backups are kept, oldest are deleted', () => {
    expect(backupsToDelete([])).toEqual([]);
    expect(backupsToDelete(['auto-backup-2026-10-01T00-00-00.csv'])).toEqual([]);
    expect(backupsToDelete([
      'auto-backup-2026-10-01T00-00-00.csv',
      'auto-backup-2026-10-07T00-00-00.csv',
      'auto-backup-2026-10-13T00-00-00.csv',
    ])).toEqual(['auto-backup-2026-10-01T00-00-00.csv']);
    expect(backupsToDelete([
      'auto-backup-2026-10-13T00-00-00.csv',
      'auto-backup-2026-10-01T00-00-00.csv',
      'auto-backup-2026-10-07T00-00-00.csv',
      'auto-backup-2026-10-19T00-00-00.csv',
    ])).toEqual(['auto-backup-2026-10-07T00-00-00.csv', 'auto-backup-2026-10-01T00-00-00.csv']);
  });

  test('input array is never modified', () => {
    const names = ['auto-backup-2026-10-01T00-00-00.csv', 'auto-backup-2026-10-07T00-00-00.csv', 'auto-backup-2026-10-13T00-00-00.csv'];
    const copy = [...names];
    backupsToDelete(names);
    expect(names).toEqual(copy);
  });
});
