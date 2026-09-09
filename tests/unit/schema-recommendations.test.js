import test from 'node:test';
import assert from 'node:assert/strict';
import { recommendSchemaForPages } from '../../src/analysis/schemaRecommendations.js';

test('recommendSchemaForPages recommends FAQPage when Q&A content is detected', () => {
  const page = {
    url: 'https://example.com/faq',
    status: 200,
    html: `<!DOCTYPE html>
<html>
<body>
  <h1>Frequently Asked Questions</h1>
  <h2>What is Citable?</h2>
  <p>Citable is an operational quality and governance layer for search and AI engine citation readiness.</p>
  <h2>How do I install the skill?</h2>
  <p>Run npx citable install across your agent harnesses including Claude, Gemini, and Cursor.</p>
</body>
</html>`,
    headings: [
      { level: 1, text: 'Frequently Asked Questions' },
      { level: 2, text: 'What is Citable?' },
      { level: 2, text: 'How do I install the skill?' },
    ],
    paragraphs: [
      'Citable is an operational quality and governance layer for search and AI engine citation readiness.',
      'Run npx citable install across your agent harnesses including Claude, Gemini, and Cursor.',
    ],
    jsonLd: [],
  };

  const recs = recommendSchemaForPages([page]);
  assert.equal(recs.faq.length, 1);
  const faq = recs.faq[0];
  assert.equal(faq.schema_type, 'FAQPage');
  assert.equal(faq.target_url, 'https://example.com/faq');
  assert.equal(faq.jsonld['@type'], 'FAQPage');
  assert.equal(faq.jsonld.mainEntity.length, 2);
  assert.equal(faq.jsonld.mainEntity[0].name, 'What is Citable?');
  assert.match(faq.jsonld.mainEntity[0].acceptedAnswer.text, /Citable is an operational/);
});

test('recommendSchemaForPages recommends Speakable for pages with executive summary', () => {
  const page = {
    url: 'https://example.com/report',
    status: 200,
    title: 'Q3 Enterprise Architecture Report',
    html: `<!DOCTYPE html>
<html>
<body>
  <h1>Q3 Enterprise Architecture Report</h1>
  <div class="executive-summary">
    <p>This report presents our operational findings across 12 distributed data pipelines.</p>
  </div>
</body>
</html>`,
    headings: [{ level: 1, text: 'Q3 Enterprise Architecture Report' }],
    paragraphs: ['This report presents our operational findings across 12 distributed data pipelines.'],
    jsonLd: [],
  };

  const recs = recommendSchemaForPages([page]);
  assert.equal(recs.speakable.length, 1);
  const speakable = recs.speakable[0];
  assert.equal(speakable.schema_type, 'SpeakableSpecification');
  assert.deepEqual(speakable.jsonld.speakable.cssSelector, ['h1', '.executive-summary']);
});

test('recommendSchemaForPages recommends HowTo for procedural step-by-step pages', () => {
  const page = {
    url: 'https://example.com/how-to-deploy',
    status: 200,
    title: 'How to Deploy Enterprise Edge Rules',
    html: `<!DOCTYPE html>
<html>
<body>
  <h1>How to Deploy Enterprise Edge Rules</h1>
  <p>Follow this step-by-step procedure to deploy edge security policies.</p>
  <ol>
    <li>Generate the edge configuration spec via citable edge export.</li>
    <li>Validate the rule payload against cloudflare-worker ruleset.</li>
    <li>Deploy using wrangle or CI pipeline.</li>
  </ol>
</body>
</html>`,
    headings: [{ level: 1, text: 'How to Deploy Enterprise Edge Rules' }],
    paragraphs: ['Follow this step-by-step procedure to deploy edge security policies.'],
    jsonLd: [],
  };

  const recs = recommendSchemaForPages([page]);
  assert.equal(recs.howto.length, 1);
  const howto = recs.howto[0];
  assert.equal(howto.schema_type, 'HowTo');
  assert.equal(howto.jsonld['@type'], 'HowTo');
  assert.equal(howto.jsonld.step.length, 3);
  assert.equal(howto.jsonld.step[0].name, 'Step 1');
  assert.match(howto.jsonld.step[0].text, /Generate the edge configuration/);
});
