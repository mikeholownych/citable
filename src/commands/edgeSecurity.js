/**
 * Security audit for generated and user-supplied edge code.
 *
 * Findings are deterministic pattern checks over the code text. A clean
 * result means no listed risk pattern was found; it is not a substitute for
 * human security review of deployed code.
 */

const WORKER_SIZE_LIMIT_BYTES = 1024 * 1024; // Cloudflare Workers ~1 MiB before compression (documented platform limit)

const RULES = [
  {
    rule_id: 'EDGSEC-001',
    name: 'Inline script requires CSP unsafe-inline',
    applies: ['shopify-snippet', 'html'],
    check(content) {
      const inline = /<script(?![^>]*\ssrc\s*=)[^>]*>/i.test(content);
      if (!inline) return null;
      return {
        severity: 'advisory',
        summary: 'Generated code contains an inline <script> block; sites with a strict Content-Security-Policy will block it unless a nonce or hash is added.',
        remediation: 'Prefer an external script file, or add the script hash/nonce to the CSP. Record the CSP implication in deployment notes.',
      };
    },
  },
  {
    rule_id: 'EDGSEC-002',
    name: 'HTMLRewriter html-mode append/setAttribute with dynamic content',
    applies: ['cloudflare-worker', 'cloudflare-cro'],
    check(content) {
      const dynamicAppend = /\.append\(\s*(?!['"`]\s*[<A-Za-z])[^,)]*?,\s*\{\s*html:\s*true/i.test(content)
        || /\.append\(\s*[A-Za-z_$][\w$.\[\]]*\s*,\s*\{\s*html:\s*true/i.test(content);
      if (!dynamicAppend) return null;
      return {
        severity: 'high',
        summary: 'HTMLRewriter append uses html:true with a non-literal argument; untrusted data reaching this sink becomes HTML injection.',
        remediation: 'Only append static string literals with html:true, or escape all interpolated values with a strict HTML escaper before insertion.',
      };
    },
  },
  {
    rule_id: 'EDGSEC-003',
    name: 'Unescaped interpolation into HTML or script context',
    applies: ['cloudflare-worker', 'cloudflare-cro', 'vercel-middleware', 'shopify-snippet', 'html'],
    check(content, { format }) {
      const problems = [];
      // JS template literals inside generated HTML strings
      const htmlTemplateLiteral = /`[^`]*<(?:div|span|aside|a|p|script)[^>]*>\$\{[^}]*\}/i.test(content);
      if (htmlTemplateLiteral) problems.push('template literal interpolated into HTML markup');
      // Liquid object output without escape filter inside script blocks (script context never auto-escapes)
      if (format === 'shopify-snippet') {
        const scripts = content.match(/<script\b[^>]*>[\s\S]*?<\/script[^>]*>/gi) || [];
        for (const block of scripts) {
          for (const m of block.matchAll(/\{\{[^}]*\}\}/g)) {
            if (!/\|\s*escape|json/.test(m[0])) problems.push(`Liquid output ${m[0]} inside <script> without escape filter`);
          }
        }
        // also Liquid anywhere with raw/unsafe filters
        for (const m of content.matchAll(/\{\{[^}]*(?:\|\s*raw|\|\s*strip_html)[^}]*\}\}/g)) {
          problems.push(`Liquid output ${m[0]} uses a filter that disables escaping`);
        }
      }
      if (problems.length === 0) return null;
      return {
        severity: 'high',
        summary: `Unescaped dynamic interpolation in output context: ${problems.join('; ')}`,
        remediation: 'Escape all dynamic values for the exact output context (HTML body, attribute, or JS string) or use static literals only.',
      };
    },
  },
  {
    rule_id: 'EDGSEC-004',
    name: 'Untrusted referral data written into the DOM',
    applies: ['cloudflare-worker', 'cloudflare-cro', 'vercel-middleware', 'shopify-snippet', 'html'],
    check(content) {
      const readsReferral = /document\.referrer|location\.hash|searchParams\.get|URLSearchParams|\?~:text=:~:text/i.test(content)
        || /:~:text=/i.test(content);
      const dangerousSink = /innerHTML\s*=|document\.write\s*\(|insertAdjacentHTML\s*\(/.test(content);
      if (readsReferral && dangerousSink) {
        return {
          severity: 'high',
          summary: 'Code reads user-controlled referral data (referrer, URL hash, or text fragment) and also writes to HTML-parsing DOM sinks; referral fragments are attacker-controllable input.',
          remediation: 'Render referral-derived values with textContent/createTextNode only, or never write them into the DOM. Treat referral fragments as untrusted data.',
        };
      }
      if (readsReferral) {
        return {
          severity: 'advisory',
          summary: 'Code reads user-controlled referral data (referrer or text fragment). Confirmed safe sinks in the current template, but any future change must keep this data out of HTML-parsing sinks and must not persist or transmit it without a documented consent basis.',
          remediation: 'Keep referral fragments out of innerHTML/document.write; do not log, store, or transmit referral content; label analytics derived from it as untrusted input.',
        };
      }
      return null;
    },
  },
  {
    rule_id: 'EDGSEC-005',
    name: 'Potential PII collected by telemetry',
    applies: ['cloudflare-worker', 'cloudflare-cro', 'vercel-middleware', 'shopify-snippet', 'html'],
    check(content) {
      // PII matters when used as data (object keys, assignments, values), not
      // when it appears inside autocomplete/CSS selector hints.
      const patterns = [
        /\b(email|e_mail|fullname|first_name|last_name|phone|address|postal_code|postcode|ip_address|user_agent|birthdate|date_of_birth)\b\s*[:=]/gi,
        /[:\{,]\s*["'](email|e_mail|fullname|first_name|last_name|phone|address|postal_code|postcode|ip_address|user_agent|birthdate|date_of_birth)["']\s*:/gi,
      ];
      const found = [];
      for (const rx of patterns) {
        for (const m of content.matchAll(rx)) found.push(m[0].trim());
      }
      if (found.length === 0) return null;
      const unique = [...new Set(found)];
      return {
        severity: 'high',
        summary: `Telemetry or edge code references potential PII fields (${unique.join(', ')}); accidental collection creates GDPR/CCPA exposure.`,
        remediation: 'Remove PII from generated telemetry payloads; collect only aggregate experiment identifiers with a documented consent basis.',
      };
    },
  },
  {
    rule_id: 'EDGSEC-006',
    name: 'Per-request response variance without cache guidance',
    applies: ['cloudflare-worker', 'cloudflare-cro', 'vercel-middleware'],
    check(content) {
      const variesOnRequest = /request\.headers\.get\(|cookies|cf-connecting-ip/i.test(content);
      const setsCacheControl = /cache-control/i.test(content);
      if (variesOnRequest && !setsCacheControl) {
        return {
          severity: 'medium',
          summary: 'Edge code varies behavior per request (headers/cookies/IP) without setting explicit Cache-Control guidance; a shared cache may serve one visitor’s personalized response to others (cache poisoning of personalized variants).',
        remediation: 'Add explicit Cache-Control (e.g. private, no-store for personalized responses) or move variance behind cacheable segmentation.',
        };
      }
      return null;
    },
  },
  {
    rule_id: 'EDGSEC-007',
    name: 'Worker size above documented platform limit',
    applies: ['cloudflare-worker', 'cloudflare-cro'],
    check(content) {
      const size = Buffer.byteLength(content, 'utf8');
      if (size <= WORKER_SIZE_LIMIT_BYTES) return null;
      return {
        severity: 'medium',
        summary: `Generated worker is ${(size / 1024).toFixed(1)} KiB; Cloudflare Workers limit scripts to ~1 MiB before compression on many plans (documented platform limit, not a measurement).`,
        remediation: 'Split the worker or strip unused remediations before deployment.',
      };
    },
  },
];

/**
 * Audit one edge/snippet code string. Returns findings with full provenance
 * fields so results are citable evidence, not terminal commentary.
 */
export function auditEdgeCode(rawContent, { format = 'html', name = 'generated-edge-code', toolVersion = null, rules = RULES } = {}) {
  const content = typeof rawContent === 'string' ? rawContent : String(rawContent);
  const findings = [];
  for (const rule of rules) {
    if (rule.applies.length && !rule.applies.includes(format)) continue;
    let hit = null;
    try {
      hit = rule.check(content, { format });
    } catch (err) {
      findings.push({
        rule_id: `${rule.rule_id}-ERROR`,
        severity: 'high',
        summary: `security rule error: ${err.message}`,
        remediation: 'Fix the audit rule before trusting a clean result (fail closed).',
      });
      continue;
    }
    if (hit) {
      findings.push({ rule_id: rule.rule_id, rule_name: rule.name, ...hit });
    }
  }
  const severityRank = { high: 0, medium: 1, advisory: 2 };
  findings.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);
  return {
    target: name,
    format,
    byte_size: Buffer.byteLength(content, 'utf8'),
    finding_count: findings.length,
    high: findings.filter((f) => f.severity === 'high').length,
    medium: findings.filter((f) => f.severity === 'medium').length,
    advisory: findings.filter((f) => f.severity === 'advisory').length,
    findings,
    methodology: 'deterministic pattern audit of generated code; a clean result is not a substitute for human security review',
    tool_version: toolVersion,
  };
}
