import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { monitor } from '../../src/commands/monitor.js';

function writeObservation(root, run, representationState, collectedAt) {
  const dir = path.join(root, '.citable', 'runs', run, 'observations');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, '0001-representation_drift.json'), JSON.stringify({
    observation_id: `OBS-${run}`,
    kind: 'representation_drift',
    state: 'observed',
    collected_at: collectedAt,
    data: {
      manifest_hash: 'a'.repeat(64), surface_id: 'nebula-llms-txt', retrieval_path: 'direct',
      region: 'test', request_identity: 'probe', representation_state: representationState,
    },
  }));
}

test('monitor correlates representation paths and reports bounded convergence', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-representation-monitor-'));
  writeObservation(root, 'run-a', 'divergent', '2026-07-19T09:00:00Z');
  writeObservation(root, 'run-b', 'consistent', '2026-07-19T10:30:00Z');
  const result = monitor(root, { runA: 'run-a', runB: 'run-b' });
  const convergence = result.alerts.find((item) => item.type === 'representation_convergence_observed');
  assert.equal(convergence.observed_interval_ms, 5_400_000);
  assert.equal(convergence.authority, 'external_unverified');
  assert.equal(convergence.gates_release_finalization, false);
});

test('monitor reports newly observed representation divergence as non-gating', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-representation-monitor-'));
  writeObservation(root, 'run-a', 'consistent', '2026-07-19T09:00:00Z');
  writeObservation(root, 'run-b', 'divergent', '2026-07-19T10:00:00Z');
  const result = monitor(root, { runA: 'run-a', runB: 'run-b' });
  const divergence = result.alerts.find((item) => item.type === 'representation_divergence_observed');
  assert.equal(divergence.severity, 'high');
  assert.equal(divergence.gates_release_finalization, false);
});
