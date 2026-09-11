import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isSensitiveKey,
  isSensitiveValue,
  sanitizeHeaders,
  sanitizeQueryParams,
  safeJsonClone,
  sanitizePayload,
  REDACTED_MARKER,
} from '../../src/observations/browser/sanitizer.js';

test('sanitizer identifies sensitive keys and value patterns', () => {
  assert.equal(isSensitiveKey('authorization'), true);
  assert.equal(isSensitiveKey('Authorization'), true);
  assert.equal(isSensitiveKey('x-api-key'), true);
  assert.equal(isSensitiveKey('cookie'), true);
  assert.equal(isSensitiveKey('set-cookie'), true);
  assert.equal(isSensitiveKey('password'), true);
  assert.equal(isSensitiveKey('access_token'), true);
  assert.equal(isSensitiveKey('session_id'), true);
  assert.equal(isSensitiveKey('content-type'), false);
  assert.equal(isSensitiveKey('accept'), false);

  assert.equal(isSensitiveValue('Bearer eyJhbGciOi...secretTokenVal12345'), true);
  assert.equal(isSensitiveValue('ghp_1234567890abcdefghijklmnopqrstuv'), true);
  assert.equal(isSensitiveValue('sk-1234567890abcdefghijklmnopqrstuvwxyz1234'), true);
  assert.equal(isSensitiveValue('normal-value-123'), false);
});

test('sanitizeHeaders unconditionally redacts sensitive keys and applies allowlist', () => {
  const raw = {
    'content-type': 'application/json',
    'accept': 'application/json',
    'authorization': 'Bearer super-secret-token',
    'cookie': 'session=abc123xyz',
    'x-api-key': 'secret-key-123',
    'user-agent': 'Mozilla/5.0',
  };

  // With no allowlist: only non-sensitive headers kept
  const res1 = sanitizeHeaders(raw, null);
  assert.equal(res1.headers['content-type'], 'application/json');
  assert.equal(res1.headers['accept'], 'application/json');
  assert.equal(res1.headers['user-agent'], 'Mozilla/5.0');
  assert.equal(res1.headers['authorization'], undefined);
  assert.equal(res1.headers['cookie'], undefined);

  // With allowlist that explicitly requests authorization and content-type
  const res2 = sanitizeHeaders(raw, ['content-type', 'authorization', 'x-api-key']);
  assert.equal(res2.headers['content-type'], 'application/json');
  assert.equal(res2.headers['authorization'], REDACTED_MARKER);
  assert.equal(res2.headers['x-api-key'], REDACTED_MARKER);
  assert.equal(res2.headers['accept'], undefined);
  assert.equal(res2.redactedCount, 2);
});

test('sanitizeQueryParams redacts sensitive query keys and filters non-allowlisted keys', () => {
  const url = 'https://example.test/path?page=1&sort=asc&token=secret123&apiKey=secret456&utm_source=google';

  // Allowlist specified: only page and token allowlisted
  const res = sanitizeQueryParams(url, ['page', 'token']);
  assert.equal(res.query.page, '1');
  assert.equal(res.query.token, REDACTED_MARKER);
  assert.equal(res.query.sort, undefined);
  assert.equal(res.query.apiKey, undefined);
  assert.equal(res.redactedCount, 1);
  assert.ok(res.filteredFields.includes('sort'));
  assert.ok(res.filteredFields.includes('apiKey'));
});

test('safeJsonClone handles cyclic objects and depth limits safely', () => {
  const cyclic = { a: 1, name: 'test' };
  cyclic.self = cyclic;

  const cloned = safeJsonClone(cyclic, { maxDepth: 4 });
  assert.equal(cloned.a, 1);
  assert.equal(cloned.name, 'test');
  assert.equal(cloned.self, '[CIRCULAR]');

  const deep = { l1: { l2: { l3: { l4: { l5: { l6: 'deep' } } } } } };
  const clonedDeep = safeJsonClone(deep, { maxDepth: 3 });
  assert.equal(clonedDeep.l1.l2.l3, '[DEPTH_LIMIT]');
});

test('safeJsonClone respects allowed_fields and hash_fields', () => {
  const obj = {
    userId: '12345',
    email: 'user@example.test',
    password: 'super-password',
    role: 'admin',
    details: { bio: 'hello' },
  };

  const cloned = safeJsonClone(obj, {
    allowedFields: ['userId', 'password', 'role'],
    hashFields: ['userId'],
  });

  assert.ok(cloned.userId.startsWith('sha256:'));
  assert.equal(cloned.password, REDACTED_MARKER);
  assert.equal(cloned.role, 'admin');
  assert.equal(cloned.email, undefined);
});

test('sanitizePayload hashes and bounds raw payload', () => {
  const jsonPayload = JSON.stringify({ event: 'test', secret: 'abc', count: 42 });
  const res = sanitizePayload(jsonPayload, {
    allowedFields: ['event', 'count'],
    hashOnly: false,
    maxBytes: 1000,
  });

  assert.ok(res.hash.length === 64);
  assert.equal(res.sanitized.event, 'test');
  assert.equal(res.sanitized.count, 42);
  assert.equal(res.sanitized.secret, undefined);
});
