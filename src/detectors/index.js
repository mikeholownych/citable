import tech from './tech.js';
import crawl from './crawl.js';
import arch from './arch.js';
import page from './page.js';
import ans from './ans.js';
import entity from './entity.js';
import claim from './claim.js';
import evd from './evd.js';
import schemaData from './schemaData.js';
import link from './link.js';
import geoReco from './geoReco.js';
import lifeMeas from './lifeMeas.js';
import { hreflangDetectors } from './hreflang.js';
import { cwvDetectors } from './cwv.js';

export const ALL_DETECTORS = [...tech, ...crawl, ...arch, ...page, ...ans, ...entity, ...claim, ...evd, ...schemaData, ...link, ...geoReco, ...lifeMeas, ...hreflangDetectors, ...cwvDetectors];

const ids = new Set();
for (const d of ALL_DETECTORS) {
  if (ids.has(d.id)) throw new Error(`duplicate detector id: ${d.id}`);
  ids.add(d.id);
}

export function detectorsByNamespace() {
  const out = {};
  for (const d of ALL_DETECTORS) (out[d.namespace] ||= []).push(d);
  return out;
}

export function selectDetectors({ scope, namespaces, discipline } = {}) {
  let ds = ALL_DETECTORS;
  if (namespaces?.length) ds = ds.filter((d) => namespaces.includes(d.namespace));
  if (discipline) ds = ds.filter((d) => d.discipline.includes(discipline));
  if (scope) {
    const scopeMap = {
      technical: ['TECH', 'CRAWL', 'LINK'],
      seo: null, // discipline filter handles it
      aeo: null,
      geo: null,
      architecture: ['ARCH', 'LINK'],
      entity: ['ENTITY'],
      claims: ['CLAIM'],
      evidence: ['EVD'],
      schema: ['SCHEMA'],
      lifecycle: ['LIFE'],
      corroboration: ['EXT'],
    };
    if (scopeMap[scope]) ds = ds.filter((d) => scopeMap[scope].includes(d.namespace));
    else if (['seo', 'aeo', 'geo'].includes(scope)) ds = ds.filter((d) => d.discipline.includes(scope));
  }
  return ds;
}
