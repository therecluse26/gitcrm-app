// The Export card in Settings (spec 05): the JSON snapshot and the CSV files, built in this browser.
// Export waits for a complete, current snapshot.
import { useState } from 'react';
import { useApp } from '@/app/store.ts';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { buildExport, exportProblem, type ExportKind } from '@/core/export.ts';

// The browser reads the file after the click, so the URL stays for a while (FileSaver.js waits 40 s).
function save(name: string, bytes: Uint8Array<ArrayBuffer>) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/zip' }));
  Object.assign(document.createElement('a'), { href: url, download: name }).click();
  setTimeout(() => URL.revokeObjectURL(url), 40_000);
}

export function ExportCard() {
  const snapshot = useApp((s) => s.snapshot);
  const files = useApp((s) => s.files);
  const sync = useApp((s) => s.sync);
  const repoName = useApp((s) => s.repoName);
  const branch = useApp((s) => s.session?.branch);
  const [failure, setFailure] = useState<string | null>(null);

  const problem =
    'message' in sync
      ? 'GitCRM could not check GitHub, so these records may be out of date. Refresh, then export.'
      : sync.status !== 'loaded' || !snapshot?.workspace || !files || !branch
        ? 'You can export when GitCRM finishes loading the records.'
        : exportProblem(snapshot.issues);

  function run(kind: ExportKind) {
    if (problem || !snapshot?.workspace || !files || !branch) return;
    setFailure(null);
    try {
      const texts = [...files.files].map(([path, file]): [string, string] => {
        // Only a file with an issue has no text, and an issue blocks the export.
        if (file.text === null) throw new Error(`${path} has no text`);
        return [path, file.text];
      });
      const source = { repository: repoName, branch, commitSha: snapshot.commitSha, config: snapshot.workspace.config, records: snapshot.records.map((saved) => saved.record), files: texts };
      const { name, bytes } = buildExport(kind, source, new Date());
      save(name, bytes);
    } catch (error) {
      setFailure(`GitCRM could not build the export: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Export</h2>
        </CardTitle>
        <CardDescription>Download a copy of every record, archived records too. GitCRM builds the file in this browser and sends it to no server.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <ul className="flex list-disc flex-col gap-1 pl-5">
          <li>
            JSON snapshot: the workspace file and every record file, with the same text as on GitHub. It is a copy of the branch, not its history. To keep the history, clone the repository.
          </li>
          <li>CSV: one file for each record type, for spreadsheets and other CRMs.</li>
        </ul>
        <p>Each ZIP file holds DATA-DICTIONARY.md, which explains every field and column.</p>
        <div className="flex flex-wrap gap-2">
          <Button disabled={problem !== null} onClick={() => run('snapshot')}>
            Export JSON snapshot
          </Button>
          <Button variant="outline" disabled={problem !== null} onClick={() => run('csv')}>
            Export CSV
          </Button>
        </div>
        {problem && <p className="text-muted-foreground wrap-anywhere">{problem}</p>}
        {failure && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{failure}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
