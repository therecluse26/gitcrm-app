// Record and workspace schemas, version 1 (docs/02-DATA-MODEL.md).
// Key order in each schema is the canonical key order of the JSON files.
import { z } from 'zod';

export const RECORD_TYPES = ['contact', 'company', 'opportunity', 'task', 'activity'] as const;
export type RecordType = (typeof RECORD_TYPES)[number];

const uuid = z.uuidv4().regex(/^[0-9a-f-]+$/, 'Use lowercase hex');
const timestamp = z.iso.datetime(); // UTC only: an offset such as +01:00 is invalid
const calendarDate = z.iso.date();
const nonBlank = z.string().refine((s) => s.trim().length > 0, 'Must not be blank');
// Stage and custom field IDs: lowercase, never changed after creation (ADR-019, ADR-020).
const slugId = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/);
const currency = z.string().regex(/^[A-Z]{3}$/, 'Use an ISO 4217 code such as USD');
const website = z.url({ protocol: /^https?$/, hostname: z.regexes.domain });
export const isWebsite = (value: unknown) => website.safeParse(value).success;
export const isCalendarDate = (value: unknown) => calendarDate.safeParse(value).success;
// A typed address with no scheme, such as northwind.example, gets https:// (spec 02, spec 10).
// Any other scheme stays as typed, so the schema refuses javascript: and the like.
export const withScheme = (typed: string) => (/^[a-z][a-z0-9+.-]*:/i.test(typed) ? typed : `https://${typed}`);
// Custom field values by field ID (spec 10). The workspace settings give each field its type;
// core/custom-fields.ts checks that a value fits it.
const customFields = z.record(slugId, z.union([z.string(), z.number(), z.boolean(), z.null()])).optional();
const related = z.strictObject({ type: z.enum(['contact', 'company', 'opportunity']), id: uuid }).nullable();

const lifecycle = {
  createdAt: timestamp,
  updatedAt: timestamp,
  archivedAt: timestamp.nullable(),
};

export const contactSchema = z.strictObject({
  schemaVersion: z.literal(1),
  type: z.literal('contact'),
  id: uuid,
  name: nonBlank,
  emails: z.array(z.email()),
  phones: z.array(nonBlank),
  companyId: uuid.nullable(),
  tags: z.array(nonBlank),
  customFields,
  ...lifecycle,
});

export const companySchema = z.strictObject({
  schemaVersion: z.literal(1),
  type: z.literal('company'),
  id: uuid,
  name: nonBlank,
  website: website.nullable(),
  tags: z.array(nonBlank),
  customFields,
  ...lifecycle,
});

export const opportunitySchema = z.strictObject({
  schemaVersion: z.literal(1),
  type: z.literal('opportunity'),
  id: uuid,
  title: nonBlank,
  stageId: slugId,
  companyId: uuid.nullable(),
  contactIds: z.array(uuid),
  valueMinor: z.int().nonnegative().nullable(),
  currency,
  expectedCloseDate: calendarDate.nullable(),
  customFields,
  ...lifecycle,
});

export const taskSchema = z.strictObject({
  schemaVersion: z.literal(1),
  type: z.literal('task'),
  id: uuid,
  title: nonBlank,
  description: z.string(),
  dueDate: calendarDate.nullable(),
  completedAt: timestamp.nullable(),
  related,
  ...lifecycle,
});

export const activitySchema = z.strictObject({
  schemaVersion: z.literal(1),
  type: z.literal('activity'),
  id: uuid,
  kind: z.enum(['note', 'call', 'meeting', 'email_manual']),
  body: nonBlank,
  occurredAt: timestamp,
  related,
  ...lifecycle,
});

export const recordSchemas = {
  contact: contactSchema,
  company: companySchema,
  opportunity: opportunitySchema,
  task: taskSchema,
  activity: activitySchema,
} as const;

export type Contact = z.infer<typeof contactSchema>;
export type Company = z.infer<typeof companySchema>;
export type Opportunity = z.infer<typeof opportunitySchema>;
export type Task = z.infer<typeof taskSchema>;
export type Activity = z.infer<typeof activitySchema>;
export type CRMRecord = Contact | Company | Opportunity | Task | Activity;
export type RecordOf<T extends RecordType> = Extract<CRMRecord, { type: T }>;

const stage = z.strictObject({ id: slugId, label: nonBlank, position: z.int().nonnegative() });

const unique = (values: unknown[]) => new Set(values).size === values.length;

export const CUSTOM_FIELD_TYPES = ['text', 'number', 'date', 'checkbox', 'url', 'select'] as const;
export const CUSTOM_RECORD_TYPES = ['contact', 'company', 'opportunity'] as const;

// A removed field or option stays, with `archived: true`, so its values come back on restore.
const customOption = z.strictObject({ id: slugId, label: nonBlank, archived: z.boolean() });
const customField = z
  .strictObject({ id: slugId, label: nonBlank, type: z.enum(CUSTOM_FIELD_TYPES), position: z.int().nonnegative(), archived: z.boolean(), options: z.array(customOption) })
  .refine((field) => field.type === 'select' || field.options.length === 0, 'Only a choice list has options')
  .refine((field) => unique(field.options.map((o) => o.id)), 'Option IDs must be unique');
const customFieldList = z
  .array(customField)
  .refine((fields) => unique(fields.map((f) => f.id)), 'Custom field IDs must be unique')
  .refine((fields) => unique(fields.map((f) => f.position)), 'Custom field positions must be unique');

// Version 2 adds custom field definitions (spec 10). A file without them stays at version 1, so
// that a version 1 app can still open it.
export const workspaceSchema = z
  .strictObject({
    schemaVersion: z.union([z.literal(1), z.literal(2)]),
    workspaceId: uuid,
    name: nonBlank,
    defaultCurrency: currency,
    pipelineStages: z.array(stage).superRefine((stages, ctx) => {
      const ids = stages.map((s) => s.id);
      if (!unique(ids)) ctx.addIssue({ code: 'custom', message: 'Stage IDs must be unique' });
      if (!unique(stages.map((s) => s.position))) ctx.addIssue({ code: 'custom', message: 'Stage positions must be unique' });
      for (const terminal of ['won', 'lost']) {
        if (!ids.includes(terminal)) ctx.addIssue({ code: 'custom', message: `A "${terminal}" stage must exist` });
      }
    }),
    customFields: z.strictObject({ contact: customFieldList, company: customFieldList, opportunity: customFieldList }).optional(),
  })
  .refine((config) => !config.customFields || config.schemaVersion === 2, { message: 'Custom fields need schemaVersion 2', path: ['schemaVersion'] });

export type WorkspaceConfig = z.infer<typeof workspaceSchema>;
export const WORKSPACE_VERSION = 2;
