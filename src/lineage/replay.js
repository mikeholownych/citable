import fs from "node:fs";
import path from "node:path";
import { readJson, writeJson, sha256, sha256File, nowIso } from "../shared/io.js";
import { canonicalEvidenceJson } from "../evidence/hashes.js";
import { validateAgainst } from "../shared/schemaValidator.js";
import { extractObservationLineage } from "./lineage.js";
import { retainUnknownArtifacts, calculateUnknownRateDrift } from "./unknownArtifacts.js";
import { createRun } from "../evidence/run.js";

/**
 * Computes SHA-256 hashes of all files in a directory to prove immutability.
 */
function directoryChecksums(dir) {
  const result = {};
  if (!fs.existsSync(dir)) return result;

  function walk(d) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, entry.name);
      if (entry.isDirectory()) {
        walk(p);
      } else if (entry.isFile()) {
        const rel = path.relative(dir, p).split(path.sep).join("/");
        result[rel] = sha256File(p);
      }
    }
  }

  walk(dir);
  return result;
}

/**
 * B-032: Replay preserved evidence under newer versions.
 * A historical run can be re-derived under a new parser or condition version,
 * producing NEW_DERIVATION_FROM_HISTORICAL_EVIDENCE;
 * the original observation and determination are preserved unchanged.
 */
export function replayHistoricalRun(historicalRunDir, {
  targetConditionVersions = {},
  targetParserVersion = null,
  conditionEvaluators = {},
  customParser = null,
  root = null,
  writeRun = false,
} = {}) {
  const resolvedDir = path.resolve(historicalRunDir);
  if (!fs.existsSync(resolvedDir)) {
    throw new Error(`Historical run directory not found: ${resolvedDir}`);
  }

  // Step 1: Record pre-replay checksums over the historical run directory
  const initialChecksums = directoryChecksums(resolvedDir);

  // Step 2: Read historical artifacts
  const manifestPath = path.join(resolvedDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Historical run manifest not found: ${manifestPath}`);
  }
  const manifest = readJson(manifestPath);

  // Read determinations (or empty array if none)
  const determinationsPath = path.join(resolvedDir, "determinations.json");
  const originalDeterminations = fs.existsSync(determinationsPath)
    ? readJson(determinationsPath)
    : [];

  // Read findings (or empty array if none)
  const findingsPath = path.join(resolvedDir, "findings.json");
  const originalFindings = fs.existsSync(findingsPath)
    ? readJson(findingsPath)
    : [];

  // Read observations if present
  const observationsDir = path.join(resolvedDir, "observations");
  const originalObservations = [];
  if (fs.existsSync(observationsDir)) {
    for (const file of fs.readdirSync(observationsDir).sort()) {
      if (file.endsWith(".json")) {
        originalObservations.push(readJson(path.join(observationsDir, file)));
      }
    }
  }

  // Step 3: Re-derive observations if targetParserVersion or customParser is specified
  const replayedObservations = [];
  let replayedUnknownArtifacts = null;

  for (const obs of originalObservations) {
    const replayedObs = { ...obs };
    if (targetParserVersion) {
      replayedObs.parser_version = targetParserVersion;
    }
    if (customParser && typeof customParser === "function") {
      const rawContent = obs.data?.raw_content || JSON.stringify(obs.data);
      const reParsed = customParser(rawContent, targetParserVersion);
      replayedObs.data = { ...replayedObs.data, ...reParsed };
    }
    replayedObservations.push(replayedObs);
  }

  // Step 4: Re-derive determinations under target condition versions / new parser
  const replayedDeterminations = [];
  const transitions = [];

  for (const det of originalDeterminations) {
    const conditionId = det.condition_id;
    const targetVersion = targetConditionVersions[conditionId] ?? (targetConditionVersions["*"] ?? det.condition_version);
    const versionChanged = targetVersion !== det.condition_version;
    const parserChanged = Boolean(targetParserVersion);

    let replayedStatus = det.status;
    let replayedReason = det.reason;
    let replayedUnknowns = det.unknown_artifacts || null;

    // Check if custom condition evaluation logic is provided for the new version
    if (conditionEvaluators[conditionId]) {
      const evalResult = conditionEvaluators[conditionId]({
        det,
        observations: replayedObservations,
        condition_version: targetVersion,
        parser_version: targetParserVersion,
      });
      replayedStatus = evalResult.status ?? replayedStatus;
      replayedReason = evalResult.reason ?? replayedReason;
      if (evalResult.unknown_artifacts) replayedUnknowns = evalResult.unknown_artifacts;
    }

    const replayedDet = {
      ...det,
      determination_id: `DET-REPLAY-${sha256(det.determination_id + ":" + targetVersion + ":" + (targetParserVersion || "")).slice(0, 12)}`,
      condition_version: targetVersion,
      status: replayedStatus,
      reason: replayedReason,
      unknown_artifacts: replayedUnknowns,
      provenance: {
        ...(det.provenance || {}),
        replayed_from_run: manifest.run_id,
        historical_condition_version: det.condition_version,
        target_condition_version: targetVersion,
        target_parser_version: targetParserVersion || det.provenance?.parser_version || null,
        replayed_at: nowIso(),
      },
    };
    replayedDeterminations.push(replayedDet);

    // Record transition
    let transition = "UNCHANGED";
    if (det.status !== replayedStatus) {
      if (det.status === "FAIL" && replayedStatus === "PASS") transition = "FAIL_TO_PASS";
      else if (det.status === "PASS" && replayedStatus === "FAIL") transition = "PASS_TO_FAIL";
      else transition = `${det.status}_TO_${replayedStatus}`;
    } else if (versionChanged || parserChanged) {
      transition = "RE_EVALUATED_SAME_STATUS";
    }

    transitions.push({
      condition_id: conditionId,
      subject: det.subject,
      historical_version: det.condition_version,
      target_version: targetVersion,
      historical_status: det.status,
      replayed_status: replayedStatus,
      transition,
    });
  }

  // Calculate unknown rate drift if unknown artifacts are present
  let unknownDrift = null;
  if (replayedDeterminations.length > 0 && originalDeterminations.length > 0) {
    const origUnknowns = originalDeterminations[0]?.unknown_artifacts;
    const replayedUnknowns = replayedDeterminations[0]?.unknown_artifacts;
    if (origUnknowns || replayedUnknowns) {
      unknownDrift = calculateUnknownRateDrift(replayedUnknowns, origUnknowns).unknown_rate_drift;
    }
  }

  // Extract replayed lineage
  const allObservations = replayedObservations.length ? replayedObservations : originalObservations;
  const replayedLineage = {
    collector_ids: [...new Set(allObservations.map((o) => o.collector_id).filter(Boolean))].sort(),
    collector_versions: [...new Set(allObservations.map((o) => o.collector_version).filter(Boolean))].sort(),
    parser_versions: [...new Set(allObservations.map((o) => o.parser_version).filter(Boolean))].sort(),
    configuration_versions: [...new Set(allObservations.map((o) => o.configuration_version).filter(Boolean))].sort(),
  };

  // Step 5: Verify post-replay checksums match initial checksums (strictly immutable)
  const postChecksums = directoryChecksums(resolvedDir);
  let historicalPreserved = true;
  for (const [file, hash] of Object.entries(initialChecksums)) {
    if (postChecksums[file] !== hash) {
      historicalPreserved = false;
      throw new Error(`Historical run was corrupted during replay: file ${file} checksum mismatch`);
    }
  }

  // Step 6: Construct derivation record
  const derivationSeed = `${manifest.run_id}|${JSON.stringify(targetConditionVersions)}|${targetParserVersion || ""}|${nowIso()}`;
  const derivationId = `DERIV-REPLAY-${sha256(derivationSeed).slice(0, 12)}`;

  const derivationPayload = {
    schema_version: 1,
    derivation_id: derivationId,
    status: "NEW_DERIVATION_FROM_HISTORICAL_EVIDENCE",
    historical_run_id: manifest.run_id,
    historical_run_timestamp: manifest.timestamp,
    replayed_at: nowIso(),
    target_condition_versions: targetConditionVersions,
    target_parser_version: targetParserVersion,
    original_determinations: originalDeterminations,
    replayed_determinations: replayedDeterminations,
    transitions,
    unknown_artifacts: replayedUnknownArtifacts,
    unknown_rate_drift: unknownDrift,
    lineage: replayedLineage,
    historical_preserved: historicalPreserved,
    historical_checksums_match: true,
  };

  const derivationHash = sha256(canonicalEvidenceJson(derivationPayload));
  const fullDerivation = { ...derivationPayload, derivation_hash: derivationHash };

  const check = validateAgainst("replayed-derivation.schema.json", fullDerivation);
  if (!check.valid) {
    throw new Error(`Replay derivation violates contract: ${check.errors.join("; ")}`);
  }

  // Step 7: Optional output write (creates a distinct new run package)
  let replayRunId = null;
  if (writeRun && root) {
    const replayRun = createRun(root, {
      command: `replay ${manifest.run_id}`,
      argv: [`--target-run=${manifest.run_id}`],
      target: manifest.target,
    });
    replayRun.writeArtifact("replayed-derivation.json", fullDerivation);
    replayRun.writeArtifact("determinations.json", replayedDeterminations);
    replayRun.finalize("completed");
    replayRunId = replayRun.runId;
  }

  return {
    derivation: fullDerivation,
    replay_run_id: replayRunId,
    historical_run_id: manifest.run_id,
    historical_preserved: true,
  };
}
