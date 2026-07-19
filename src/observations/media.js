import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'node-html-parser';
import { envelope, observationRun, readInput } from './common.js';
import { loadRegistries } from '../registries/index.js';
import { validateAgainst } from '../shared/schemaValidator.js';

function resolveMediaPath(manifestFile, value) {
  const file = path.resolve(path.dirname(manifestFile), value);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error(`media file not found: ${value}`);
  return file;
}

async function pdfEvidence(item, file, artifacts) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const bytes = new Uint8Array(fs.readFileSync(file));
  const document = await pdfjs.getDocument({ data: bytes, disableWorker: true, useSystemFonts: true }).promise;
  const metadata = await document.getMetadata().catch(() => ({ info: {}, metadata: null }));
  const pages = [];
  for (let number = 1; number <= document.numPages; number++) {
    const page = await document.getPage(number);
    const content = await page.getTextContent();
    const text = content.items.map((entry) => entry.str).join(' ').replace(/\s+/g, ' ').trim();
    pages.push({ page: number, text, word_count: text ? text.split(/\s+/).length : 0, anchor: `${item.source_url || file}#page=${number}` });
  }
  artifacts[`media/${item.media_id}/extracted.txt`] = pages.map((page) => `--- page ${page.page} ---\n${page.text}`).join('\n');
  return envelope('media_pdf', { media_id: item.media_id, source_url: item.source_url, page_url: item.page_url, claim_ids: item.claim_ids, permission_status: item.permission_status, page_count: document.numPages, pages, metadata: metadata.info || {}, tagged: Boolean(metadata.info?.IsTagged) }, { method: 'static_analysis', source: file, raw: bytes, confidence: 'high', limitations: ['Reading order, tables, footnotes, signatures, revisions, accessibility tags, and scanned text are not fully validated.', 'Page text extraction does not establish that linked claims are supported.'] });
}

function transcriptEvidence(item, file, artifacts) {
  const raw = fs.readFileSync(file, 'utf8');
  const cues = raw.split(/\r?\n\r?\n/).map((block) => {
    const lines = block.split(/\r?\n/).filter(Boolean);
    const timing = lines.find((line) => line.includes('-->')) || null;
    const fragment = parse(lines.filter((line) => line !== 'WEBVTT' && line !== timing && !/^\d+$/.test(line)).join(' '));
    for (const node of fragment.querySelectorAll('script,style')) node.remove();
    const text = fragment.textContent.replace(/\s+/g, ' ').trim();
    return text ? { timing, text } : null;
  }).filter(Boolean);
  const text = cues.map((cue) => cue.text).join(' ');
  artifacts[`media/${item.media_id}/transcript.txt`] = text;
  return envelope('media_transcript', { media_id: item.media_id, source_url: item.source_url, page_url: item.page_url, claim_ids: item.claim_ids, permission_status: item.permission_status, language: item.language || null, published_at: item.published_at || null, cues, word_count: text ? text.split(/\s+/).length : 0 }, { method: 'owner_import', source: file, raw, limitations: ['Speaker identity, transcription accuracy, timing accuracy, and media parity require human verification.', 'Transcript ingestion does not establish that linked claims are supported.'] });
}

async function imageEvidence(item, file, options) {
  const html = fs.readFileSync(file, 'utf8');
  const root = parse(html);
  const images = root.querySelectorAll('img');
  const image = item.image_src ? images.find((node) => node.getAttribute('src') === item.image_src) : images[0];
  if (!image) return envelope('media_image', { media_id: item.media_id, image_src: item.image_src || null, page_url: item.page_url, claim_ids: item.claim_ids }, { method: 'static_analysis', source: file, raw: html, state: 'not_observed', limitations: ['No matching image was found in the supplied HTML.'] });
  const figure = image.closest('figure');
  const caption = figure?.querySelector('figcaption')?.text.replace(/\s+/g, ' ').trim() || null;
  const alt = image.getAttribute('alt');
  const nearby_text = (figure || image.parentNode)?.text?.replace(/\s+/g, ' ').trim() || null;
  let ocr = { state: 'not_requested', text: null };
  if (options.ocr) {
    try { const tesseract = await import('tesseract.js'); const result = await tesseract.recognize(path.resolve(path.dirname(file), image.getAttribute('src')), item.language || 'eng'); ocr = { state: 'observed', text: result.data.text }; }
    catch { ocr = { state: 'not_evidenced', text: null }; }
  }
  return envelope('media_image', { media_id: item.media_id, image_src: image.getAttribute('src'), source_url: item.source_url, page_url: item.page_url, claim_ids: item.claim_ids, permission_status: item.permission_status, alt: alt ?? null, caption, nearby_text, ocr }, { method: 'static_analysis', source: file, raw: html, state: options.ocr && ocr.state === 'not_evidenced' ? 'incomplete' : 'observed', confidence: 'high', limitations: [...(!alt && !caption ? ['Neither alt text nor a figure caption supplies textual context.'] : []), ...(ocr.state === 'not_evidenced' ? ['OCR was explicitly requested but the optional tesseract.js dependency or image resource was unavailable.'] : []), 'Alt text, captions, nearby text, and OCR do not establish semantic equivalence or claim support.'] });
}

export async function observeMedia(root, options) {
  const input = readInput(options.input);
  const check = validateAgainst('media-manifest.schema.json', input.value);
  if (!check.valid) throw new Error(`media manifest violates contract: ${check.errors.join('; ')}`);
  const { registries, problems } = loadRegistries(root);
  if (problems.length) throw new Error(`registry validation failed: ${problems.join('; ')}`);
  const claimIds = new Set(registries.claims.entries.map((claim) => claim.claim_id));
  const observations = [], artifacts = {}, rawInputs = { media_manifest: input.raw };
  for (const item of input.value.items) {
    const unknown = item.claim_ids.filter((id) => !claimIds.has(id));
    if (unknown.length) throw new Error(`${item.media_id} references unknown claim ids: ${unknown.join(', ')}`);
    const file = resolveMediaPath(input.file, item.path);
    rawInputs[`media_${item.media_id}`] = fs.readFileSync(file);
    if (item.type === 'pdf') observations.push(await pdfEvidence(item, file, artifacts));
    else if (item.type === 'transcript') observations.push(transcriptEvidence(item, file, artifacts));
    else observations.push(await imageEvidence(item, file, options));
  }
  const incomplete = observations.filter((item) => item.state === 'incomplete').map((item) => `${item.data.media_id}: requested extraction is incomplete`);
  return observationRun(root, 'observe media', input.file, observations, { rawInputs, artifacts, incomplete });
}
