import fs from "node:fs";
import path from "node:path";
import { replayHistoricalRun } from "../lineage/replay.js";

/**
 * Replay command: re-evaluates historical run evidence under target parser or condition version.
 */
export function replayCommand(root, runId, options = {}) {
  if (!runId) throw new Error("replay requires <run-id>");
  const runDir = path.join(root, ".citable", "runs", runId);
  if (!fs.existsSync(runDir)) throw new Error(`run not found: ${runId}`);

  const targetConditionVersions = {};
  if (options.conditionVersion) {
    const pairs = Array.isArray(options.conditionVersion) ? options.conditionVersion : [options.conditionVersion];
    for (const p of pairs) {
      const [id, ver] = String(p).split("=");
      if (id && ver) targetConditionVersions[id.trim()] = Number.parseInt(ver.trim(), 10);
    }
  }

  const result = replayHistoricalRun(runDir, {
    targetConditionVersions,
    targetParserVersion: options.parserVersion || null,
    root,
    writeRun: options.write ?? true,
  });

  return result;
}
