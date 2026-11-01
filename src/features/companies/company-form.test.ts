import { describe, expect, it } from 'vitest';
import { companyValues, readCompanyForm } from './company-form.ts';

const website = (value: string) => readCompanyForm({ name: 'Northwind Traders', website: value, tags: '', custom: {} });

describe('companyValues', () => {
  it('starts a new company empty', () => {
    expect(companyValues(null)).toEqual({ name: '', website: '', tags: '', custom: {} });
  });

  it('reads a saved company back into the form', () => {
    expect(companyValues({ name: 'Northwind Traders', website: 'https://northwind.example', tags: ['partner'] })).toEqual({
      name: 'Northwind Traders',
      website: 'https://northwind.example',
      tags: 'partner',
      custom: {},
    });
  });
});

describe('readCompanyForm', () => {
  it('turns valid values into company fields', () => {
    expect(readCompanyForm({ name: ' Northwind Traders ', website: ' https://northwind.example/about ', tags: 'partner', custom: {} })).toEqual({
      ok: true,
      fields: { name: 'Northwind Traders', website: 'https://northwind.example/about', tags: ['partner'] },
    });
  });

  it('stores no website when the field is empty', () => {
    expect(website('')).toEqual({ ok: true, fields: { name: 'Northwind Traders', website: null, tags: [] } });
  });

  it('adds https:// to an address without a scheme', () => {
    const result = website('northwind.example');
    expect(result.ok && result.fields.website).toBe('https://northwind.example');
  });

  it.each(['javascript:alert(1)', 'ftp://northwind.example', 'https://', 'not a website'])('refuses %s', (value) => {
    expect(website(value)).toEqual({ ok: false, errors: { website: 'Enter a web address, such as https://example.com.' } });
  });

  it('requires a name', () => {
    expect(readCompanyForm({ name: '', website: '', tags: '', custom: {} })).toEqual({ ok: false, errors: { name: 'Enter a name.' } });
  });
});
