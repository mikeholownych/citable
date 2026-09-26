import { sha256 } from "../shared/io.js";

export const READINESS_LEVELS = [
  {
    level: 0,
    name: "INACCESSIBLE",
    description: "Site blocks machines, returns 403/503, or serves unparseable content.",
    required_conditions: ["Site responds with parseable content and basic HTTP availability"],
  },
  {
    level: 1,
    name: "MACHINE_ACCESSIBLE",
    description: "Basic crawlability and non-blocking access for automated tools.",
    required_conditions: [
      "Level 0 satisfied",
      "Robots policy allows agent inspection",
      "Indexable HTML documents exist",
      "No total blocking firewall or captcha on public routes",
    ],
  },
  {
    level: 2,
    name: "MACHINE_READABLE",
    description: "Semantic clarity and structured data enabling reliable machine comprehension.",
    required_conditions: [
      "Level 1 satisfied",
      "Structured data (Schema.org / JSON-LD) present and valid",
      "Semantic HTML heading and section hierarchy",
      "Key entity facts declared without ambiguity",
    ],
  },
  {
    level: 3,
    name: "AGENT_DISCOVERABLE",
    description: "Machine-discoverable capabilities, clean prompt boundaries, and protocol discovery.",
    required_conditions: [
      "Level 2 satisfied",
      "Capabilities discoverable via MCP card, OpenAPI spec, or llms.txt",
      "No critical or uncontained prompt-injection surface",
      "Clear content grounding and licensing/usage terms",
    ],
  },
  {
    level: 4,
    name: "AGENT_OPERABLE",
    description: "Safe machine interactions with classified actions, confirmation boundaries, and working journeys.",
    required_conditions: [
      "Level 3 satisfied",
      "ZERO unresolved CRITICAL findings across all domains",
      "Interactive forms classify risk and enforce confirmation boundaries",
      "Machine-exposed operations enforce idempotency and authorization",
      "At least one representative grounded journey resolves to SUCCESS or PARTIAL",
    ],
  },
  {
    level: 5,
    name: "AGENT_NATIVE",
    description: "Verified machine execution, zero critical/high findings, and 100% direct-evidence journey success.",
    required_conditions: [
      "Level 4 satisfied",
      "ZERO unresolved CRITICAL findings across all domains",
      "ZERO unresolved HIGH findings across all domains",
      "Representative grounded agent journeys resolve to SUCCESS with 100% direct evidence",
      "Operations verified end-to-end with verified confirmation and state mutation semantics",
    ],
  },
];

/**
 * Evaluates the Agent Readiness Level (0 to 5) with strict published gating rules (B-066).
 *
 * Invariant: Agent Native (Level 5) and Agent Operable (Level 4) are completely unreachable
 * by accumulating points while an unresolved CRITICAL finding exists.
 */
export function evaluateReadinessLevel({
  siteUrl = "https://example.test",
  findings = [],
  determinations = [],
  journeys = [],
  siteContext = {},
} = {}) {
  const nowIso = new Date().toISOString();

  // 1. Identify critical and blocking findings
  const criticalFindings = findings.filter((f) => String(f.severity).toLowerCase() === "critical");
  const highFindings = findings.filter((f) => String(f.severity).toLowerCase() === "high");

  const blockingFindings = criticalFindings.map((f) => ({
    finding_id: f.finding_id || f.id || "CRIT-UNKNOWN",
    severity: "critical",
    description: f.summary || f.title || f.detector_id || "Unresolved critical finding",
  }));

  // 2. Evaluate individual level gates sequentially
  const levelGates = [];

  // Gate 0: Accessible
  const isAccessible = !siteContext.is_blocked && !siteContext.access_denied && (siteContext.site?.pages?.length ?? siteContext.pages?.length ?? 1) > 0;
  levelGates.push({
    level: 0,
    satisfied: isAccessible,
    missing_prerequisites: isAccessible ? [] : ["Site returned access denial or zero parseable pages"],
  });

  // Gate 1: Machine Accessible (Level 0 + basic crawlability)
  const isCrawlable = isAccessible && !findings.some((f) => f.detector_id === "CRAWL-001" || f.detector_id === "CRAWL-002");
  levelGates.push({
    level: 1,
    satisfied: isCrawlable,
    missing_prerequisites: isCrawlable ? [] : ["Crawl policies or robots conflicts prevent machine access"],
  });

  // Gate 2: Machine Readable (Level 1 + structured data / clean markup)
  const hasStructuredData = (siteContext.site?.pages || siteContext.pages || []).some((p) => (p.jsonLd?.length || 0) > 0);
  const isMachineReadable = isCrawlable && (hasStructuredData || determinations.some((d) => d.detector_id?.startsWith("SCHEMA-") && d.status === "PASS"));
  levelGates.push({
    level: 2,
    satisfied: isMachineReadable,
    missing_prerequisites: isMachineReadable ? [] : ["Missing valid structured data (JSON-LD) or semantic entity hierarchy"],
  });

  // Gate 3: Agent Discoverable (Level 2 + capabilities/mcp/llms.txt + no prompt injection)
  const hasCapabilityDiscovery = Boolean(
    siteContext.mcp_card || siteContext.llms_txt || siteContext.openapi_spec ||
    determinations.some((d) => d.detector_id?.startsWith("AGENT-") && d.status === "PASS")
  );
  const noCritInjection = !criticalFindings.some((f) => f.detector_id === "AGENT-010" || /injection/i.test(f.summary || ""));
  const isDiscoverable = isMachineReadable && hasCapabilityDiscovery && noCritInjection;
  levelGates.push({
    level: 3,
    satisfied: isDiscoverable,
    missing_prerequisites: isDiscoverable ? [] : ["Missing machine-discoverable capability cards (MCP/OpenAPI) or contains prompt injection risks"],
  });

  // Gate 4: Agent Operable (Level 3 + ZERO CRITICAL FINDINGS + forms/actions + journeys >= PARTIAL)
  const noCritical = criticalFindings.length === 0;
  const journeysPassedL4 = journeys.length > 0 && journeys.every((j) => j.outcome === "SUCCESS" || j.outcome === "PARTIAL");
  const isOperable = isDiscoverable && noCritical && journeysPassedL4;
  const missingL4 = [];
  if (!isDiscoverable) missingL4.push("Level 3 prerequisite not satisfied");
  if (!noCritical) missingL4.push(`Unresolved CRITICAL findings exist (${criticalFindings.length} critical findings)`);
  if (!journeysPassedL4) missingL4.push("Requires at least one grounded agent journey resolving to SUCCESS or PARTIAL");
  levelGates.push({
    level: 4,
    satisfied: isOperable,
    missing_prerequisites: missingL4,
  });

  // Gate 5: Agent Native (Level 4 + ZERO CRITICAL + ZERO HIGH + 100% SUCCESS journeys with direct evidence)
  const noHigh = highFindings.length === 0;
  const journeysPassedL5 = journeys.length > 0 && journeys.every((j) => j.outcome === "SUCCESS" && (j.evidence_summary?.direct_evidence_count || 0) > 0 && (j.evidence_summary?.model_inference_count || 0) === 0);
  const isNative = isOperable && noHigh && journeysPassedL5;
  const missingL5 = [];
  if (!isOperable) missingL5.push("Level 4 prerequisite not satisfied");
  if (!noHigh) missingL5.push(`Unresolved HIGH findings exist (${highFindings.length} high findings)`);
  if (!journeysPassedL5) missingL5.push("Requires all representative journeys to succeed with 100% direct evidence and zero model inferences");
  levelGates.push({
    level: 5,
    satisfied: isNative,
    missing_prerequisites: missingL5,
  });

  // Calculate highest satisfied level without breaking sequential gating
  let assignedLevel = 0;
  for (let i = 0; i <= 5; i++) {
    if (levelGates[i]?.satisfied) {
      assignedLevel = i;
    } else {
      break; // Sequential: cannot skip a level!
    }
  }

  // Hard Invariant Check: Point accumulation bypass check
  // Level 4 and Level 5 can NEVER be assigned if critical findings exist!
  if (criticalFindings.length > 0 && assignedLevel >= 4) {
    throw new Error("INVARIANT BREACH: Agent Operable/Native was assigned while critical findings exist!");
  }

  const levelMeta = READINESS_LEVELS[assignedLevel];
  const assessmentId = `arl_${sha256(`arl|${siteUrl}|${assignedLevel}|${nowIso}`).slice(0, 16)}`;

  return {
    schema_version: 1,
    assessment_id: assessmentId,
    site_url: siteUrl,
    assigned_level: assignedLevel,
    level_name: levelMeta.name,
    gating_evaluation: {
      critical_findings_present: criticalFindings.length > 0,
      critical_findings_count: criticalFindings.length,
      blocking_findings: blockingFindings,
      level_gates: levelGates,
    },
    point_accumulation_bypass_blocked: true,
    assessed_at: nowIso,
  };
}
