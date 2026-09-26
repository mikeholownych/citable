import fs from 'node:fs';
import path from 'node:path';
import { readJson, writeJson, nowIso } from '../shared/io.js';

export const FINDINGS_INDEX_FILE = 'findings-index.json';

export function classifyPersistence(occurrenceCount) {
  if (occurrenceCount >= 3) return 'PERSISTENT';
  if (occurrenceCount === 2) return 'RECURRENT';
  return 'TRANSIENT';
}

export function findingsIndexPath(root) {
  return path.join(root, '.citable', FINDINGS_INDEX_FILE);
}

export function loadFindingsIndex(root) {
  const filePath = findingsIndexPath(root);
  if (fs.existsSync(filePath)) {
    try {
      const data = readJson(filePath);
      if (data && typeof data === 'object' && data.findings && typeof data.findings === 'object') {
        return data;
      }
    } catch {
      // Degrade gracefully if corrupted or unparseable
    }
  }
  return { version: 1, updated_at: null, findings: {} };
}

export function saveFindingsIndex(root, index) {
  const dir = path.join(root, '.citable');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  writeJson(findingsIndexPath(root), index);
}

export function getFindingIdentity(root, findingId) {
  const index = loadFindingsIndex(root);
  return index.findings[findingId] || null;
}

/**
 * Reconcile finding identity across runs:
 * - first_seen reflects the earliest run that observed the finding
 * - occurrence_count tracks total observed runs
 * - persistence is classified as TRANSIENT (1), RECURRENT (2), or PERSISTENT (>=3)
 * Persists index to .citable/findings-index.json so history is derivable without
 * re-reading every run directory.
 */
export function reconcileFindingIdentities(root, findings, { runId, timestamp = nowIso() } = {}) {
  const index = loadFindingsIndex(root);

  for (const f of findings) {
    if (!f.finding_id) continue;
    const existing = index.findings[f.finding_id];

    let firstSeen = timestamp;
    let occurrenceCount = 1;
    let firstRunId = runId ?? null;

    if (existing) {
      firstSeen = existing.first_seen || timestamp;
      occurrenceCount = (Number.isInteger(existing.occurrence_count) && existing.occurrence_count > 0 ? existing.occurrence_count : 1) + 1;
      firstRunId = existing.first_run_id || existing.first_run || firstRunId;
    } else if (f.status?.first_seen && f.status.first_seen !== f.timestamp) {
      firstSeen = f.status.first_seen;
    }

    const persistence = classifyPersistence(occurrenceCount);

    f.status = {
      ...(f.status || { state: 'open', resolved_at: null }),
      first_seen: firstSeen,
      last_seen: timestamp,
      occurrence_count: occurrenceCount,
      persistence,
    };

    index.findings[f.finding_id] = {
      finding_id: f.finding_id,
      detector_id: f.detector_id,
      first_seen: firstSeen,
      last_seen: timestamp,
      first_run_id: firstRunId,
      last_run_id: runId ?? null,
      occurrence_count: occurrenceCount,
      persistence,
    };
  }

  index.updated_at = timestamp;
  saveFindingsIndex(root, index);
  return findings;
}
