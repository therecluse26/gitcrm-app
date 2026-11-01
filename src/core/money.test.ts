import { describe, expect, it } from 'vitest';
import { formatMoney, fractionDigits, isCurrency, minorToInput, parseMoney } from './money.ts';

describe('fractionDigits', () => {
  it('follows the currency', () => {
    expect(fractionDigits('USD')).toBe(2);
    expect(fractionDigits('JPY')).toBe(0);
    expect(fractionDigits('KWD')).toBe(3);
  });
});

describe('parseMoney', () => {
  it.each([
    ['2500', 'USD', 250000],
    ['2500.00', 'USD', 250000],
    ['2,500.5', 'USD', 250050],
    [' 1,234,567.89 ', 'USD', 123456789],
    ['0.07', 'USD', 7],
    ['.5', 'USD', 50],
    ['2500.000', 'USD', 250000], // extra zeros change nothing
    ['2500', 'JPY', 2500],
    ['1.234', 'KWD', 1234],
    ['0', 'USD', 0],
  ])('reads %j %s as %i minor units', (text, currency, minor) => {
    expect(parseMoney(text, currency)).toEqual({ ok: true, minor });
  });

  it('reads an empty amount as no amount', () => {
    expect(parseMoney('  ', 'USD')).toEqual({ ok: true, minor: null });
  });

  it.each([
    ['-5', 'USD', 'Enter an amount of 0 or more.'],
    ['2500.005', 'USD', 'USD amounts have at most 2 decimal places.'],
    ['2500.5', 'JPY', 'JPY amounts have no decimal places.'],
    ['2,50', 'USD', 'Use a period for decimals and commas only between thousands, such as 2,500.00.'],
    ['25,00.00', 'USD', 'Use a period for decimals and commas only between thousands, such as 2,500.00.'],
    ['$2500', 'USD', 'Enter digits only, such as 2500.00.'],
    ['2.5.0', 'USD', 'Enter digits only, such as 2500.00.'],
    ['1e5', 'USD', 'Enter digits only, such as 2500.00.'],
    ['.', 'USD', 'Enter digits only, such as 2500.00.'],
    ['90071992547409.92', 'USD', 'This amount is too large.'],
  ])('refuses %j in %s', (text, currency, error) => {
    expect(parseMoney(text, currency)).toEqual({ ok: false, error });
  });
});

describe('formatMoney', () => {
  it('shows 250000 minor units of USD as $2,500.00, with no float rounding (docs/10)', () => {
    expect(formatMoney(250000, 'USD', 'en-US')).toBe('$2,500.00');
    expect(formatMoney(9007199254740991, 'USD', 'en-US')).toBe('$90,071,992,547,409.91');
    expect(formatMoney(7, 'USD', 'en-US')).toBe('$0.07');
  });

  it('uses the currency’s decimal places', () => {
    expect(formatMoney(2500, 'JPY', 'en-US')).toBe('¥2,500');
    expect(formatMoney(1234, 'KWD', 'en-US')).toBe('KWD 1.234');
  });
});

describe('minorToInput', () => {
  it('gives the form text that reads back to the same value', () => {
    for (const [minor, currency] of [[250000, 'USD'], [7, 'USD'], [2500, 'JPY'], [1234, 'KWD'], [9007199254740991, 'USD']] as const) {
      expect(parseMoney(minorToInput(minor, currency), currency)).toEqual({ ok: true, minor });
    }
    expect(minorToInput(250000, 'USD')).toBe('2500.00');
  });
});

describe('isCurrency', () => {
  it('accepts ISO 4217 codes the browser knows', () => {
    expect(isCurrency('USD')).toBe(true);
    expect(isCurrency('usd')).toBe(false);
    expect(isCurrency('ZZZ')).toBe(false);
  });
});
