import fs from 'node:fs';
import path from 'node:path';
import { loadRegistries, saveRegistry } from '../registries/index.js';
import { readJson, readYaml, sha256, nowIso } from '../shared/io.js';
import { validateAgainst } from '../shared/schemaValidator.js';

const INPUTS = ['business_importance','citation_frequency','evidence_age_days','source_authority','regulatory_exposure','intervention_impact','change_magnitude','disagreement_history'];
const SEVERITY = { critical: 25, high: 20, medium: 12, low: 6, informational: 2, experimental: 1 };

export function reviewBindingHash(item) {
  const { decisions, status, adjudication, ...bound } = item;
  return sha256(JSON.stringify(bound));
}

function priority(item, finding) {
  const missing = INPUTS.filter((key) => item.priority_inputs[key] == null);
  const p = item.priority_inputs;
  const score = (SEVERITY[finding?.classification?.severity] || 0) + (p.business_importance || 0) * 4 + Math.min(p.citation_frequency || 0, 10) + Math.min((p.evidence_age_days || 0) / 30, 10) + (5 - (p.source_authority ?? 5)) * 2 + (p.regulatory_exposure || 0) * 5 + (p.intervention_impact || 0) * 3 + (p.change_magnitude || 0) * 2 + Math.min((p.disagreement_history || 0) * 3, 12);
  return { score, tier: missing.length ? 'insufficient_inputs' : score >= 60 ? 'urgent' : score >= 35 ? 'high' : 'normal', missing };
}

export function queueReviews(root, { runId, policyId, write = false }) {
  if (!runId || !policyId) throw new Error('reviews queue requires <run-id> <policy-id>');
  const file = path.join(root,'.citable','runs',runId,'findings.json');
  if (!fs.existsSync(file)) throw new Error(`source findings not found for run ${runId}`);
  const findings = readJson(file);
  const { registries, problems } = loadRegistries(root);
  if (problems.length) throw new Error(`registry validation failed: ${problems.join('; ')}`);
  if (!registries.review_policies.entries.some((p) => p.policy_id === policyId && p.status === 'active')) throw new Error(`active review policy not found: ${policyId}`);
  const existing = new Set(registries.review_items.entries.map((i) => `${i.source_run_id}:${i.finding_id}`));
  const candidates = findings.filter((f) => !f.classification.deterministic || f.remediation.review_required).filter((f) => !existing.has(`${runId}:${f.finding_id}`));
  const created = candidates.map((finding) => {
    const item = { review_item_id:`REVIEW-${sha256(`${runId}:${finding.finding_id}`).slice(0,12).toUpperCase()}`,source_run_id:runId,finding_id:finding.finding_id,finding_hash:sha256(JSON.stringify(finding)),review_type:'general_semantic_review',status:'queued',priority_inputs:Object.fromEntries(INPUTS.map((k)=>[k,null])),priority_score:0,priority_tier:'insufficient_inputs',missing_inputs:[...INPUTS],policy_id:policyId,assigned_reviewer_ids:[],decisions:[],adjudication:null,created_at:nowIso() };
    const ranked = priority(item,finding); item.priority_score=ranked.score; item.priority_tier=ranked.tier; item.missing_inputs=ranked.missing; return item;
  });
  if (write && created.length) saveRegistry(root,'review_items',{...registries.review_items,entries:[...registries.review_items.entries,...created]});
  return { source_run_id:runId, created, written:write };
}

export function prioritizeReviews(root, { write = false } = {}) {
  const { registries, problems } = loadRegistries(root); if (problems.length) throw new Error(`registry validation failed: ${problems.join('; ')}`);
  const cache = new Map();
  const entries = registries.review_items.entries.map((item) => { const file=path.join(root,'.citable','runs',item.source_run_id,'findings.json'); if(!cache.has(file)) cache.set(file,fs.existsSync(file)?new Map(readJson(file).map(f=>[f.finding_id,f])):new Map()); const ranked=priority(item,cache.get(file).get(item.finding_id)); return {...item,priority_score:ranked.score,priority_tier:ranked.tier,missing_inputs:ranked.missing}; });
  if(write) saveRegistry(root,'review_items',{...registries.review_items,entries});
  return { items:entries.sort((a,b)=>b.priority_score-a.priority_score), written:write };
}

export function initializeSamplingPlan(root,{input,write=false}) {
  if(!input || !fs.existsSync(input)) throw new Error('reviews plan requires --input <json|yaml>');
  const plan=path.extname(input).match(/ya?ml/i)?readYaml(input):readJson(input); const {registries}=loadRegistries(root);
  const candidate={...registries.sampling_plans,entries:[...registries.sampling_plans.entries,plan]};
  const check=validateAgainst('sampling-plan.schema.json',candidate); if(!check.valid) throw new Error(`sampling plan violates contract: ${check.errors.join('; ')}`);
  if(write) saveRegistry(root,'sampling_plans',candidate);
  return { plan, written:write };
}

export function selectSample(root,{planId,write=false}) {
  const {registries,problems}=loadRegistries(root); if(problems.length) throw new Error(`registry validation failed: ${problems.join('; ')}`);
  const plan=registries.sampling_plans.entries.find(p=>p.sampling_plan_id===planId); if(!plan) throw new Error(`sampling plan not found: ${planId}`);
  const population=registries.review_items.entries.filter(i=>plan.population_statuses.includes(i.status) && (!plan.review_types.length||plan.review_types.includes(i.review_type))).sort((a,b)=>a.review_item_id.localeCompare(b.review_item_id));
  if(!population.length) throw new Error('sampling population is empty');
  if(plan.method==='simple_random' && plan.sample_size>population.length) throw new Error('sample_size exceeds population');
  const selected=plan.method==='census'?population:[...population].sort((a,b)=>sha256(`${plan.seed}:${a.review_item_id}`).localeCompare(sha256(`${plan.seed}:${b.review_item_id}`))).slice(0,plan.sample_size);
  const updated={...plan,status:'selected',population_hash:sha256(JSON.stringify(population.map(i=>[i.review_item_id,reviewBindingHash(i)]))),selected_item_ids:selected.map(i=>i.review_item_id)};
  if(write) saveRegistry(root,'sampling_plans',{...registries.sampling_plans,entries:registries.sampling_plans.entries.map(p=>p.sampling_plan_id===planId?updated:p)});
  return { plan:updated,population_size:population.length,selected_item_ids:updated.selected_item_ids,written:write };
}

export function evaluateReviews(root) {
  const {registries,problems}=loadRegistries(root); const reviewers=new Map(registries.reviewers.entries.map(r=>[r.reviewer_id,r])); const results=[];
  for(const item of registries.review_items.entries){const issues=[];const binding=reviewBindingHash(item);const source=path.join(root,'.citable','runs',item.source_run_id,'findings.json');const finding=fs.existsSync(source)?readJson(source).find(f=>f.finding_id===item.finding_id):null;if(!finding||sha256(JSON.stringify(finding))!==item.finding_hash)issues.push('source finding is unavailable or changed');for(const d of item.decisions){const r=reviewers.get(d.reviewer_id);const reviewRole=r?.roles.some(role=>['technical_reviewer','subject_matter_reviewer','independent_reviewer'].includes(role));if(!r||r.status!=='active'||!reviewRole||!item.assigned_reviewer_ids.includes(d.reviewer_id))issues.push(`${d.reviewer_id} is not an active assigned semantic reviewer`);if(d.review_item_hash!==binding)issues.push(`${d.reviewer_id} decision is stale`);}const verdicts=[...new Set(item.decisions.map(d=>d.verdict))];let state=item.decisions.length?'completed':'review_required';if(verdicts.length>1){state='adjudication_required';const a=reviewers.get(item.adjudication?.reviewer_id);if(item.adjudication&&a?.status==='active'&&a.roles.includes('independent_reviewer')&&item.adjudication.review_item_hash===binding)state='completed';else issues.push('reviewer disagreement requires a current decision from an active independent adjudicator');}results.push({review_item_id:item.review_item_id,state,verdict:state==='completed'&&!issues.length?(item.adjudication?.verdict||verdicts[0]):null,issues});}
  return {ok:problems.length===0&&results.every(r=>!r.issues.length),problems,results};
}
