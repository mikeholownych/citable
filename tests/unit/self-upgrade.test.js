import { test, describe, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { selfUpgradeCommand } from '../../src/commands/selfUpgrade.js';

// Helper: mock globalThis.fetch
function mockFetch(response) {
  const original = globalThis.fetch;
  globalThis.fetch = async () => response;
  return () => { globalThis.fetch = original; };
}

describe('selfUpgradeCommand', () => {
  test('--check: reports current when already up to date', async () => {
    // Patch fetch to return a version behind/equal to local
    const restore = mockFetch({
      ok: true,
      json: async () => ({ version: '0.0.1' }), // older than any real version
    });
    try {
      const out = await selfUpgradeCommand(['--check']);
      assert.match(out, /already up to date|up to date/i);
    } finally {
      restore();
    }
  });

  test('--check --json: returns valid JSON', async () => {
    const restore = mockFetch({
      ok: true,
      json: async () => ({ version: '0.0.1' }),
    });
    try {
      const out = await selfUpgradeCommand(['--check', '--json']);
      const parsed = JSON.parse(out);
      assert.ok(parsed.ok);
      assert.equal(parsed.status, 'current');
      assert.ok(parsed.current);
      assert.ok(parsed.latest);
    } finally {
      restore();
    }
  });

  test('--check: reports update available when registry is newer', async () => {
    const restore = mockFetch({
      ok: true,
      json: async () => ({ version: '99.99.99' }), // always newer
    });
    try {
      const out = await selfUpgradeCommand(['--check']);
      assert.match(out, /update available/i);
      assert.match(out, /99\.99\.99/);
    } finally {
      restore();
    }
  });

  test('--check --json: update-available status when registry is newer', async () => {
    const restore = mockFetch({
      ok: true,
      json: async () => ({ version: '99.99.99' }),
    });
    try {
      const out = await selfUpgradeCommand(['--check', '--json']);
      const parsed = JSON.parse(out);
      assert.equal(parsed.status, 'update-available');
      assert.equal(parsed.latest, '99.99.99');
    } finally {
      restore();
    }
  });

  test('registry failure returns error with current version', async () => {
    const restore = mockFetch({
      ok: false,
      status: 503,
    });
    try {
      const out = await selfUpgradeCommand(['--check']);
      assert.match(out, /error/i);
      assert.match(out, /Current version/i);
    } finally {
      restore();
    }
  });

  test('--check --json: registry failure returns ok:false', async () => {
    const restore = mockFetch({
      ok: false,
      status: 503,
    });
    try {
      const out = await selfUpgradeCommand(['--check', '--json']);
      const parsed = JSON.parse(out);
      assert.equal(parsed.ok, false);
      assert.ok(parsed.error);
    } finally {
      restore();
    }
  });
});
