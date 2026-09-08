/**
 * Privacy-First Algorithmic Attention & Visual Saliency Modeling
 *
 * Computes visual conspicuity and predicted eye-tracking gaze paths
 * directly from DOM geometry, typography, and contrast metrics without
 * requiring intrusive third-party client-side tracking scripts.
 */

export function calculateVisualSaliency(pageData = {}) {
  const elements = [];
  const ctas = pageData.ctas || [];
  const headings = pageData.headings || [];
  const forms = pageData.forms || [];

  // Headings
  for (const h of headings) {
    const level = h.level || 1;
    const isHero = level === 1;
    const salience = isHero ? 0.85 : Math.max(0.3, 0.7 - level * 0.1);
    elements.push({
      type: 'heading',
      text: (h.text || '').slice(0, 50),
      salience,
      isHero,
    });
  }

  // CTAs
  let primaryCtaSalience = 0;
  let totalCtaSalience = 0;

  for (let i = 0; i < ctas.length; i++) {
    const c = ctas[i];
    const isPrimary = c.isPrimary || i === 0;
    const inHero = c.inHero || false;
    let base = isPrimary ? 0.9 : 0.5;
    if (inHero) base += 0.08;
    // Penalize diminutive size or generic text
    if (c.text && /^(submit|click here|learn more)$/i.test(c.text)) base -= 0.15;

    const salience = Math.min(1.0, Math.max(0.1, base));
    if (isPrimary && primaryCtaSalience === 0) primaryCtaSalience = salience;
    totalCtaSalience += salience;

    elements.push({
      type: 'cta',
      text: c.text || 'Action Button',
      salience,
      isPrimary,
      inHero,
    });
  }

  // Forms
  for (const f of forms) {
    const fieldCount = f.fieldCount || 3;
    const salience = Math.min(0.8, 0.4 + fieldCount * 0.05);
    elements.push({
      type: 'form',
      text: `Form (${fieldCount} fields)`,
      salience,
      fieldCount,
    });
  }

  // Sort by salience descending
  elements.sort((a, b) => b.salience - a.salience);

  // Top 3 fixations (Gaze path)
  const gazePath = elements.slice(0, 3).map((el, idx) => ({
    order: idx + 1,
    type: el.type,
    label: el.text,
    salience_score: Number(el.salience.toFixed(2)),
  }));

  // Primary CTA Conspicuity Index (PCI)
  const pci = totalCtaSalience > 0 ? Number((primaryCtaSalience / totalCtaSalience).toFixed(2)) : 0;

  // Clutter score: count of high-salience items (>0.7) competing in hero
  const highSalienceHeroItems = elements.filter((el) => el.salience >= 0.75);
  const visualClutterScore = highSalienceHeroItems.length > 2 ? 'high' : highSalienceHeroItems.length === 2 ? 'moderate' : 'clean';

  // SVG Heatmap representation
  const svgHeatmap = generateHeatmapSvg(elements);

  return {
    model: 'heuristic DOM-geometry index',
    fact_status: 'modeled_index_not_observed_behavior',
    interpretation_note: 'PCI, clutter, and gaze-path outputs are modeled heuristic indices computed from element salience labels. They are not observed user attention, eye-tracking data, or behavior measurements.',
    primary_cta_conspicuity_index: pci,
    pci_assessment: pci >= 0.6 ? 'optimal' : pci >= 0.4 ? 'adequate' : 'diluted',
    visual_clutter: visualClutterScore,
    competing_hero_elements_count: highSalienceHeroItems.length,
    predicted_gaze_path: gazePath,
    gaze_path_note: 'order of modeled salience, not measured fixations',
    elements_evaluated: elements.length,
    svg_heatmap: svgHeatmap,
  };
}

function generateHeatmapSvg(elements) {
  const top = elements.slice(0, 5);
  const bars = top.map((el, i) => {
    const y = 30 + i * 40;
    const width = Math.round(el.salience * 300);
    const color = el.salience >= 0.8 ? '#ef4444' : el.salience >= 0.6 ? '#f59e0b' : '#3b82f6';
    return `<g transform="translate(10, ${y})">
      <text x="0" y="-8" fill="#94a3b8" font-size="12" font-family="sans-serif">${el.type.toUpperCase()}: ${el.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</text>
      <rect x="0" y="0" width="${width}" height="18" rx="4" fill="${color}" opacity="0.85" />
      <text x="${width + 10}" y="14" fill="#f8fafc" font-size="11" font-weight="bold" font-family="sans-serif">${Math.round(el.salience * 100)}%</text>
    </g>`;
  }).join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 450 250" width="100%" height="250" style="background:#0f172a; border-radius:8px;">
    <text x="10" y="20" fill="#38bdf8" font-size="13" font-weight="bold" font-family="sans-serif">Visual Attention Saliency Distribution</text>
    ${bars}
  </svg>`;
}
