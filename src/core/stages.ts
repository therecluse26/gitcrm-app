// Pipeline stage edits (ADR-019): rename, reorder, add, and remove. Stage IDs never change, and
// the terminal stages won and lost always exist. Each edit returns the stages in order, with
// positions 0, 1, 2, and so on.
import type { WorkspaceConfig } from './schemas.ts';

export type Stage = WorkspaceConfig['pipelineStages'][number];

export const isTerminal = (id: string) => id === 'won' || id === 'lost';

const renumber = (stages: Stage[]) => stages.map((stage, position) => ({ ...stage, position }));

export function sortStages(stages: Stage[]): Stage[] {
  return renumber(stages.toSorted((a, b) => a.position - b.position));
}

export type StageTone = 1 | 2 | 3 | 4 | 'won' | 'lost' | 'unknown';

// The colour of a stage's mark (spec 12): open stages take tones 1 to 4 in pipeline order, then
// start again.
export function stageTone(stages: Stage[], id: string): StageTone {
  if (id === 'won' || id === 'lost') return id;
  const index = sortStages(stages).filter((s) => !isTerminal(s.id)).findIndex((s) => s.id === id);
  return index === -1 ? 'unknown' : ((index % 4) + 1) as StageTone;
}

// "Quote sent" -> "quote-sent", or "quote-sent-2" when that is taken (docs/02). Stage, custom
// field, and option IDs all come from here. The base stops at 56 characters, so a number still
// fits in the 64-character limit.
export function idFor(label: string, taken: ReadonlySet<string>, fallback: string): string {
  const slug = label
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 56)
    .replace(/^-+|-+$/g, '');
  const base = slug || fallback;
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}

export const stageIdFor = (label: string, taken: ReadonlySet<string>) => idFor(label, taken, 'stage');

// A new stage goes before the first terminal stage.
export function addStage(stages: Stage[], label: string): Stage[] {
  const ordered = sortStages(stages);
  const id = stageIdFor(label, new Set(ordered.map((s) => s.id)));
  const at = ordered.findIndex((s) => isTerminal(s.id));
  return renumber(ordered.toSpliced(at === -1 ? ordered.length : at, 0, { id, label: label.trim(), position: 0 }));
}

export function renameStage(stages: Stage[], id: string, label: string): Stage[] {
  return sortStages(stages).map((stage) => (stage.id === id ? { ...stage, label } : stage));
}

export function moveStage(stages: Stage[], id: string, offset: -1 | 1): Stage[] {
  const ordered = sortStages(stages);
  const from = ordered.findIndex((s) => s.id === id);
  const to = from + offset;
  if (from === -1 || to < 0 || to >= ordered.length) return ordered;
  return renumber(ordered.with(from, ordered[to]).with(to, ordered[from]));
}

// The caller checks first that no opportunity uses the stage.
export function removeStage(stages: Stage[], id: string): Stage[] {
  if (isTerminal(id)) throw new Error(`The ${id} stage always exists`);
  return renumber(sortStages(stages).filter((s) => s.id !== id));
}

// Errors by stage ID: a blank name, or a name that another stage has too (both get the error).
export function stageLabelErrors(stages: Stage[]): Record<string, string> {
  const errors: Record<string, string> = {};
  const key = (label: string) => label.trim().toLowerCase();
  const count = new Map<string, number>();
  for (const { label } of stages) count.set(key(label), (count.get(key(label)) ?? 0) + 1);
  for (const { id, label } of stages) {
    if (!label.trim()) errors[id] = 'Enter a stage name.';
    else if (count.get(key(label))! > 1) errors[id] = `Another stage is also called "${label.trim()}".`;
  }
  return errors;
}
