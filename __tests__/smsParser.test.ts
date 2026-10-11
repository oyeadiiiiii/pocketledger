import { describe, expect, test } from '@jest/globals';
import { parseSms, type ParsedSms } from '../src/lib/smsParser';

const NOW = new Date(2026, 9, 11, 14, 40);

function tx(text: string): ParsedSms {
  const r = parseSms(text, { now: NOW });
  if (r.kind !== 'transaction') throw new Error(`Expected a transaction but it was ignored: ${r.reason}`);
  return r;
}

describe('specification examples', () => {
  test('UPI debit to Swiggy', () => {
    const r = tx('Rs.450.00 debited from A/c XX1234 on 11-10-2026 at 14:35. Info: UPI/SWIGGY.');
    expect(r).toMatchObject({
      direction: 'debit', amountPaise: 45000, mode: 'online', merchant: 'SWIGGY',
      suggestedType: 'expense', suggestedCategory: 'Food', occurredAt: '2026-10-11T14:35', accountLast4: '1234',
    });
    expect(r.flags).toEqual([]);
  });

  test('NEFT credit', () => {
    const r = tx('Your account XX5678 has been credited with INR 21000.00 via NEFT.');
    expect(r).toMatchObject({
      direction: 'credit', amountPaise: 2100000, mode: 'online', suggestedType: 'income', suggestedCategory: 'Income', accountLast4: '5678',
    });
  });

  test('failed payment is ignored', () => {
    expect(parseSms('Your UPI payment of Rs 500 failed.')).toEqual({ kind: 'ignored', reason: 'failed' });
  });

  test('OTP is ignored and the code is never returned', () => {
    const r = parseSms('Your OTP is 492817 for Rs 1000.');
    expect(r).toEqual({ kind: 'ignored', reason: 'otp' });
    expect(JSON.stringify(r)).not.toContain('492817');
  });

  test('balance-only message is ignored', () => {
    expect(parseSms('Available balance INR 12500.')).toEqual({ kind: 'ignored', reason: 'balance_only' });
  });
});

describe('harder cases', () => {
  test('refund from merchant', () => {
    const r = tx('Refund of Rs 299.00 from AMAZON has been credited to your a/c XX1234 on 05-10-2026.');
    expect(r).toMatchObject({ direction: 'credit', suggestedType: 'refund', amountPaise: 29900, merchant: 'AMAZON', suggestedCategory: 'Shopping' });
  });

  test('reversal of a failed transaction is a refund, not ignored', () => {
    const r = tx('Rs.500.00 credited to your a/c XX1234 towards reversal of failed UPI txn. UPI Ref 412345678901.');
    expect(r).toMatchObject({ direction: 'credit', suggestedType: 'refund', amountPaise: 50000, reference: '412345678901' });
  });

  test('available balance is not mistaken for the amount', () => {
    const r = tx('Rs 1,200.00 debited from A/c XX1234 on 10-10-2026. Avl Bal Rs 5,000.00');
    expect(r.amountPaise).toBe(120000);
    expect(r.flags).not.toContain('multiple_amounts');
  });

  test('ambiguous amounts are flagged, not silently chosen', () => {
    const r = tx('Rs 200 and Rs 300 debited from A/c XX1234');
    expect(r.flags).toContain('multiple_amounts');
    expect([r.amountPaise, ...r.alternativeAmountsPaise].sort()).toEqual([20000, 30000]);
    expect(r.confidence).toBeLessThan(0.8);
  });

  test('credit card spend: "Credit Card" does not mean credit', () => {
    const r = tx('INR 1,499.00 spent on HDFC Bank Credit Card XX4321 at FLIPKART on 09-10-26. Avl Limit: INR 48,000.00');
    expect(r).toMatchObject({ direction: 'debit', amountPaise: 149900, merchant: 'FLIPKART', suggestedCategory: 'Shopping', occurredAt: '2026-10-09T12:00' });
  });

  test('ATM withdrawal becomes an Online to Cash transfer', () => {
    const r = tx('Rs 2,000.00 withdrawn at ATM from A/c XX1234 on 10-10-2026');
    expect(r.suggestedType).toBe('transfer');
    expect(r.flags).toContain('atm_withdrawal');
  });

  test('broker debit is an ordinary expense in the Invest category', () => {
    const r = tx('Rs 1,000.00 debited from A/c XX1234 to ZERODHA BROKING on 02-07-2026');
    expect(r).toMatchObject({ suggestedType: 'expense', suggestedCategory: 'Invest' });
  });

  test('salary credit', () => {
    const r = tx('INR 21,000.00 credited to A/c XX5678 by NEFT - SALARY OCT 2026');
    expect(r).toMatchObject({ suggestedType: 'income', suggestedCategory: 'Salary', amountPaise: 2100000 });
  });

  test('"Salary Credit" wording is a credit', () => {
    const r = tx('SALARY CREDIT of INR 21,000.00 to your A/c XX5678 on 01-10-2026');
    expect(r).toMatchObject({ direction: 'credit', suggestedType: 'income', suggestedCategory: 'Salary', amountPaise: 2100000 });
  });

  test('VPA merchant and UPI reference', () => {
    const r = tx('Rs 250.00 debited from a/c **1234 on 11-10-26 to VPA zomato.order@okaxis (UPI Ref No 628912345678)');
    expect(r).toMatchObject({ merchant: 'zomato.order', suggestedCategory: 'Food', reference: '628912345678', accountLast4: '1234' });
  });

  test('promotional loan offer is ignored', () => {
    expect(parseSms('Congratulations! You are eligible for a pre-approved loan of Rs 5,00,000. Apply now.'))
      .toEqual({ kind: 'ignored', reason: 'promotional' });
  });

  test('missing date uses the time the SMS arrived, and is flagged', () => {
    const r = tx('Rs 99 debited from A/c XX1234. Info: UPI/BLINKIT');
    expect(r.occurredAt).toBe('2026-10-11T14:40');
    expect(r.flags).toContain('date_from_received_time');
  });

  test('oversized and empty input are rejected', () => {
    expect(parseSms('x'.repeat(1001))).toEqual({ kind: 'ignored', reason: 'too_long' });
    expect(parseSms('   ')).toEqual({ kind: 'ignored', reason: 'empty' });
  });
});