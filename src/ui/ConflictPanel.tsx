// Someone else saved the record first (spec 07, "Conflict UI requirements"): compare, then
// Retry after review, Copy mine, or Discard mine. Nothing is saved until the user chooses.
import { useEffect, useRef, useState } from 'react';
import { selectCanWrite, useApp } from '@/app/store.ts';
import { Button } from '@/components/ui/button';

// A list value, such as email addresses, shows one item per line.
export type ConflictRowView = { label: string; remote: string | string[]; mine: string | string[]; changedByMe: boolean };

function Value({ value }: { value: string | string[] }) {
  if (!Array.isArray(value)) return value;
  return value.length === 0 ? 'None' : value.map((item) => <span key={item} className="block break-all">{item}</span>);
}

export function ConflictPanel({
  noun,
  rows,
  remoteDeleted,
  copyText,
  onRetry,
  onDiscard,
}: {
  noun: string;
  rows: ConflictRowView[];
  remoteDeleted: boolean;
  copyText: string;
  onRetry: () => void;
  onDiscard: () => void;
}) {
  const canWrite = useApp(selectCanWrite); // false while GitCRM loads the newer version
  const heading = useRef<HTMLHeadingElement>(null);
  const [copied, setCopied] = useState<'yes' | 'blocked' | null>(null);
  useEffect(() => heading.current?.focus(), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(copyText);
      setCopied('yes');
    } catch {
      setCopied('blocked');
    }
  }

  return (
    <section aria-labelledby="conflict-heading" className="flex flex-col gap-3 rounded-lg border border-destructive/50 p-4">
      <h2 id="conflict-heading" ref={heading} tabIndex={-1} className="font-semibold outline-none">
        {remoteDeleted ? `Someone deleted this ${noun} on GitHub` : `Someone else changed this ${noun}`}
      </h2>
      <p className="text-sm">
        {remoteDeleted
          ? 'Your changes are not saved. Copy them before you leave this page.'
          : 'Your changes are not saved yet. Compare them with the version on GitHub now.'}
      </p>
      {!remoteDeleted && (
        <>
          <table className="w-full table-fixed text-left text-sm">
            <thead className="text-muted-foreground">
              <tr>
                <th scope="col" className="pb-1 font-medium">Field</th>
                <th scope="col" className="pb-1 font-medium">On GitHub now</th>
                <th scope="col" className="pb-1 font-medium">Your change</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label} className="border-t align-top">
                  <th scope="row" className="py-1 pr-2 font-medium">{row.label}</th>
                  <td className="py-1 pr-2 break-words">
                    <Value value={row.remote} />
                  </td>
                  <td className="py-1 break-words">{row.changedByMe ? <Value value={row.mine} /> : 'Not changed'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-sm text-muted-foreground">Retry keeps the other changes on GitHub and saves your changes on top of them.</p>
        </>
      )}
      <div className="flex flex-wrap gap-2">
        {!remoteDeleted && <Button type="button" disabled={!canWrite} onClick={onRetry}>Retry after review</Button>}
        <Button type="button" variant="outline" onClick={() => void copy()}>Copy mine</Button>
        <Button type="button" variant="ghost" onClick={onDiscard}>Discard mine</Button>
      </div>
      {copied && (
        <p role="status" className="text-sm">
          {copied === 'yes' ? 'Your changes are copied.' : 'This browser blocked copying. Select the form text and copy it.'}
        </p>
      )}
    </section>
  );
}
