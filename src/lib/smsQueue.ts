/**
 * Clipboard queue for bank SMS captured by an Apple Shortcut while the app stays closed.
 * Each entry is one line: "PLQ1|" + URL-encoded message. URL-encoding makes every SMS
 * (any characters, no newlines) a single safe clipboard line.
 */
export const QUEUE_PREFIX = 'PLQ1|';

/** Encodes one SMS for the clipboard queue. */
export function encodeQueueEntry(text: string): string {
  return QUEUE_PREFIX + encodeURIComponent(text.trim());
}

/** Extracts all queued SMS texts from raw clipboard content. Junk lines are ignored. */
export function parseClipboardQueue(raw: string | null | undefined): string[] {
  if (typeof raw !== 'string' || !raw.includes(QUEUE_PREFIX)) return [];
  const out: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line.startsWith(QUEUE_PREFIX)) continue;
    try {
      const text = decodeURIComponent(line.slice(QUEUE_PREFIX.length)).trim();
      if (text) out.push(text);
    } catch {
      // malformed entry: skip, never throw on clipboard junk
    }
  }
  return out;
}
