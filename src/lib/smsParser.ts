import { parseRupeesToPaise } from './money';
import { INVEST_RE, suggestCategory } from './categorize';
import { isValidYmd, localIsoToDate, pad, toLocalIso } from './dates';
import type { TxType } from './types';

export const SMS_MAX_LENGTH = 1000;

export type IgnoreReason = 'empty' | 'too_long' | 'otp' | 'failed' | 'balance_only' | 'promotional' | 'not_transaction';

export const IGNORE_REASON_LABEL: Record<IgnoreReason, string> = {
  empty: 'The message was empty.',
  too_long: 'The message is too long to be a bank alert.',
  otp: 'OTP / verification message. It was discarded and not stored.',
  failed: 'Failed or declined transaction.',
  balance_only: 'Balance information only.',
  promotional: 'Promotional message.',
  not_transaction: 'No debit or credit was found.',
};

export const FLAG_LABEL: Record<string, string> = {
  ambiguous_direction: 'Debit/credit unclear',
  multiple_amounts: 'Several amounts found',
  amount_missing: 'Amount not found',
  amount_without_currency: 'Amount guessed',
  merchant_unknown: 'Merchant unknown',
  date_from_received_time: 'Date taken from arrival time',
  date_in_future: 'Suspicious date',
  atm_withdrawal: 'ATM withdrawal to Cash',
  possible_duplicate: 'Possible duplicate',
  refund_not_yet_credited: 'Refund initiated, not yet credited',
};

export interface ParsedSms {
  kind: 'transaction';
  direction: 'debit' | 'credit';
  amountPaise: number | null;
  alternativeAmountsPaise: number[];
  merchant: string;
  suggestedType: TxType;
  suggestedCategory: string | null;
  mode: 'online';
  occurredAt: string;
  reference: string | null;
  accountLast4: string | null;
  confidence: number;
  flags: string[];
}
export interface IgnoredSms { kind: 'ignored'; reason: IgnoreReason }
export type SmsParseResult = ParsedSms | IgnoredSms;

const ignored = (reason: IgnoreReason): IgnoredSms => ({ kind: 'ignored', reason });

const OTP_RE = /\b(otp|one[\s-]?time[\s-]?(?:password|passcode|pin)|verification\s+code|security\s+code|auth(?:entication)?\s+code|login\s+code)\b/i;
const FAILED_RE = /\b(failed|failure|declined|unsuccessful|not\s+successful|could\s+not\s+be\s+(?:processed|completed)|rejected|insufficient\s+(?:funds|balance))\b/i;
const REFUND_RE = /\b(refund(?:ed)?|revers(?:al|ed)|reverted|chargeback)\b/i;
const CREDIT_CONFIRM_RE = /\b(credited|refunded|reversed|added\s+to)\b/i;
const DEBIT_RE = /\b(debited|spent|paid|withdrawn|withdrawal|sent|deducted|purchased?|charged|transferred\s+to)\b/i;
const CREDIT_RE = /\b(credited|received|deposited|added\s+to|refund(?:ed)?|revers(?:al|ed)|cashback|credit(?!\s*(?:card|limit|score|line)))\b/i;
const CREDIT_TO_OTHER_RE = /\bcredited\s+to\s+(?:vpa|beneficiary|payee|a\/c\s+of|account\s+of|[a-z0-9._-]+@[a-z])/i;
const SUCCESS_PAYMENT_RE = /\b(payment|txn|transaction|transfer)\b.*\b(successful(?:ly)?|success|completed|done)\b/i;
const PROMO_RE = /\b(pre-?approved|offer|apply\s+now|eligible\s+for|get\s+up\s+to|congratulations|limited\s+period|click\s+here)\b/i;
const BALANCE_WORD_RE = /\b(bal|balance|avl|available)\b/i;
const BALANCE_CTX_RE = /\b(bal|balance|avl|available|limit|outstanding|total\s+due|min(?:imum)?\s+(?:amount\s+)?due|amount\s+due)\b[^0-9]{0,12}$/i;
const ACCOUNT_RE = /\b(?:a\/c|acct|account|card)\s*(?:no\.?\s*)?(?:ending\s*(?:with|in)?\s*)?[x*]*\s*(\d{3,6})\b/i;
const REF_RE = /\b(?:upi\s*ref(?:erence)?|ref(?:erence)?|utr|rrn|txn\s*id|transaction\s*id)\s*(?:no\.?|num(?:ber)?|id)?\s*[:#.-]?\s*([a-z0-9]{6,24})\b/i;
const BARE_AMOUNT_RE = /\b(?:debited|credited|paid|spent|received|withdrawn)\s+(?:with|by|for|of)?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)\b/i;
const INFO_RE = /\binfo\s*[:-]?\s*([^;]+?)(?:\.\s|\.$|;|$)/i;
const VPA_RE = /\b(?:vpa|upi\s*id)\s*[:-]?\s*([a-z0-9._-]+@[a-z0-9.-]+)/i;
const BARE_VPA_RE = /\b([a-z0-9._-]{2,}@[a-z][a-z0-9.-]*)/i;
const NAME = String.raw`([A-Za-z][A-Za-z0-9&.'\- ]{1,40}?)(?=\s+(?:on|via|ref|upi|using|from|with|avl|is|has|dated|txn|for|at|by|to)\b|[.,;(]|\s*$)`;
const DEBIT_NAME_RE = new RegExp(String.raw`\b(?:to|at|towards)\s+(?:vpa\s+)?` + NAME, 'gi');
const CREDIT_NAME_RE = new RegExp(String.raw`\b(?:from|by)\s+(?:vpa\s+)?` + NAME, 'gi');
const RAIL_RE = /\b(?:via|by|through)\s+(neft|imps|rtgs|upi|nach|ach)\b/i;
const STOPWORDS = new Set(['upi', 'imps', 'neft', 'rtgs', 'ach', 'nach', 'pos', 'ecom', 'atm', 'p2a', 'p2m', 'dr', 'cr', 'ref', 'txn', 'vpa', 'info', 'mb', 'ib', 'net', 'bank', 'payment', 'transfer', 'your', 'the', 'ac', 'account']);
const PENALTY: Record<string, number> = {
  ambiguous_direction: 0.3, multiple_amounts: 0.25, amount_missing: 0.5, amount_without_currency: 0.15,
  merchant_unknown: 0.15, date_from_received_time: 0.05, date_in_future: 0.2, refund_not_yet_credited: 0.2,
};

export function sanitizeSmsInput(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Mask long digit runs (account numbers etc.) before storing a preview. */
export const maskSmsForStorage = (t: string): string =>
  t.replace(/\b\d{9,}\b/g, (s) => 'X'.repeat(s.length - 4) + s.slice(-4));

const indexOfRe = (t: string, re: RegExp): number => { const m = re.exec(t); return m ? m.index : -1; };

interface AmountHit { paise: number; index: number; isBalance: boolean }
function extractAmounts(t: string): AmountHit[] {
  const re = /(?:₹|\b(?:rs|inr)(?=[\s.\d]))\.?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/gi;
  const hits: AmountHit[] = [];
  for (const m of t.matchAll(re)) {
    const paise = parseRupeesToPaise(m[1].replace(/,+$/, ''));
    if (paise === null || paise <= 0) continue;
    const idx = m.index ?? 0;
    hits.push({ paise, index: idx, isBalance: BALANCE_CTX_RE.test(t.slice(Math.max(0, idx - 30), idx)) });
  }
  return hits;
}

function cleanMerchant(s: string): string | null {
  let v = s.trim();
  if (v.includes('@')) v = v.split('@')[0];
  v = v.replace(/_+/g, ' ').replace(/[^A-Za-z0-9&.'\- ]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^[.\-' ]+|[.\-' ]+$/g, '');
  if (v.length < 2) return null;
  if (v.length > 60) v = v.slice(0, 60).trim();
  if (!/[A-Za-z]/.test(v) || /^(rs|inr)\b/i.test(v)) return null;
  if (STOPWORDS.has(v.toLowerCase())) return null;
  if (/^(your|the|you|a\/c|account|card|ac)\b/i.test(v)) return null;
  if (v.replace(/\D/g, '').length > v.length / 2) return null;
  return v;
}

function extractMerchant(t: string, direction: 'debit' | 'credit'): string | null {
  const info = INFO_RE.exec(t);
  if (info) for (const seg of info[1].split(/[/|:]|-(?=\d)/)) { const c = cleanMerchant(seg); if (c) return c; }
  const vpa = VPA_RE.exec(t) ?? BARE_VPA_RE.exec(t);
  if (vpa) { const c = cleanMerchant(vpa[1]); if (c) return c; }
  for (const m of t.matchAll(direction === 'debit' ? DEBIT_NAME_RE : CREDIT_NAME_RE)) {
    const c = cleanMerchant(m[1]);
    if (c) return c;
  }
  return null;
}

const MONTH_NUM: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const fullYear = (s: string) => (s.length === 2 ? 2000 + Number(s) : Number(s));
const ymd = (y: number, m: number, d: number) => (isValidYmd(y, m, d) ? `${y}-${pad(m)}-${pad(d)}` : null);

function extractDate(t: string): string | null {
  let m = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(t);
  if (m) return ymd(+m[1], +m[2], +m[3]);
  m = /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})\b/.exec(t);
  if (m) return ymd(fullYear(m[3]), +m[2], +m[1]);
  m = /\b(\d{1,2})[-\s]?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[-\s,]*(\d{4}|\d{2})\b/i.exec(t);
  if (m) return ymd(fullYear(m[3]), MONTH_NUM[m[2].toLowerCase()], +m[1]);
  return null;
}

function extractTime(t: string): string | null {
  const m = /(?:^|[\s,(@])(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?\b/i.exec(t);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  const ap = (m[3] ?? '').toLowerCase();
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  return h < 24 && min < 60 ? `${pad(h)}:${pad(min)}` : null;
}

function extractReference(t: string): string | null {
  const m = REF_RE.exec(t);
  return m && /\d/.test(m[1]) ? m[1].toUpperCase() : null;
}

export function parseSms(raw: string, opts: { now?: Date } = {}): SmsParseResult {
  const now = opts.now ?? new Date();
  const t = sanitizeSmsInput(raw);
  if (!t) return ignored('empty');
  if (t.length > SMS_MAX_LENGTH) return ignored('too_long');
  // OTP check runs first: OTP text never reaches any later step or storage.
  if (OTP_RE.test(t)) return ignored('otp');

  const isRefund = REFUND_RE.test(t);
  if (FAILED_RE.test(t) && !(isRefund && CREDIT_CONFIRM_RE.test(t))) return ignored('failed');

  const accountMatch = ACCOUNT_RE.exec(t);
  const reference = extractReference(t);
  if (PROMO_RE.test(t) && !accountMatch && !reference) return ignored('promotional');

  const flags: string[] = [];
  const debitIdx = indexOfRe(t, DEBIT_RE);
  const creditIdx = indexOfRe(t, CREDIT_RE);
  const creditToOther = CREDIT_TO_OTHER_RE.test(t);

  let direction: 'debit' | 'credit';
  if (debitIdx < 0 && creditIdx < 0) {
    if (SUCCESS_PAYMENT_RE.test(t) && extractAmounts(t).some((h) => !h.isBalance)) {
      direction = 'debit';
      flags.push('ambiguous_direction');
    } else if (BALANCE_WORD_RE.test(t)) return ignored('balance_only');
    else return ignored('not_transaction');
  } else if (isRefund && creditIdx >= 0) direction = 'credit';
  else if (debitIdx >= 0 && creditIdx < 0) direction = 'debit';
  else if (creditIdx >= 0 && debitIdx < 0) direction = creditToOther ? 'debit' : 'credit';
  else if (creditToOther) direction = 'debit';
  else { direction = debitIdx < creditIdx ? 'debit' : 'credit'; flags.push('ambiguous_direction'); }

  // ----- amount -----
  const hits = extractAmounts(t).filter((h) => !h.isBalance);
  let amountPaise: number | null = null;
  let alternatives: number[] = [];
  if (hits.length) {
    const unique = [...new Set(hits.map((h) => h.paise))];
    if (unique.length === 1) amountPaise = unique[0];
    else {
      const anchor = Math.max(direction === 'debit' ? debitIdx : creditIdx, 0);
      const best = hits.slice().sort((a, b) => Math.abs(a.index - anchor) - Math.abs(b.index - anchor))[0];
      amountPaise = best.paise;
      alternatives = unique.filter((p) => p !== best.paise);
      flags.push('multiple_amounts');
    }
  } else {
    const m = BARE_AMOUNT_RE.exec(t);
    const p = m ? parseRupeesToPaise(m[1].replace(/,+$/, '')) : null;
    if (p && p > 0) { amountPaise = p; flags.push('amount_without_currency'); }
    else flags.push('amount_missing');
  }

  // ----- type / category / merchant -----
  const lower = t.toLowerCase();
  let merchant = extractMerchant(t, direction);
  let suggestedType: TxType;
  let category: string | null;
  if (direction === 'debit') {
    if (/\batm\b/.test(lower) && /(withdraw|cash)/.test(lower)) {
      suggestedType = 'transfer'; category = null; merchant = 'ATM withdrawal'; flags.push('atm_withdrawal');
    } else if (INVEST_RE.test(`${merchant ?? ''} ${t}`)) {
      suggestedType = 'investment'; category = 'Invest';
    } else if (/\bemi\b|loan\s+(?:repayment|instal)/i.test(t)) {
      suggestedType = 'loan_repaid'; category = null;
    } else {
      suggestedType = 'expense';
      category = (merchant ? suggestCategory(merchant) : null) ?? suggestCategory(t);
    }
  } else if (isRefund) {
    suggestedType = 'refund';
    category = merchant ? suggestCategory(merchant) : null;
    if (!CREDIT_CONFIRM_RE.test(t)) flags.push('refund_not_yet_credited');
    merchant = merchant ?? 'Refund';
  } else if (/loan\s+(?:amount\s+)?(?:has\s+been\s+)?disburs/i.test(t)) {
    suggestedType = 'loan_taken'; category = null;
  } else if (/\bsal(?:ary)?\b/i.test(t)) {
    suggestedType = 'income'; category = 'Salary';
  } else {
    suggestedType = 'income'; category = 'Income';
  }
  if (!merchant) {
    const rail = RAIL_RE.exec(t);
    if (rail) merchant = `${rail[1].toUpperCase()} ${direction === 'credit' ? 'credit' : 'transfer'}`;
    else { merchant = direction === 'debit' ? 'Bank debit' : 'Bank credit'; flags.push('merchant_unknown'); }
  }

  // ----- date / time -----
  const today = toLocalIso(now);
  const date = extractDate(t);
  const time = extractTime(t);
  let occurredAt: string;
  if (date) {
    occurredAt = `${date}T${time ?? (date === today.slice(0, 10) ? today.slice(11) : '12:00')}`;
    if (localIsoToDate(occurredAt).getTime() > now.getTime() + 24 * 3600 * 1000) {
      flags.push('date_in_future');
      occurredAt = today;
    }
  } else {
    occurredAt = time ? `${today.slice(0, 10)}T${time}` : today;
    flags.push('date_from_received_time');
  }

  const confidence = Math.max(0.05, Math.round((0.95 - flags.reduce((s, f) => s + (PENALTY[f] ?? 0), 0)) * 100) / 100);

  return {
    kind: 'transaction', direction, amountPaise, alternativeAmountsPaise: alternatives, merchant,
    suggestedType, suggestedCategory: category, mode: 'online', occurredAt, reference,
    accountLast4: accountMatch ? accountMatch[1].slice(-4) : null, confidence, flags,
  };
}