import { defineDetector, indexTargets, registryPageFor, pageSubject } from './framework.js';
import { parse } from 'node-html-parser';

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

D.push(defineDetector({
  id: 'ANS-009', name: 'Answer-target page has no prompt coverage', namespace: 'ANS',
  description: 'An answer-bearing page is intended for discovery but is not mapped to any prompt in the governed prompt corpus.',
  discipline: ['aeo', 'geo'], severity: 'medium', deterministic: true, requires: ['site', 'registries'],
  impact: { citation: 'high', representation: 'medium', maintainability: 'medium' },
  applicable_requirement: 'AEO §1 governed question corpus and §13 page acceptance; GEO §1 prompt registry and §19 page acceptance',
  remediation: 'Map the page to at least one reviewed prompt via target_prompts, then verify that the page answers the prompt without broadening registered claims.',
  verification: 'Page registry target_prompts is non-empty and every referenced prompt exists.',
  check(ctx) {
    const answerTypes = new Set(['definition', 'problem', 'solution', 'comparison', 'recommendation', 'implementation', 'evidence', 'faq', 'glossary', 'documentation', 'article', 'product']);
    return indexTargets(ctx).flatMap((p) => {
      const reg = registryPageFor(ctx, p);
      if (!reg || !answerTypes.has(reg.page_type) || (reg.target_prompts || []).length > 0) return [];
      return [{
        subject: pageSubject(p),
        summary: `${reg.page_type} page ${reg.page_id} has no governed target prompt`,
        evidence: ['target_prompts is empty or absent'],
      }];
    });
  },
}));

D.push(defineDetector({
  id: 'ANS-010', name: 'Published claims lack page evidence mapping', namespace: 'ANS',
  description: 'A page publishes governed claims but records no page-level evidence references, preventing evidence-adjacency review.',
  discipline: ['aeo', 'geo'], severity: 'high', deterministic: true, requires: ['site', 'registries'],
  impact: { citation: 'high', representation: 'high', legal: 'medium', reputational: 'medium' },
  applicable_requirement: 'AEO §4 evidence adjacency and atomic claims; GEO §4 claim registry and §5 claim-evidence proximity',
  remediation: 'Map supporting evidence in evidence_references and place the relevant source or methodology adjacent to each material claim.',
  verification: 'Page registry contains evidence_references and claim/evidence referential integrity passes.',
  check(ctx) {
    return indexTargets(ctx).flatMap((p) => {
      const reg = registryPageFor(ctx, p);
      if (!reg || !(reg.published_claims || []).length || (reg.evidence_references || []).length) return [];
      return [{
        subject: pageSubject(p),
        summary: `Page ${reg.page_id} publishes claims without page-level evidence references`,
        evidence: [`published_claims: ${reg.published_claims.join(', ')}`, 'evidence_references is empty or absent'],
      }];
    });
  },
}));

D.push(defineDetector({
  id: 'ANS-011', name: 'Over-diluted answer passage (missing direct answer lead)', namespace: 'ANS',
  description: 'A section targeting an informational query or question heading lacks a concise, direct answer passage in its opening sentences, burying key factual answers behind excessive preamble or rambling prose.',
  discipline: ['aeo', 'geo'], severity: 'medium', deterministic: false, requires: ['site'],
  impact: { citation: 'medium', representation: 'low' },
  applicable_requirement: 'AEO §4 direct answer block in first 50–100 words; AEO §5 concise declarative answer passages',
  false_positive_conditions: ['narrative essays or creative fiction where question headings are rhetorical devices'],
  remediation: 'Provide a concise 30–70 word direct declarative answer immediately following the question heading before elaborating with background details.',
  verification: 'Re-inspect question sections to verify the first paragraph delivers a direct factual answer.',
  check(ctx) {
    const hits = [];
    const RAMBLE_RX = /^(to understand|before (exploring|answering|diving|we)|in order to understand|it is (important|essential) to (note|understand|first)|there are many (factors|aspects)|the answer to this question depends on)/i;

    for (const p of indexTargets(ctx)) {
      if (p.status !== 200 || !p.rawHtml) continue;
      const doc = parse(p.rawHtml);
      const headings = doc.querySelectorAll('h2, h3, h4');

      for (const h of headings) {
        const text = h.text.trim();
        const isQuestion = /\?$/.test(text) || /^(what|how|why|when|where|who|is|are|can|does|do|which)\b/i.test(text);
        if (!isQuestion) continue;

        let curr = h.nextElementSibling;
        let firstP = null;
        while (curr && !/^h[1-6]$/i.test(curr.tagName)) {
          if (curr.tagName.toLowerCase() === 'p') {
            const pt = curr.text.trim();
            if (pt.length > 0) {
              firstP = pt;
              break;
            }
          }
          curr = curr.nextElementSibling;
        }

        if (firstP) {
          const words = firstP.split(/\s+/).filter(Boolean);
          const isRambling = RAMBLE_RX.test(firstP);
          const isOverlyLongWithoutDirectness = words.length > 130;
          if (isRambling || isOverlyLongWithoutDirectness) {
            hits.push({
              subject: pageSubject(p),
              summary: `Question section "${text.slice(0, 60)}" lacks a concise direct answer lead (${isRambling ? 'rambling preamble' : `opening paragraph is ${words.length} words`})`,
              evidence: [
                `heading: "${text}"`,
                `opening: "${firstP.slice(0, 150)}..."`,
                `word_count: ${words.length}`,
              ],
              confidence: 'medium',
            });
          }
        }
      }
    }
    return hits;
  },
}));

D.push(defineDetector({
  id: 'ANS-012', name: 'Ungrounded quantitative metric in answer passage', namespace: 'ANS',
  description: 'An answer-bearing passage asserts high-stakes quantitative metrics, percentages, or multiples without adjacent evidence citation, benchmark reference, or registered evidence link.',
  discipline: ['aeo', 'geo'], severity: 'medium', deterministic: false, requires: ['site'],
  impact: { citation: 'medium', legal: 'low' },
  applicable_requirement: 'AEO §8 version evidence; GEO §5 substantiated factual claims; premise 3.5: quantitative outcomes require grounding',
  false_positive_conditions: ['introductory marketing pages where detailed case studies are linked elsewhere in the navigation'],
  remediation: 'Attach an adjacent citation, benchmark link, methodology note, or registered evidence ID near the metric.',
  verification: 'Confirm every statistical or multiple claim has adjacent attribution or registered evidence.',
  check(ctx) {
    const hits = [];
    const STAT_RX = /\b(\d+(?:\.\d+)?%\s*(?:reduction|increase|faster|decrease|improvement|growth|boost|drop|savings?)|(?:\d+(?:\.\d+)?x)\s*(?:faster|more|performance|throughput|speed|improvement)|\$\d+(?:\.\d+)?[MBK]\b)/i;
    const ATTRIBUTION_RX = /\[\d+\]|\((?:source|benchmark|study|audit|test|report|see)\b|according to|citation|evidence|EVD-|CLAIM-|\bhttps?:\/\/|href=/i;

    for (const p of indexTargets(ctx)) {
      if (p.status !== 200 || !p.paragraphs) continue;

      for (const para of p.paragraphs) {
        const statMatch = STAT_RX.exec(para);
        if (statMatch) {
          const hasAttribution = ATTRIBUTION_RX.test(para);
          if (!hasAttribution) {
            hits.push({
              subject: pageSubject(p),
              summary: `Ungrounded quantitative metric "${statMatch[1]}" in answer prose lacks citation or evidence attribution`,
              evidence: [
                `metric: "${statMatch[1]}"`,
                `passage: "${para.slice(0, 150)}..."`,
              ],
              confidence: 'medium',
            });
          }
        }
      }
    }
    return hits;
  },
}));

D.push(defineDetector({
  id: 'ANS-013', name: 'Comparative or procedural section lacking structured table or ordered sequence', namespace: 'ANS',
  description: 'A section covering comparative evaluation (vs, alternatives, comparison) or multi-step execution (how to, steps) lacks structured <table>, <ol>, or <ul> markup, diminishing answer engine extraction fidelity.',
  discipline: ['aeo', 'seo'], severity: 'medium', deterministic: true, requires: ['site'],
  impact: { representation: 'medium', citation: 'low' },
  applicable_requirement: 'AEO §5 structured answer surfaces; GEO §4 extractability; premise 3.3 information gain',
  remediation: 'Represent comparisons with <table> markup and sequential instructions with <ol> step lists.',
  verification: 'Confirm comparative/procedural sections contain <table> or <ol> structured elements.',
  check(ctx) {
    const hits = [];
    const COMPARATIVE_RX = /\b(vs\.?|versus|comparison|alternatives|pros and cons|differences between)\b/i;
    const PROCEDURAL_RX = /\b(how to|steps to|installation steps|quickstart guide|configuration steps|deployment guide)\b/i;

    for (const p of indexTargets(ctx)) {
      if (p.status !== 200 || !p.rawHtml) continue;
      const doc = parse(p.rawHtml);
      const headings = doc.querySelectorAll('h2, h3');

      for (const h of headings) {
        const text = h.text.trim();
        const isComp = COMPARATIVE_RX.test(text);
        const isProc = PROCEDURAL_RX.test(text);
        if (!isComp && !isProc) continue;

        let curr = h.nextElementSibling;
        let hasTable = false;
        let hasList = false;
        let textWordCount = 0;

        while (curr && !/^h[1-3]$/i.test(curr.tagName)) {
          if (curr.tagName.toLowerCase() === 'table' || curr.querySelector('table')) hasTable = true;
          if (/^(ol|ul)$/i.test(curr.tagName) || curr.querySelector('ol, ul')) hasList = true;
          if (curr.tagName.toLowerCase() === 'p') {
            textWordCount += curr.text.split(/\s+/).filter(Boolean).length;
          }
          curr = curr.nextElementSibling;
        }

        if (textWordCount > 50) {
          if (isComp && !hasTable) {
            hits.push({
              subject: pageSubject(p),
              summary: `Comparative section "${text.slice(0, 60)}" lacks a structured <table> comparison surface`,
              evidence: [`heading: "${text}"`, `section word count: ${textWordCount}`, 'no <table> detected before next heading'],
              confidence: 'high',
            });
          } else if (isProc && !hasList) {
            hits.push({
              subject: pageSubject(p),
              summary: `Procedural section "${text.slice(0, 60)}" lacks structured <ol> step or list markup`,
              evidence: [`heading: "${text}"`, `section word count: ${textWordCount}`, 'no <ol>/<ul> detected before next heading'],
              confidence: 'high',
            });
          }
        }
      }
    }
    return hits;
  },
}));

D.push(defineDetector({
  id: 'ANS-014', name: 'Low information-gain fluff ratio in answer prose', namespace: 'ANS',
  description: 'An answer passage contains excessive rhetorical filler, clichés, or conversational padding, reducing factual density for generative engine extraction.',
  discipline: ['aeo', 'geo'], severity: 'low', deterministic: true, requires: ['site'],
  impact: { representation: 'low', citation: 'low' },
  applicable_requirement: 'AEO §8 concise factual grounding; GEO §4 information gain; premise 3.3 substantive answer density',
  remediation: 'Remove conversational clichés, tautologies, and promotional fluff; state verifiable facts, properties, and constraints directly.',
  verification: 'Re-audit answer passages to ensure cliché and filler phrases are removed.',
  check(ctx) {
    const hits = [];
    const FLUFF_PATTERNS = [
      /\b(?:as we all know|it goes without saying|needless to say)\b/i,
      /\bat the end of the day\b/i,
      /\b(?:in today's rapidly evolving|in this day and age)\b/i,
      /\b(?:game[- ]changer|revolutionary new|paradigm shift)\b/i,
      /\b(?:delve into|dive deep into|unlock the power of|leverage the power of)\b/i,
      /\b(?:seamlessly integrate|cutting[- ]edge technology)\b/i,
    ];

    for (const p of indexTargets(ctx)) {
      if (p.status !== 200 || !p.paragraphs) continue;

      for (const para of p.paragraphs) {
        if (para.length < 60) continue;
        const matchedFluff = [];
        for (const rx of FLUFF_PATTERNS) {
          const m = rx.exec(para);
          if (m) matchedFluff.push(m[0]);
        }

        if (matchedFluff.length >= 2) {
          hits.push({
            subject: pageSubject(p),
            summary: `Answer passage contains low information-gain fluff clichés (${matchedFluff.join(', ')})`,
            evidence: [
              `clichés detected: ${matchedFluff.join(', ')}`,
              `passage: "${para.slice(0, 150)}..."`,
            ],
            confidence: 'medium',
          });
        }
      }
    }
    return hits;
  },
}));

D.push(defineDetector({
  id: 'ANS-015', name: 'Definitional page lacks direct copular definition', namespace: 'ANS',
  description: 'A page with definitional intent (page_type=definition, /definition/, /glossary/, or "What is" heading) does not provide a direct copular definition ("X is a Y that Z") in the opening paragraph.',
  discipline: ['aeo', 'geo'], severity: 'medium', deterministic: true, requires: ['site'],
  impact: { retrieval: 'medium', citation: 'high' },
  applicable_requirement: 'AEO §4 direct copular answer block; search engine featured snippet & LLM definition synthesis requirements',
  remediation: 'Formulate the opening sentence with a direct copular definition stating what the concept is, its primary class, and its defining capability.',
  verification: 'Confirm the opening paragraph defines the entity using a copular verb ("is", "are", "refers to") within the first 140 characters.',
  check(ctx) {
    const hits = [];
    const COPULA_RX = /\b(?:is|are|refers\s+to|denotes|represents|means)\b/i;
    for (const p of indexTargets(ctx)) {
      if (p.status !== 200 || !p.paragraphs || p.paragraphs.length === 0) continue;
      const reg = registryPageFor(ctx, p);
      const isDefType = reg?.page_type === 'definition' || /\/(definition|glossary)\b/i.test(p.url);
      const firstH1 = (p.headings || []).find((h) => h.level === 1)?.text || '';
      const isWhatIsHeading = /^(what\s+is|definition\s+of|meaning\s+of)\b/i.test(firstH1);

      if (isDefType || isWhatIsHeading) {
        const firstP = p.paragraphs[0] || '';
        const openingSlice = firstP.slice(0, 140);
        if (!COPULA_RX.test(openingSlice)) {
          hits.push({
            subject: pageSubject(p),
            summary: `Definitional page opening does not provide a direct copular definition ("is", "are", "refers to")`,
            evidence: [
              `opening passage: "${firstP.slice(0, 120)}..."`,
              'definitional query extractors require immediate copular formulation in lead sentence',
            ],
            captured: firstP.slice(0, 80),
            expected: 'direct copular sentence (e.g. "X is a Y that Z") in first 140 characters',
          });
        }
      }
    }
    return hits;
  },
}));

D.push(defineDetector({
  id: 'ANS-016', name: 'Comprehensive long-form guide lacks executive summary or key takeaways', namespace: 'ANS',
  description: 'An in-depth article or guide exceeding 1,200 words does not provide an executive summary, key takeaways, or TL;DR block, increasing RAG chunk fragmentation and extraction ambiguity.',
  discipline: ['aeo', 'geo'], severity: 'low', deterministic: true, requires: ['site'],
  impact: { representation: 'medium', citation: 'low' },
  applicable_requirement: 'AEO §4 structural answer density; GEO §4 top-level synthesis grounding for RAG embedding retrieval',
  remediation: 'Add an executive summary or bulleted key takeaways block near the top of the article before detailed section walkthroughs.',
  verification: 'Re-audit page to verify a summary, key takeaways, or TL;DR section precedes long-form content.',
  check(ctx) {
    const hits = [];
    const SUMMARY_RX = /\b(?:executive\s+summary|key\s+takeaways?|summary|overview|at\s+a\s+glance|tl;?dr|quick\s+summary|highlights?)\b/i;
    for (const p of indexTargets(ctx)) {
      if (p.status !== 200) continue;
      const wordCount = p.rawVisibleWordCount || p.wordCount || 0;
      if (wordCount < 1200) continue;

      const hasSummaryHeading = (p.headings || []).some((h) => SUMMARY_RX.test(h.text));
      if (!hasSummaryHeading) {
        hits.push({
          subject: pageSubject(p),
          summary: `Long-form guide (${wordCount} words) lacks an executive summary, key takeaways, or TL;DR section`,
          evidence: [
            `word count: ${wordCount} words`,
            'no heading matches executive summary, key takeaways, or TL;DR pattern',
            'sprawling unsummarized documents experience lower RAG retrieval relevance in generative answer engines',
          ],
          captured: { wordCount, hasSummaryHeading: false },
          expected: 'executive summary or key takeaways section for documents > 1,200 words',
        });
      }
    }
    return hits;
  },
}));

export default D;

