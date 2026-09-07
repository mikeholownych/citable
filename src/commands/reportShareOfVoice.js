import fs from 'node:fs';
import path from 'node:path';
import {
  calculateShareOfVoice,
  extractDomain,
  loadCitationRuns,
  renderShareOfVoiceHtml,
  renderShareOfVoiceMarkdown,
} from '../reporting/shareOfVoice.js';
import { loadRegistries } from '../registries/index.js';

/**
 * `citable report share-of-voice` — compute first-party and competitor citation share
 * across recorded observation runs. Never invents competitor citations; unevidenced
 * prompts and competitors are reported plainly.
 */
export function reportShareOfVoice(root, { since, last } = {}) {
  if (last != null && (!Number.isInteger(last) || last < 1)) {
    throw new Error('--last must be a positive integer');
  }

  const { registries } = loadRegistries(root);
  const competitors = registries.competitors?.entries || [];

  const firstPartyDomains = new Set();
  if (registries.config?.site?.base_url) {
    const d = extractDomain(registries.config.site.base_url);
    if (d) firstPartyDomains.add(d);
  }
  if (registries.pages?.entries) {
    for (const p of registries.pages.entries) {
      if (p.url) {
        const d = extractDomain(p.url);
        if (d) firstPartyDomains.add(d);
      }
    }
  }

  const { included, skipped } = loadCitationRuns(root, { since, last });
  const data = calculateShareOfVoice(included, competitors, firstPartyDomains);

  const dir = path.join(root, '.citable', 'reports');
  const pathMd = path.join(dir, 'share-of-voice.md');
  const pathHtml = path.join(dir, 'share-of-voice.html');

  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(pathMd, renderShareOfVoiceMarkdown(data, skipped));
  fs.writeFileSync(pathHtml, renderShareOfVoiceHtml(data, skipped));

  return {
    dir,
    included: included.length,
    skipped: skipped.length,
    competitors_evaluated: competitors.length,
    prompts_evaluated: data.prompts.length,
    total_citations: data.total_citations_recorded,
    path_md: pathMd,
    path_html: pathHtml,
  };
}
