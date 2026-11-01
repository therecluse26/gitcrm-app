import { describe, expect, it } from 'vitest';
import { newRecord } from '@/core/records.ts';
import type { Opportunity } from '@/core/schemas.ts';
import { newWorkspaceConfig } from '@/core/workspace.ts';
import { pipelineColumns, stageName } from './pipeline.ts';

const stages = newWorkspaceConfig({ name: 'W', defaultCurrency: 'USD' }).pipelineStages;
const now = new Date('2026-10-29T12:00:00Z');

function deal(title: string, stageId: string, changes: Partial<Opportunity> = {}): Opportunity {
  return { ...newRecord('opportunity', { title, stageId, companyId: null, contactIds: [], valueMinor: null, currency: 'USD', expectedCloseDate: null }, { now }), ...changes };
}

const titles = (result: ReturnType<typeof pipelineColumns>) => result.columns.map((c) => [c.stage?.id ?? null, c.opportunities.map((o) => o.title)]);
const all = { openOnly: false, showArchived: false };

describe('pipelineColumns', () => {
  it('makes one column per stage, in stage order, Won and Lost too', () => {
    const result = pipelineColumns([deal('Audit', 'won'), deal('Website rebuild', 'proposal')], stages, all);
    expect(titles(result)).toEqual([
      ['lead', []],
      ['qualified', []],
      ['proposal', ['Website rebuild']],
      ['won', ['Audit']],
      ['lost', []],
    ]);
  });

  it('leaves out Won and Lost with "Open only"', () => {
    const result = pipelineColumns([deal('Audit', 'won'), deal('Logo', 'lost'), deal('Website rebuild', 'lead')], stages, { ...all, openOnly: true });
    expect(titles(result).map(([id]) => id)).toEqual(['lead', 'qualified', 'proposal']);
  });

  it('hides archived opportunities unless asked, and counts them', () => {
    const archived = deal('Old deal', 'lead', { archivedAt: '2026-10-29T12:00:00Z' });
    expect(pipelineColumns([archived, deal('New deal', 'lead')], stages, all)).toMatchObject({ hiddenArchived: 1, shown: 1 });
    expect(titles(pipelineColumns([archived], stages, { ...all, showArchived: true }))[0]).toEqual(['lead', ['Old deal']]);
  });

  it('puts an opportunity with an unknown stage in a last column', () => {
    const result = pipelineColumns([deal('Lost track', 'negotiation')], stages, { ...all, openOnly: true });
    expect(titles(result).at(-1)).toEqual([null, ['Lost track']]);
    expect(titles(pipelineColumns([], stages, all)).at(-1)?.[0]).toBe('lost');
  });

  it('sorts a column by expected close date, then title; no date comes last', () => {
    const result = pipelineColumns(
      [deal('B', 'lead'), deal('C', 'lead', { expectedCloseDate: '2026-12-01' }), deal('A', 'lead'), deal('D', 'lead', { expectedCloseDate: '2026-11-01' })],
      stages,
      all,
    );
    expect(titles(result)[0]).toEqual(['lead', ['D', 'C', 'A', 'B']]);
  });
});

describe('stageName', () => {
  it('names a stage, or says it is unknown', () => {
    expect(stageName(stages, 'proposal')).toBe('Proposal');
    expect(stageName(stages, 'negotiation')).toBe('Unknown stage (negotiation)');
  });
});
