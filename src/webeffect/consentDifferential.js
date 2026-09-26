import { sha256 } from "../shared/io.js";

const MARKETING_DOMAINS = [
  "google-analytics.com",
  "googletagmanager.com",
  "facebook.net",
  "facebook.com",
  "doubleclick.net",
  "tiktok.com",
  "linkedin.com",
  "hotjar.com",
  "clarity.ms",
  "criteo.com",
];

/**
 * Technical observation comparing network activity across consent states (B-073).
 *
 * Invariant: Technical observation is NEVER reported as a legal compliance determination.
 * Reports observed requests, trackers, and cookies across states without asserting legal compliance.
 */
export function observeConsentStateDifferential(stateRecord = {}, siteUrl = "https://example.test") {
  const nowIso = new Date().toISOString();

  const beforeConsent = stateRecord.before_consent || { total_requests: 0, third_party_requests: 0, active_trackers: [], cookies_set: [] };
  const afterReject = stateRecord.after_reject || { total_requests: 0, third_party_requests: 0, active_trackers: [], cookies_set: [] };
  const afterAccept = stateRecord.after_accept || { total_requests: 0, third_party_requests: 0, active_trackers: [], cookies_set: [] };
  const afterWithdrawal = stateRecord.after_withdrawal || { total_requests: 0, third_party_requests: 0, active_trackers: [], cookies_set: [] };

  const isMarketingTracker = (tracker) => {
    const t = String(tracker).toLowerCase();
    return MARKETING_DOMAINS.some((d) => t.includes(d)) || /pixel|analytics|ads|tracking|tag/i.test(t);
  };

  const technicalContradictions = [];

  // 1. Trackers active before consent
  for (const trk of beforeConsent.active_trackers || []) {
    if (isMarketingTracker(trk)) {
      technicalContradictions.push({
        state: "before_consent",
        tracker_domain: trk,
        tracker_category: "marketing",
        finding_type: "TRACKER_ACTIVE_BEFORE_CONSENT",
        observed_activity: `Non-essential marketing/analytics tracker "${trk}" initiated network requests prior to user consent interaction`,
      });
    }
  }

  // 2. Trackers active after explicit reject
  for (const trk of afterReject.active_trackers || []) {
    if (isMarketingTracker(trk)) {
      technicalContradictions.push({
        state: "after_reject",
        tracker_domain: trk,
        tracker_category: "marketing",
        finding_type: "TRACKER_ACTIVE_AFTER_REJECT",
        observed_activity: `Tracker "${trk}" continued transmitting beacons after user explicitly selected "Reject All"`,
      });
    }
  }

  // 3. Trackers or cookies active after withdrawal
  for (const trk of afterWithdrawal.active_trackers || []) {
    if (isMarketingTracker(trk)) {
      technicalContradictions.push({
        state: "after_withdrawal",
        tracker_domain: trk,
        tracker_category: "marketing",
        finding_type: "TRACKER_ACTIVE_AFTER_WITHDRAWAL",
        observed_activity: `Tracker "${trk}" remained active or continued setting cookies after user withdrew previously given consent`,
      });
    }
  }

  const seed = `${siteUrl}|${technicalContradictions.length}|${nowIso}`;
  const observationId = `cns_diff_${sha256(seed).slice(0, 16)}`;

  return {
    schema_version: 1,
    observation_id: observationId,
    site_url: siteUrl,
    epistemic_boundary: {
      is_technical_observation: true,
      is_legal_compliance_determination: false,
      boundary_notice: "Technical observation records observed network payloads, requests, and cookies across states; it does NOT constitute legal advice or a regulatory compliance determination.",
    },
    observed_states: {
      before_consent: beforeConsent,
      after_reject: afterReject,
      after_accept: afterAccept,
      after_withdrawal: afterWithdrawal,
    },
    technical_contradictions: technicalContradictions,
    observed_at: nowIso,
  };
}
