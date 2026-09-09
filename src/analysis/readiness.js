import { parse as parseHtml } from 'node-html-parser';
import { registryPageFor, safePath } from '../detectors/framework.js';

const QUESTION_RX = /^(?:how|what|why|when|where|who|can|is|does|which|should)\b|\?$/i;
const COPULA_RX = /\b(?:is|are|refers\s+to|denotes|represents|means|provides|enables)\b/i;

/**
 * Evaluates a page's extraction, retrieval, and citation readiness across
 * Perplexity, Bing Copilot, and ChatGPT / SearchGPT.
 */
export function evaluateAnswerEngineReadiness(page, ctx = {}) {
  const html = page.html || '';
  const root = parseHtml(html);
  const text = (page.text || root.textContent || '').replace(/\s+/g, ' ').trim();
  const headings = page.headings || [];
  const paragraphs = page.paragraphs || root.querySelectorAll('p').map((p) => p.text.trim()).filter(Boolean);
  const jsonLd = page.jsonLd || [];
  const tablesCount = (page.tables ?? root.querySelectorAll('table').length);
  const listsCount = (page.orderedLists ?? root.querySelectorAll('ol').length) + root.querySelectorAll('ul').length;
  const wordCount = page.rawVisibleWordCount || page.wordCount || text.split(/\s+/).filter(Boolean).length;

  // Crawler directives check (from robots Directives or headers)
  const robotsDirectives = Array.from(page.robotsDirectives || []);
  const isNoindex = robotsDirectives.some((d) => d.includes('noindex'));

  // -----------------------------------------------------------------
  // 1. PERPLEXITY READINESS
  // -----------------------------------------------------------------
  const perplexityChecks = [];
  let perplexityScore = 0;

  // Check 1: Crawler policy (PerplexityBot)
  const perplexityBotBlocked = robotsDirectives.some((d) => d.includes('perplexitybot: noindex') || d.includes('perplexitybot: none'));
  if (!perplexityBotBlocked && !isNoindex) {
    perplexityScore += 25;
    perplexityChecks.push({ name: 'Crawler Policy', passed: true, note: 'PerplexityBot allowed' });
  } else {
    perplexityChecks.push({ name: 'Crawler Policy', passed: false, note: 'Blocked by robots directive' });
  }

  // Check 2: Direct Definitional Lead (Copula in first paragraph)
  const firstParagraph = paragraphs[0] || '';
  const hasCopularLead = COPULA_RX.test(firstParagraph.slice(0, 160));
  if (hasCopularLead) {
    perplexityScore += 25;
    perplexityChecks.push({ name: 'Definitional Lead', passed: true, note: 'Concise copular definition in opening passage' });
  } else {
    perplexityChecks.push({ name: 'Definitional Lead', passed: false, note: 'Opening passage lacks concise definitional copula ("X is Y")' });
  }

  // Check 3: Structured question headings
  const questionHeadings = headings.filter((h) => QUESTION_RX.test(h.text.trim()));
  if (questionHeadings.length >= 2) {
    perplexityScore += 25;
    perplexityChecks.push({ name: 'Question Density', passed: true, note: `${questionHeadings.length} interrogative headings found` });
  } else if (questionHeadings.length === 1) {
    perplexityScore += 15;
    perplexityChecks.push({ name: 'Question Density', passed: true, note: '1 interrogative heading found' });
  } else {
    perplexityChecks.push({ name: 'Question Density', passed: false, note: 'No interrogative headings found (Q&A format optimizes extraction)' });
  }

  // Check 4: Structured data & tables for citation synthesis
  if (tablesCount >= 1 || listsCount >= 2) {
    perplexityScore += 25;
    perplexityChecks.push({ name: 'Tabular / List Data', passed: true, note: `${tablesCount} table(s), ${listsCount} list(s) for direct citation` });
  } else {
    perplexityScore += 10;
    perplexityChecks.push({ name: 'Tabular / List Data', passed: false, note: 'Limited tables or structured lists for bulleted answers' });
  }

  // -----------------------------------------------------------------
  // 2. BING COPILOT READINESS
  // -----------------------------------------------------------------
  const bingChecks = [];
  let bingScore = 0;

  // Check 1: Bingbot allowed
  const bingbotBlocked = robotsDirectives.some((d) => d.includes('bingbot: noindex'));
  if (!bingbotBlocked && !isNoindex) {
    bingScore += 25;
    bingChecks.push({ name: 'Crawler Policy', passed: true, note: 'Bingbot allowed' });
  } else {
    bingChecks.push({ name: 'Crawler Policy', passed: false, note: 'Bingbot blocked' });
  }

  // Check 2: IndexNow protocol support / fast-indexing
  const hasIndexNow = Boolean(
    ctx.registries?.connections?.entries?.some((c) => c.provider === 'indexnow') ||
    root.querySelector('link[rel="indexnow"]') ||
    ctx.config?.indexnow
  );
  if (hasIndexNow) {
    bingScore += 25;
    bingChecks.push({ name: 'IndexNow Protocol', passed: true, note: 'IndexNow instant discovery integration detected' });
  } else {
    bingScore += 10;
    bingChecks.push({ name: 'IndexNow Protocol', passed: false, note: 'IndexNow not configured; submission relies on standard crawl schedule' });
  }

  // Check 3: Schema.org JSON-LD completeness
  const validSchemaBlocks = jsonLd.flatMap((j) => j.blocks || []).filter((b) => b['@type']);
  const schemaTypes = validSchemaBlocks.map((b) => [].concat(b['@type']).join(',')).join('; ');
  if (validSchemaBlocks.length >= 2) {
    bingScore += 25;
    bingChecks.push({ name: 'Structured Data', passed: true, note: `Rich schema graphs (${schemaTypes})` });
  } else if (validSchemaBlocks.length === 1) {
    bingScore += 15;
    bingChecks.push({ name: 'Structured Data', passed: true, note: `Basic schema present (${schemaTypes})` });
  } else {
    bingChecks.push({ name: 'Structured Data', passed: false, note: 'No valid JSON-LD schema detected; Bing Copilot cards hindered' });
  }

  // Check 4: Deep page internal linking and canonical clarity
  const canonicals = page.canonicals || [];
  if (canonicals.length === 1) {
    bingScore += 25;
    bingChecks.push({ name: 'Canonical Authority', passed: true, note: `Canonical unambiguously specified (${canonicals[0]})` });
  } else {
    bingChecks.push({ name: 'Canonical Authority', passed: false, note: canonicals.length === 0 ? 'Missing canonical URL' : 'Multiple contradictory canonical tags' });
  }

  // -----------------------------------------------------------------
  // 3. CHATGPT / SEARCHGPT READINESS
  // -----------------------------------------------------------------
  const chatGptChecks = [];
  let chatGptScore = 0;

  // Check 1: OAI-SearchBot / ChatGPT-User allowed
  const oaiBlocked = robotsDirectives.some((d) => d.includes('oai-searchbot: noindex') || d.includes('chatgpt-user: noindex'));
  if (!oaiBlocked && !isNoindex) {
    chatGptScore += 25;
    chatGptScore = Math.min(100, chatGptScore);
    chatGptChecks.push({ name: 'SearchBot Policy', passed: true, note: 'OAI-SearchBot and ChatGPT-User allowed for search retrieval' });
  } else {
    chatGptChecks.push({ name: 'SearchBot Policy', passed: false, note: 'OAI-SearchBot / ChatGPT-User blocked by robots directives' });
  }

  // Check 2: RAG Chunkability (H2/H3 headers under 350 words per chunk)
  const estimatedChunks = Math.max(1, Math.ceil(wordCount / 300));
  const wordsPerHeading = headings.length > 0 ? Math.round(wordCount / headings.length) : wordCount;
  if (headings.length >= 2 && wordsPerHeading >= 80 && wordsPerHeading <= 400) {
    chatGptScore += 25;
    chatGptChecks.push({ name: 'RAG Chunkability', passed: true, note: `Optimal chunk sizes (${wordsPerHeading} words/heading across ${headings.length} headings)` });
  } else if (headings.length >= 1) {
    chatGptScore += 15;
    chatGptChecks.push({ name: 'RAG Chunkability', passed: true, note: `Sub-optimal chunking (${wordsPerHeading} words/heading)` });
  } else {
    chatGptChecks.push({ name: 'RAG Chunkability', passed: false, note: 'Monolithic content without H2/H3 hierarchy risks retrieval severance' });
  }

  // Check 3: Direct answer lead in first 100 words of section
  const SUMMARY_RX = /\b(?:executive\s+summary|key\s+takeaways?|summary|overview|quick\s+facts|highlights?)\b/i;
  const hasSummary = headings.some((h) => SUMMARY_RX.test(h.text));
  if (hasSummary || hasCopularLead) {
    chatGptScore += 25;
    chatGptChecks.push({ name: 'Direct Answer Synthesis', passed: true, note: hasSummary ? 'Executive summary / key takeaways section present' : 'Immediate answer thesis in opening paragraph' });
  } else {
    chatGptChecks.push({ name: 'Direct Answer Synthesis', passed: false, note: 'Missing executive summary or lead key takeaways section' });
  }

  // Check 4: Quantitative claim grounding
  const hasQuantitativeData = /(?:\b\d+(?:\.\d+)?%|\b\d+\s*ms\b|\b\d+\s*s\b|\$\d+(?:,\d{3})*)/.test(text);
  if (hasQuantitativeData && wordCount >= 300) {
    chatGptScore += 25;
    chatGptChecks.push({ name: 'Claim Grounding', passed: true, note: 'Specific numerical metrics and quantitative facts present' });
  } else if (wordCount >= 300) {
    chatGptScore += 15;
    chatGptChecks.push({ name: 'Claim Grounding', passed: false, note: 'Qualitative assertions without empirical statistics' });
  } else {
    chatGptChecks.push({ name: 'Claim Grounding', passed: false, note: 'Thin content lacks verifiable data' });
  }

  // Posture per engine
  const posture = (s) => (s >= 80 ? 'optimal' : s >= 50 ? 'needs_optimization' : 'obstructed');
  const perplexityStatus = posture(perplexityScore);
  const bingStatus = posture(bingScore);
  const chatGptStatus = posture(chatGptScore);

  const compositeScore = Math.round((perplexityScore + bingScore + chatGptScore) / 3);

  // Cross-engine prioritized recommendations
  const recommendations = [];
  if (!hasCopularLead) {
    recommendations.push({
      priority: 'high',
      engine: 'all',
      action: 'Add a concise definitional sentence ("X is Y") within the first 140 characters of the page',
    });
  }
  if (!hasSummary) {
    recommendations.push({
      priority: 'medium',
      engine: 'chatgpt',
      action: 'Include a "Key Takeaways" or "Executive Summary" section at the top of long-form content',
    });
  }
  if (questionHeadings.length < 2) {
    recommendations.push({
      priority: 'medium',
      engine: 'perplexity',
      action: 'Rephrase section headings as explicit user questions (e.g. "How does X work?", "What are the benefits of Y?")',
    });
  }
  if (validSchemaBlocks.length < 2) {
    recommendations.push({
      priority: 'medium',
      engine: 'bing_copilot',
      action: 'Deploy structured JSON-LD schema (FAQPage, Article, or Product) to power Copilot card extraction',
    });
  }
  if (!hasIndexNow) {
    recommendations.push({
      priority: 'low',
      engine: 'bing_copilot',
      action: 'Configure IndexNow protocol to notify Bing immediately of content updates',
    });
  }

  return {
    url: page.url,
    fact_status: 'deterministic_engine_readiness_audit',
    composite_readiness_score: compositeScore,
    engines: {
      perplexity: {
        score: perplexityScore,
        status: perplexityStatus,
        primary_bot: 'PerplexityBot',
        checks: perplexityChecks,
      },
      bing_copilot: {
        score: bingScore,
        status: bingStatus,
        primary_bot: 'Bingbot',
        checks: bingChecks,
      },
      chatgpt: {
        score: chatGptScore,
        status: chatGptStatus,
        primary_bot: 'OAI-SearchBot',
        checks: chatGptChecks,
      },
    },
    comparison_matrix: [
      { capability: 'Direct Definitional Lead', perplexity: hasCopularLead ? 'SUPPORTED' : 'MISSING', bing_copilot: hasCopularLead ? 'SUPPORTED' : 'OPTIONAL', chatgpt: hasCopularLead ? 'SUPPORTED' : 'MISSING' },
      { capability: 'Q&A Heading Structure', perplexity: questionHeadings.length >= 2 ? 'HIGH' : 'LOW', bing_copilot: questionHeadings.length >= 2 ? 'SUPPORTED' : 'OPTIONAL', chatgpt: questionHeadings.length >= 2 ? 'OPTIMAL' : 'MODERATE' },
      { capability: 'Structured Data (JSON-LD)', perplexity: validSchemaBlocks.length ? 'PARSED' : 'FALLBACK', bing_copilot: validSchemaBlocks.length ? 'REQUIRED_CARD' : 'OBSTRUCTED', chatgpt: validSchemaBlocks.length ? 'GROUNDED' : 'PLAIN_TEXT' },
      { capability: 'RAG Section Chunkability', perplexity: wordsPerHeading <= 400 ? 'OPTIMAL' : 'LONG', bing_copilot: 'STANDARD', chatgpt: wordsPerHeading <= 400 ? 'OPTIMAL' : 'SEVERED' },
      { capability: 'Crawler Directives', perplexity: perplexityBotBlocked ? 'BLOCKED' : 'ALLOWED', bing_copilot: bingbotBlocked ? 'BLOCKED' : 'ALLOWED', chatgpt: oaiBlocked ? 'BLOCKED' : 'ALLOWED' },
    ],
    recommendations,
  };
}
