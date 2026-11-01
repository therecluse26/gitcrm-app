// The pipeline stage editor in Settings (ADR-019): rename, reorder, add, and remove when unused.
// Edits stay in a draft until "Save stages" writes .gitcrm/workspace.json in one commit.
import { useBlocker } from '@tanstack/react-router';
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { selectCanWrite, selectReadOnly, useApp } from '@/app/store.ts';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { addStage, isTerminal, moveStage, removeStage, renameStage, sortStages, stageLabelErrors, type Stage } from '@/core/stages.ts';
import { saveBase } from '@/core/workspace.ts';
import { stateForError, type OperationState } from '@/storage/operation-state.ts';
import type { WorkspaceSnapshot } from '@/storage/workspace-repository.ts';
import { TextField } from '@/ui/form-fields.tsx';
import { useFocusFirstError } from '@/ui/use-focus-first-error.ts';
import { useRecords, useStages } from '../records.ts';

type Workspace = NonNullable<WorkspaceSnapshot['workspace']>;

export function StageEditor() {
  const workspace = useApp((s) => s.snapshot?.workspace);
  const latest = useStages();
  const readOnly = useApp(selectReadOnly);
  const canWrite = useApp(selectCanWrite);
  const opportunities = useRecords('opportunity');
  // null until the first edit; until then the editor shows the latest stages.
  const [draft, setDraft] = useState<{ base: Workspace; stages: Stage[] } | null>(null);
  const [newLabel, setNewLabel] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [blocked, setBlocked] = useState<string | null>(null);
  const [state, setState] = useState<OperationState>({ status: 'idle' });
  const form = useFocusFirstError(errors);
  const stages = draft?.stages ?? latest;
  const dirty = draft !== null && JSON.stringify(draft.stages) !== JSON.stringify(sortStages(draft.base.config.pipelineStages));
  const saving = state.status === 'saving';
  const conflict = state.status === 'conflict';

  useBlocker({ shouldBlockFn: () => !window.confirm('Leave this page? Your unsaved stage changes will be lost.'), enableBeforeUnload: true, disabled: !dirty });

  if (!workspace) return null;
  const edit = (next: Stage[]) => {
    setDraft({ base: draft?.base ?? workspace, stages: next });
    setBlocked(null);
    if (state.status !== 'idle') setState({ status: 'idle' });
  };

  function remove(stage: Stage) {
    const using = opportunities.filter((o) => o.record.stageId === stage.id);
    if (using.length === 0) return edit(removeStage(stages, stage.id));
    const archived = using.filter((o) => o.record.archivedAt !== null).length;
    const count = using.length === 1 ? '1 opportunity' : `${using.length} opportunities`;
    setBlocked(
      `${stage.label} has ${count}${archived > 0 ? `, ${archived} of them archived` : ''}, so it cannot be removed. Move ${using.length === 1 ? 'it' : 'them'} to another stage first.`,
    );
  }

  function add() {
    const label = newLabel.trim();
    const taken = stages.find((s) => s.label.trim().toLowerCase() === label.toLowerCase());
    if (!label || taken) return setErrors({ new: label ? `Another stage is already called "${taken!.label.trim()}".` : 'Enter a stage name.' });
    setErrors({});
    setNewLabel('');
    edit(addStage(stages, label));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft || !dirty) return;
    const found = stageLabelErrors(draft.stages);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setState({ status: 'saving' });
    try {
      const pipelineStages = draft.stages.map((s) => ({ ...s, label: s.label.trim() }));
      const target = saveBase(draft.base, workspace, (config) => config.pipelineStages);
      await useApp.getState().saveWorkspace({ ...target.config, pipelineStages }, target.blobSha);
      setDraft(null);
      setState({ status: 'idle' });
    } catch (error) {
      setState(stateForError(error));
    }
  }

  function loadLatest() {
    setDraft(null);
    setErrors({});
    setState({ status: 'idle' });
  }

  const nameOf = (stage: Stage) => stage.label.trim() || stage.id;
  const failure = 'message' in state && !conflict ? state.message : null;

  return (
    <section aria-labelledby="pipeline-stages-heading">
      <Card>
        <CardHeader>
          <CardTitle>
            <h2 id="pipeline-stages-heading">Pipeline stages</h2>
          </CardTitle>
          <CardDescription>Renaming or moving a stage changes only the workspace settings file. Won and Lost always stay.</CardDescription>
        </CardHeader>
        <CardContent>
          {readOnly ? (
            <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm">
              {stages.map((stage) => (
                <li key={stage.id}>{stage.label}</li>
              ))}
            </ol>
          ) : (
            <form ref={form} onSubmit={(e) => void save(e)} noValidate className="flex max-w-xl flex-col gap-4">
              <fieldset disabled={saving || conflict} className="flex flex-col gap-4">
                <ol aria-label="Stages" className="flex flex-col gap-2">
                  {stages.map((stage, i) => (
                    <li key={stage.id} className="flex flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-1">
                        <Input
                          aria-label={`Name of stage ${i + 1}`}
                          aria-invalid={Boolean(errors[stage.id])}
                          aria-describedby={errors[stage.id] ? `stage-${stage.id}-error` : undefined}
                          className="w-auto min-w-0 flex-1 basis-40"
                          value={stage.label}
                          onChange={(e) => edit(renameStage(stages, stage.id, e.target.value))}
                        />
                        <Button type="button" variant="ghost" size="icon" aria-label={`Move ${nameOf(stage)} up`} disabled={i === 0} onClick={() => edit(moveStage(stages, stage.id, -1))}>
                          <ArrowUp aria-hidden />
                        </Button>
                        <Button type="button" variant="ghost" size="icon" aria-label={`Move ${nameOf(stage)} down`} disabled={i === stages.length - 1} onClick={() => edit(moveStage(stages, stage.id, 1))}>
                          <ArrowDown aria-hidden />
                        </Button>
                        {isTerminal(stage.id) ? (
                          <span className="w-8 text-center text-xs text-muted-foreground" title="Won and Lost always stay">
                            <span aria-hidden>—</span>
                            <span className="sr-only">{nameOf(stage)} always stays</span>
                          </span>
                        ) : (
                          <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${nameOf(stage)}`} onClick={() => remove(stage)}>
                            <X aria-hidden />
                          </Button>
                        )}
                      </div>
                      {errors[stage.id] && <p id={`stage-${stage.id}-error`} className="text-sm text-destructive">{errors[stage.id]}</p>}
                    </li>
                  ))}
                </ol>
                {blocked && <p role="alert" className="text-sm">{blocked}</p>}
                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-48 flex-1">
                    <TextField
                      id="new-stage"
                      label="New stage name"
                      autoComplete="off"
                      value={newLabel}
                      error={errors.new}
                      onChange={(e) => setNewLabel(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key !== 'Enter') return;
                        e.preventDefault();
                        add();
                      }}
                    />
                  </div>
                  <Button type="button" variant="outline" onClick={add}>
                    <Plus aria-hidden />
                    Add stage
                  </Button>
                </div>
              </fieldset>
              {failure && (
                <Alert variant="destructive" role="alert">
                  <AlertDescription>{failure} Your stage changes are still here.</AlertDescription>
                </Alert>
              )}
              {conflict && (
                <Alert role="alert">
                  <AlertDescription className="flex flex-col items-start gap-2">
                    Someone else changed the workspace settings, so your stage changes were not saved. Load the latest stages, then make your changes again.
                    <Button type="button" variant="outline" size="sm" onClick={loadLatest}>Load the latest stages</Button>
                  </AlertDescription>
                </Alert>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" disabled={!dirty || !canWrite || conflict}>{saving ? 'Saving…' : 'Save stages'}</Button>
                {dirty && !saving && !conflict && (
                  <Button type="button" variant="ghost" onClick={loadLatest}>Discard changes</Button>
                )}
                {dirty && <span className="text-sm text-muted-foreground">Unsaved changes</span>}
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
