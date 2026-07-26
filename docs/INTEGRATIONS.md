# Integrations and evidence transports

An integration changes how evidence reaches Citable. It does not change who
controls the source, how representative the evidence is, or what the evidence
can establish.

## Current integration matrix

| Capability | Supported transport | Status | Evidence boundary |
| --- | --- | --- | --- |
| Google Search Console index inspection | Direct read-only API or import | Implemented | Authorization and one response do not prove complete indexing |
| Google Search Console metrics | Direct read-only connector | Implemented | Aggregation and top-row availability limits remain |
| Google Analytics 4 | Direct read-only connector | Implemented | Organic Search filtering, consent, attribution, and thresholding affect results |
| CrUX | Direct API or import | Implemented | Field observations cover the returned origin/URL and period only |
| Lighthouse | Repeated local execution | Implemented when optional dependency is available | Lab execution is not field performance |
| Bing Webmaster | Owner CSV/JSON export | Implemented import | No supported live AI Performance API contract is captured |
| Citation observations | Owner import or controlled HTTPS adapter | Implemented | Controlled responses do not prove provider-wide behavior |
| Crawler logs | Owner import | Implemented | Declared identity and sampled logs may not be representative |
| Canonical selections | Strict engine-observation import | Implemented | Imported selections retain collection authority and authenticity |
| External corroboration | Strict owner/third-party import | Implemented | A mention does not establish support, independence, or authority |
| Regional network probes | Strict runner export | Implemented import | Citable does not operate a managed multi-region runner |
| MCP evidence transport | None | Roadmap; not implemented | MCP discovery detection is not an MCP client or connector |

## Credential handling

- Store connection identifiers and non-secret configuration in registries.
- Supply tokens through the connector's declared environment variable.
- Use read-only scopes.
- Do not put credentials in imported evidence, run metadata, command history,
  or documentation examples.
- Treat credential presence as a prerequisite signal, not proof of validity,
  scope, property access, quota, or successful collection.

## MCP transport contract

MCP may add value as a standardized transport for provider evidence. It must
not become evidence authority.

```text
MCP server
    ↓ untrusted tool response
allowlisted transport adapter
    ↓ raw capture + provenance
schema validation and normalization
    ↓
immutable Citable observation
    ↓
governed interpretation
```

An MCP-derived observation would need to preserve at least:

- server identity and remote endpoint or package name and pinned version;
- protocol version, tool name, and advertised tool schema;
- canonical request arguments or their hash;
- raw response or a content hash plus an explicit retention reason;
- collection time, timeout, retry, and incomplete-state details;
- authorization mode and scopes without persisting credentials;
- source authority, authenticity, representativeness, and source-control
  declarations;
- adapter version, normalization version, and resulting artifact hashes;
- sensitivity, retention, and redaction decisions.

Unknown or changed tool schemas, undeclared server identity, authorization
failure, incomplete pagination, malformed output, or lost raw provenance must
fail closed. They must not silently become an empty successful observation.

## MCP security baseline

Any future implementation is gated on:

- an explicit server and tool allowlist;
- pinned local packages or verified HTTPS remote endpoints;
- read-only tools and least-privilege authorization by default;
- public-destination and redirect controls for remote connections;
- bounded time, response size, retries, and pagination;
- separation of tool output from executable instructions;
- secret filtering and no credential persistence;
- fixtures proving success, rejection, and incomplete states;
- provider-specific normalization rather than generic arbitrary-server
  passthrough.

Citable does not currently recommend MCP install commands or server packages.
A server appearing in another project's documentation is not evidence that its
identity, version, scopes, output contract, or provider authorization has been
verified for Citable.

## Adding an integration

1. Identify the provider-supported interface and its usage restrictions.
2. Define source authority, authentication, collection, and completeness
   boundaries.
3. Preserve raw input and deterministic provenance.
4. Validate against a versioned import or observation contract.
5. Add positive and negative fixtures, including partial and malformed output.
6. Document credential scopes, residual security risks, and what remains
   `not_evidenced`.
7. Add the adapter only after the contract can fail closed.

See [the roadmap](ROADMAP.md#mcp-evidence-transport) for planned MCP stages.
