// DATA-DICTIONARY.md and schemas/ in every export (docs/09): what each file and field holds, and
// the CSV columns of each field (spec 05, "CSV rules").
import { z } from 'zod';
import { fieldSets, TYPE_LABELS } from './custom-fields.ts';
import type { ExportSource } from './export.ts';
import { FOLDERS, WORKSPACE_PATH } from './paths.ts';
import { isoTimestamp } from './records.ts';
import { CUSTOM_RECORD_TYPES, RECORD_TYPES, recordSchemas, workspaceSchema, type RecordType } from './schemas.ts';

const COMMON: Record<string, string> = {
  schemaVersion: 'The version of the record format. Always 1.',
  id: 'The record ID, a lowercase UUID v4. It never changes. The file name is the ID.',
  tags: 'Tags, a list of text.',
  related: 'The contact, company, or opportunity the record is for: an object with type and id, or null.',
  customFields:
    'Custom field values: an object from field ID to value. "Custom fields" gives each field. Text, web address, date (YYYY-MM-DD), and choice (the option ID) values are text. A number is a number. A checked checkbox is true. null means no value. The JSON leaves it out when the record has none.',
  createdAt: 'When the record was created, as a UTC timestamp, such as 2026-10-26T16:00:00Z.',
  updatedAt: 'When the record last changed, as a UTC timestamp.',
  archivedAt: 'When the record was archived, as a UTC timestamp. null when the record is not archived.',
};

const SPECIFIC: Record<RecordType, Record<string, string>> = {
  contact: {
    name: 'The contact name. It must not be blank.',
    emails: 'Email addresses, a list.',
    phones: 'Phone numbers as the user typed them, a list.',
    companyId: "The ID of the contact's company, or null.",
  },
  company: {
    name: 'The company name. It must not be blank.',
    website: 'The website, an http or https URL, or null.',
  },
  opportunity: {
    title: 'The opportunity title. It must not be blank.',
    stageId: 'The ID of the pipeline stage. "Pipeline stages" gives its label.',
    companyId: 'The ID of the company, or null.',
    contactIds: 'The IDs of the contacts, a list.',
    valueMinor: 'The amount in the smallest unit of the currency, such as cents: 1200000 in USD is $12,000.00. null when there is no amount.',
    currency: 'The currency, an ISO 4217 code such as USD.',
    expectedCloseDate: 'The expected close date, YYYY-MM-DD, or null. It is a calendar date, not a time.',
  },
  task: {
    title: 'The task title. It must not be blank.',
    description: 'More about the task. It can be empty.',
    dueDate: 'The due date, YYYY-MM-DD, or null.',
    completedAt: 'When the task was completed, as a UTC timestamp. null while the task is open.',
  },
  activity: {
    kind: 'note, call, meeting, or email_manual (an email recorded by hand).',
    body: 'What happened, as plain text. It must not be blank.',
    occurredAt: 'When it happened, as a UTC timestamp.',
  },
};

// One note per field, in the order of the JSON files. A field with no note is undefined.
export const FIELD_NOTES = Object.fromEntries(
  RECORD_TYPES.map((type) => [type, Object.fromEntries(Object.keys(recordSchemas[type].shape).map((key) => [key, key === 'type' ? `Always "${type}".` : (SPECIFIC[type][key] ?? COMMON[key])]))]),
) as Record<RecordType, Record<string, string>>;

// The CSV columns of a field: `related` becomes two.
export const csvColumns = (key: string) => (key === 'related' ? ['relatedType', 'relatedId'] : [key]);

// The columns at the end of opportunities.csv that are not JSON fields.
export const OPPORTUNITY_CSV_ONLY = {
  stageLabel: `The label of the stage in \`${WORKSPACE_PATH}\`. Empty when the stage is not there.`,
  value: 'valueMinor with all its decimal places, such as 12000.00. Empty when there is no amount.',
};

const CSV_RULES = [
  'UTF-8 with a byte order mark. A comma separates the cells, and CRLF ends each row.',
  'The first row is the header. The columns are the fields of the JSON file, in the same order.',
  'Every cell is in double quotes. A double quote in a value is written twice.',
  'An empty cell is null, an empty list, or an empty task description.',
  'A list (`emails`, `phones`, `tags`, `contactIds`) is one cell, with `;` between items. In an item, `\\` is written `\\\\`, and `;` is written `\\;`.',
  '`related` becomes two columns, `relatedType` and `relatedId`.',
  '`customFields` is one cell of JSON text. It is empty when the record has no custom fields.',
  '`opportunities.csv` has two more columns at the end, `stageLabel` and `value`.',
  'Spreadsheet safety (OWASP, "CSV Injection"): a cell that begins with `=`, `+`, `-`, `@`, `＝`, `＋`, `－`, `＠`, a tab, a carriage return, a line feed, or `\'` gets a `\'` in front, so a spreadsheet shows it as text. To read the value back, remove that one `\'`. The JSON snapshot keeps the original value.',
  "To read a list cell, remove the leading `'` first, then split the items.",
];

const TITLES: Record<RecordType, string> = { contact: 'Contacts', company: 'Companies', opportunity: 'Opportunities', task: 'Tasks', activity: 'Activities' };

// Text from the workspace file in a Markdown table cell: a "|" or a line break would break the table.
const md = (text: string) => text.replaceAll('|', '\\|').replace(/\s*[\r\n]+\s*/g, ' ');
const code = (text: string) => `\`${text}\``;

// The custom field definitions (spec 10), so a reader can name the keys of `customFields`.
function customFieldTable({ config }: ExportSource): string[] {
  const sets = fieldSets(config);
  const rows = CUSTOM_RECORD_TYPES.flatMap((type) =>
    sets[type].map((f) => {
      const options = f.options.map((o) => `${code(o.id)} ${md(o.label)}${o.archived ? ' (removed)' : ''}`).join('; ');
      return `| ${type[0].toUpperCase()}${type.slice(1)} | ${code(f.id)} | ${md(f.label)} | ${TYPE_LABELS[f.type]} | ${options} | ${f.archived ? 'Removed' : ''} |`;
    }),
  );
  if (rows.length === 0) return ['## Custom fields', '', 'The workspace has no custom fields.'];
  return [
    '## Custom fields',
    '',
    `From ${code(WORKSPACE_PATH)}. The keys of ${code('customFields')} in a record are these IDs. A removed field or option still has its values in the records.`,
    '',
    '| Record type | ID | Label | Type | Options | Status |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rows,
  ];
}

export function dataDictionary(source: ExportSource, now: Date): string {
  const { config, records } = source;
  const count = (type: RecordType) => records.filter((r) => r.type === type).length;
  const archived = (type: RecordType) => records.filter((r) => r.type === type && r.archivedAt !== null).length;
  return [
    `# GitCRM export: ${md(config.name)}`,
    '',
    'GitCRM made this file when it exported the workspace. It describes the files in the ZIP.',
    '',
    '| | |',
    '| --- | --- |',
    `| Repository | ${source.repository}, branch ${source.branch} |`,
    `| Commit | ${source.commitSha ?? 'Not known: this browser saved changes after it last read the branch'} |`,
    `| Exported | ${isoTimestamp(now)} (UTC) |`,
    `| Schema versions | Record files 1, ${code(WORKSPACE_PATH)} ${config.schemaVersion} |`,
    '',
    `The JSON snapshot holds ${code(WORKSPACE_PATH)} and every record file under ${code('data/')}, with the same text as on the branch. It is a copy of the branch, not its history. To keep the history, clone the repository.`,
    '',
    'The CSV export holds one CSV file for each record type. "CSV rules" tells how a CSV file holds the JSON fields.',
    '',
    '## Records',
    '',
    '| Record type | Records | Archived | JSON folder | CSV file |',
    '| --- | --- | --- | --- | --- |',
    ...RECORD_TYPES.map((type) => `| ${TITLES[type]} | ${count(type)} | ${archived(type)} | ${code(`data/${FOLDERS[type]}/`)} | ${code(`${FOLDERS[type]}.csv`)} |`),
    '',
    '## Pipeline stages',
    '',
    `From ${code(WORKSPACE_PATH)}. The ${code('stageId')} of an opportunity is one of these IDs.`,
    '',
    '| ID | Label | Position |',
    '| --- | --- | --- |',
    ...config.pipelineStages.toSorted((a, b) => a.position - b.position).map((stage) => `| ${code(stage.id)} | ${md(stage.label)} | ${stage.position} |`),
    '',
    ...customFieldTable(source),
    '',
    '## Fields',
    '',
    `Every JSON file has every field in its table. Only ${code('customFields')} can be left out.`,
    '',
    `The exact formats are in ${code('schemas/')}: JSON Schema 2020-12, generated from the validation in GitCRM. Three rules are not in the schemas. A name, title, tag, phone number, or activity text must not be blank. A website must use http or https. The workspace file needs unique stage IDs and positions, a ${code('won')} and a ${code('lost')} stage, unique custom field IDs, positions, and option IDs, and ${code('schemaVersion')} 2 when it has custom fields.`,
    ...RECORD_TYPES.flatMap((type) => [
      '',
      `### ${type[0].toUpperCase()}${type.slice(1)} (${code(`data/${FOLDERS[type]}/`)}, ${code(`${FOLDERS[type]}.csv`)})`,
      '',
      '| Field | CSV columns | Description |',
      '| --- | --- | --- |',
      ...Object.entries(FIELD_NOTES[type]).map(([key, note]) => `| ${code(key)} | ${csvColumns(key).map(code).join(', ')} | ${note} |`),
      ...(type === 'opportunity' ? Object.entries(OPPORTUNITY_CSV_ONLY).map(([column, note]) => `| (none) | ${code(column)} | ${note} |`) : []),
    ]),
    '',
    '## CSV rules',
    '',
    ...CSV_RULES.map((rule) => `- ${rule}`),
    '',
  ].join('\n');
}

// One JSON Schema per record type, and one for the workspace file.
export function jsonSchemas(): Record<string, string> {
  const schemas = { ...recordSchemas, workspace: workspaceSchema };
  return Object.fromEntries(Object.entries(schemas).map(([name, schema]) => [`schemas/${name}.schema.json`, `${JSON.stringify(z.toJSONSchema(schema), null, 2)}\n`]));
}
