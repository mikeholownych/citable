/**
 * Domain and Page Qualification (B-081).
 *
 * Invariants:
 * 1. Domain and page qualification are evaluated separately.
 * 2. A high-authority domain with a low-quality links page is not automatically high-value.
 * 3. Third-party authority metrics retain provider, metric, value, retrieved_at and are never canonical.
 */

export function qualifyDomainAndPage({
  domain,
  domainData = {},
  pageUrl,
  pageData = {},
  thirdPartyMetrics = [],
}) {
  if (!domain) {
    throw new Error("domain is required for qualification");
  }
  if (!pageUrl) {
    throw new Error("pageUrl is required for qualification");
  }

  // 1. Domain-Level Qualification
  let domainStatus = domainData.status || "NEEDS_REVIEW";
  let domainLegitimacy = domainData.editorial_legitimacy || "MEDIUM";
  let domainDisqualificationReason = domainData.disqualification_reason || null;

  if (domainData.is_pbn || domainData.is_spam || domainData.is_compromised) {
    domainStatus = "DISQUALIFIED";
    domainLegitimacy = "QUESTIONABLE";
    domainDisqualificationReason = domainData.disqualification_reason || "Domain flagged for spam, compromised indicators, or PBN network";
  } else if (domainData.editorial_legitimacy === "QUESTIONABLE" || domainData.editorial_legitimacy === "LOW") {
    domainLegitimacy = domainData.editorial_legitimacy;
    if (domainData.editorial_legitimacy === "QUESTIONABLE") {
      domainStatus = "DISQUALIFIED";
      domainDisqualificationReason = "Domain fails editorial legitimacy threshold";
    }
  } else if (domainData.status === "QUALIFIED" || domainData.editorial_legitimacy === "HIGH") {
    domainStatus = "QUALIFIED";
    domainLegitimacy = domainData.editorial_legitimacy || "HIGH";
  }

  const domainQualification = {
    domain,
    status: domainStatus,
    editorial_legitimacy: domainLegitimacy,
    disqualification_reason: domainDisqualificationReason,
  };

  // 2. Page-Level Qualification (Evaluated separately from domain authority)
  const outboundLinkCount = Number(pageData.outbound_link_count ?? 0);
  const contextualRelevance = pageData.contextual_relevance || "MEDIUM";
  let pageStatus = pageData.status || "NEEDS_REVIEW";
  let pageDisqualificationReason = pageData.disqualification_reason || null;

  // Invariant: A high-authority domain with a low-quality links page is NOT automatically high-value
  if (contextualRelevance === "IRRELEVANT") {
    pageStatus = "DISQUALIFIED";
    pageDisqualificationReason = "Page content is contextually irrelevant to candidate topic";
  } else if (outboundLinkCount > 80 || pageData.is_link_farm || pageData.page_type === "LOW_QUALITY_DIRECTORY") {
    pageStatus = "DISQUALIFIED";
    pageDisqualificationReason = `Low-quality links page with excessive outbound links (${outboundLinkCount}) or directory blast characteristics`;
  } else if (pageData.status === "QUALIFIED" || (contextualRelevance === "HIGH" && outboundLinkCount <= 50)) {
    pageStatus = "QUALIFIED";
  }

  const pageQualification = {
    page_url: pageUrl,
    status: pageStatus,
    outbound_link_count: outboundLinkCount,
    contextual_relevance: contextualRelevance,
    disqualification_reason: pageDisqualificationReason,
  };

  // 3. Third-Party Metrics (Non-canonical, retain provider, metric, value, retrieved_at)
  const normalizedMetrics = (thirdPartyMetrics || []).map((m) => {
    if (!m.provider || !m.metric_name || typeof m.value !== "number" || !m.retrieved_at) {
      throw new Error(
        "Each third_party_metric must include provider, metric_name, numeric value, and retrieved_at timestamp"
      );
    }
    return {
      provider: String(m.provider),
      metric_name: String(m.metric_name),
      value: Number(m.value),
      retrieved_at: String(m.retrieved_at),
    };
  });

  return {
    domain_qualification: domainQualification,
    page_qualification: pageQualification,
    third_party_metrics: normalizedMetrics,
  };
}

/**
 * Returns whether an opportunity meets qualification criteria.
 * Strict: domain must be QUALIFIED and page must be QUALIFIED.
 */
export function isOpportunityFullyQualified(qualification) {
  if (!qualification?.domain_qualification || !qualification?.page_qualification) {
    return false;
  }
  return (
    qualification.domain_qualification.status === "QUALIFIED" &&
    qualification.page_qualification.status === "QUALIFIED"
  );
}
