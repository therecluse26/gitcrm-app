// Money as integer minor units (docs/02): parsing what the user types, and display. The number of
// decimal places comes from the currency, through Intl. No step uses binary floating point.

const KNOWN = new Set(Intl.supportedValuesOf('currency'));

export function isCurrency(code: string): boolean {
  return /^[A-Z]{3}$/.test(code) && KNOWN.has(code);
}

export function fractionDigits(currency: string): number {
  return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
}

// "1234.5" with 2 digits -> "123450"; the inverse of decimalText.
function decimalText(minor: number, currency: string): string {
  const digits = fractionDigits(currency);
  if (digits === 0) return String(minor);
  const text = String(minor).padStart(digits + 1, '0');
  return `${text.slice(0, -digits)}.${text.slice(-digits)}`;
}

export type MoneyResult = { ok: true; minor: number | null } | { ok: false; error: string };

// Commas may only group thousands, so "2,50" is refused rather than read as 250.
export function parseMoney(input: string, currency: string): MoneyResult {
  const text = input.trim();
  if (text === '') return { ok: true, minor: null };
  if (text.startsWith('-')) return { ok: false, error: 'Enter an amount of 0 or more.' };
  const match = /^(\d[\d,]*|)(?:\.(\d*))?$/.exec(text);
  if (!match || (match[1] === '' && !match[2])) return { ok: false, error: 'Enter digits only, such as 2500.00.' };
  const [, whole, fraction = ''] = match;
  if (whole.includes(',') && !/^\d{1,3}(,\d{3})+$/.test(whole)) {
    return { ok: false, error: 'Use a period for decimals and commas only between thousands, such as 2,500.00.' };
  }
  const digits = fractionDigits(currency);
  const kept = fraction.replace(/0+$/, '');
  if (kept.length > digits) {
    return { ok: false, error: digits === 0 ? `${currency} amounts have no decimal places.` : `${currency} amounts have at most ${digits} decimal places.` };
  }
  const minor = Number(whole.replaceAll(',', '') + kept.padEnd(digits, '0'));
  if (!Number.isSafeInteger(minor)) return { ok: false, error: 'This amount is too large.' };
  return { ok: true, minor };
}

// Intl formats the decimal string exactly; a number would round above 2^53.
export function formatMoney(minor: number, currency: string, locale?: string): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(decimalText(minor, currency) as Intl.StringNumericLiteral);
}

// The text an edit form starts with: no grouping, all decimal places.
export function minorToInput(minor: number, currency: string): string {
  return decimalText(minor, currency);
}
