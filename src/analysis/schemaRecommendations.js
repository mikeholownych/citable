import { parse as parseHtml } from 'node-html-parser';

const QUESTION_RX = /^(?:how|what|why|when|where|who|can|is|does|which|should)\b|\?$/i;
const HOWTO_TITLE_RX = /^(?:how\s+to|how\s+do\s+i|step-by-step|guide\s+to)\b/i;

/**
 * Scan audited site pages for FAQPage, Speakable, and HowTo markup opportunities.
 */
export function recommendSchemaForPages(pages = []) {
  const recommendations = {
    faq: [],
    speakable: [],
    howto: [],
  };

  for (const page of pages) {
    if (!page || page.status !== 200) continue;
    const html = page.html || '';
    const root = parseHtml(html);
    const existingTypes = new Set(
      (page.jsonLd || []).flatMap((j) => j.blocks || []).flatMap((b) => [].concat(b['@type'] || []))
    );

    // -------------------------------------------------------------
    // 1. FAQPage Recommendation
    // -------------------------------------------------------------
    if (!existingTypes.has('FAQPage')) {
      const qas = [];

      // Pattern A: <details><summary>Q</summary><p>A</p></details>
      for (const details of root.querySelectorAll('details')) {
        const summary = details.querySelector('summary');
        if (summary) {
          const questionText = summary.text.trim();
          const clone = parseHtml(details.innerHTML);
          const s = clone.querySelector('summary');
          if (s) s.remove();
          const answerText = clone.text.replace(/\s+/g, ' ').trim();
          if (questionText && answerText) {
            qas.push({ question: questionText, answer: answerText });
          }
        }
      }

      // Pattern B: Question headings followed by paragraphs
      if (qas.length < 2) {
        const headings = root.querySelectorAll('h2, h3');
        for (const h of headings) {
          const hText = h.text.trim();
          if (QUESTION_RX.test(hText)) {
            // Find next sibling paragraph
            let next = h.nextElementSibling;
            let answerText = '';
            while (next && !['H1', 'H2', 'H3', 'H4'].includes(next.tagName)) {
              if (['P', 'UL', 'OL', 'DIV'].includes(next.tagName)) {
                answerText += (answerText ? ' ' : '') + next.text.replace(/\s+/g, ' ').trim();
                if (answerText.length > 60) break;
              }
              next = next.nextElementSibling;
            }
            if (hText && answerText) {
              qas.push({ question: hText, answer: answerText });
            }
          }
        }
      }

      if (qas.length >= 2) {
        recommendations.faq.push({
          target_url: page.url,
          source_file: page.sourceFile || null,
          schema_type: 'FAQPage',
          rationale: `Detected ${qas.length} visible question-and-answer pairs without FAQPage schema.`,
          jsonld: {
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: qas.slice(0, 10).map((qa) => ({
              '@type': 'Question',
              name: qa.question,
              acceptedAnswer: {
                '@type': 'Answer',
                text: qa.answer,
              },
            })),
          },
        });
      }
    }

    // -------------------------------------------------------------
    // 2. Speakable Recommendation (SpeakableSpecification)
    // -------------------------------------------------------------
    const hasExistingSpeakable = (page.jsonLd || []).some((j) =>
      (j.blocks || []).some((b) => b.speakable)
    );

    if (!hasExistingSpeakable) {
      const speakableSelectors = [];
      if (root.querySelector('h1')) speakableSelectors.push('h1');
      if (root.querySelector('#summary, .executive-summary, .summary, .key-takeaways')) {
        speakableSelectors.push(root.querySelector('#summary') ? '#summary' : '.executive-summary');
      } else if (root.querySelector('article > p:first-of-type, main > p:first-of-type, p:first-of-type')) {
        speakableSelectors.push('article > p:first-of-type');
      }

      if (speakableSelectors.length >= 2) {
        recommendations.speakable.push({
          target_url: page.url,
          source_file: page.sourceFile || null,
          schema_type: 'SpeakableSpecification',
          rationale: 'Page has clear title and executive lead passage suitable for smart speaker / assistant audio playback.',
          jsonld: {
            '@context': 'https://schema.org',
            '@type': 'WebPage',
            '@id': `${page.url}#webpage`,
            url: page.url,
            name: page.title || 'Page',
            speakable: {
              '@type': 'SpeakableSpecification',
              cssSelector: speakableSelectors,
            },
          },
        });
      }
    }

    // -------------------------------------------------------------
    // 3. HowTo Recommendation
    // -------------------------------------------------------------
    if (!existingTypes.has('HowTo')) {
      const pageTitle = page.title || '';
      const h1s = (page.headings || []).filter((h) => h.level === 1).map((h) => h.text);
      const isHowToPage = HOWTO_TITLE_RX.test(pageTitle) || h1s.some((h) => HOWTO_TITLE_RX.test(h));

      if (isHowToPage) {
        const steps = [];
        // Look for ordered list items or step subheadings
        const olItems = root.querySelectorAll('ol > li');
        if (olItems.length >= 2) {
          olItems.forEach((li, idx) => {
            const stepText = li.text.replace(/\s+/g, ' ').trim();
            if (stepText) {
              steps.push({
                '@type': 'HowToStep',
                position: idx + 1,
                name: `Step ${idx + 1}`,
                text: stepText,
              });
            }
          });
        }

        if (steps.length >= 2) {
          recommendations.howto.push({
            target_url: page.url,
            source_file: page.sourceFile || null,
            schema_type: 'HowTo',
            rationale: `Procedural instructional guide detected with ${steps.length} ordered steps.`,
            jsonld: {
              '@context': 'https://schema.org',
              '@type': 'HowTo',
              name: h1s[0] || pageTitle,
              description: page.paragraphs?.[0] || 'Procedural guide and instructions.',
              step: steps,
            },
          });
        }
      }
    }
  }

  return recommendations;
}
