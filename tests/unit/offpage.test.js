import test from 'node:test';
import assert from 'node:assert/strict';
import { auditBacklinkProfile } from '../../src/analysis/offpage.js';
import { formatBacklinksOutput } from '../../src/commands/auditBacklinks.js';

test('auditBacklinkProfile identifies toxic domains, spam TLDs, and PBN footprints', () => {
  const sampleBacklinks = [
    // Clean editorial link
    {
      source_url: 'https://techpublication.org/article-1',
      target_url: 'https://example.com/product',
      anchor_text: 'Example Corp',
      rel: 'dofollow',
      source_ip: '93.184.216.34',
    },
    // Spam TLD with commercial keyword
    {
      source_url: 'https://best-free-spins.top/index.html',
      target_url: 'https://example.com/',
      anchor_text: 'casino slots bonus',
      rel: '',
      source_ip: '198.51.100.10',
    },
    // PBN cluster member 1
    {
      source_url: 'https://affiliate-farm1.work/review',
      target_url: 'https://example.com/',
      anchor_text: 'cheap essay writing',
      rel: '',
      source_ip: '198.51.100.11',
    },
    // PBN cluster member 2
    {
      source_url: 'https://affiliate-farm2.work/review',
      target_url: 'https://example.com/',
      anchor_text: 'cheap essay writing',
      rel: '',
      source_ip: '198.51.100.12',
    },
    // PBN cluster member 3 (triggers C-class cluster)
    {
      source_url: 'https://affiliate-farm3.click/review',
      target_url: 'https://example.com/',
      anchor_text: 'payday loans',
      rel: '',
      source_ip: '198.51.100.13',
    },
  ];

  const result = auditBacklinkProfile(sampleBacklinks, { targetDomain: 'example.com' });
  assert.equal(result.fact_status, 'observable_risk_indicators');
  assert.equal(result.profile_health, 'high_risk_footprint');
  assert.equal(result.summary.total_backlinks, 5);
  assert.equal(result.summary.total_referring_domains, 5);
  assert.ok(result.summary.toxic_domains_count >= 4);
  assert.ok(result.summary.critical_risk_domains >= 2);

  // Verify disavow export contains standard GSC domain rules
  assert.match(result.disavow_export, /domain:best-free-spins\.top/);
  assert.match(result.disavow_export, /domain:affiliate-farm1\.work/);
  assert.match(result.disavow_export, /# Risk: CRITICAL/);
});

test('auditBacklinkProfile passes natural profile without toxic findings', () => {
  const cleanBacklinks = [
    {
      source_url: 'https://news.ycombinator.com/item?id=123',
      target_url: 'https://example.com/blog/launch',
      anchor_text: 'Example Platform',
      rel: 'nofollow',
      source_ip: '104.20.0.1',
    },
    {
      source_url: 'https://github.com/example/repo',
      target_url: 'https://example.com/',
      anchor_text: 'https://example.com',
      rel: 'nofollow',
      source_ip: '140.82.112.4',
    },
  ];

  const result = auditBacklinkProfile(cleanBacklinks, { targetDomain: 'example.com' });
  assert.equal(result.profile_health, 'natural');
  assert.equal(result.summary.toxic_domains_count, 0);
  assert.equal(result.anchor_profile.over_optimization_risk, 'normal');
});

test('formatBacklinksOutput formats terminal report with disavow lines', () => {
  const dummy = {
    profile_health: 'high_risk_footprint',
    summary: {
      total_backlinks: 10,
      total_referring_domains: 5,
      dofollow_count: 8,
      nofollow_count: 2,
      ugc_count: 0,
      sponsored_count: 0,
      deep_link_ratio_pct: 60,
      toxic_domains_count: 2,
      critical_risk_domains: 1,
      high_risk_domains: 1,
    },
    anchor_profile: {
      branded_pct: 20,
      commercial_exact_match_pct: 40,
      over_optimization_risk: 'elevated',
    },
    toxic_domains: [
      {
        domain: 'spamblog.top',
        risk_tier: 'critical',
        reasons: ['Spam TLD (.top)', 'Spam anchor'],
        anchors: ['casino bonus'],
      },
    ],
    disavow_export: 'domain:spamblog.top',
  };

  const text = formatBacklinksOutput(dummy);
  assert.match(text, /Off-Page Authority & Toxic Domain Audit/);
  assert.match(text, /HIGH_RISK_FOOTPRINT/);
  assert.match(text, /domain:spamblog\.top/);
});
