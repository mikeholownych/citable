import { defineDetector, indexTargets, registryPageFor, pageSubject } from './framework.js';

const D = [];

const PREAMBLE_RX = /\b(in today'?s (rapidly |ever[- ])?(evolving|changing)|in the (modern|current|digital) (era|age|landscape|world)|now more than ever|as (technology|ai) continues to (evolve|advance)|in an increasingly)\b/i;

D.push(defineDetector({
  id: 'ANS-001', name: 'Generic preamble before answer', namespace: 'ANS',
  description: 'The opening paragraph uses generic scene-setting boilerplate instead of answering the page’s question.',
  discipline: ['aeo', 'geo'], severity: 'medium', deterministic: false, requires: ['site'],
  impact: { citation: 'medium', representation: 'low' },
  applicable_requirement: 'AEO §4 direct answer block in first 50–100 words; GEO §5 avoid "in today\'s rapidly evolving..." openings; anti-pattern: generic AI introductions',
  remediation: 'Replace the opening with a direct answer to the principal question in the first 50–100 words.',
  verification: 'Re-inspect the first paragraph for a direct answer.',
  check(ctx) {
    return indexTargets(ctx)
      .filter((p) => p.status === 200 && p.paragraphs.length > 0 && PREAMBLE_RX.test(p.paragraphs[0]))
      .map((p) => ({
        subject: pageSubject(p),
        summary: 'Opening paragraph is generic preamble, not a direct answer',
        evidence: [`first paragraph: "${p.paragraphs[0].slice(0, 160)}..."`],
        confidence: 'high',
      }));
  },
}));

D.push(defineDetector({
  id: 'ANS-002', name: 'Question heading without direct answer', namespace: 'ANS',
  description: 'A heading phrased as a question is not followed by prose before the next heading.',
  discipline: ['aeo'], severity: 'medium', deterministic: true, requires: ['site'],
  impact: { citation: 'medium' },
  applicable_requirement: 'AEO §4 answer extractability; anti-pattern: question headings created only for formatting',
  remediation: 'Answer the question directly in the text immediately after the heading, or remove the decorative question heading.',
  verification: 'Confirm prose follows each question heading.',
  check(ctx) {
    const hits = [];
    for (const p of indexTargets(ctx)) {
      if (p.status !== 200) continue;
      const html = p.rawHtml;
      const rx = /<h([2-4])[^>]*>([^<]*\?)\s*<\/h\1>\s*(<h[1-6]|<\/section|<\/article|<\/body|$)/gi;
      let m;
      while ((m = rx.exec(html)) !== null) {
        hits.push({
          subject: pageSubject(p),
          summary: `Question heading "${m[2].trim().slice(0, 80)}" has no answering prose before the next heading`,
          evidence: [`heading: ${m[2].trim()}`],
        });
      }
    }
    return hits;
  },
}));

D.push(defineDetector({
  id: 'ANS-003', name: 'Circular definition', namespace: 'ANS',
  description: 'A definitional sentence defines a term using the term itself as the definition head.',
  discipline: ['aeo', 'geo'], severity: 'medium', deterministic: false, requires: ['site'],
  impact: { citation: 'medium', representation: 'medium' },
  applicable_requirement: 'AEO §4 explicit definitions; anti-pattern: circular definitions',
  false_positive_conditions: ['legitimate genus-differentia definitions repeating one word of a compound term'],
  remediation: 'Rewrite as “[Term] is [genus] that [differentia]”, then state exclusions.',
  verification: 'Re-inspect the definition sentence.',
  check(ctx) {
    const hits = [];
    for (const p of indexTargets(ctx)) {
      if (p.status !== 200) continue;
      for (const para of p.paragraphs.slice(0, 12)) {
        const m = para.match(/^([A-Z][A-Za-z0-9 -]{2,60}?)\s+(?:is|are|refers to|means)\s+(.{3,120})/);
        if (!m) continue;
        const term = m[1].trim().toLowerCase().replace(/^(the|a|an)\s+/, '');
        const defHead = m[2].trim().toLowerCase().replace(/^(the|a|an|simply|just|basically)\s+/, '');
        if (term.split(' ').length >= 2 && defHead.startsWith(term)) {
          hits.push({
            subject: pageSubject(p),
            summary: `Circular definition: "${m[1].trim()}" is defined as itself`,
            evidence: [`sentence: "${para.slice(0, 160)}"`],
            confidence: 'high',
          });
        }
      }
    }
    return hits;
  },
}));

D.push(defineDetector({
  id: 'ANS-004', name: 'Deictic dependency in answer text', namespace: 'ANS',
  description: 'Answer-bearing prose depends on preceding visual context ("as shown above", "in the diagram below"), which breaks when extracted.',
  discipline: ['aeo'], severity: 'low', deterministic: true, requires: ['site'],
  impact: { citation: 'medium' },
  applicable_requirement: 'AEO §4: extracted passage must not distort or lose meaning; GEO §5 decomposable content',
  remediation: 'Make the passage self-contained: name the referent explicitly instead of pointing at it.',
  verification: 'Search page text for deictic references.',
  check(ctx) {
    const rx = /\b(as (shown|seen|described|illustrated|mentioned) (above|below|earlier|previously)|the (diagram|table|figure|chart|image) (above|below)|see (above|below))\b/i;
    return indexTargets(ctx)
      .filter((p) => p.status === 200)
      .flatMap((p) => {
        const matches = p.paragraphs.filter((t) => rx.test(t));
        return matches.length ? [{
          subject: pageSubject(p),
          summary: `${matches.length} passage(s) depend on preceding visual context`,
          evidence: matches.slice(0, 3).map((t) => `"${t.slice(0, 120)}"`),
        }] : [];
      });
  },
}));

D.push(defineDetector({
  id: 'ANS-005', name: 'Relative quantity without baseline or timeframe', namespace: 'ANS',
  description: 'Text asserts a relative numeric improvement ("3x faster", "50% reduction") without a nearby baseline, unit, or timeframe.',
  discipline: ['aeo', 'geo'], severity: 'medium', deterministic: false, requires: ['site'],
  impact: { citation: 'medium', legal: 'medium', reputational: 'medium' },
  applicable_requirement: 'AEO §4 atomic factual claims with measurement conditions; detector spec: numerical claim without unit or timeframe; anti-pattern: false precision',
  false_positive_conditions: ['numbers whose baseline is stated in an adjacent sentence outside the matched window'],
  remediation: 'State the baseline, measurement period, and test conditions adjacent to the number, or remove the figure.',
  verification: 'Confirm baseline/conditions appear adjacent to each relative quantity.',
  check(ctx) {
    const numRx = /\b(\d+(?:\.\d+)?)\s*(x|times)\s+(faster|slower|better|cheaper|more|fewer|higher|lower)|\b(\d+(?:\.\d+)?)%\s+(reduction|increase|improvement|faster|savings|growth|decrease)/i;
    const contextRx = /\b(compared (to|with)|versus|vs\.?|baseline|benchmark|measured|test(ed)? (under|conditions|over|during|in)|between \d{4}|in (q[1-4] )?\d{4}|over (a|the) (period|quarter|year|month)|methodology)\b/i;
    const hits = [];
    for (const p of indexTargets(ctx)) {
      if (p.status !== 200) continue;
      for (const para of p.paragraphs) {
        if (numRx.test(para) && !contextRx.test(para)) {
          hits.push({
            subject: pageSubject(p),
            summary: 'Relative quantity asserted without baseline or timeframe in the same passage',
            evidence: [`passage: "${para.slice(0, 160)}"`],
            confidence: 'medium',
          });
        }
      }
    }
    return hits;
  },
}));

D.push(defineDetector({
  id: 'ANS-006', name: 'Procedure content without ordered steps', namespace: 'ANS',
  description: 'A page registered as implementation/how-to content contains no ordered list or numbered steps.',
  discipline: ['aeo'], severity: 'low', deterministic: true, requires: ['site', 'registries'],
  impact: { citation: 'medium' },
  applicable_requirement: 'AEO §4 procedures: provide explicit steps',
  remediation: 'Express the procedure as explicit ordered steps.',
  verification: 'Confirm an ordered list or numbered step structure exists.',
  check(ctx) {
    const hits = [];
    for (const p of indexTargets(ctx)) {
      const reg = registryPageFor(ctx, p);
      if (!reg || reg.page_type !== 'implementation' || p.status !== 200) continue;
      const numbered = /(^|\s)(step\s+\d|1\.\s+\S+[\s\S]{0,400}2\.\s+\S+)/i.test(p.text);
      if (p.orderedLists === 0 && !numbered) {
        hits.push({
          subject: pageSubject(p),
          summary: `Implementation page ${reg.page_id} has no ordered steps`,
          evidence: ['0 <ol> elements; no numbered step pattern in text'],
        });
      }
    }
    return hits;
  },
}));

D.push(defineDetector({
  id: 'ANS-007', name: 'Comparison without explicit basis', namespace: 'ANS',
  description: 'A comparison page has neither a comparison table nor prose stating the comparison criteria.',
  discipline: ['aeo', 'geo'], severity: 'medium', deterministic: true, requires: ['site', 'registries'],
  impact: { citation: 'medium', representation: 'medium' },
  applicable_requirement: 'AEO §4 comparison tables with prose; detector spec: comparison without explicit comparison basis',
  remediation: 'State the comparison dimensions explicitly and support them with a table plus prose.',
  verification: 'Confirm comparison criteria appear in table or prose.',
  check(ctx) {
    const basisRx = /\b(differs? (from|in)|difference between|compared (on|across|by)|criteria|dimension|whereas|in contrast|unlike)\b/i;
    const hits = [];
    for (const p of indexTargets(ctx)) {
      const reg = registryPageFor(ctx, p);
      if (!reg || reg.page_type !== 'comparison' || p.status !== 200) continue;
      if (p.tables === 0 && !basisRx.test(p.text)) {
        hits.push({
          subject: pageSubject(p),
          summary: `Comparison page ${reg.page_id} states no explicit comparison basis`,
          evidence: ['0 tables; no comparison-basis phrasing found in text'],
        });
      }
    }
    return hits;
  },
}));

D.push(defineDetector({
  id: 'ANS-008', name: 'Missing scope or limitations on answer page', namespace: 'ANS',
  description: 'A definition/comparison/recommendation page never states scope boundaries, exclusions, or limitations.',
  discipline: ['aeo', 'geo'], severity: 'medium', deterministic: false, requires: ['site', 'registries'],
  impact: { citation: 'medium', legal: 'medium', representation: 'medium' },
  applicable_requirement: 'AEO §4 boundary conditions; GEO §5 scope boundaries; acceptance standard: limitations disclosed',
  false_positive_conditions: ['limitations expressed with vocabulary outside the matched set'],
  remediation: 'Add explicit "when this applies / when it does not / limitations" content.',
  verification: 'Confirm boundary-condition language exists on the page.',
  check(ctx) {
    const rx = /\b(limitation|does not (apply|include|cover|solve|support)|not (intended|suitable|designed) for|out of scope|exclusion|caveat|constraint|boundary condition|when (this|it) (does not|doesn'?t) apply)\b/i;
    const hits = [];
    for (const p of indexTargets(ctx)) {
      const reg = registryPageFor(ctx, p);
      if (!reg || !['definition', 'comparison', 'recommendation', 'product'].includes(reg.page_type) || p.status !== 200) continue;
      if (!rx.test(p.text)) {
        hits.push({
          subject: pageSubject(p),
          summary: `${reg.page_type} page ${reg.page_id} states no scope boundaries or limitations`,
          evidence: ['no limitation/exclusion/scope-boundary phrasing found in page text'],
          confidence: 'medium',
        });
      }
    }
    return hits;
  },
}));

export default D;
