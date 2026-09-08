import { defineDetector, indexTargets, pageSubject, safePath } from './framework.js';
import { isPastDate } from '../shared/io.js';

const D = [];

D.push(defineDetector({
  id: 'SCHEMA-001', name: 'JSON-LD parse failure', namespace: 'SCHEMA',
  description: 'A JSON-LD script block does not parse as JSON.',
  discipline: ['seo', 'aeo', 'geo'], severity: 'high', deterministic: true, requires: ['site'],
  impact: { ranking: 'medium', representation: 'medium' },
  applicable_requirement: 'SEO §7 schema validation in CI/CD; detector spec: JSON-LD parse failure',
  remediation: 'Fix the JSON syntax; generate JSON-LD from data structures rather than hand-edited strings.',
  verification: 'All ld+json blocks parse.',
  check(ctx) {
    const hits = [];
    for (const p of ctx.site.pages) {
      for (const j of p.jsonLd) {
        if (j.parseError) {
          hits.push({
            subject: { type: 'schema_block', identifier: `${p.url}#ld+json`, url: p.url, ...(p.sourceFile ? { source_file: p.sourceFile } : {}) },
            summary: `JSON-LD block fails to parse: ${j.parseError}`,
            evidence: [`parse error: ${j.parseError}`, `block head: ${j.raw.slice(0, 120)}`],
          });
        }
      }
    }
    return hits;
  },
}));

D.push(defineDetector({
  id: 'SCHEMA-002', name: 'Schema headline/name mismatch with visible content', namespace: 'SCHEMA',
  description: 'Article/WebPage headline in JSON-LD does not match the visible title or H1.',
  discipline: ['seo', 'aeo'], severity: 'medium', deterministic: true, requires: ['site'],
  impact: { representation: 'medium' },
  applicable_requirement: 'Premise 3.4: structured data must match visible content; SEO §7 no invisible marked-up claims',
  remediation: 'Generate the headline from the same authoritative field that renders the visible title.',
  verification: 'Schema headline equals visible title or H1.',
  check(ctx) {
    const hits = [];
    for (const p of indexTargets(ctx)) {
      for (const j of p.jsonLd) {
        for (const b of j.blocks) {
          const type = [].concat(b['@type'] || []).join(',');
          if (!/Article|BlogPosting|TechArticle|WebPage/i.test(type)) continue;
          const headline = b.headline || b.name;
          if (!headline) continue;
          const visible = [p.title, ...(p.h1s.map((h) => h.text))].filter(Boolean).map((s) => s.toLowerCase().trim());
          if (!visible.some((v) => v.includes(String(headline).toLowerCase().trim()) || String(headline).toLowerCase().trim().includes(v))) {
            hits.push({
              subject: { type: 'schema_block', identifier: `${p.url}#${type}`, url: p.url },
              summary: `Schema headline "${headline}" does not match visible title or H1`,
              evidence: [`schema headline: ${headline}`, `visible title: ${p.title}`, `H1: ${p.h1s.map((h) => h.text).join(' | ') || 'none'}`],
            });
          }
        }
      }
    }
    return hits;
  },
}));

D.push(defineDetector({
  id: 'SCHEMA-003', name: 'Schema URL conflicts with canonical', namespace: 'SCHEMA',
  description: 'JSON-LD url/mainEntityOfPage disagrees with the page canonical.',
  discipline: ['seo'], severity: 'medium', deterministic: true, requires: ['site'],
  impact: { ranking: 'medium' },
  applicable_requirement: 'SEO §2 canonical signals should agree across structured data URLs',
  remediation: 'Emit the canonical URL in structured data.',
  verification: 'Schema url matches rel=canonical.',
  check(ctx) {
    const hits = [];
    for (const p of indexTargets(ctx)) {
      if (p.canonicals.length !== 1) continue;
      const canon = safePath(p.canonicals[0], p.url);
      for (const j of p.jsonLd) {
        for (const b of j.blocks) {
          const u = typeof b.url === 'string' ? b.url : typeof b.mainEntityOfPage === 'string' ? b.mainEntityOfPage : b.mainEntityOfPage?.['@id'];
          if (u && /WebPage|Article|BlogPosting|TechArticle/i.test([].concat(b['@type'] || []).join(',')) && safePath(u, p.url) !== canon) {
            hits.push({
              subject: { type: 'schema_block', identifier: `${p.url}#url`, url: p.url },
              summary: `Schema URL ${u} conflicts with canonical ${p.canonicals[0]}`,
              evidence: [`schema url: ${u}`, `canonical: ${p.canonicals[0]}`],
            });
          }
        }
      }
    }
    return hits;
  },
}));

D.push(defineDetector({
  id: 'SCHEMA-004', name: 'Inaccurate schema dates', namespace: 'SCHEMA',
  description: 'datePublished is in the future, or dateModified precedes datePublished.',
  discipline: ['seo', 'aeo'], severity: 'medium', deterministic: true, requires: ['site'],
  impact: { representation: 'medium' },
  applicable_requirement: 'SEO §7 accurate dates; AEO §8 do not update dates without material updates',
  remediation: 'Derive dates from the content system of record.',
  verification: 'datePublished ≤ dateModified ≤ now.',
  check(ctx) {
    const now = ctx.refDate ?? new Date();
    const hits = [];
    for (const p of ctx.site.pages) {
      for (const j of p.jsonLd) {
        for (const b of j.blocks) {
          const pub = b.datePublished ? new Date(b.datePublished) : null;
          const mod = b.dateModified ? new Date(b.dateModified) : null;
          if (pub && !Number.isNaN(pub.getTime()) && pub > now) {
            hits.push({
              subject: { type: 'schema_block', identifier: `${p.url}#datePublished`, url: p.url },
              summary: `datePublished ${b.datePublished} is in the future`,
              evidence: [`datePublished: ${b.datePublished}; audit reference date: ${now.toISOString().slice(0, 10)}`],
            });
          }
          if (pub && mod && !Number.isNaN(pub.getTime()) && !Number.isNaN(mod.getTime()) && mod < pub) {
            hits.push({
              subject: { type: 'schema_block', identifier: `${p.url}#dateModified`, url: p.url },
              summary: `dateModified ${b.dateModified} precedes datePublished ${b.datePublished}`,
              evidence: [`dateModified: ${b.dateModified}; datePublished: ${b.datePublished}`],
            });
          }
        }
      }
    }
    return hits;
  },
}));

D.push(defineDetector({
  id: 'SCHEMA-005', name: 'Rating/review markup without visible reviews', namespace: 'SCHEMA',
  description: 'aggregateRating or review markup exists but the visible page contains no review content.',
  discipline: ['seo'], severity: 'critical', deterministic: true, requires: ['site'],
  impact: { legal: 'high', reputational: 'high', ranking: 'medium' },
  applicable_requirement: 'Premise 3.4: no fabricated ratings or reviews; SEO §7 required controls',
  remediation: 'Remove the rating markup unless genuine, visible, attributable reviews exist.',
  unsafe_shortcuts: ['keeping the markup and adding boilerplate "reviews" text'],
  verification: 'Rating markup exists only alongside visible review content.',
  check(ctx) {
    const reviewRx = /\b(review(s|ed)?|rating|testimonial)\b/i;
    const hits = [];
    for (const p of ctx.site.pages) {
      for (const j of p.jsonLd) {
        for (const b of j.blocks) {
          if ((b.aggregateRating || b.review) && !reviewRx.test(p.text)) {
            hits.push({
              subject: { type: 'schema_block', identifier: `${p.url}#aggregateRating`, url: p.url },
              summary: 'Rating/review markup present but no visible review content on the page',
              evidence: [`schema contains ${b.aggregateRating ? 'aggregateRating' : 'review'}`, 'page text contains no review/rating/testimonial content'],
            });
          }
        }
      }
    }
    return hits;
  },
}));

D.push(defineDetector({
  id: 'SCHEMA-006', name: 'Stale offer price validity', namespace: 'SCHEMA',
  description: 'Offer markup carries a priceValidUntil in the past.',
  discipline: ['seo', 'geo'], severity: 'medium', deterministic: true, requires: ['site'],
  impact: { representation: 'high', conversion: 'medium' },
  applicable_requirement: 'Premise 3.4: avoid stale prices or availability; GEO §11 pricing: immediate on change',
  remediation: 'Regenerate offers from live commercial data; remove expired offers.',
  verification: 'No offer has priceValidUntil in the past.',
  check(ctx) {
    const hits = [];
    for (const p of ctx.site.pages) {
      for (const j of p.jsonLd) {
        for (const b of j.blocks) {
          const offers = [].concat(b.offers || []);
          for (const o of offers) {
            if (o && o.priceValidUntil && isPastDate(o.priceValidUntil, ctx.refDate)) {
              hits.push({
                subject: { type: 'schema_block', identifier: `${p.url}#offers`, url: p.url },
                summary: `Offer priceValidUntil ${o.priceValidUntil} is in the past`,
                evidence: [`priceValidUntil: ${o.priceValidUntil}; price: ${o.price ?? '?'}`],
              });
            }
          }
        }
      }
    }
    return hits;
  },
}));

D.push(defineDetector({
  id: 'SCHEMA-007', name: 'FAQPage markup without matching visible questions', namespace: 'SCHEMA',
  description: 'FAQPage JSON-LD questions do not appear in the visible page text.',
  discipline: ['seo', 'aeo'], severity: 'high', deterministic: true, requires: ['site'],
  impact: { legal: 'medium', ranking: 'medium' },
  applicable_requirement: 'AEO §6 do not deploy mass-generated FAQ schema; anti-pattern: FAQ schema without substantive FAQ content',
  remediation: 'Only mark up FAQs that are visible, substantive page content.',
  verification: 'Every FAQPage question string appears in visible text.',
  check(ctx) {
    const hits = [];
    for (const p of ctx.site.pages) {
      for (const j of p.jsonLd) {
        for (const b of j.blocks) {
          if (![].concat(b['@type'] || []).includes('FAQPage')) continue;
          const questions = [].concat(b.mainEntity || []).map((q) => q?.name).filter(Boolean);
          const missing = questions.filter((q) => !p.text.toLowerCase().includes(String(q).toLowerCase().slice(0, 40)));
          if (questions.length > 0 && missing.length > 0) {
            hits.push({
              subject: { type: 'schema_block', identifier: `${p.url}#FAQPage`, url: p.url },
              summary: `${missing.length}/${questions.length} FAQ schema questions not found in visible content`,
              evidence: missing.slice(0, 3).map((q) => `not visible: "${q}"`),
            });
          }
        }
      }
    }
    return hits;
  },
}));

D.push(defineDetector({
  id: 'SCHEMA-008', name: 'Contradictory Organization graphs', namespace: 'SCHEMA',
  description: 'Multiple Organization blocks exist with the same @id but different names, or different @id values with the same name (split identity).',
  discipline: ['geo', 'seo'], severity: 'high', deterministic: true, requires: ['site'],
  impact: { representation: 'high' },
  applicable_requirement: 'Detector spec: multiple contradictory entity graphs; GEO §9 graph consistency',
  remediation: 'Emit one shared Organization node from a single data source; reference it by @id everywhere else.',
  verification: 'One @id ↔ one name for the organization across all pages.',
  check(ctx) {
    const byId = new Map();
    for (const p of ctx.site.pages) {
      for (const j of p.jsonLd) {
        for (const b of j.blocks) {
          if (!/Organization|Corporation/i.test([].concat(b['@type'] || []).join(','))) continue;
          if (!b['@id'] || !b.name) continue;
          if (!byId.has(b['@id'])) byId.set(b['@id'], new Set());
          byId.get(b['@id']).add(String(b.name));
        }
      }
    }
    return [...byId.entries()]
      .filter(([, names]) => names.size > 1)
      .map(([id, names]) => ({
        subject: { type: 'schema_block', identifier: id },
        summary: `Organization @id ${id} carries ${names.size} different names: ${[...names].join(' / ')}`,
        evidence: [...names].map((n) => `name: ${n}`),
      }));
  },
}));

D.push(defineDetector({
  id: 'SCHEMA-009', name: 'Structured data entity facts unsupported by visible content', namespace: 'SCHEMA',
  description: 'Material entity facts in JSON-LD (such as contact phone, address, pricing, or founding year) are absent from visible page content.',
  discipline: ['seo', 'aeo', 'geo'], severity: 'high', deterministic: true, requires: ['site'],
  impact: { representation: 'high', legal: 'medium' },
  applicable_requirement: 'Premise 3.4: structured data must match visible content; Google Structured Data General Guidelines: no invisible marked-up facts',
  remediation: 'Ensure all facts declared in Schema.org JSON-LD are visibly presented to users in the rendered page text, or remove the ungrounded markup.',
  verification: 'Confirm every material schema property has matching visible text on the page.',
  check(ctx) {
    const hits = [];
    for (const p of ctx.site.pages) {
      const pageText = (p.text || '').toLowerCase();
      const pageDigits = (p.text || '').replace(/\D/g, '');
      for (const j of p.jsonLd) {
        for (const b of j.blocks) {
          if (!b || typeof b !== 'object') continue;
          // Check telephone
          if (b.telephone && typeof b.telephone === 'string') {
            const telDigits = b.telephone.replace(/\D/g, '');
            if (telDigits.length >= 7 && !pageDigits.includes(telDigits)) {
              hits.push({
                subject: { type: 'schema_block', identifier: `${p.url}#telephone`, url: p.url },
                summary: `Schema telephone "${b.telephone}" not found in visible page content`,
                evidence: [`schema declares telephone: ${b.telephone}`, 'visible text contains no matching phone number'],
                captured: b.telephone,
                expected: 'matching visible phone number',
              });
            }
          }
          // Check email
          if (b.email && typeof b.email === 'string') {
            const email = b.email.trim().toLowerCase();
            if (email.includes('@') && !pageText.includes(email)) {
              hits.push({
                subject: { type: 'schema_block', identifier: `${p.url}#email`, url: p.url },
                summary: `Schema email "${b.email}" not found in visible page content`,
                evidence: [`schema declares email: ${b.email}`, 'visible text contains no matching email address'],
                captured: b.email,
                expected: 'matching visible email address',
              });
            }
          }
          // Check postalAddress
          const address = b.address;
          if (address && typeof address === 'object') {
            if (address.postalCode && typeof address.postalCode === 'string') {
              const zip = address.postalCode.trim().toLowerCase();
              if (zip.length >= 3 && !pageText.includes(zip)) {
                hits.push({
                  subject: { type: 'schema_block', identifier: `${p.url}#postalCode`, url: p.url },
                  summary: `Schema postalCode "${address.postalCode}" not found in visible page content`,
                  evidence: [`schema declares postalCode: ${address.postalCode}`, 'visible text contains no matching postal code'],
                  captured: address.postalCode,
                  expected: 'matching visible postal code',
                });
              }
            }
          }
          // Check price in offers
          if (b.offers) {
            const offers = [].concat(b.offers);
            for (const off of offers) {
              if (off && off.price !== undefined && off.price !== null) {
                const priceStr = String(off.price);
                if (priceStr && !pageText.includes(priceStr)) {
                  hits.push({
                    subject: { type: 'schema_block', identifier: `${p.url}#price`, url: p.url },
                    summary: `Schema offer price "${off.price}" not found in visible page content`,
                    evidence: [`schema declares price: ${off.price}`, 'visible text contains no matching price figure'],
                    captured: off.price,
                    expected: 'matching visible price',
                  });
                }
              }
            }
          }
        }
      }
    }
    return hits;
  },
}));

D.push(defineDetector({
  id: 'SCHEMA-010', name: 'Dangling or circular @id reference in entity graph', namespace: 'SCHEMA',
  description: 'A JSON-LD node references an @id URI that is not defined on the site or creates a circular self-reference.',
  discipline: ['geo', 'seo'], severity: 'high', deterministic: true, requires: ['site'],
  impact: { representation: 'high' },
  applicable_requirement: 'GEO §9 graph consistency and entity resolution; Schema.org graph reference integrity',
  remediation: 'Ensure all @id references point to defined entity nodes on the site, and resolve circular reference loops.',
  verification: 'All referenced @id targets exist in the graph and graph references are acyclic.',
  check(ctx) {
    const hits = [];
    const siteDefinedIds = new Set();

    // Collect all defined @id values across all blocks on the site
    for (const p of ctx.site.pages) {
      for (const j of p.jsonLd) {
        for (const b of j.blocks) {
          if (b && b['@id'] && typeof b['@id'] === 'string') {
            siteDefinedIds.add(b['@id']);
            try {
              const u = new URL(b['@id'], p.url);
              siteDefinedIds.add(ctx.site.normalize(u.origin + u.pathname + u.search) + u.hash);
            } catch {}
          }
        }
      }
    }

    // Inspect references within each block
    for (const p of ctx.site.pages) {
      for (const j of p.jsonLd) {
        for (const b of j.blocks) {
          if (!b || typeof b !== 'object') continue;
          const currentId = b['@id'];

          const inspectObj = (obj, propPath = '') => {
            if (!obj || typeof obj !== 'object') return;
            for (const [key, val] of Object.entries(obj)) {
              if (key === '@id') continue;
              if (val && typeof val === 'object') {
                if (val['@id'] && typeof val['@id'] === 'string') {
                  const targetId = val['@id'];
                  // 1. Check circular self-reference
                  if (currentId && targetId === currentId) {
                    hits.push({
                      subject: { type: 'schema_block', identifier: `${p.url}#${propPath ? propPath + '.' : ''}${key}`, url: p.url },
                      summary: `Circular @id self-reference detected on ${currentId}`,
                      evidence: [`node ${currentId} references itself in property "${key}"`],
                      captured: targetId,
                      expected: 'acyclic reference to distinct entity',
                    });
                  }
                  // 2. Check dangling reference if it is an internal URI or fragment
                  const isInternal = targetId.startsWith('#') || (ctx.site.base_url && targetId.startsWith(ctx.site.base_url)) || (ctx.site.baseUrl && targetId.startsWith(ctx.site.baseUrl)) || targetId.startsWith('http://') || targetId.startsWith('https://');
                  if (isInternal) {
                    let normTarget = targetId;
                    let isSchemaOrg = false;
                    try {
                      const u = new URL(targetId, p.url);
                      normTarget = ctx.site.normalize(u.origin + u.pathname + u.search) + u.hash;
                      isSchemaOrg = u.hostname === 'schema.org' || u.hostname === 'www.schema.org';
                    } catch {}
                    if (!siteDefinedIds.has(targetId) && !siteDefinedIds.has(normTarget)) {
                      if (!isSchemaOrg) {
                        hits.push({
                          subject: { type: 'schema_block', identifier: `${p.url}#${propPath ? propPath + '.' : ''}${key}`, url: p.url },
                          summary: `Dangling @id reference "${targetId}" not defined in site graph`,
                          evidence: [`property "${key}" references @id: ${targetId}`, 'no entity node with this @id is defined on the site'],
                          captured: targetId,
                          expected: 'defined entity @id in graph',
                        });
                      }
                    }
                  }
                }
                inspectObj(val, propPath ? `${propPath}.${key}` : key);
              }
            }
          };

          inspectObj(b);
        }
      }
    }
    return hits;
  },
}));

D.push(defineDetector({
  id: 'SCHEMA-011', name: 'BreadcrumbList schema broken or unanchored', namespace: 'SCHEMA',
  description: 'BreadcrumbList structured data has invalid sequential positions, missing or empty item URLs/names, or broken hierarchical continuity.',
  discipline: ['seo', 'aeo'], severity: 'medium', deterministic: true, requires: ['site'],
  impact: { representation: 'medium', ranking: 'low' },
  applicable_requirement: 'SEO §7 schema validation; Google Search Central Breadcrumb structured data specification',
  remediation: 'Ensure BreadcrumbList itemListElement contains sequential 1-based positions, each item has a non-empty name and item target URL, and matches the hierarchical navigation.',
  verification: 'Verify BreadcrumbList elements have position 1..N with valid names and target URLs.',
  check(ctx) {
    const hits = [];
    for (const p of indexTargets(ctx)) {
      if (!p.jsonLd) continue;
      for (const j of p.jsonLd) {
        if (!j.blocks) continue;
        for (const b of j.blocks) {
          if (!b || typeof b !== 'object') continue;
          const type = [].concat(b['@type'] || []).join(',');
          if (!/BreadcrumbList/i.test(type)) continue;

          const items = Array.isArray(b.itemListElement)
            ? b.itemListElement
            : (b.itemListElement ? [b.itemListElement] : []);

          if (items.length === 0) {
            hits.push({
              subject: { type: 'schema_block', identifier: `${p.url}#BreadcrumbList`, url: p.url },
              summary: 'BreadcrumbList schema has empty or missing itemListElement',
              evidence: ['itemListElement is empty or not an array'],
            });
            continue;
          }

          let expectedPos = 1;
          let posBroken = false;
          let missingField = false;

          for (let i = 0; i < items.length; i++) {
            const el = items[i];
            if (!el || typeof el !== 'object') {
              missingField = true;
              continue;
            }
            const pos = Number(el.position);
            if (Number.isNaN(pos) || pos !== expectedPos) {
              posBroken = true;
            }
            expectedPos++;

            const name = el.name || (typeof el.item === 'object' ? el.item?.name : null);
            const itemUrl = typeof el.item === 'string'
              ? el.item
              : (typeof el.item === 'object' ? (el.item?.['@id'] || el.item?.url) : null) || el.url;

            const isLast = i === items.length - 1;
            if (!name || (typeof name === 'string' && !name.trim())) {
              missingField = true;
            }
            if (!isLast && (!itemUrl || (typeof itemUrl === 'string' && !itemUrl.trim()))) {
              missingField = true;
            }
          }

          if (posBroken) {
            hits.push({
              subject: { type: 'schema_block', identifier: `${p.url}#BreadcrumbList`, url: p.url },
              summary: 'BreadcrumbList positions are not sequential 1-based integers',
              evidence: [`declared positions: ${items.map((it) => it?.position).join(', ')}`],
              captured: items.map((it) => it?.position),
              expected: items.map((_, i) => i + 1),
            });
          }

          if (missingField) {
            hits.push({
              subject: { type: 'schema_block', identifier: `${p.url}#BreadcrumbList`, url: p.url },
              summary: 'BreadcrumbList item missing required name or item URL target',
              evidence: ['one or more ListItem entries lack a non-empty name or navigation item URL'],
            });
          }
        }
      }
    }
    return hits;
  },
}));

D.push(defineDetector({
  id: 'SCHEMA-012', name: 'Temporal contradiction between schema dates, visible text, and HTTP headers', namespace: 'SCHEMA',
  description: 'Structured data dates contradict visible page text timestamps or HTTP Last-Modified headers, undermining search engine freshness consensus.',
  discipline: ['seo', 'aeo', 'geo'], severity: 'medium', deterministic: true, requires: ['site'],
  impact: { representation: 'medium', citation: 'low' },
  applicable_requirement: 'Premise 3.4: structured data must match visible content; SEO §7 freshness consensus; AEO §8 version evidence',
  remediation: 'Synchronize JSON-LD dateModified/datePublished with visible page timestamps and HTTP Last-Modified headers.',
  verification: 'Confirm structured data dates match visible page dates and do not contradict server headers.',
  check(ctx) {
    const hits = [];
    const DATE_TEXT_RX = /\b(?:last\s+updated|updated\s+on|modified\s+on|published\s+on|date):\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2})\b/i;

    for (const p of indexTargets(ctx)) {
      if (!p.jsonLd) continue;

      let visibleDate = null;
      if (p.rawHtml || p.paragraphs) {
        const textSources = [...(p.paragraphs || []), ...(p.headings || []).map((h) => h.text || '')];
        for (const s of textSources) {
          const m = DATE_TEXT_RX.exec(s);
          if (m) {
            const d = new Date(m[1]);
            if (!Number.isNaN(d.getTime())) {
              visibleDate = { str: m[1], date: d };
              break;
            }
          }
        }
      }

      const lastModHeader = p.headers?.['last-modified'] || p.headers?.['Last-Modified'];
      const headerDate = lastModHeader ? new Date(lastModHeader) : null;
      const validHeaderDate = headerDate && !Number.isNaN(headerDate.getTime()) ? headerDate : null;

      for (const j of p.jsonLd) {
        if (!j.blocks) continue;
        for (const b of j.blocks) {
          if (!b || typeof b !== 'object') continue;
          const sPub = b.datePublished ? new Date(b.datePublished) : null;
          const sMod = b.dateModified ? new Date(b.dateModified) : null;
          const validPub = sPub && !Number.isNaN(sPub.getTime()) ? sPub : null;
          const validMod = sMod && !Number.isNaN(sMod.getTime()) ? sMod : null;
          const primarySchemaDate = validMod || validPub;
          const primaryDateStr = b.dateModified || b.datePublished;

          if (!primarySchemaDate) continue;

          // 1. Check against visible text date
          if (visibleDate) {
            const diffDays = Math.abs((primarySchemaDate.getTime() - visibleDate.date.getTime()) / (1000 * 60 * 60 * 24));
            if (diffDays > 90) {
              hits.push({
                subject: { type: 'schema_block', identifier: `${p.url}#dateConsensus`, url: p.url },
                summary: `Schema date (${primaryDateStr.slice(0, 10)}) contradicts visible date (${visibleDate.str}) by ${Math.round(diffDays)} days`,
                evidence: [
                  `schema date: ${primaryDateStr}`,
                  `visible page date: ${visibleDate.str}`,
                  `difference: ${Math.round(diffDays)} days`,
                ],
                captured: primaryDateStr.slice(0, 10),
                expected: visibleDate.date.toISOString().slice(0, 10),
              });
            }
          }

          // 2. Check against HTTP Last-Modified header
          if (validHeaderDate && validMod) {
            const diffDaysHeader = Math.abs((validMod.getTime() - validHeaderDate.getTime()) / (1000 * 60 * 60 * 24));
            if (diffDaysHeader > 180) {
              hits.push({
                subject: { type: 'schema_block', identifier: `${p.url}#headerConsensus`, url: p.url },
                summary: `Schema dateModified (${b.dateModified.slice(0, 10)}) contradicts HTTP Last-Modified header (${validHeaderDate.toISOString().slice(0, 10)}) by ${Math.round(diffDaysHeader)} days`,
                evidence: [
                  `schema dateModified: ${b.dateModified}`,
                  `HTTP Last-Modified: ${lastModHeader}`,
                  `difference: ${Math.round(diffDaysHeader)} days`,
                ],
                captured: b.dateModified.slice(0, 10),
                expected: validHeaderDate.toISOString().slice(0, 10),
              });
            }
          }
        }
      }
    }
    return hits;
  },
}));

D.push(defineDetector({
  id: 'SCHEMA-013', name: 'VideoObject schema missing critical SERP playback prerequisites', namespace: 'SCHEMA',
  description: 'A VideoObject JSON-LD block is missing required attributes for Google SERP rich video display (name, description, uploadDate, thumbnailUrl, contentUrl or embedUrl).',
  discipline: ['seo', 'aeo'], severity: 'medium', deterministic: true, requires: ['site'],
  impact: { representation: 'medium', ranking: 'low' },
  applicable_requirement: 'Google Search Central Video structured data guidelines; SEO §7 schema validation',
  remediation: 'Add name, description, uploadDate, thumbnailUrl, and either contentUrl or embedUrl to the VideoObject markup.',
  verification: 'Verify VideoObject schema includes all Google Search required playback fields.',
  check(ctx) {
    const hits = [];
    for (const p of indexTargets(ctx)) {
      for (const j of p.jsonLd || []) {
        for (const b of j.blocks || []) {
          if (!b || typeof b !== 'object') continue;
          const type = [].concat(b['@type'] || []).join(',');
          if (!/VideoObject/i.test(type)) continue;

          const missing = [];
          if (!b.name) missing.push('name');
          if (!b.description) missing.push('description');
          if (!b.uploadDate) missing.push('uploadDate');
          if (!b.thumbnailUrl && !b.thumbnail) missing.push('thumbnailUrl');
          if (!b.contentUrl && !b.embedUrl) missing.push('contentUrl or embedUrl');

          if (missing.length > 0) {
            hits.push({
              subject: { type: 'schema_block', identifier: `${p.url}#VideoObject`, url: p.url },
              summary: `VideoObject schema missing required Google SERP playback fields: ${missing.join(', ')}`,
              evidence: [
                `video name: ${b.name || 'missing'}`,
                `missing required fields: ${missing.join(', ')}`,
              ],
              captured: missing,
              expected: [],
            });
          }
        }
      }
    }
    return hits;
  },
}));

D.push(defineDetector({
  id: 'SCHEMA-014', name: 'Organization or LocalBusiness schema missing authoritative identity attributes', namespace: 'SCHEMA',
  description: 'An Organization or LocalBusiness JSON-LD block lacks essential identity signals for Google Knowledge Graph or SERP inclusion (name, url, logo, or contactPoint/address).',
  discipline: ['seo', 'aeo', 'geo'], severity: 'low', deterministic: true, requires: ['site'],
  impact: { representation: 'medium', ranking: 'none' },
  applicable_requirement: 'Google Search Central Organization structured data; GEO §9 knowledge graph entity resolution',
  remediation: 'Include name, url, logo, and at least one contactPoint or address in Organization structured data.',
  verification: 'Ensure Organization and LocalBusiness blocks declare logo, url, and contact anchors.',
  check(ctx) {
    const hits = [];
    for (const p of indexTargets(ctx)) {
      for (const j of p.jsonLd || []) {
        for (const b of j.blocks || []) {
          if (!b || typeof b !== 'object') continue;
          const type = [].concat(b['@type'] || []).join(',');
          if (!/Organization|LocalBusiness|Corporation/i.test(type)) continue;

          const missing = [];
          if (!b.name) missing.push('name');
          if (!b.url) missing.push('url');
          if (!b.logo && !b.image) missing.push('logo/image');
          const hasAnchor = b.contactPoint || b.address || (Array.isArray(b.sameAs) && b.sameAs.length > 0);
          if (!hasAnchor) missing.push('contactPoint, address, or sameAs');

          // Flag when missing multiple essential identity anchors
          if (missing.length >= 2) {
            hits.push({
              subject: { type: 'schema_block', identifier: `${p.url}#${type}`, url: p.url },
              summary: `${type} schema missing authoritative identity fields: ${missing.join(', ')}`,
              evidence: [
                `entity name: ${b.name || 'missing'}`,
                `missing identity signals: ${missing.join(', ')}`,
              ],
              captured: missing,
              expected: [],
            });
          }
        }
      }
    }
    return hits;
  },
}));

D.push(defineDetector({
  id: 'SCHEMA-015', name: 'Circular or self-referential JSON-LD @id node reference', namespace: 'SCHEMA',
  description: 'A JSON-LD structured data graph contains an @id node that points to itself or forms a direct circular reference cycle, breaking search engine graph crawlers and parsers.',
  discipline: ['seo', 'aeo'], severity: 'high', deterministic: true, requires: ['site'],
  impact: { retrieval: 'high', representation: 'high' },
  applicable_requirement: 'Google Search Central structured data syntax; Knowledge Graph acyclic graph integrity',
  remediation: 'Remove self-referential @id links and ensure parent/child entity relationships form a directed acyclic graph.',
  verification: 'Validate JSON-LD graph to ensure no entity points to its own @id.',
  check(ctx) {
    const hits = [];
    for (const p of indexTargets(ctx)) {
      for (const j of p.jsonLd || []) {
        for (const b of j.blocks || []) {
          if (!b || typeof b !== 'object') continue;
          const rootId = b['@id'];
          if (!rootId) continue;

          const checkCycle = (obj, path = '') => {
            if (!obj || typeof obj !== 'object') return;
            for (const [key, val] of Object.entries(obj)) {
              if (key === '@id') continue;
              if (val && typeof val === 'object') {
                if (val['@id'] && val['@id'] === rootId) {
                  hits.push({
                    subject: { type: 'schema_block', identifier: `${p.url}#${rootId}`, url: p.url },
                    summary: `Circular self-reference detected in schema graph: property "${path ? `${path}.${key}` : key}" references parent @id (${rootId})`,
                    evidence: [
                      `node @id: ${rootId}`,
                      `cyclic property: ${path ? `${path}.${key}` : key}`,
                      'search engines fail graph parsing when structured data nodes reference themselves circularly',
                    ],
                    captured: { rootId, cyclicProperty: path ? `${path}.${key}` : key },
                    expected: 'acyclic entity references',
                  });
                } else {
                  checkCycle(val, path ? `${path}.${key}` : key);
                }
              }
            }
          };

          checkCycle(b);
        }
      }
    }
    return hits;
  },
}));

D.push(defineDetector({
  id: 'SCHEMA-016', name: 'Author Person entity lacks external disambiguation URL or sameAs', namespace: 'SCHEMA',
  description: 'An Article, BlogPosting, NewsArticle, or Review defines an author Person entity without an external profile URL or sameAs link, preventing search engine Knowledge Graph author disambiguation and weakening E-E-A-T trust signals.',
  discipline: ['seo', 'aeo', 'geo'], severity: 'medium', deterministic: true, requires: ['site'],
  impact: { representation: 'medium', ranking: 'low' },
  applicable_requirement: 'Google Search Central Article author structured data; E-E-A-T author identity disambiguation',
  remediation: 'Add a "url" or "sameAs" link pointing to the author\'s authoritative personal profile, Wikidata entry, or professional bio.',
  verification: 'Confirm all author Person entities have at least one valid external disambiguation URL or sameAs reference.',
  check(ctx) {
    const hits = [];
    for (const p of indexTargets(ctx)) {
      for (const j of p.jsonLd || []) {
        for (const b of j.blocks || []) {
          if (!b || typeof b !== 'object') continue;
          const type = [].concat(b['@type'] || []).join(',');
          if (!/Article|BlogPosting|NewsArticle|Review/i.test(type)) continue;

          const authors = [].concat(b.author || []).filter(Boolean);
          for (const author of authors) {
            if (typeof author !== 'object') continue;
            const authorType = author['@type'] || 'Person';
            if (/Person/i.test(authorType)) {
              const hasUrl = Boolean(author.url);
              const hasSameAs = Array.isArray(author.sameAs) ? author.sameAs.length > 0 : Boolean(author.sameAs);
              if (!hasUrl && !hasSameAs) {
                hits.push({
                  subject: { type: 'schema_block', identifier: `${p.url}#${type}-author`, url: p.url },
                  summary: `Author Person "${author.name || 'unnamed'}" in ${type} schema lacks disambiguating url or sameAs links`,
                  evidence: [
                    `article type: ${type}`,
                    `author: ${author.name || 'unnamed'}`,
                    'Google Knowledge Graph and E-E-A-T guidelines require author identity anchors for AI and rich search features',
                  ],
                  captured: { author: author.name || 'unnamed', hasUrl, hasSameAs },
                  expected: 'author Person entity includes url or sameAs profile link',
                });
              }
            }
          }
        }
      }
    }
    return hits;
  },
}));

export default D;


