import * as Clipboard from 'expo-clipboard';
import type { SqlDriver } from '../db/driver';
import { ingestSms } from '../db/repo';
import { parseClipboardQueue } from './smsQueue';

export interface DrainResult {
  hadEntries: boolean;
  created: number;
  ignored: number;
  duplicates: number;
}

/**
 * Reads bank SMS that a Shortcut queued into the clipboard while the app was closed,
 * ingests each into Pending Review (never directly into the ledger) and clears the
 * clipboard so nothing is processed twice. Safe to call on every app open.
 */
export async function drainClipboardQueue(db: SqlDriver, now: Date = new Date()): Promise<DrainResult> {
  const raw = await Clipboard.getStringAsync();
  const entries = parseClipboardQueue(raw);
  if (!entries.length) return { hadEntries: false, created: 0, ignored: 0, duplicates: 0 };

  let created = 0;
  let ignored = 0;
  let duplicates = 0;
  for (const text of entries) {
    const res = ingestSms(db, text, now);
    if (res.status === 'created') created++;
    else if (res.status === 'ignored') ignored++;
    else if (res.status === 'duplicate') duplicates++;
  }
  await Clipboard.setStringAsync(''); // consumed once; never re-ingest
  return { hadEntries: true, created, ignored, duplicates };
}
