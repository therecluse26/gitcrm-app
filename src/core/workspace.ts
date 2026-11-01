// The workspace config that Initialize writes (docs/02-DATA-MODEL.md), and the file a Settings
// card saves against.
import { workspaceSchema, type WorkspaceConfig } from './schemas.ts';

const DEFAULT_STAGES = ['Lead', 'Qualified', 'Proposal', 'Won', 'Lost'];

export function newWorkspaceConfig(
  { name, defaultCurrency }: { name: string; defaultCurrency: string },
  { id = crypto.randomUUID() }: { id?: string } = {},
): WorkspaceConfig {
  return workspaceSchema.parse({
    schemaVersion: 1,
    workspaceId: id,
    name,
    defaultCurrency,
    pipelineStages: DEFAULT_STAGES.map((label, position) => ({ id: label.toLowerCase(), label, position })),
  });
}

// Two Settings cards save .gitcrm/workspace.json (spec 10, "Error handling"). `part` is the part a
// card owns. When that part is the same in the latest loaded file as in `first`, the file its
// draft began from, the card saves against the latest file, so another card's save stays.
// Otherwise it saves against `first`, and GitHub refuses the old blob SHA as a conflict.
export function saveBase<W extends { config: WorkspaceConfig }>(first: W, latest: W | null | undefined, part: (config: WorkspaceConfig) => unknown): W {
  return latest && JSON.stringify(part(latest.config)) === JSON.stringify(part(first.config)) ? latest : first;
}
