// The contact form (spec 02): form values to contact fields, with an error for each bad field.
// Custom fields (spec 10) come after the built-in fields.
import { formValues, readCustomValues, type CustomField, type FormValue } from '@/core/custom-fields.ts';
import { contactSchema, type Contact } from '@/core/schemas.ts';
import { cleanList, splitTags, type FieldErrors, type FormResult } from '../record-form.ts';

export type ContactFields = Pick<Contact, 'name' | 'emails' | 'phones' | 'companyId' | 'tags' | 'customFields'>;
export type ContactFormValues = { name: string; emails: string[]; phones: string[]; companyId: string; tags: string; custom: Record<string, FormValue> };

// The form always shows at least one email row and one phone row.
const rows = (values: string[]) => (values.length > 0 ? values : ['']);

export function contactFields({ name, emails, phones, companyId, tags, customFields }: Contact): ContactFields {
  return { name, emails, phones, companyId, tags, customFields };
}

// `custom` holds the custom fields the form shows.
export function contactValues(fields: ContactFields | null, custom: CustomField[] = []): ContactFormValues {
  return {
    name: fields?.name ?? '',
    emails: rows(fields?.emails ?? []),
    phones: rows(fields?.phones ?? []),
    companyId: fields?.companyId ?? '',
    tags: fields?.tags.join(', ') ?? '',
    custom: formValues(custom, fields?.customFields),
  };
}

// `companies` holds the IDs a contact may link to. The contact's current link may stay, even to a
// missing company, so that an unrelated edit still saves. `stored` holds the custom field values
// the form started from.
export function readContactForm(
  values: ContactFormValues,
  { companies, currentCompanyId, custom = [], stored }: { companies: ReadonlySet<string>; currentCompanyId: string | null; custom?: CustomField[]; stored?: Contact['customFields'] },
): FormResult<ContactFields> {
  const errors: FieldErrors = {};
  const name = values.name.trim();
  if (!contactSchema.shape.name.safeParse(name).success) errors.name = 'Enter a name.';
  values.emails.forEach((email, i) => {
    if (email.trim() && !contactSchema.shape.emails.element.safeParse(email.trim()).success) {
      errors[`emails.${i}`] = 'Enter a valid email address, such as ava@example.com.';
    }
  });
  const companyId = values.companyId || null;
  if (companyId && companyId !== currentCompanyId && !companies.has(companyId)) errors.companyId = 'Choose a company from the list.';
  const customFields = readCustomValues(custom, values.custom, stored);
  if (!customFields.ok) Object.assign(errors, customFields.errors);
  if (!customFields.ok || Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    fields: { name, emails: cleanList(values.emails), phones: cleanList(values.phones), companyId, tags: splitTags(values.tags), customFields: customFields.customFields },
  };
}

// Duplicates are allowed (spec 02); the form only warns about an exact email match, ignoring case.
export function duplicateEmails(emails: string[], contacts: Contact[], selfId: string | null): { email: string; contact: Contact }[] {
  return cleanList(emails).flatMap((email) => {
    const contact = contacts.find((c) => c.id !== selfId && c.emails.some((e) => e.toLowerCase() === email.toLowerCase()));
    return contact ? [{ email, contact }] : [];
  });
}
