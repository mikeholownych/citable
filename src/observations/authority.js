const DEFAULTS = {
  live_api: ['provider_published', 'direct_api', 'transport_authenticated', 'unknown'],
  browser: ['synthetic', 'browser_capture', 'checksum_protected_only', 'single_observation'],
  owner_import: ['owner_controlled', 'owner_export', 'checksum_protected_only', 'unknown'],
  synthetic_fetch: ['synthetic', 'synthetic_probe', 'checksum_protected_only', 'single_observation'],
  static_analysis: ['inferred', 'static_analysis', 'checksum_protected_only', 'single_observation'],
  human_review: ['owner_controlled', 'manual_entry', 'owner_attested', 'single_observation'],
};

export function evidenceAuthority(method, overrides = {}) {
  const [source_authority, collection_authority, authenticity_status, representativeness] = DEFAULTS[method] || DEFAULTS.static_analysis;
  return { source_authority, collection_authority, authenticity_status, representativeness, ...overrides };
}
