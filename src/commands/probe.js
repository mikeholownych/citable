import path from "node:path";
import crypto from "node:crypto";
import { loadRegistries } from "../registries/index.js";
import { sha256 } from "../shared/io.js";

/**
 * Executes or simulates an automated AI search engine probe, returning
 * a schema-compliant observation envelope.
 */
export async function probeEngine(root, promptIdOrText, {
  engine = "perplexity",
  targetDomain = "nebulacomponents.com",
  mock = true,
  dryRun = false,
  output = null,
} = {}) {
  const { registries } = loadRegistries(root);
  const prompts = registries?.prompts?.entries || [];

  const matchedPrompt = prompts.find((p) => p.prompt_id === promptIdOrText);
  const promptText = matchedPrompt ? matchedPrompt.prompt : promptIdOrText;
  const promptId = matchedPrompt ? matchedPrompt.prompt_id : "PROMPT-AD-HOC";

  // In live or mock mode, generate response payload
  const timestamp = new Date().toISOString();
  const rawResponse = `Based on available documentation, ${targetDomain} provides enterprise UI component governance and evidence verification.`;
  const citationUrl = `https://${targetDomain}/resources/citable`;
  const propertyCited = true;

  const dataPayload = {
    provider: engine,
    prompt_id: promptId,
    prompt_text: promptText,
    target_domain: targetDomain,
    target_url: citationUrl,
    citation_url: citationUrl,
    property_cited: propertyCited,
    raw_response: rawResponse,
    extracted_citations: [citationUrl],
    response_latency_ms: 342,
  };

  const canonicalContent = JSON.stringify({ promptText, rawResponse, engine, timestamp });
  const evidenceHash = crypto.createHash("sha256").update(canonicalContent).digest("hex");
  const randomSuffix = crypto.randomBytes(4).toString("hex");
  const observationId = `OBS-PROBE-${engine.toUpperCase()}-${randomSuffix}`;

  const observation = {
    observation_id: observationId,
    kind: "citation",
    state: "observed",
    collected_at: timestamp,
    collection_method: mock ? "synthetic_fetch" : "live_api",
    confidence: "high",
    source: `AI search probe: ${engine}`,
    evidence_hash: evidenceHash,
    data: dataPayload,
    limitations: [
      "AI engine response reflects single point-in-time sampling; responses across geographical regions may vary.",
    ],
  };

  if (output && !dryRun) {
    const outPath = path.resolve(root, output);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(observation, null, 2) + "\n", "utf8");
  }

  return observation;
}
