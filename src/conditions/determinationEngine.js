import { calculateUnknownRateDrift } from "../lineage/unknownArtifacts.js";
import { extractObservationLineage } from "../lineage/lineage.js";
import { isDomainEnabled } from "../domains/registry.js";
import { sha256, readJson } from "../shared/io.js";
import { DETERMINATION_STATUS } from "./constants.js";
import { resolveSiteProfile, isConditionApplicable } from "./siteProfile.js";
import { detectCollectorFailure } from "./collectorFailure.js";
import { pageSubject } from "../detectors/framework.js";
import { evaluateRequirement, requirementForDetector } from "../evidence/determination.js";

const TOOL_VERSION = readJson(new URL("../../package.json", import.meta.url)).version;

function evidenceSourceFor(detector, ctx) {
  if (ctx.observations?.length && detector.requires?.includes("observations")) return "controlled_observation";
  if (detector.requires?.includes("registries") && detector.requires?.includes("site")) return "registry+dom_parse";
  if (detector.requires?.includes("registries")) return "registry";
  if (detector.requires?.includes("site")) return "dom_parse";
  return "configuration";
}

/**
 * Builds a schema-valid finding from a determination and hit.
 */
function buildFinding(d, hit, det, ctx, ts) {
  const coverageRequirement = requirementForDetector(d, hit);
  const scope = ctx.coverage
    ? evaluateRequirement(coverageRequirement, ctx.coverage, hit.subject)
    : null;
  const resourceIds = scope?.resource_id ? [scope.resource_id] : [];
  const scopeSatisfied = scope?.status === "supported" || scope?.status === "qualified";
  const determinationNote = scope && !scopeSatisfied
    ? `determination not established: ${scope.reason || "coverage requirement unsatisfied"}`
    : null;

  return {
    ...(ctx.coverage ? { schema_version: 2 } : {}),
    finding_id: det.finding_id,
    detector_id: d.id,
    detector_name: d.name,
    run_id: ctx.runId ?? "adhoc",
    timestamp: ts,
    discipline: d.discipline,
    subject: hit.subject,
    observation: {
      summary: hit.summary,
      evidence: hit.evidence || [],
      captured_value: hit.captured ?? null,
      expected_value: hit.expected ?? null,
      ...(scope ? { determination_status: scope.status, ...(determinationNote ? { determination_reason: determinationNote } : {}) } : {}),
    },
    classification: {
      finding_type: hit.finding_type ?? d.finding_type,
      severity: hit.severity ?? d.severity,
      confidence: scope && !scopeSatisfied ? "unknown" : (hit.confidence ?? d.confidence),
      deterministic: d.deterministic,
      impact: { ...d.impact, ...(hit.impact || {}) },
    },
    reasoning: {
      applicable_requirement: d.applicable_requirement,
      explanation: d.description,
      assumptions: hit.assumptions ?? [],
      limitations: [
        ...(d.deterministic ? [] : ["heuristic detection; verify manually before acting"]),
        ...(determinationNote ? [determinationNote] : []),
      ],
    },
    remediation: {
      preferred: d.remediation,
      alternatives: d.remediation_alternatives ?? [],
      unsafe_shortcuts: d.unsafe_shortcuts ?? [],
      owner: hit.owner ?? null,
      review_required: d.review_required ?? !d.deterministic,
    },
    verification: {
      method: d.verification,
      expected_result: "detector no longer reports this subject",
      detector_to_rerun: d.id,
    },
    provenance: {
      detector_version: d.version ?? 1,
      tool_version: TOOL_VERSION,
      source_url: hit.subject?.url ?? hit.subject?.identifier ?? null,
      source_file: hit.subject?.source_file ?? null,
      evidence_selector: hit.subject?.rendered_selector ?? hit.subject?.source_location ?? null,
      evidence_source: evidenceSourceFor(d, ctx),
      viewport: ctx.viewport ?? null,
      viewport_note: ctx.viewport ? null : "viewport not captured for this collection method; static source/built-output check",
      methodology: d.deterministic
        ? "deterministic condition check over captured evidence"
        : "heuristic judgment; human semantic review required before acting",
      revalidation_required: d.deterministic ? "on_next_audit" : "human_review_before_action",
    },
    ...(ctx.coverage ? {
      evidence_scope: {
        requirement: coverageRequirement,
        satisfaction: scope.status,
        resource_ids: resourceIds,
        coverage_ref: "coverage.json",
      },
    } : {}),
    status: { state: "open", first_seen: ts, last_seen: ts, resolved_at: null },
  };
}

/**
 * Core Determination Engine (Wave 1: B-010, B-011, B-014).
 * Evaluates conditions per subject and produces determinations.
 * Findings are projected strictly from FAIL and WARNING determinations.
 */
export function evaluateDeterminations(detectors, ctx) {
  const determinations = [];
  const findings = [];
  const detectorsRun = [];
  const detectorsSkipped = [];
  const errors = [];
  const ts = ctx.timestamp ?? new Date().toISOString();
  const siteProfile = resolveSiteProfile(ctx);

  // Identify subjects
  const pages = ctx.site?.pages || [];
  const defaultSubject = ctx.site
    ? { type: "site", identifier: ctx.site.baseUrl || "site", url: ctx.site.baseUrl || null }
    : { type: "registry", identifier: "registries" };

  for (const d of detectors) {
    // 0. Domain module gating (B-042: disabled domains produce NOT_TESTED, not absence)
    const domainCheck = isDomainEnabled(d.namespace, { ...ctx, siteProfile });
    if (!domainCheck.enabled) {
      const reason = domainCheck.reason || `domain module ${d.namespace} is disabled by configuration`;
      detectorsSkipped.push({ detector_id: d.id, reason });
      const seed = `${d.id}|${defaultSubject.identifier}|domain_disabled`;
      determinations.push({
        schema_version: 1,
        determination_id: `DET-${sha256(seed).slice(0, 12)}`,
        condition_id: d.id,
        condition_version: d.version ?? 1,
        detector_id: d.id,
        detector_name: d.name,
        run_id: ctx.runId ?? "adhoc",
        timestamp: ts,
        subject: defaultSubject,
        status: DETERMINATION_STATUS.NOT_TESTED,
        reason,
        finding_id: null,
        discipline: d.discipline,
        severity: d.severity,
        collector_failure: null,
        site_profile: siteProfile,
        applicable: false,
        unknown_artifacts: null,
        unknown_rate_drift: null,
        lineage: null,
      });
      continue;
    }

    // 1. Missing context prerequisites -> NOT_TESTED
    if (d.requires && !d.requires.every((r) => ctx[r])) {
      const reason = `missing context: ${d.requires.filter((r) => !ctx[r]).join(", ")}`;
      detectorsSkipped.push({ detector_id: d.id, reason });
      const seed = `${d.id}|${defaultSubject.identifier}|not_tested`;
      determinations.push({
        schema_version: 1,
        determination_id: `DET-${sha256(seed).slice(0, 12)}`,
        condition_id: d.id,
        condition_version: d.version ?? 1,
        detector_id: d.id,
        detector_name: d.name,
        run_id: ctx.runId ?? "adhoc",
        timestamp: ts,
        subject: defaultSubject,
        status: DETERMINATION_STATUS.NOT_TESTED,
        reason,
        finding_id: null,
        discipline: d.discipline,
        severity: d.severity,
        collector_failure: null,
        site_profile: siteProfile,
        applicable: true,
      });
      continue;
    }

    // 2. Applicability check (B-011: content_only records ecommerce conditions as NOT_APPLICABLE)
    const applicability = isConditionApplicable(d, siteProfile, defaultSubject);
    if (!applicability.applicable) {
      const seed = `${d.id}|${defaultSubject.identifier}|not_applicable`;
      determinations.push({
        schema_version: 1,
        determination_id: `DET-${sha256(seed).slice(0, 12)}`,
        condition_id: d.id,
        condition_version: d.version ?? 1,
        detector_id: d.id,
        detector_name: d.name,
        run_id: ctx.runId ?? "adhoc",
        timestamp: ts,
        subject: defaultSubject,
        status: DETERMINATION_STATUS.NOT_APPLICABLE,
        reason: applicability.reason,
        finding_id: null,
        discipline: d.discipline,
        severity: d.severity,
        collector_failure: null,
        site_profile: siteProfile,
        applicable: false,
      });
      continue;
    }

    // 3. Execute detector check
    let hits;
    try {
      hits = d.check(ctx) || [];
    } catch (err) {
      const reason = `detector error: ${err.message}`;
      errors.push(`${d.id}: ${reason}`);
      const seed = `${d.id}|${defaultSubject.identifier}|error`;
      determinations.push({
        schema_version: 1,
        determination_id: `DET-${sha256(seed).slice(0, 12)}`,
        condition_id: d.id,
        condition_version: d.version ?? 1,
        detector_id: d.id,
        detector_name: d.name,
        run_id: ctx.runId ?? "adhoc",
        timestamp: ts,
        subject: defaultSubject,
        status: DETERMINATION_STATUS.ERROR,
        reason,
        finding_id: null,
        discipline: d.discipline,
        severity: d.severity,
        collector_failure: null,
        site_profile: siteProfile,
        applicable: true,
      });
      continue;
    }

    detectorsRun.push(d.id);

    // Map hits by subject identifier
    const hitsBySubject = new Map();
    for (const hit of hits) {
      const ident = hit.subject?.identifier ?? "";
      if (!hitsBySubject.has(ident)) hitsBySubject.set(ident, []);
      hitsBySubject.get(ident).push(hit);
    }

    // Does this detector evaluate pages or site/global?
    const evaluatesPages = d.requires?.includes("site") && pages.length > 0;
    const evaluatedSubjects = evaluatesPages
      ? pages.map((p) => pageSubject(p))
      : [defaultSubject];

    // For any hit on an unlisted subject (e.g. schema block, registry entry), include it
    for (const [ident, subjectHits] of hitsBySubject.entries()) {
      if (!evaluatedSubjects.some((s) => s.identifier === ident)) {
        evaluatedSubjects.push(subjectHits[0].subject);
      }
    }

    // Evaluate determinations for each subject
    for (const subj of evaluatedSubjects) {
      const pageForSubj = pages.find((p) => (p.url && p.url === subj.url) || (p.sourceFile && p.sourceFile === subj.source_file));
      const subjUnknownArtifacts = pageForSubj?.unknown_artifacts || ctx.unknown_artifacts || null;
      let unknownRateDrift = null;
      if (ctx.baselineDeterminations && Array.isArray(ctx.baselineDeterminations)) {
        const baseDet = ctx.baselineDeterminations.find((b) => b.condition_id === d.id && b.subject?.identifier === subj.identifier);
        if (baseDet) {
          unknownRateDrift = calculateUnknownRateDrift(subjUnknownArtifacts, baseDet.unknown_artifacts).unknown_rate_drift;
        }
      }
      let obsLineage = null;
      if (ctx.observations && ctx.observations.length) {
        try {
          obsLineage = extractObservationLineage(ctx.observations);
        } catch {
          obsLineage = null;
        }
      }
      const subjHits = hitsBySubject.get(subj.identifier) || [];
      const collectorFailure = detectCollectorFailure(subj, ctx);

      // B-014 Invariant: Collector failure never becomes condition failure!
      if (collectorFailure) {
        const seed = `${d.id}|${subj.identifier}|collector_failure|${collectorFailure}`;
        determinations.push({
          schema_version: 1,
          determination_id: `DET-${sha256(seed).slice(0, 12)}`,
          condition_id: d.id,
          condition_version: d.version ?? 1,
          detector_id: d.id,
          detector_name: d.name,
          run_id: ctx.runId ?? "adhoc",
          timestamp: ts,
          subject: subj,
          status: collectorFailure === "PARSER_FAILED" || collectorFailure === "TIMEOUT" || collectorFailure === "DNS_FAILED"
            ? DETERMINATION_STATUS.ERROR
            : DETERMINATION_STATUS.NOT_TESTED,
          reason: `collector failure observed: ${collectorFailure}`,
          finding_id: null,
          discipline: d.discipline,
          severity: d.severity,
          collector_failure: collectorFailure,
          site_profile: siteProfile,
          applicable: true,
          unknown_artifacts: subjUnknownArtifacts,
          unknown_rate_drift: unknownRateDrift,
          lineage: obsLineage,
        });
        continue;
      }

      if (subjHits.length > 0) {
        // Hits produced on this subject
        for (const hit of subjHits) {
          const isWarning = hit.severity === "warning" || hit.severity === "info";
          const status = isWarning ? DETERMINATION_STATUS.WARNING : DETERMINATION_STATUS.FAIL;
          const idSeed = `${d.id}|${hit.subject?.identifier ?? ""}|${hit.summary}`;
          const findingId = `F-${sha256(idSeed).slice(0, 12)}`;
          const detId = `DET-${sha256(idSeed).slice(0, 12)}`;

          const det = {
            schema_version: 1,
            determination_id: detId,
            condition_id: d.id,
            condition_version: d.version ?? 1,
            detector_id: d.id,
            detector_name: d.name,
            run_id: ctx.runId ?? "adhoc",
            timestamp: ts,
            subject: hit.subject,
            status,
            reason: hit.summary,
            finding_id: findingId,
            discipline: d.discipline,
            severity: hit.severity ?? d.severity,
            collector_failure: null,
            site_profile: siteProfile,
            applicable: true,
            unknown_artifacts: subjUnknownArtifacts,
            unknown_rate_drift: unknownRateDrift,
            lineage: obsLineage,
          };
          determinations.push(det);

          // Project finding from FAIL/WARNING determination
          const finding = buildFinding(d, hit, det, ctx, ts);
          findings.push(finding);
        }
      } else {
        // Evaluated subject with NO hits -> PASS (or INDETERMINATE if coverage indeterminate)
        let status = DETERMINATION_STATUS.PASS;
        let reason = "condition evaluated and satisfied";

        if (ctx.coverage) {
          const req = requirementForDetector(d, { subject: subj });
          const scope = evaluateRequirement(req, ctx.coverage, subj);
          if (scope.status === "indeterminate") {
            status = DETERMINATION_STATUS.INDETERMINATE;
            reason = scope.reason ? `coverage indeterminate: ${scope.reason}` : "coverage requirement unsatisfied";
          }
        }

        const seed = `${d.id}|${subj.identifier}|pass`;
        determinations.push({
          schema_version: 1,
          determination_id: `DET-${sha256(seed).slice(0, 12)}`,
          condition_id: d.id,
          condition_version: d.version ?? 1,
          detector_id: d.id,
          detector_name: d.name,
          run_id: ctx.runId ?? "adhoc",
          timestamp: ts,
          subject: subj,
          status,
          reason,
          finding_id: null,
          discipline: d.discipline,
          severity: d.severity,
          collector_failure: null,
          site_profile: siteProfile,
          applicable: true,
          unknown_artifacts: subjUnknownArtifacts,
          unknown_rate_drift: unknownRateDrift,
          lineage: obsLineage,
        });
      }
    }
  }

  return { findings, determinations, detectorsRun, detectorsSkipped, errors, siteProfile };
}
