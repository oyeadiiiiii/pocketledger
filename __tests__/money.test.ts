import { describe, expect, test } from '@jest/globals';
import { formatINR, paiseToPlain, parseRupeesToPaise, parseSignedAmount } from '../src/lib/money';

describe('parseRupeesToPaise', () => {
  test.each([
    ['₹3,700.00', 370000],
    ['149.28', 14928],
    ['448.56', 44856],
    ['90.03', 9003],
    ['₹1,23,456.7', 12345670],
    ['Rs. 450', 45000],
    ['INR 21000.00', 2100000],
    ['0', 0],
  ])('%s -> %i paise', (input, paise) => {
    expect(parseRupeesToPaise(input)).toBe(paise);
  });

  test.each(['', 'abc', '1.234', '12,,3', '12,', '-5', '1e5', '₹'])('rejects %p', (input) => {
    expect(parseRupeesToPaise(input)).toBeNull();
  });

  test('signed amounts from the summary sheet', () => {
    expect(parseSignedAmount('-₹2,377.80')).toBe(-237780);
    expect(parseSignedAmount('(₹100)')).toBe(-10000);
  });

  test('integer paise avoid floating point drift', () => {
    const sum = ['149.28', '448.56', '90.03'].map((s) => parseRupeesToPaise(s) as number).reduce((a, b) => a + b, 0);
    expect(sum).toBe(68787);
  });
});

describe('formatINR', () => {
  test('Indian digit grouping', () => {
    expect(formatINR(9333800)).toBe('₹93,338.00');
    expect(formatINR(123456700)).toBe('₹12,34,567.00');
    expect(formatINR(9003)).toBe('₹90.03');
    expect(formatINR(-237780)).toBe('-₹2,377.80');
    expect(formatINR(500, { showPlus: true })).toBe('+₹5.00');
  });

  test('plain export format', () => {
    expect(paiseToPlain(14928)).toBe('149.28');
    expect(paiseToPlain(370000)).toBe('3700.00');
  });
});