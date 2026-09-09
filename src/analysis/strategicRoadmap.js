import fs from 'node:fs';
import path from 'node:path';
import { readJson, writeJson, nowIso } from '../shared/io.js';
import { scoreFinding, scoreInitiative } from './iceMatrix.js';

/**
 * Generate a 30 / 90 / 180-day Strategic Roadmap from audit findings and initiatives.
 */
export function buildStrategicRoadmap({ findings = [], initiatives = [], targetDomain = 'example.com' } = {}) {
  // Score all findings and initiatives with ICE
  const scoredFindings = findings.map(scoreFinding);
  const scoredInitiatives = initiatives.map(scoreInitiative);

  // Group into horizons
  const horizon30 = {
    horizon: '30_days',
    label: 'Days 1 - 30: Foundation & Unblock',
    objective: 'Eliminate catastrophic crawl, index, and Core Web Vitals blockers; establish foundational crawler access and entity identity.',
    focus_areas: [
      'Technical SEO: Resolve HTTP non-200 responses, accidental noindex, and canonical contradictions',
      'Core Web Vitals: Eliminate render-blocking scripts, specify image dimensions (CLS <= 0.1), preload LCP hero images',
      'Answer Engine Access: Open robots.txt permissions for PerplexityBot, Bingbot, and OAI-SearchBot',
      'Entity Identity: Deploy baseline Organization and primary Person JSON-LD schemas',
    ],
    exit_criteria: [
      'Zero critical-severity technical findings in citable audit technical',
      'Static CLS readiness: 100% of body images have explicit dimensions',
      'All major answer engine bots verified allowed in robots directives',
      'Baseline Organization schema live with verified @id',
    ],
    actions: [],
  };

  const horizon90 = {
    horizon: '90_days',
    label: 'Days 31 - 90: Governance, E-E-A-T & Extractability',
    objective: 'Elevate on-page E-E-A-T, deploy rich structured data (FAQPage, Speakable, HowTo), audit backlinks, and automate fast indexing.',
    focus_areas: [
      'On-Page E-E-A-T: Attribute all content to verified authors, add credentials, visible update dates, and editorial transparency links',
      'Schema Enrichment: Deploy FAQPage Q&A markup, SpeakableSpecification for audio extraction, and HowTo step schemas',
      'Fast Indexing: Configure and verify IndexNow protocol connector for instant Bing / search engine notification',
      'Off-Page Governance: Audit inbound backlink profile, flag toxic PBN/spam TLDs, and compile GSC disavow candidate file',
      'Claim Substantiation: Map material business claims to evidence registry records',
    ],
    exit_criteria: [
      'Composite E-E-A-T score >= 4.0 / 5.0 across money and content pages',
      'FAQPage and Speakable schema deployed on all eligible guide/product pages',
      'IndexNow connection tested and submitting on content updates',
      'Google Disavow file reviewed and archived in evidence package',
      'Zero unverified material claims in citable substantiate',
    ],
    actions: [],
  };

  const horizon180 = {
    horizon: '180_days',
    label: 'Days 91 - 180: GEO Dominance, Corroboration & Scale',
    objective: 'Dominate generative search citations across Perplexity, Copilot, and ChatGPT; build digital PR authority; govern conversion experiments.',
    focus_areas: [
      'Generative Engine Optimization (GEO): Optimize RAG chunk boundaries (150-350 words) and direct copular definitions ("X is Y")',
      'Competitive Share-of-Voice: Benchmark brand citation share and sentiment stance across AI engines vs key competitors',
      'Authority & Corroboration: Earn high-authority primary citations (.edu, .gov, standards bodies, industry reports)',
      'Conversion Rate Optimization (CRO): Implement accessible Nebula UI components and govern A/B experiment guardrails (SRM, stopping)',
      'Continuous Governance: Schedule automated version-pinned audit runs with regression alerts',
    ],
    exit_criteria: [
      'Answer-Engine readiness score >= 85/100 across Perplexity, Bing Copilot, and ChatGPT',
      'Weekly automated continuous audit pipeline with regression monitoring active',
      'Dominant citation share on primary category prompts in AI search engine probes',
      'Zero statistically invalid experiment decisions (SRM < 0.001)',
    ],
    actions: [],
  };

  // Map findings into horizons based on urgency and discipline
  for (const f of scoredFindings) {
    const ns = (f.id || '').split('-')[0];
    if (f.severity === 'critical' || ['TECH', 'CRAWL', 'STATUS'].includes(ns)) {
      horizon30.actions.push(f);
    } else if (f.severity === 'high' || ['CWV', 'SCHEMA', 'PAGE', 'LINK'].includes(ns)) {
      if (['CWV-001', 'CWV-004'].includes(f.id)) horizon30.actions.push(f);
      else horizon90.actions.push(f);
    } else if (['ANS', 'ENTITY', 'CLAIM', 'EVD'].includes(ns)) {
      horizon90.actions.push(f);
    } else {
      horizon180.actions.push(f);
    }
  }

  // Map initiatives into horizons
  for (const i of scoredInitiatives) {
    if (i.impact >= 8 && i.effort <= 4) {
      horizon30.actions.push(i);
    } else if (i.impact >= 6) {
      horizon90.actions.push(i);
    } else {
      horizon180.actions.push(i);
    }
  }

  return {
    fact_status: 'strategic_roadmap_projection',
    target_domain: targetDomain,
    generated_at: nowIso(),
    methodology: 'Horizon Phasing: 30-Day (Critical Unblock & Core CWV) -> 90-Day (E-E-A-T, Schema & Off-Page) -> 180-Day (GEO Dominance & PR)',
    horizons: [horizon30, horizon90, horizon180],
  };
}

/**
 * Format Strategic Roadmap as GitHub-flavored Markdown
 */
export function formatRoadmapMarkdown(roadmap) {
  const lines = [
    `# 30 / 90 / 180-Day Strategic Roadmap`,
    ``,
    `- Target Property: \`${roadmap.target_domain}\``,
    `- Generated: ${roadmap.generated_at}`,
    `- Governance Methodology: ${roadmap.methodology}`,
    ``,
    `> **Operating Premise Reminder**: This roadmap sequences verified remediation priorities and strategic enhancements. It establishes technical eligibility and extractability, but never guarantees ranking, traffic, or citation outcomes.`,
    ``,
  ];

  for (const h of roadmap.horizons) {
    lines.push(`## ${h.label}`);
    lines.push(``);
    lines.push(`**Objective**: ${h.objective}`);
    lines.push(``);
    lines.push(`### Strategic Focus Areas:`);
    for (const f of h.focus_areas) lines.push(`- ${f}`);
    lines.push(``);
    lines.push(`### Exit Criteria & Success Milestones:`);
    for (const c of h.exit_criteria) lines.push(`- [ ] ${c}`);
    lines.push(``);
    if (h.actions.length) {
      lines.push(`### Prioritized Actions (${h.actions.length}):`);
      lines.push(`| Action / Initiative | Impact | Effort | Conf | ICE Score | Quadrant |`);
      lines.push(`| :--- | :--- | :--- | :--- | :--- | :--- |`);
      for (const a of h.actions.slice(0, 10)) {
        lines.push(`| **${a.id}**: ${a.title.slice(0, 45)} | ${a.impact}/10 | ${a.effort}/10 | ${a.confidence}/10 | **${a.ice_score}** | ${a.quadrant} |`);
      }
      lines.push(``);
    }
  }

  return lines.join('\n');
}
