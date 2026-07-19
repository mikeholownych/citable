# Evidence authority and crawler identity

An evidence checksum establishes preservation only. It does not establish that
the source was authentic, the collection was complete, or the observation was
representative. Report four axes independently on every new observation:

1. `source_authority`: provider-published, standards-body, owner-controlled,
   independently controlled, third-party commercial, synthetic, inferred, or
   unknown.
2. `collection_authority`: direct API, production log, browser capture, owner
   export, third-party export, manual entry, model-generated inference, static
   analysis, or synthetic probe.
3. `authenticity_status`: cryptographically authenticated, provider-range
   verified, owner-attested, transport-authenticated, checksum-protected only,
   or unverified.
4. `representativeness`: production population, complete export,
   statistically sampled, controlled experiment, convenience sample, single
   observation, or unknown.

Never convert these axes into one authority score.

## Crawler identity

Contract support and verified observations are different outcomes. The
`crawler-identity` schema can exist without any production event satisfying it.
A user-agent match is `declared`. A synthetic request is
`synthetically_observed`. An observed IP in an imported range is only
`range_matched`.

`fully_verified` requires all of:

- a provider and declared user agent;
- observed source IP matching the captured CIDR set;
- provider-published range source URL, retrieval time, captured source snapshot,
  and valid snapshot checksum;
- documented forward/reverse DNS verification where applicable;
- an explicit edge observation and decision;
- a correlated origin observation and status;
- region and collector identity.

A failed range or DNS check, or a claimed verification without the required
chain, is `contradictory`. Missing links are `insufficient_evidence`. Verification
applies only to the captured event; it does not establish all crawler traffic.
