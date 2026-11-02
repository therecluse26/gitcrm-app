// A small square before a stage's name, in the stage's colour (spec 12). The name always shows
// next to it, so colour is never the only cue (docs/08).
import { stageTone, type Stage, type StageTone } from '@/core/stages.ts';

const TONES: Record<StageTone, string> = {
  1: 'bg-stage-1',
  2: 'bg-stage-2',
  3: 'bg-stage-3',
  4: 'bg-stage-4',
  won: 'bg-stage-won',
  lost: 'bg-stage-lost',
  unknown: 'border border-muted-foreground',
};

export function StageMark({ stages, id }: { stages: Stage[]; id: string }) {
  return <span data-slot="stage-mark" aria-hidden className={`inline-block size-2 shrink-0 rounded-[2px] ${TONES[stageTone(stages, id)]}`} />;
}
