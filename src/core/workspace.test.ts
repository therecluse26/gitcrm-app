import { describe, expect, it } from 'vitest';
import { serializeWorkspace } from './record-file.ts';
import type { WorkspaceConfig } from './schemas.ts';
import { newWorkspaceConfig, saveBase } from './workspace.ts';

describe('newWorkspaceConfig', () => {
  it('uses the default pipeline: Lead, Qualified, Proposal, Won, Lost', () => {
    const id = 'f81d4fae-7dec-4c1d-ae0c-0d04ef1a7291';
    expect(newWorkspaceConfig({ name: 'Example Studio', defaultCurrency: 'USD' }, { id })).toEqual({
      schemaVersion: 1,
      workspaceId: id,
      name: 'Example Studio',
      defaultCurrency: 'USD',
      pipelineStages: [
        { id: 'lead', label: 'Lead', position: 0 },
        { id: 'qualified', label: 'Qualified', position: 1 },
        { id: 'proposal', label: 'Proposal', position: 2 },
        { id: 'won', label: 'Won', position: 3 },
        { id: 'lost', label: 'Lost', position: 4 },
      ],
    });
  });

  it('creates a valid config with a random workspace ID', () => {
    const config = newWorkspaceConfig({ name: 'Example Studio', defaultCurrency: 'EUR' });
    expect(() => serializeWorkspace(config)).not.toThrow();
    expect(config.workspaceId).not.toBe(newWorkspaceConfig({ name: 'x', defaultCurrency: 'EUR' }).workspaceId);
  });

  it('refuses a blank name or a malformed currency', () => {
    expect(() => newWorkspaceConfig({ name: ' ', defaultCurrency: 'USD' })).toThrow();
    expect(() => newWorkspaceConfig({ name: 'Studio', defaultCurrency: 'usd' })).toThrow();
  });
});

describe('saveBase', () => {
  const config = newWorkspaceConfig({ name: 'Example Studio', defaultCurrency: 'USD' });
  const first = { config, blobSha: 'a' };
  // The stage card saved first: the latest file has a new stage name.
  const latest = { config: { ...config, pipelineStages: config.pipelineStages.map((s) => (s.id === 'lead' ? { ...s, label: 'New lead' } : s)) }, blobSha: 'b' };
  const stages = (c: WorkspaceConfig) => c.pipelineStages;
  const fields = (c: WorkspaceConfig) => c.customFields;

  it("saves against the latest file when the card's own part is the same there", () => {
    expect(saveBase(first, latest, fields)).toBe(latest);
    expect(saveBase(first, first, stages)).toBe(first);
  });

  it('saves against the first file when its own part changed, so GitHub refuses the old blob SHA', () => {
    expect(saveBase(first, latest, stages)).toBe(first);
    expect(saveBase(first, null, fields)).toBe(first);
  });
});
