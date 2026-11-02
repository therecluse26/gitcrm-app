import { describe, expect, it } from 'vitest';
import { addStage, moveStage, removeStage, renameStage, sortStages, stageIdFor, stageLabelErrors, stageTone, type Stage } from './stages.ts';
import { newWorkspaceConfig } from './workspace.ts';

const defaults = newWorkspaceConfig({ name: 'W', defaultCurrency: 'USD' }).pipelineStages;
const ids = (stages: Stage[]) => stages.map((s) => s.id);
const positions = (stages: Stage[]) => stages.map((s) => s.position);

describe('sortStages', () => {
  it('orders by position and numbers the positions from 0', () => {
    const shuffled = [
      { id: 'won', label: 'Won', position: 7 },
      { id: 'lead', label: 'Lead', position: 2 },
      { id: 'lost', label: 'Lost', position: 9 },
    ];
    expect(sortStages(shuffled)).toEqual([
      { id: 'lead', label: 'Lead', position: 0 },
      { id: 'won', label: 'Won', position: 1 },
      { id: 'lost', label: 'Lost', position: 2 },
    ]);
  });
});

describe('stageIdFor', () => {
  it('makes a lowercase ID from the label', () => {
    expect(stageIdFor('Quote sent', new Set())).toBe('quote-sent');
    expect(stageIdFor('  Négociation / Legal!  ', new Set())).toBe('negociation-legal');
  });

  it('adds a number when the ID is taken', () => {
    expect(stageIdFor('Proposal', new Set(['proposal']))).toBe('proposal-2');
    expect(stageIdFor('Proposal', new Set(['proposal', 'proposal-2']))).toBe('proposal-3');
  });

  it('falls back to "stage" when no letter or digit is left', () => {
    expect(stageIdFor('💰', new Set())).toBe('stage');
    expect(stageIdFor('交渉', new Set(['stage']))).toBe('stage-2');
  });

  it('keeps the ID within the 64-character limit, with room for a number', () => {
    const id = stageIdFor('a'.repeat(100), new Set(['a'.repeat(56)]));
    expect(id).toBe(`${'a'.repeat(56)}-2`);
    expect(id.length).toBeLessThanOrEqual(64);
  });
});

describe('stage edits', () => {
  it('adds a stage before Won', () => {
    const added = addStage(defaults, 'Negotiation');
    expect(ids(added)).toEqual(['lead', 'qualified', 'proposal', 'negotiation', 'won', 'lost']);
    expect(positions(added)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(added[3]).toEqual({ id: 'negotiation', label: 'Negotiation', position: 3 });
  });

  it('renames a stage and keeps its ID', () => {
    expect(renameStage(defaults, 'proposal', 'Quote sent').find((s) => s.id === 'proposal')?.label).toBe('Quote sent');
  });

  it('moves a stage up or down, and not past either end', () => {
    expect(ids(moveStage(defaults, 'qualified', -1))).toEqual(['qualified', 'lead', 'proposal', 'won', 'lost']);
    expect(ids(moveStage(defaults, 'lost', 1))).toEqual(ids(defaults));
    expect(ids(moveStage(defaults, 'lead', -1))).toEqual(ids(defaults));
    expect(positions(moveStage(defaults, 'won', 1))).toEqual([0, 1, 2, 3, 4]);
  });

  it('removes a stage, but never Won or Lost (ADR-019)', () => {
    expect(ids(removeStage(defaults, 'qualified'))).toEqual(['lead', 'proposal', 'won', 'lost']);
    expect(positions(removeStage(defaults, 'qualified'))).toEqual([0, 1, 2, 3]);
    expect(() => removeStage(defaults, 'won')).toThrow();
    expect(() => removeStage(defaults, 'lost')).toThrow();
  });
});

describe('stageLabelErrors', () => {
  it('needs a name for every stage', () => {
    expect(stageLabelErrors(renameStage(defaults, 'lead', '  '))).toEqual({ lead: 'Enter a stage name.' });
  });

  it('refuses two stages with the same name, ignoring case', () => {
    expect(stageLabelErrors(renameStage(defaults, 'qualified', ' proposal'))).toEqual({
      qualified: 'Another stage is also called "proposal".',
      proposal: 'Another stage is also called "Proposal".',
    });
  });

  it('accepts the defaults', () => {
    expect(stageLabelErrors(defaults)).toEqual({});
  });
});

describe('stageTone', () => {
  it('gives open stages tones 1 to 4 in pipeline order, then starts again', () => {
    const stages = [...'abcdef'].map((id, position) => ({ id, label: id, position })).concat([{ id: 'won', label: 'Won', position: 6 }, { id: 'lost', label: 'Lost', position: 7 }]);
    expect(stages.map((s) => stageTone(stages, s.id))).toEqual([1, 2, 3, 4, 1, 2, 'won', 'lost']);
  });

  it('follows the position, not the order of the list', () => {
    const stages = [
      { id: 'proposal', label: 'Proposal', position: 2 },
      { id: 'lead', label: 'Lead', position: 0 },
      { id: 'qualified', label: 'Qualified', position: 1 },
    ];
    expect(['lead', 'qualified', 'proposal'].map((id) => stageTone(stages, id))).toEqual([1, 2, 3]);
  });

  it('marks a stage that the settings do not have as unknown', () => {
    expect(stageTone(defaults, 'gone')).toBe('unknown');
  });
});
