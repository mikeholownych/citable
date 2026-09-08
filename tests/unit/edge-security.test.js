import test from 'node:test';
import assert from 'node:assert/strict';
import { auditEdgeCode } from '../../src/commands/edgeSecurity.js';
import { exportEdgeRules } from '../../src/commands/edgeRules.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('EDGSEC-002 detects HTMLRewriter html-mode append with dynamic arguments', () => {
  const malicious = `export default {
    async fetch(request) {
      const response = await fetch(request);
      const label = new URL(request.url).searchParams.get('label');
      const rewriter = new HTMLRewriter().on("body", { element(e) { e.append(label, { html: true }); }});
      return rewriter.transform(response);
    },
  };`;
  const r = auditEdgeCode(malicious, { format: 'cloudflare-worker' });
  const hit = r.findings.find((f) => f.rule_id === 'EDGSEC-002');
  assert.ok(hit, 'dynamic html:true append must be flagged high');
  assert.equal(hit.severity, 'high');
  assert.match(hit.summary, /HTML injection/);
});

test('EDGSEC-003 detects unescaped Liquid output inside script blocks and raw filters', () => {
  const unescaped = `<script>
  var visitor = {{ customer_name }};
  console.log(visitor);
</script>`;
  const r = auditEdgeCode(unescaped, { format: 'shopify-snippet' });
  const hit = r.findings.find((f) => f.rule_id === 'EDGSEC-003');
  assert.ok(hit, 'unescaped Liquid in script must be flagged');
  assert.match(hit.summary, /escape filter/);

  const raw = `<div>{{ product.title | strip_html }}</div>`;
  const r2 = auditEdgeCode(raw, { format: 'shopify-snippet' });
  assert.ok(r2.findings.some((f) => f.rule_id === 'EDGSEC-003' && /strip_html/.test(f.summary)));
});

test('EDGSEC-004 treats referral fragments as untrusted: flags parsing sinks, advises on safe reads', () => {
  const xss = `<script>
  var frag = location.hash;
  document.getElementById('out').innerHTML = frag;
</script>`;
  const r = auditEdgeCode(xss, { format: 'html' });
  const hit = r.findings.find((f) => f.rule_id === 'EDGSEC-004');
  assert.ok(hit, 'referral + innerHTML must be flagged high');
  assert.match(hit.summary, /untrusted|attacker-controllable/i);

  const safe = `<script>
  if (/:~:text=/.test(location.hash)) { document.getElementById('banner').textContent = 'Corroborated claim'; }
</script>`;
  const r2 = auditEdgeCode(safe, { format: 'html' });
  const advisory = r2.findings.find((f) => f.rule_id === 'EDGSEC-004');
  assert.ok(advisory, 'referral read alone must still produce an advisory');
  assert.equal(advisory.severity, 'advisory');
  assert.match(advisory.summary, /do not (log|persist|transmit)|consent|innerHTML/);
});

test('EDGSEC-005 flags potential PII fields in telemetry payloads', () => {
  const pii = `<script>
  var payload = { experiment_id: 'E1', variant_id: 'B', email: userEmail };
  navigator.sendBeacon('/api/events', JSON.stringify(payload));
</script>`;
  const r = auditEdgeCode(pii, { format: 'html' });
  const hit = r.findings.find((f) => f.rule_id === 'EDGSEC-005');
  assert.ok(hit, 'PII field must be flagged');
  assert.match(hit.summary, /email/);
  assert.match(hit.summary, /GDPR|CCPA/);
});

test('EDGSEC-006 flags per-request variance without cache-control guidance', () => {
  const varies = `export default {
    async fetch(request) {
      const ip = request.headers.get('cf-connecting-ip');
      const response = await fetch(request);
      return new Response(response.body, { headers: response.headers });
    },
  };`;
  const r = auditEdgeCode(varies, { format: 'cloudflare-worker' });
  const hit = r.findings.find((f) => f.rule_id === 'EDGSEC-006');
  assert.ok(hit, 'request-varied response without cache guidance must be flagged');
  assert.match(hit.summary, /cache poisoning/i);
});

test('EDGSEC-007 flags oversized workers; EDGSEC-001 flags inline scripts', () => {
  const big = 'export default { fetch() {} };\n' + '// pad\n'.repeat(1);
  const oversized = auditEdgeCode('x'.repeat(1024 * 1024 + 1), { format: 'cloudflare-worker' });
  assert.ok(oversized.findings.some((f) => f.rule_id === 'EDGSEC-007'));

  const inline = auditEdgeCode('<div><script>console.log(1)</script></div>', { format: 'shopify-snippet' });
  const csp = inline.findings.find((f) => f.rule_id === 'EDGSEC-001');
  assert.ok(csp, 'inline script must produce CSP advisory');
  assert.match(csp.summary, /Content-Security-Policy/);
});

test('all current generated edge exports pass the security audit with at most advisories', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'citable-edge-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const format of ['cloudflare-redirects', 'cloudflare-waf', 'cloudflare-worker', 'cloudflare-cro', 'vercel-middleware', 'shopify-snippet']) {
    const r = await exportEdgeRules(dir, { format });
    assert.ok(r.security, `${format} export must carry a security audit`);
    assert.equal(r.security.high, 0, `${format} must have zero high-severity findings (got: ${r.security.findings.filter((f) => f.severity === 'high').map((f) => f.rule_id).join(', ')})`);
    assert.match(r.security.methodology, /not a substitute/);
  }
});

test('audit is fail-closed: a crashing rule yields an ERROR finding, never silence', () => {
  const crashingRules = [{
    rule_id: 'EDGSEC-TEST',
    name: 'crashing rule',
    applies: ['cloudflare-worker'],
    check() { throw new Error('boom'); },
  }];
  const r = auditEdgeCode('export default {};', { format: 'cloudflare-worker', rules: crashingRules });
  assert.equal(r.finding_count, 1);
  assert.equal(r.findings[0].rule_id, 'EDGSEC-TEST-ERROR');
  assert.equal(r.findings[0].severity, 'high');
  assert.match(r.findings[0].summary, /boom/);
});
