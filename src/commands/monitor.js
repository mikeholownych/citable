import fs from 'node:fs';
import path from 'node:path';
import { readJson, writeJson, nowIso } from '../shared/io.js';
import { buildAlertPayload, dispatchAlertWebhook, filterAlerts } from '../monitoring/alertDelivery.js';
import { calculateShareOfVoice, extractDomain } from '../reporting/shareOfVoice.js';
import { loadRegistries } from '../registries/index.js';
import { evaluateAnswerAttribution } from '../observations/attribution.js';

function observations(dir) {
  const folder = path.join(dir, 'observations');
  if (!fs.existsSync(folder)) return [];
  return fs.readdirSync(folder).filter((f) => f.endsWith('.json')).sort().map((f) => readJson(path.join(folder, f)));
}

function key(item) {
  const d = item.data || {};
  if (item.kind === 'citation') return [item.kind, d.provider, d.product_mode, d.prompt_id, d.run_index].join(':');
  if (item.kind === 'representation_drift') return [item.kind, d.manifest_hash, d.surface_id, d.retrieval_path, d.region, d.request_identity].join(':');
  if (item.kind === 'stance') return [item.kind, d.entity_id || d.canonical_name, d.prompt_id, d.engine].join(':');
  return [item.kind, d.url || d.citation_url || d.prompt_id || d.timestamp || item.observation_id].join(':');
}

export function monitor(root, { runA, runB } = {}) {
  const runsDir = path.join(root, '.citable', 'runs');
  if (!fs.existsSync(runsDir)) throw new Error('no runs available to monitor');
  const candidates = fs.readdirSync(runsDir).filter((r) => fs.existsSync(path.join(runsDir, r, 'observations'))).sort();
  const b = runB || candidates.at(-1), a = runA || candidates.at(-2);
  if (!a || !b) throw new Error('monitor requires two observation runs');

  let activeClaims = [];
  let entities = [];
  let competitors = [];
  const firstPartyDomains = new Set();
  try {
    const { registries } = loadRegistries(root);
    activeClaims = (registries?.claims?.entries || []).filter((c) => c.status === 'verified' || c.status === 'established');
    entities = (registries?.entities?.entries || []).filter((e) => e.status !== 'retired');
    if (registries?.competitors?.entries) competitors = registries.competitors.entries;
    if (registries?.config?.site?.base_url) {
      const d = extractDomain(registries.config.site.base_url);
      if (d) firstPartyDomains.add(d);
    }
    if (registries?.pages?.entries) {
      for (const p of registries.pages.entries) {
        if (p.url) {
          const d = extractDomain(p.url);
          if (d) firstPartyDomains.add(d);
        }
      }
    }
  } catch {
    // Registries may not exist in synthetic test environments
  }

  const before = new Map(observations(path.join(runsDir, a)).map((o) => [key(o), o]));
  const after = new Map(observations(path.join(runsDir, b)).map((o) => [key(o), o]));
  const alerts = [];
  for (const [k, current] of after) {
    const previous = before.get(k);
    if (!previous) alerts.push({ severity: 'informational', type: 'new_observation', key: k, current_state: current.state });
    else if (previous.state !== current.state) alerts.push({ severity: ['failed', 'not_observed'].includes(current.state) ? 'high' : 'medium', type: 'state_change', key: k, previous_state: previous.state, current_state: current.state });
    if (current.kind === 'index' && previous?.data?.indexed === true && current.data.indexed === false) alerts.push({ severity: 'high', type: 'index_loss', key: k });
    if (current.kind === 'canonical_freshness' && previous?.data?.canonical_consensus === true && current.data.canonical_consensus === false) alerts.push({ severity: 'high', type: 'canonical_regression', key: k });
    if (current.kind === 'citation' && previous?.data?.property_cited === true && current.data.property_cited === false) alerts.push({ severity: 'medium', type: 'citation_presence_change', key: k });
    if (current.kind === 'stance' && previous) {
      const fromStance = previous.data?.stance;
      const toStance = current.data?.stance;
      if (fromStance === 'favorable' && (toStance === 'unfavorable' || toStance === 'mixed')) {
        alerts.push({
          severity: 'high',
          type: 'stance_regression',
          key: k,
          previous_stance: fromStance,
          current_stance: toStance,
          entity_id: current.data?.entity_id || null,
          canonical_name: current.data?.canonical_name || null,
          prompt_id: current.data?.prompt_id || null,
          engine: current.data?.engine || null,
        });
      }
    }
    if (current.kind === 'representation_drift' && previous) {
      const from = previous.data.representation_state, to = current.data.representation_state;
      if (from !== 'divergent' && to === 'divergent') alerts.push({ severity: 'high', type: 'representation_divergence_observed', key: k, previous_state: from, current_state: to, authority: 'external_unverified', gates_release_finalization: false });
      if (from === 'divergent' && to === 'consistent') {
        const duration = new Date(current.collected_at) - new Date(previous.collected_at);
        alerts.push({ severity: 'informational', type: 'representation_convergence_observed', key: k, previous_state: from, current_state: to, observed_interval_ms: Number.isFinite(duration) && duration >= 0 ? duration : null, authority: 'external_unverified', gates_release_finalization: false });
      }
    }

    // Generative claim contradiction / hallucination check
    if (current.kind === 'attribution' && current.data?.evaluations) {
      for (const ev of current.data.evaluations) {
        if (ev.attribution_status === 'distorted') {
          alerts.push({
            severity: 'high',
            type: 'claim_contradiction_observed',
            key: k,
            claim_id: ev.claim_id,
            claim_text: ev.claim_text,
            assertion_excerpt: ev.assertion_excerpt,
            engine: current.data?.engine || current.data?.provider || null,
            reasons: ev.reasons || [],
          });
        }
      }
    } else if (current.kind === 'citation' || current.kind === 'passage') {
      if (current.data?.answer_text && entities.length > 0 && activeClaims.length > 0) {
        for (const e of entities) {
          const evalRes = evaluateAnswerAttribution(current.data.answer_text, e, { claims: activeClaims });
          if (evalRes.mentioned && evalRes.has_distorted_claims) {
            for (const ev of evalRes.evaluations) {
              if (ev.attribution_status === 'distorted') {
                alerts.push({
                  severity: 'high',
                  type: 'claim_contradiction_observed',
                  key: k,
                  claim_id: ev.claim_id,
                  claim_text: ev.claim_text,
                  assertion_excerpt: ev.assertion_excerpt,
                  engine: current.data?.provider || current.data?.engine || null,
                  reasons: ev.reasons || [],
                });
              }
            }
          }
        }
      } else if (current.data?.contradicted_claims && Array.isArray(current.data.contradicted_claims)) {
        for (const cc of current.data.contradicted_claims) {
          alerts.push({
            severity: 'high',
            type: 'claim_contradiction_observed',
            key: k,
            claim_id: typeof cc === 'object' ? cc.claim_id : cc,
            assertion_excerpt: typeof cc === 'object' ? cc.assertion_excerpt : current.data?.answer_text?.slice(0, 150) || null,
            engine: current.data?.provider || current.data?.engine || null,
            reasons: typeof cc === 'object' ? cc.reasons || [] : ['contradicted claim observed in answer'],
          });
        }
      }
    }
  }
  for (const k of before.keys()) if (!after.has(k)) alerts.push({ severity: 'medium', type: 'observation_missing', key: k });

  // Share-of-Voice comparison across observation runs
  const citationsA = [...before.values()].filter((o) => o.kind === 'citation');
  const citationsB = [...after.values()].filter((o) => o.kind === 'citation');
  if (citationsA.length > 0 && citationsB.length > 0) {
    const sovA = calculateShareOfVoice([{ run_id: a, citations: citationsA }], competitors, firstPartyDomains);
    const sovB = calculateShareOfVoice([{ run_id: b, citations: citationsB }], competitors, firstPartyDomains);

    const prevShare = sovA.aggregate?.first_party?.citation_share ?? sovA.aggregate?.first_party?.presence_rate;
    const currShare = sovB.aggregate?.first_party?.citation_share ?? sovB.aggregate?.first_party?.presence_rate;

    if (prevShare != null && currShare != null && prevShare > currShare) {
      const drop = prevShare - currShare;
      const relativeDrop = prevShare > 0 ? (prevShare - currShare) / prevShare : 0;
      if (drop >= 0.20 || relativeDrop >= 0.20) {
        alerts.push({
          severity: 'high',
          type: 'share_of_voice_drop',
          key: 'share_of_voice:aggregate',
          previous_share: Number(prevShare.toFixed(4)),
          current_share: Number(currShare.toFixed(4)),
          drop: Number(drop.toFixed(4)),
          relative_drop: Number(relativeDrop.toFixed(4)),
          competitors: (sovB.aggregate?.competitors || []).map((c) => {
            const prevComp = sovA.aggregate?.competitors?.find((p) => p.competitor_id === c.competitor_id);
            return {
              competitor_id: c.competitor_id,
              name: c.name,
              previous_share: prevComp?.citation_share ?? null,
              current_share: c.citation_share,
              drift: prevComp?.citation_share != null ? Number((c.citation_share - prevComp.citation_share).toFixed(4)) : null,
            };
          }),
        });
      }
    }
  }
  const result = { generated_at: nowIso(), run_a: a, run_b: b, summary: { alerts: alerts.length, critical_or_high: alerts.filter((x) => ['critical', 'high'].includes(x.severity)).length }, alerts };
  const dir = path.join(root, '.citable', 'monitoring');
  writeJson(path.join(dir, `${a}--${b}.json`), result);
  writeJson(path.join(dir, 'latest.json'), result);
  return { ...result, dir };
}

export async function monitorAndAlert(root, {
  runA,
  runB,
  webhookUrl,
  minSeverity = 'medium',
  secret = process.env.CITABLE_WEBHOOK_SECRET,
  fetchImpl,
  lookup,
  allowPrivateForTest = false,
} = {}) {
  const result = monitor(root, { runA, runB });
  if (webhookUrl) {
    const qualifying = filterAlerts(result.alerts, minSeverity);
    if (qualifying.length > 0) {
      const payload = buildAlertPayload({
        runA: result.run_a,
        runB: result.run_b,
        source: 'monitor',
        summary: result.summary,
        alerts: qualifying,
      });
      const delivery = await dispatchAlertWebhook(root, payload, {
        webhookUrl,
        secret,
        fetchImpl,
        lookup,
        allowPrivateForTest,
      });
      return { ...result, delivery };
    }
    return { ...result, delivery: { skipped: true, reason: `no alerts meet min_severity: ${minSeverity}` } };
  }
  return result;
}

