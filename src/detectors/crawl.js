import { defineDetector, entrySubject } from './framework.js';
import { isAllowed } from '../crawler/robots.js';
import { isPastDate } from '../shared/io.js';

const D = [];

D.push(defineDetector({
  id: 'CRAWL-001', name: 'robots.txt contradicts crawler policy decision', namespace: 'CRAWL',
  description: 'The deployed robots.txt outcome for a crawler differs from the decision recorded in the crawler policy registry.',
  discipline: ['seo', 'aeo', 'geo'], severity: 'high', deterministic: true, requires: ['site', 'registries'],
  impact: { retrieval: 'high', legal: 'medium' },
  applicable_requirement: 'GEO §2 crawler-policy matrix; premise 3.3 crawler access managed by crawler and purpose',
  remediation: 'Align robots.txt with the registry decision, or update the registry with a new decision, owner, and rationale.',
  verification: 'Evaluate robots.txt for the crawler user-agent against / and compare with the registry decision.',
  check(ctx) {
    if (!ctx.site?.robots) return [];
    const hits = [];
    for (const c of ctx.registries.crawlers?.entries || []) {
      if (c.decision === 'undecided' || c.status === 'retired') continue;
      const verdict = isAllowed(ctx.site.robots, c.user_agent, '/');
      const deployed = verdict.allowed ? 'allow' : 'block';
      if (deployed !== c.decision) {
        hits.push({
          subject: entrySubject('crawlers', c.crawler_id),
          summary: `Registry decision for ${c.user_agent} is "${c.decision}" but robots.txt effectively "${deployed}s" it`,
          evidence: [`registry decision: ${c.decision} (purpose: ${c.purpose})`, `robots.txt evaluation at /: ${deployed}${verdict.rule ? ` via ${verdict.rule}` : ' (no matching rule)'}`],
          captured: deployed, expected: c.decision,
        });
      }
    }
    return hits;
  },
}));

D.push(defineDetector({
  id: 'CRAWL-002', name: 'Training-purpose access not decided separately', namespace: 'CRAWL',
  description: 'A vendor has an allow decision for search discovery, but no separate recorded decision for its model-training crawler.',
  discipline: ['geo'], severity: 'medium', deterministic: true, requires: ['registries'],
  impact: { legal: 'high', representation: 'low' },
  applicable_requirement: 'Premise 3.3: crawler access for search is not permission for model training; GEO §2 access layers must not be conflated',
  remediation: 'Record an explicit allow/block decision, owner, and legal rationale for each training-purpose crawler of vendors whose search crawlers are allowed.',
  verification: 'Confirm a crawler registry entry with purpose model_training exists for the vendor.',
  check(ctx) {
    const entries = ctx.registries.crawlers?.entries || [];
    const hits = [];
    const vendors = new Set(entries.filter((e) => ['search_indexing', 'ai_search_discovery'].includes(e.purpose) && e.decision === 'allow').map((e) => e.vendor).filter(Boolean));
    for (const v of vendors) {
      const training = entries.filter((e) => e.vendor === v && e.purpose === 'model_training');
      if (training.length === 0) {
        hits.push({
          subject: { type: 'crawler', identifier: v },
          summary: `Vendor "${v}" has search-crawler access allowed but no recorded model-training decision`,
          evidence: [`crawlers registry contains no purpose=model_training entry for vendor ${v}`],
        });
      } else {
        for (const t of training.filter((t) => t.decision === 'undecided')) {
          hits.push({
            subject: entrySubject('crawlers', t.crawler_id),
            summary: `Model-training decision for ${t.user_agent} is still "undecided" while search access is allowed`,
            evidence: [`entry ${t.crawler_id}: decision=undecided, purpose=model_training`],
          });
        }
      }
    }
    return hits;
  },
}));

D.push(defineDetector({
  id: 'CRAWL-003', name: 'robots.txt missing', namespace: 'CRAWL',
  description: 'No robots.txt was found; crawler access is uncontrolled and sitemap discovery is weakened.',
  discipline: ['seo', 'aeo', 'geo'], severity: 'medium', deterministic: true, requires: ['site'],
  impact: { retrieval: 'medium' },
  applicable_requirement: 'SEO §2 crawl controls; GEO §2 crawler-policy matrix',
  remediation: 'Publish robots.txt implementing the crawler policy registry, including a Sitemap directive.',
  verification: 'Fetch /robots.txt and confirm 200 with expected rules.',
  check(ctx) {
    if (ctx.site.robotsText != null) return [];
    return [{
      subject: { type: 'site', identifier: ctx.site.baseUrl, url: ctx.site.baseUrl },
      summary: 'robots.txt not found',
      evidence: ['no robots.txt in audited output'],
    }];
  },
}));

D.push(defineDetector({
  id: 'CRAWL-004', name: 'robots.txt parse problems', namespace: 'CRAWL',
  description: 'robots.txt contains unparseable or misplaced directives.',
  discipline: ['seo'], severity: 'medium', deterministic: true, requires: ['site'],
  impact: { retrieval: 'medium' },
  applicable_requirement: 'SEO §2 explicit control over robots.txt',
  remediation: 'Fix the malformed lines; regenerate robots.txt from the crawler policy registry.',
  verification: 'Re-parse robots.txt and confirm zero errors.',
  check(ctx) {
    if (!ctx.site.robots || ctx.site.robots.errors.length === 0) return [];
    return [{
      subject: { type: 'site', identifier: `${ctx.site.baseUrl}/robots.txt`, url: `${ctx.site.baseUrl}/robots.txt` },
      summary: `robots.txt has ${ctx.site.robots.errors.length} parse problem(s)`,
      evidence: ctx.site.robots.errors.slice(0, 10),
    }];
  },
}));

D.push(defineDetector({
  id: 'CRAWL-005', name: 'Crawler policy review overdue', namespace: 'CRAWL',
  description: 'A crawler policy decision has passed its next review date.',
  discipline: ['seo', 'aeo', 'geo'], severity: 'low', deterministic: true, requires: ['registries'],
  impact: { legal: 'medium', maintainability: 'medium' },
  applicable_requirement: 'Registry §6.7 review_date/next_review_date; lifecycle premise',
  remediation: 'Re-review the crawler decision against current vendor documentation and update review dates.',
  verification: 'Confirm next_review_date is in the future.',
  check(ctx) {
    return (ctx.registries.crawlers?.entries || [])
      .filter((c) => c.status !== 'retired' && isPastDate(c.next_review_date, ctx.refDate))
      .map((c) => ({
        subject: entrySubject('crawlers', c.crawler_id),
        summary: `Crawler policy for ${c.user_agent} review overdue (due ${c.next_review_date})`,
        evidence: [`next_review_date: ${c.next_review_date}`],
      }));
  },
}));

D.push(defineDetector({
  id: 'CRAWL-006', name: 'Undecided crawler with observed governance relevance', namespace: 'CRAWL',
  description: 'A crawler policy entry remains "undecided" — access is currently whatever robots.txt happens to say, not a governed decision.',
  discipline: ['geo'], severity: 'low', deterministic: true, requires: ['registries'],
  impact: { legal: 'medium' },
  applicable_requirement: 'GEO §2: decision required per crawler and purpose',
  remediation: 'Record an explicit allow/block decision with owner and business and legal rationale.',
  verification: 'Registry entry decision is allow or block.',
  check(ctx) {
    return (ctx.registries.crawlers?.entries || [])
      .filter((c) => c.decision === 'undecided' && c.status === 'active')
      .map((c) => ({
        subject: entrySubject('crawlers', c.crawler_id),
        summary: `No decision recorded for ${c.user_agent} (${c.purpose})`,
        evidence: [`entry ${c.crawler_id}: decision=undecided`],
      }));
  },
}));

export default D;
