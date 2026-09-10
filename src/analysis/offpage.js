import { URL } from 'node:url';
import { extractHostname, extractRegistrableDomain, extractPublicSuffix } from '../shared/domainUtils.js';

const SPAM_TLDS = new Set([
  'top', 'work', 'gdn', 'click', 'monster', 'buzz', 'cfd', 'sbs',
  'rest', 'cam', 'fit', 'surf', 'stream', 'tk', 'ml', 'ga', 'cf',
]);

const COMMERCIAL_SPAM_KEYWORDS = /\b(casino|viagra|cialis|payday\s*loans?|replica|cheap\s*essay|free\s*download|warez|crack|hack|gambling|betting|slots|crypto\s*airdrop)\b/i;

/**
 * Audit an inbound backlink profile for authority distribution and toxic domain risks.
 */
export function auditBacklinkProfile(backlinks, { targetDomain = null } = {}) {
  const links = Array.isArray(backlinks) ? backlinks : (backlinks?.backlinks || []);
  const normalizedTarget = targetDomain ? targetDomain.toLowerCase().replace(/^www\./, '') : null;

  const referringDomains = new Map();
  const cClassClusters = new Map();
  let dofollowCount = 0;
  let nofollowCount = 0;
  let ugcCount = 0;
  let sponsoredCount = 0;
  let homepageLinksCount = 0;
  let deepLinksCount = 0;

  const anchorTypes = {
    branded: 0,
    naked_url: 0,
    generic: 0,
    exact_match_commercial: 0,
    other: 0,
  };

  const toxicDomains = [];
  const GENERIC_ANCHORS = /^(?:click here|here|website|link|read more|learn more|source|this site|visit|more info)$/i;

  // 1. Process each backlink
  for (const link of links) {
    const srcHost = extractHostname(link.source_url);
    if (!srcHost) continue;
    const rootDomain = extractRegistrableDomain(srcHost) || srcHost;
    const tld = extractPublicSuffix(srcHost);
    const anchor = (link.anchor_text || '').trim();
    const relTokens = (link.rel || '').toLowerCase().split(/\s+/).filter(Boolean);
    const isNofollow = relTokens.includes('nofollow');
    const isUgc = relTokens.includes('ugc');
    const isSponsored = relTokens.includes('sponsored');

    if (isNofollow) nofollowCount++;
    if (isUgc) ugcCount++;
    if (isSponsored) sponsoredCount++;
    if (!isNofollow && !isUgc && !isSponsored) dofollowCount++;

    // Deep link vs homepage
    const targetPath = link.target_url ? (() => { try { return new URL(link.target_url).pathname; } catch { return '/'; } })() : '/';
    if (targetPath === '/' || targetPath === '') homepageLinksCount++;
    else deepLinksCount++;

    // Anchor categorization
    if (anchor && normalizedTarget && (anchor.toLowerCase().includes(normalizedTarget) || (anchor.length >= 3 && normalizedTarget.includes(anchor.toLowerCase())))) {
      anchorTypes.branded++;
    } else if (anchor && (/^https?:\/\//i.test(anchor) || anchor.includes('www.') || anchor.includes('.com') || anchor.includes('.org'))) {
      anchorTypes.naked_url++;
    } else if (anchor && GENERIC_ANCHORS.test(anchor)) {
      anchorTypes.generic++;
    } else if (anchor && (COMMERCIAL_SPAM_KEYWORDS.test(anchor) || /\b(buy|best|cheap|discount|order)\b/i.test(anchor))) {
      anchorTypes.exact_match_commercial++;
    } else {
      anchorTypes.other++;
    }

    // C-class IP clustering
    if (link.source_ip) {
      const parts = link.source_ip.split('.');
      if (parts.length === 4) {
        const cClass = parts.slice(0, 3).join('.');
        const cluster = cClassClusters.get(cClass) || new Set();
        cluster.add(rootDomain);
        cClassClusters.set(cClass, cluster);
      }
    }

    // Domain tracking
    const domainData = referringDomains.get(rootDomain) || {
      domain: rootDomain,
      sample_source_url: link.source_url,
      total_links: 0,
      anchors: [],
      tld,
      ip: link.source_ip || null,
      dofollow: false,
    };
    domainData.total_links++;
    if (!isNofollow && !isSponsored) domainData.dofollow = true;
    if (anchor && !domainData.anchors.includes(anchor)) domainData.anchors.push(anchor);
    referringDomains.set(rootDomain, domainData);
  }

  // 2. Toxic domain risk analysis per domain
  for (const [domain, data] of referringDomains.entries()) {
    const reasons = [];
    let riskTier = 'clean';

    // Spam TLD rule
    if (data.tld && SPAM_TLDS.has(data.tld)) {
      reasons.push(`Known high-abuse spam TLD (.${data.tld})`);
      riskTier = 'high';
    }

    // Spam anchor rule
    const hasSpamAnchor = data.anchors.some((a) => COMMERCIAL_SPAM_KEYWORDS.test(a));
    if (hasSpamAnchor) {
      reasons.push('Anchor text matches known high-risk commercial spam patterns');
      riskTier = 'critical';
    }

    // PBN IP clustering rule (3+ distinct domains on the exact same /24 C-block)
    if (data.ip) {
      const parts = data.ip.split('.');
      if (parts.length === 4) {
        const cClass = parts.slice(0, 3).join('.');
        const cluster = cClassClusters.get(cClass);
        if (cluster && cluster.size >= 3) {
          reasons.push(`Part of hosting cluster on ${cClass}.0/24 with ${cluster.size} domains (PBN footprint)`);
          riskTier = 'critical';
        }
      }
    }

    // Excessive sitewide link density without nofollow
    if (data.total_links > 50 && data.dofollow && (data.tld && SPAM_TLDS.has(data.tld))) {
      reasons.push(`Sitewide link farm pattern (${data.total_links} links without rel="nofollow")`);
      riskTier = 'critical';
    }

    if (riskTier !== 'clean') {
      toxicDomains.push({
        domain,
        risk_tier: riskTier,
        reasons,
        sample_url: data.sample_source_url,
        anchors: data.anchors.slice(0, 5),
        total_links: data.total_links,
      });
    }
  }

  // Sort flagged domains by severity (critical first) with deterministic secondary key
  const tierWeight = { critical: 2, high: 1, clean: 0 };
  toxicDomains.sort((a, b) => (tierWeight[b.risk_tier] || 0) - (tierWeight[a.risk_tier] || 0) || a.domain.localeCompare(b.domain));

  const totalLinks = links.length;
  const totalDomains = referringDomains.size;
  const commercialAnchorPct = totalLinks > 0 ? Math.round((anchorTypes.exact_match_commercial / totalLinks) * 100) : 0;
  const brandedAnchorPct = totalLinks > 0 ? Math.round((anchorTypes.branded / totalLinks) * 100) : 0;
  const deepLinkPct = totalLinks > 0 ? Math.round((deepLinksCount / totalLinks) * 100) : 0;

  // Authority health assessment
  let profileHealth = 'natural';
  if (toxicDomains.some((d) => d.risk_tier === 'critical') || commercialAnchorPct > 30) {
    profileHealth = 'high_risk_footprint';
  } else if (toxicDomains.length > 0 || commercialAnchorPct > 15) {
    profileHealth = 'moderate_risk';
  }

  // Generate GSC-compatible disavow lines
  const disavowLines = [
    `# Citable Google Disavow Candidate Export`,
    `# Generated at: ${new Date().toISOString()}`,
    `# Flagged domains: ${toxicDomains.length} (critical: ${toxicDomains.filter((d) => d.risk_tier === 'critical').length})`,
    ``,
  ];
  for (const td of toxicDomains) {
    disavowLines.push(`# Risk: ${td.risk_tier.toUpperCase()} — ${td.reasons.join('; ')}`);
    disavowLines.push(`domain:${td.domain}`);
  }

  return {
    fact_status: 'observable_risk_indicators',
    epistemic_status: 'DERIVED',
    target_domain: targetDomain,
    profile_health: profileHealth,
    summary: {
      total_backlinks: totalLinks,
      total_referring_domains: totalDomains,
      toxic_domains_count: toxicDomains.length,
      critical_risk_domains: toxicDomains.filter((d) => d.risk_tier === 'critical').length,
      high_risk_domains: toxicDomains.filter((d) => d.risk_tier === 'high').length,
      dofollow_count: dofollowCount,
      nofollow_count: nofollowCount,
      ugc_count: ugcCount,
      sponsored_count: sponsoredCount,
      deep_link_ratio_pct: deepLinkPct,
    },
    anchor_profile: {
      branded_pct: brandedAnchorPct,
      commercial_exact_match_pct: commercialAnchorPct,
      naked_url_count: anchorTypes.naked_url,
      generic_count: anchorTypes.generic,
      over_optimization_risk: commercialAnchorPct > 25 ? 'elevated' : 'normal',
    },
    toxic_domains: toxicDomains,
    risk_indicators: toxicDomains,
    disavow_export: disavowLines.join('\n'),
    limitations: [
      'Search engines do not disclose algorithmic penalty thresholds; toxic classifications reflect observable risk patterns.',
      'Manual verification is required before submitting disavow files to Google Search Console.',
    ],
  };
}
