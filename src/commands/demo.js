import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { audit } from './audit.js';

const FIXTURE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'demo');
// Pinned so output never drifts as real-world "today" passes the fixture's validity windows.
const DEMO_REF_DATE = '2026-07-18';

/**
 * `citable demo` — run the full detector engine against a bundled, frozen,
 * offline example site. Never fetches the network. Never scores the caller's
 * own project or a real named company — the fixture is synthetic
 * (`https://example.test`, RFC 2606 reserved, non-resolvable).
 */
export async function demo() {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-demo-'));
  try {
    fs.cpSync(FIXTURE_ROOT, workDir, { recursive: true });
    const r = await audit(workDir, {
      target: path.join(workDir, 'site'),
      baseUrl: 'https://example.test',
      refDate: DEMO_REF_DATE,
    });
    return {
      runId: r.runId,
      summary: r.summary,
      manifest: r.manifest,
      report: r.report,
      fixture: 'bundled synthetic example site — offline, not fetched, not a real company',
    };
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}
