// Spike 3: generates a realistic GitCRM dataset in the docs/03 layout. Output is deterministic per count.
//   node spikes/gen-dataset.js <count> <outDir>
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const count = Number(process.argv[2]);
const outDir = process.argv[3];
if (!count || !outDir) {
  console.error('usage: node spikes/gen-dataset.js <count> <outDir>');
  process.exit(2);
}

// mulberry32, seeded by the count so each dataset is reproducible.
let seed = count;
function random() {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = (list) => list[Math.floor(random() * list.length)];
const int = (min, max) => min + Math.floor(random() * (max - min + 1));

function uuid() {
  const hex = Array.from({ length: 32 }, () => Math.floor(random() * 16).toString(16));
  hex[12] = '4';
  hex[16] = '89ab'[Math.floor(random() * 4)];
  const h = hex.join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const FIRST = ['Ava', 'Liam', 'Maya', 'Noah', 'Iris', 'Omar', 'Lena', 'Ravi', 'Zoe', 'Kai', 'Nora', 'Theo', 'Sofia', 'Eli', 'Mina', 'Jonas'];
const LAST = ['Bennett', 'Okafor', 'Lindqvist', 'Patel', 'Moreau', 'Tanaka', 'Silva', 'Novak', 'Haddad', 'Kowalski', 'Reyes', 'Fischer'];
const ORG = ['Studio', 'Labs', 'Works', 'Partners', 'Digital', 'Group', 'Collective', 'Systems'];
const WORDS = ('discussed timeline budget scope proposal follow up next steps pricing contract renewal onboarding '
  + 'integration feedback design review launch roadmap stakeholder approval invoice deadline kickoff workshop '
  + 'requirements estimate phase milestone handoff support retainer referral meeting call agreed concerns '
  + 'priority migration analytics hosting performance security accessibility content strategy').split(' ');
const TAGS = ['referral', 'warm', 'enterprise', 'agency', 'priority', 'partner', 'past-client'];
const STAGES = ['lead', 'qualified', 'proposal', 'won', 'lost'];

const BASE = Date.parse('2026-01-01T00:00:00Z');
const timestamp = (days) => new Date(BASE + days * 86_400_000 + int(0, 86_399) * 1000).toISOString().replace('.000', '');
const date = (days) => new Date(BASE + days * 86_400_000).toISOString().slice(0, 10);
const tags = () => Array.from(new Set(Array.from({ length: int(0, 2) }, () => pick(TAGS))));
function prose(minChars, maxChars) {
  const target = Math.round(minChars + (maxChars - minChars) * random() ** 2);
  const words = [];
  while (words.join(' ').length < target) words.push(pick(WORDS));
  const text = words.join(' ');
  return text[0].toUpperCase() + text.slice(1) + '.';
}
function stamps() {
  const created = int(0, 290);
  return { createdAt: timestamp(created), updatedAt: timestamp(created + int(0, 10)), archivedAt: random() < 0.05 ? timestamp(created + 12) : null };
}

const n = {
  companies: Math.round(count * 0.1),
  contacts: Math.round(count * 0.25),
  opportunities: Math.round(count * 0.1),
  tasks: Math.round(count * 0.15),
};
n.activities = count - n.companies - n.contacts - n.opportunities - n.tasks;

const companies = Array.from({ length: n.companies }, () => {
  const name = `${pick(LAST)} ${pick(ORG)}`;
  return { schemaVersion: 1, type: 'company', id: uuid(), name, website: `https://${name.toLowerCase().replace(/\s+/g, '')}.example`, tags: tags(), ...stamps() };
});
const contacts = Array.from({ length: n.contacts }, () => {
  const first = pick(FIRST);
  const last = pick(LAST);
  return {
    schemaVersion: 1, type: 'contact', id: uuid(), name: `${first} ${last}`,
    emails: [`${first}.${last}@example.test`.toLowerCase()],
    phones: random() < 0.5 ? [`+1-555-${String(int(0, 9999)).padStart(4, '0')}`] : [],
    companyId: companies.length && random() < 0.8 ? pick(companies).id : null,
    tags: tags(), ...stamps(),
  };
});
const opportunities = Array.from({ length: n.opportunities }, () => ({
  schemaVersion: 1, type: 'opportunity', id: uuid(), title: `${pick(WORDS)} ${pick(WORDS)} project`,
  stageId: pick(STAGES), companyId: companies.length ? pick(companies).id : null,
  contactIds: contacts.length ? [pick(contacts).id] : [],
  valueMinor: int(5, 500) * 10_000, currency: 'USD', expectedCloseDate: date(int(30, 400)), ...stamps(),
}));
const relatable = [
  ...contacts.map((r) => ({ type: 'contact', id: r.id })),
  ...companies.map((r) => ({ type: 'company', id: r.id })),
  ...opportunities.map((r) => ({ type: 'opportunity', id: r.id })),
];
const related = () => (relatable.length && random() < 0.9 ? pick(relatable) : null);
const tasks = Array.from({ length: n.tasks }, () => {
  const due = int(0, 330);
  return {
    schemaVersion: 1, type: 'task', id: uuid(), title: `Follow up on ${pick(WORDS)}`,
    description: random() < 0.6 ? prose(20, 300) : '', dueDate: date(due),
    completedAt: random() < 0.4 ? timestamp(due) : null, related: related(), ...stamps(),
  };
});
const activities = Array.from({ length: n.activities }, () => {
  const s = stamps();
  return {
    schemaVersion: 1, type: 'activity', id: uuid(), kind: pick(['note', 'note', 'call', 'meeting', 'email_manual']),
    body: prose(100, 1500), occurredAt: s.createdAt, related: related(), ...s,
  };
});

function write(path, value) {
  const full = join(outDir, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, JSON.stringify(value, null, 2) + '\n');
}

write('.gitcrm/workspace.json', {
  schemaVersion: 1, workspaceId: uuid(), name: `Benchmark ${count}`, defaultCurrency: 'USD',
  pipelineStages: STAGES.map((id, position) => ({ id, label: id[0].toUpperCase() + id.slice(1), position })),
});
for (const [plural, records] of Object.entries({ companies, contacts, opportunities, tasks, activities })) {
  for (const record of records) write(`data/${plural}/${record.id.slice(0, 2)}/${record.id}.json`, record);
}
console.log(JSON.stringify({ count, ...n }));
