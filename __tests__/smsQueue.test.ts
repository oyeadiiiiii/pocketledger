import { describe, expect, test } from '@jest/globals';
import { QUEUE_PREFIX, encodeQueueEntry, parseClipboardQueue } from '../src/lib/smsQueue';

const SMS = 'Rs.450.00 debited from A/c XX1234 on 11-10-2026 at 14:35. Info: UPI/SWIGGY.';

describe('SMS clipboard queue', () => {
  test('entries are one prefixed line each', () => {
    const e = encodeQueueEntry(SMS);
    expect(e.startsWith(QUEUE_PREFIX)).toBe(true);
    expect(e).not.toContain('\n');
  });

  test('round trip preserves any text, including unicode and newlines', () => {
    for (const text of [SMS, 'UPI/₹1,000.00 क्रेडिट\nline two 100%', 'plain']) {
      expect(parseClipboardQueue(encodeQueueEntry(text))).toEqual([text.trim()]);
    }
  });

  test('several queued alerts accumulate and all are recovered', () => {
    const clip = [encodeQueueEntry('A'), encodeQueueEntry('B'), encodeQueueEntry('C')].join('\n');
    expect(parseClipboardQueue(clip)).toEqual(['A', 'B', 'C']);
  });

  test('junk and user clipboard text are ignored', () => {
    const clip = ['my shopping list', '', encodeQueueEntry(SMS), '   ', 'PLQ9|not ours'].join('\n');
    expect(parseClipboardQueue(clip)).toEqual([SMS]);
  });

  test('missing marker means nothing queued', () => {
    expect(parseClipboardQueue('')).toEqual([]);
    expect(parseClipboardQueue(null)).toEqual([]);
    expect(parseClipboardQueue(undefined)).toEqual([]);
    expect(parseClipboardQueue('just a copied sentence')).toEqual([]);
  });

  test('malformed entries never throw', () => {
    expect(parseClipboardQueue('PLQ1|%E0%A4%A')).toEqual([]);
    expect(parseClipboardQueue('PLQ1|   ')).toEqual([]);
  });
});
