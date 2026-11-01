// Runs the S-02 checks from Node 18+. The token comes from the environment and is never printed.
//   GITCRM_SPIKE_TOKEN=... node spikes/run-node.js owner/gitcrm-spike
import { runChecks } from './p0-crud.js';

const token = process.env.GITCRM_SPIKE_TOKEN;
if (!token) {
  console.error('Set GITCRM_SPIKE_TOKEN.');
  process.exit(2);
}
const [owner, repo] = (process.argv[2] ?? '').split('/');

const results = [];
function record(name, ok, detail = '', ms = 0) {
  results.push({ name, ok, detail, ms });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ms ? ` (${ms} ms)` : ''}${detail ? ` - ${detail}` : ''}`);
}

try {
  await runChecks({ token, owner, repo, record });
} catch (error) {
  record('Unexpected error', false, String(error));
}
console.log(`\nResults JSON (safe to share; it contains no token):\n${JSON.stringify({ spike: 'S-02', runner: `node ${process.version}`, when: new Date().toISOString(), results }, null, 2)}`);
process.exitCode = results.every((r) => r.ok) ? 0 : 1;
