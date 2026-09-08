import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { exportExecutiveReport } from "../../src/reporting/executiveExport.js";
import { formatSlackPayload, formatTeamsPayload, formatDiscordPayload, buildAlertPayload } from "../../src/monitoring/alertDelivery.js";

test("exportExecutiveReport creates HTML brief and Markdown deck with disclaimer", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "citable-exec-test-"));

  const htmlRes = await exportExecutiveReport(tmpDir, "RUN-TEST-001", {
    format: "html-brief",
    clientName: "Nebula Enterprise Client",
  });
  assert.equal(htmlRes.format, "html-brief");
  assert.ok(htmlRes.content.includes("Executive Search & AEO Governance Briefing"));
  assert.ok(htmlRes.content.includes("Nebula Enterprise Client"));
  assert.ok(htmlRes.content.includes("Citable does not guarantee"));

  const deckRes = await exportExecutiveReport(tmpDir, "RUN-TEST-001", {
    format: "markdown-deck",
    clientName: "Nebula Enterprise Client",
  });
  assert.equal(deckRes.format, "markdown-deck");
  assert.ok(deckRes.content.includes("<!-- slide -->"));
});

test("alert formatters format Slack, Teams, and Discord payloads cleanly", () => {
  const payload = buildAlertPayload({
    runA: "RUN-001",
    runB: "RUN-002",
    alerts: [
      { type: "index_loss", severity: "critical", message: "Homepage dropped from index" },
      { type: "citation_presence_change", severity: "high", message: "Lost primary citation on SearchGPT" },
    ],
  });

  const slack = formatSlackPayload(payload);
  assert.ok(slack.text.includes("Citable Alert"));
  assert.ok(Array.isArray(slack.blocks));
  assert.ok(slack.blocks[1].fields.some((f) => f.text.includes("Critical / High")));

  const teams = formatTeamsPayload(payload);
  assert.equal(teams["@type"], "MessageCard");
  assert.equal(teams.themeColor, "D9381E");

  const discord = formatDiscordPayload(payload);
  assert.ok(discord.content.includes("Citable Alert"));
  assert.ok(discord.embeds[0].color === 14232606);
});
