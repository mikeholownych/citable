import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyResource } from '../../src/crawler/resourceValidity.js';

const htmlHeaders = { 'content-type': 'text/html; charset=utf-8' };

test('classifyResource rejects HTTP error responses with the observed status', () => {
  const result = classifyResource({ status: 404, headers: htmlHeaders, body: '<h1>Not found</h1>' });
  assert.equal(result.state, 'invalid_resource');
  assert.deepEqual(result.reason_codes, ['http_status_404']);
  assert.equal(result.signals.http_status, 404);
});

test('classifyResource treats empty successful responses as indeterminate', () => {
  const result = classifyResource({ status: 200, headers: htmlHeaders, body: '  ' });
  assert.equal(result.state, 'indeterminate');
  assert.ok(result.reason_codes.includes('empty_body'));
  assert.equal(result.signals.body_bytes, 2);

  const emptyDocumentBody = classifyResource({
    status: 200,
    headers: htmlHeaders,
    body: '<html><head><title>A long title cannot substitute for substantive page content</title></head><body></body></html>',
  });
  assert.equal(emptyDocumentBody.state, 'indeterminate');
  assert.ok(emptyDocumentBody.reason_codes.includes('insubstantial_html'));
});

test('classifyResource rejects an explicit non-HTML MIME for the page evaluator', () => {
  const result = classifyResource({
    status: 200,
    headers: { 'Content-Type': 'application/pdf' },
    body: '%PDF-1.7',
  });
  assert.equal(result.state, 'invalid_resource');
  assert.ok(result.reason_codes.includes('unexpected_mime'));
  assert.equal(result.signals.content_type, 'application/pdf');
});

test('classifyResource fails closed when the response body is truncated', () => {
  const result = classifyResource({ status: 200, headers: htmlHeaders, body: '<html>', bodyComplete: false });
  assert.equal(result.state, 'indeterminate');
  assert.ok(result.reason_codes.includes('body_truncated'));
  assert.equal(result.signals.body_complete, false);
});

test('classifyResource reports challenge, login, consent, and soft-404 signals as indeterminate', () => {
  const cases = [
    ['<html><title>Just a moment...</title><body>Verify you are human to continue.</body></html>', 'challenge_wall_signal'],
    ['<html><body><h1>Sign in required</h1><p>Please sign in to continue to this page.</p></body></html>', 'login_wall_signal'],
    ['<html><body><h1>Before you continue</h1><p>Please accept cookies to continue to the site.</p></body></html>', 'consent_wall_signal'],
    ['<html><body><h1>Page not found</h1><p>The page you requested does not exist.</p></body></html>', 'soft_404_signal'],
  ];
  for (const [body, code] of cases) {
    const result = classifyResource({ status: 200, headers: htmlHeaders, body });
    assert.equal(result.state, 'indeterminate', code);
    assert.ok(result.reason_codes.includes(code), code);
  }
});

test('classifyResource does not treat incidental numbers or matches beyond its bounded window as a soft 404', () => {
  const ordinary = classifyResource({
    status: 200,
    headers: htmlHeaders,
    body: '<html><body><h1>Model 404</h1><p>This product has a 404 millimetre work surface and a complete technical specification for professional buyers.</p></body></html>',
  });
  assert.equal(ordinary.signals.soft_404, false);
  assert.equal(ordinary.state, 'valid_resource');

  const beyondWindow = classifyResource({
    status: 200,
    headers: htmlHeaders,
    body: `<html><body><p>${'Useful product documentation. '.repeat(12_000)}</p><h1>Page not found</h1></body></html>`,
  });
  assert.equal(beyondWindow.signals.pattern_scan_truncated, true);
  assert.equal(beyondWindow.signals.soft_404, false);
  assert.equal(beyondWindow.state, 'valid_resource');
});

test('classifyResource accepts a complete substantive HTML response', () => {
  const result = classifyResource({
    status: 200,
    headers: htmlHeaders,
    body: '<!doctype html><html><body><main><h1>Technical guide</h1><p>This guide explains the supported configuration, verification process, limitations, and recovery procedure.</p></main></body></html>',
    requestedUrl: 'https://Example.test/guide#part',
    effectiveUrl: 'https://Example.test/guide',
  });
  assert.equal(result.state, 'valid_resource');
  assert.deepEqual(result.reason_codes, ['substantive_html']);
  assert.equal(result.signals.html_mime, true);
  assert.equal(result.signals.requested_url, 'https://Example.test/guide#part');
  assert.equal(result.signals.effective_url, 'https://Example.test/guide');
});
