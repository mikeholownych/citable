import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { envelope, summarizeObservations } from "../../src/observations/common.js";
import { validateAgainst } from "../../src/shared/schemaValidator.js";
import {
  verifyObservationLineage,
  assertObservationLineage,
  extractObservationLineage,
  deriveMetricWithLineage,
} from "../../src/lineage/lineage.js";
import {
  retainUnknownArtifacts,
  calculateUnknownRateDrift,
  reportConditionUnknownDrift,
  extractUnknownDomStructures,
  extractUnknownSchemaTypes,
  extractUnknownProtocolArtifacts,
} from "../../src/lineage/unknownArtifacts.js";
import { replayHistoricalRun } from "../../src/lineage/replay.js";
import { replayCommand } from "../../src/commands/replay.js";
import { createRun } from "../../src/evidence/run.js";
import { extractPage } from "../../src/extractor/page.js";
import { DETERMINATION_STATUS } from "../../src/conditions/constants.js";
import { parse } from "node-html-parser";

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "citable-wave3-test-"));
}

test("B-030: observation envelope carries collector_id, collector_version, parser_version, configuration_version", () => {
  const obs = envelope("citation", { provider: "perplexity", property_cited: true }, {
    method: "synthetic_fetch",
    source: "https://api.perplexity.ai",
    collector_id: "collector:perplexity_probe",
    collector_version: "1.23.0",
    parser_version: "1.23.0",
    configuration_version: "1.0.0",
  });

  assert.equal(obs.collector_id, "collector:perplexity_probe");
  assert.equal(obs.collector_version, "1.23.0");
  assert.equal(obs.parser_version, "1.23.0");
  assert.equal(obs.configuration_version, "1.0.0");

  const validation = validateAgainst("observation.schema.json", obs);
  assert.equal(validation.valid, true, validation.errors?.join("; "));

  const lineageCheck = verifyObservationLineage(obs);
  assert.equal(lineageCheck.valid, true);
  assert.doesNotThrow(() => assertObservationLineage(obs));
});

test("B-030: default observation envelope populates valid lineage automatically", () => {
  const obs = envelope("citation", { provider: "copilot", property_cited: false }, {
    method: "live_api",
    source: "https://copilot.test",
  });

  assert.ok(obs.collector_id.startsWith("citable:collector:"));
  assert.ok(obs.collector_version.length > 0);
  assert.ok(obs.parser_version.length > 0);
  assert.ok(obs.configuration_version.length > 0);

  const validation = validateAgainst("observation.schema.json", obs);
  assert.equal(validation.valid, true, validation.errors?.join("; "));
});

test("B-030: no derived metric lacks lineage to collector, parser, and config versions", () => {
  const obs1 = envelope("citation", { provider: "gemini", property_cited: true }, {
    method: "live_api",
    source: "https://gemini.test",
    collector_id: "col-gemini-1",
    collector_version: "1.1.0",
    parser_version: "2.0.0",
    configuration_version: "1.0.1",
  });
  const obs2 = envelope("citation", { provider: "chatgpt", property_cited: false }, {
    method: "live_api",
    source: "https://chatgpt.test",
    collector_id: "col-chatgpt-1",
    collector_version: "1.2.0",
    parser_version: "2.0.0",
    configuration_version: "1.0.1",
  });

  const summary = summarizeObservations([obs1, obs2]);
  assert.ok(summary.lineage, "summary must carry lineage");
  assert.deepEqual(summary.lineage.collector_ids, ["col-chatgpt-1", "col-gemini-1"]);
  assert.deepEqual(summary.lineage.collector_versions, ["1.1.0", "1.2.0"]);
  assert.deepEqual(summary.lineage.parser_versions, ["2.0.0"]);
  assert.deepEqual(summary.lineage.configuration_versions, ["1.0.1"]);

  assert.ok(summary.citation_metrics.lineage, "citation_metrics must carry lineage");
  assert.deepEqual(summary.citation_metrics.lineage.collector_ids, ["col-chatgpt-1", "col-gemini-1"]);

  // deriveMetricWithLineage utility
  const derivedRate = deriveMetricWithLineage("citation_rate", (items) => {
    return items.filter((x) => x.data.property_cited).length / items.length;
  }, [obs1, obs2]);

  assert.equal(derivedRate.data, 0.5);
  assert.deepEqual(derivedRate.lineage.parser_versions, ["2.0.0"]);

  // Mutation proof: missing lineage field fails closed
  const corruptObs = { ...obs1 };
  delete corruptObs.collector_version;
  assert.throws(() => extractObservationLineage([corruptObs]), /lacks required lineage/);
});

test("B-031: requested_at, observed_at, ingested_at, and normalized_at are distinct", () => {
  const reqTime = "2026-06-01T10:00:00.000Z";
  const obsTime = "2026-06-01T10:00:01.500Z";
  const ingTime = "2026-06-01T10:00:02.000Z";
  const normTime = "2026-06-01T10:00:02.250Z";

  const obs = envelope("metric", { metric_id: "m_traffic", value: 1200 }, {
    method: "synthetic_fetch",
    source: "https://analytics.test",
    requested_at: reqTime,
    observed_at: obsTime,
    ingested_at: ingTime,
    normalized_at: normTime,
  });

  assert.equal(obs.requested_at, reqTime);
  assert.equal(obs.observed_at, obsTime);
  assert.equal(obs.ingested_at, ingTime);
  assert.equal(obs.normalized_at, normTime);

  // All 4 distinct
  const uniqueTimes = new Set([obs.requested_at, obs.observed_at, obs.ingested_at, obs.normalized_at]);
  assert.equal(uniqueTimes.size, 4, "all four timestamps must be distinct");

  const validation = validateAgainst("observation.schema.json", obs);
  assert.equal(validation.valid, true, validation.errors?.join("; "));
});

test("B-031: owner import records historical observation time separately from ingest time", () => {
  const historicalJuneTime = "2026-06-15T08:30:00.000Z";
  const nowIngestTime = "2026-09-25T18:00:00.000Z";

  const obs = envelope("metric", { metric_id: "m_impressions", value: 45000 }, {
    method: "owner_import",
    source: "/path/to/historical-export-june.csv",
    observed_at: historicalJuneTime,
    ingested_at: nowIngestTime,
    normalized_at: nowIngestTime,
  });

  assert.equal(obs.observed_at, historicalJuneTime, "observed_at records historical source observation time");
  assert.equal(obs.ingested_at, nowIngestTime, "ingested_at records ingest time");
  assert.notEqual(obs.observed_at, obs.ingested_at, "owner import observed_at and ingested_at must not be identical");

  const validation = validateAgainst("observation.schema.json", obs);
  assert.equal(validation.valid, true, validation.errors?.join("; "));
});

test("B-032: historical run replay under new parser or condition version produces NEW_DERIVATION_FROM_HISTORICAL_EVIDENCE", () => {
  const tmp = makeTmpDir();
  try {
    // 1. Create a historical sealed run
    const histRun = createRun(tmp, {
      command: "audit",
      target: { kind: "source", location: "site", environment: "local" },
    });
    const histObs = envelope("citation", { provider: "perplexity", property_cited: false }, {
      method: "synthetic_fetch",
      source: "https://api.perplexity.ai",
      collector_version: "1.0.0",
      parser_version: "1.0.0",
    });
    histRun.writeArtifact("observations/0001-citation.json", histObs);

    const histDets = [
      {
        schema_version: 1,
        determination_id: "DET-TEST-001",
        condition_id: "TECH-CANONICAL-EXISTS",
        condition_version: 1,
        detector_id: "TECH-CANONICAL-EXISTS",
        detector_name: "Canonical link detector",
        run_id: histRun.runId,
        timestamp: "2026-08-01T00:00:00Z",
        subject: { type: "page", identifier: "/page-1" },
        status: DETERMINATION_STATUS.FAIL,
        reason: "canonical missing in legacy parser",
        finding_id: "F-001",
        applicable: true,
      },
    ];
    histRun.writeArtifact("determinations.json", histDets);
    histRun.writeArtifact("findings.json", [{ finding_id: "F-001" }]);
    const histDir = histRun.finalize("completed");

    // 2. Read checksums before replay
    const checksumsBefore = JSON.parse(fs.readFileSync(path.join(histDir, "checksums.json"), "utf8"));
    const determinationsBefore = fs.readFileSync(path.join(histDir, "determinations.json"), "utf8");

    // 3. Replay with updated condition version and custom evaluator
    const replayResult = replayHistoricalRun(histDir, {
      targetConditionVersions: { "TECH-CANONICAL-EXISTS": 2 },
      targetParserVersion: "2.0.0",
      conditionEvaluators: {
        "TECH-CANONICAL-EXISTS": ({ condition_version }) => ({
          status: DETERMINATION_STATUS.PASS,
          reason: `canonical satisfied under version ${condition_version}`,
        }),
      },
      root: tmp,
      writeRun: true,
    });

    // 4. Verify derivation output
    assert.equal(replayResult.derivation.status, "NEW_DERIVATION_FROM_HISTORICAL_EVIDENCE");
    assert.equal(replayResult.historical_run_id, histRun.runId);
    assert.equal(replayResult.historical_preserved, true);
    assert.equal(replayResult.derivation.historical_checksums_match, true);

    const dCheck = validateAgainst("replayed-derivation.schema.json", replayResult.derivation);
    assert.equal(dCheck.valid, true, dCheck.errors?.join("; "));

    // 5. Verify transitions
    assert.equal(replayResult.derivation.transitions.length, 1);
    assert.equal(replayResult.derivation.transitions[0].transition, "FAIL_TO_PASS");
    assert.equal(replayResult.derivation.transitions[0].historical_version, 1);
    assert.equal(replayResult.derivation.transitions[0].target_version, 2);

    // 6. Strict immutability check: historical run files are bit-for-bit unchanged!
    const checksumsAfter = JSON.parse(fs.readFileSync(path.join(histDir, "checksums.json"), "utf8"));
    const determinationsAfter = fs.readFileSync(path.join(histDir, "determinations.json"), "utf8");
    assert.deepEqual(checksumsBefore, checksumsAfter);
    assert.equal(determinationsBefore, determinationsAfter);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("B-032: replayCommand CLI executes replay without mutating source run", () => {
  const tmp = makeTmpDir();
  try {
    const run = createRun(tmp, {
      command: "audit",
      target: { kind: "source", location: "site", environment: "local" },
    });
    const dets = [
      {
        schema_version: 1,
        determination_id: "DET-CLI-01",
        condition_id: "CRAWL-ROBOTS-VALID",
        condition_version: 1,
        detector_id: "CRAWL-ROBOTS-VALID",
        run_id: run.runId,
        timestamp: "2026-08-01T00:00:00Z",
        subject: { type: "site", identifier: "site" },
        status: DETERMINATION_STATUS.PASS,
        applicable: true,
      },
    ];
    run.writeArtifact("determinations.json", dets);
    const runDir = run.finalize("completed");

    const result = replayCommand(tmp, run.runId, {
      conditionVersion: "CRAWL-ROBOTS-VALID=2",
      parserVersion: "1.24.0",
      write: false,
    });

    assert.equal(result.derivation.status, "NEW_DERIVATION_FROM_HISTORICAL_EVIDENCE");
    assert.equal(result.historical_preserved, true);
    assert.equal(result.derivation.target_condition_versions["CRAWL-ROBOTS-VALID"], 2);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("B-033: unknown DOM structures, schema types, and protocol artifacts are retained rather than discarded", () => {
  const htmlWithUnknowns = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Unknown Test</title>
        <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "CustomUnknownProductType",
          "name": "Widget"
        }
        </script>
      </head>
      <body>
        <main>
          <h1>Hello World</h1>
          <custom-element-tag data-attr="val">Custom Web Component Content</custom-element-tag>
          <another-unknown-widget id="w1">Widget Content</another-unknown-widget>
        </main>
      </body>
    </html>
  `;

  const page = extractPage({
    url: "https://example.com/page",
    html: htmlWithUnknowns,
    headers: {
      "content-type": "text/html",
      "x-custom-engine-header": "experimental-token",
    },
  });

  assert.ok(page.unknown_artifacts, "page must have unknown_artifacts");
  assert.equal(page.unknown_artifacts.dom.length, 2, "must retain 2 unknown DOM structures");
  assert.equal(page.unknown_artifacts.dom[0].tag, "custom-element-tag");
  assert.equal(page.unknown_artifacts.dom[1].tag, "another-unknown-widget");

  assert.equal(page.unknown_artifacts.schema.length, 1, "must retain 1 unknown schema type");
  assert.equal(page.unknown_artifacts.schema[0].type, "CustomUnknownProductType");

  assert.equal(page.unknown_artifacts.protocol.length, 1, "must retain 1 unknown protocol header");
  assert.equal(page.unknown_artifacts.protocol[0].name, "x-custom-engine-header");

  assert.ok(page.unknown_rate > 0, "unknown_rate must be greater than 0");
});

test("B-033: drift in unknown-rate is calculated and reported per condition", () => {
  const baselineUnknowns = {
    unknown_rate: 0.05,
    unknown_elements: 2,
    total_elements: 40,
  };
  const currentUnknowns = {
    unknown_rate: 0.15,
    unknown_elements: 6,
    total_elements: 40,
  };

  const drift = calculateUnknownRateDrift(currentUnknowns, baselineUnknowns);
  assert.equal(drift.baseline_unknown_rate, 0.05);
  assert.equal(drift.current_unknown_rate, 0.15);
  assert.equal(drift.unknown_rate_drift, 0.10);
  assert.equal(drift.drift_detected, true);
  assert.equal(drift.has_increased_drift, true);

  const baselineDets = [
    {
      condition_id: "PAGE-UNKNOWN-TAGS",
      subject: { identifier: "/page" },
      unknown_artifacts: baselineUnknowns,
    },
  ];
  const currentDets = [
    {
      condition_id: "PAGE-UNKNOWN-TAGS",
      subject: { identifier: "/page" },
      unknown_artifacts: currentUnknowns,
    },
  ];

  const report = reportConditionUnknownDrift(currentDets, baselineDets);
  assert.equal(report.length, 1);
  assert.equal(report[0].condition_id, "PAGE-UNKNOWN-TAGS");
  assert.equal(report[0].unknown_rate_drift, 0.10);
  assert.equal(report[0].has_increased_drift, true);
});
