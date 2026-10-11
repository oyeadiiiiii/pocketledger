import type { IngestOutcome } from '../db/repo';
import { IGNORE_REASON_LABEL } from './smsParser';

export type IntakeOutcome = IngestOutcome | { status: 'rejected'; reason: 'invalid_key' };

const REJECT_MESSAGE: Record<'empty' | 'too_long' | 'rate_limited' | 'invalid_key', string> = {
  empty: 'No message text was received.',
  too_long: 'The message is too long to be a bank alert.',
  rate_limited: 'Too many alerts arrived in 10 minutes. Try again shortly.',
  invalid_key: 'The Shortcut key is missing or wrong. Copy the URL template again from Settings.',
};

export function describeOutcome(o: IntakeOutcome): { title: string; message: string } {
  switch (o.status) {
    case 'created':
      return {
        title: 'Added to Pending Review',
        message: o.possibleDuplicateOf
          ? 'It looks similar to an existing entry (same amount within 10 minutes). Check before confirming.'
          : 'Review and confirm it to add it to your ledger.',
      };
    case 'ignored':
      return { title: 'Ignored', message: `${IGNORE_REASON_LABEL[o.reason]} Nothing was saved.` };
    case 'duplicate':
      return {
        title: 'Already received',
        message: o.reason === 'same_reference'
          ? 'A transaction with the same bank reference number already exists.'
          : 'This exact message was already received.',
      };
    case 'rejected':
      return { title: 'Not accepted', message: REJECT_MESSAGE[o.reason] };
  }
}