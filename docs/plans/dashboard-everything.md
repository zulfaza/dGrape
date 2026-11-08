# dGrape: an agent-built data workspace

Status: proposal for user review. Implementation is underway; proposed decisions remain subject to review.
Date: 2026-11-02.

Durable architecture decisions now live in [architecture/decisions](../../architecture/decisions/README.md), outside `docs/`. Their Accepted/Proposed statuses take precedence over this temporary planning document. Removing this plan must not remove the ADRs.

Frontend additions: shadcn/ui, tsrs, and the friendly sloth direction are recorded in ADRs 0010–0012. The durable [design brief and inspiration shortlist](../../architecture/design/README.md) is awaiting user curation. Do not retain the old square monochrome theme as a requirement.

## Intent

Replace the job-specific product direction with a general workspace for data, compute, schedules, artifacts, and dashboards. People describe what they want to their existing agent harness. Agents configure and operate this workspace through MCP. The browser makes the resulting data, jobs, and views visible and manageable.

Job applications become the first example workspace, not platform-specific tables or hardcoded workflows. Other examples include GitHub activity, API usage, personal finance imports, and combined operational reports. These are capability examples, not committed connector scope.

Deliver a focused data workspace first, not a full Notion editor, arbitrary code-hosting platform, or autonomous agent runner. Documents, tables, charts, and custom HTML reports are all dashboard blocks. Harnesses continue model execution and interactive browser work. Scheduled jobs execute deterministic recipes without a model call.

## User experience

An agent can create collections, evolve their fields, write records, connect configured APIs, define a recipe, schedule it, store artifacts, and publish a page. Every definition is inspectable, versioned, exportable, and addressable by a stable ID.

Example request: 'Every morning fetch my authored GitHub PRs, combine them with my application tracker, and show recent work and applications needing follow-up.' The agent discovers capabilities, defines datasets, configures an approved connector, previews a bounded recipe run, publishes its version, creates a schedule, and saves a dashboard. Subsequent scheduled executions use that frozen recipe; they do not ask an LLM to reinterpret the original request.

The UI has a workspace sidebar with Pages, Data, Jobs, Connections, and Artifacts. A page combines prose, live data blocks, and saved HTML reports. Data views expose schemas and records. Job detail shows schedule, run history, errors, and freshness. Connections show credential availability and granted operations, never secret values.

## System architecture

1. TanStack Start/Router serves the authenticated UI from Cloudflare Workers. TanStack Query coordinates HTTP state; authenticated Convex subscriptions supply bounded live metadata and record views. Use TanStack Table for grids and TanStack Charts behind an app-owned chart adapter.
2. An API Worker exposes /mcp, versioned HTTP commands/query endpoints, upload/download endpoints, and narrowly authenticated runner callbacks. Both MCP and HTTP use the same Effect application services and contracts.
3. Convex owns workspace permissions, collection metadata, records, query definitions, recipes, schedules, runs, page revisions, artifacts metadata, and operation history. Convex transactions enforce ownership, revision checks, and deduplication even if called outside the Worker service layer.
4. R2 owns file bodies: raw responses, input documents, images, generated HTML/PDF, immutable report datasets, and large output batches. Store private object keys, checksums, and metadata in Convex.
5. A Cloudflare Cron Trigger wakes a dispatcher once per minute. The dispatcher claims bounded due occurrences transactionally in Convex and starts Cloudflare Workflow instances with deterministic occurrence IDs. A pending-run reconciler repairs the gap between a DB claim and Workflow creation. No second scheduler independently triggers these jobs.
6. A separate runner Worker/Workflow executes validated, published deterministic recipes through trusted connector and transformation implementations. It receives only the workspace capability needed by that run, with server-side credential resolution. It cannot acquire arbitrary database or platform administrator credentials.

Data flow: harness or UI -> authenticated transport -> Effect services -> Convex/R2 adapters. Scheduled flow: clock tick -> due occurrence claim -> durable run -> connector fetch -> mapping/aggregation -> dataset upsert/artifact -> run completion -> dashboard refresh.

Deploy gateway/UI and runner as separate Worker entry points for credentials and failure isolation. Packages: contracts, domain, adapters, recipe-runtime, dashboard-renderer. Apps: web, gateway, runner. Keep boundaries logical first; exact monorepo tooling is an implementation choice.

## Flexible database model

### Confirmed workload and proposed performance targets

The user clarified the primary requirement: hundreds of job application records per day plus hundreds of transaction records per day, with fast on-demand reports. This is the initial sizing baseline, rather than arbitrary warehouse-scale analytics. Keep Convex as the primary structured database; an additional analytical database is not a v1 requirement.

Use an illustrative capacity test of 500 new applications and 500 new transactions per day: 1,000 new primary records daily, or 365,000 annually. This excludes updates, events, index projection rows, API calls, and artifacts; measure those separately. Imported batches can arrive in bursts even when average daily volume is modest. Benchmark at least 500,000 primary records with realistic field sizes, uneven collection sizes, schema versions, index projections, and concurrent reads/writes. Include a replayable 1,000-record batch import with bounded chunks; validate partial progress and retry safety instead of treating the whole import as one transaction.

Proposed acceptance targets, not measured guarantees: p95 authenticated API response under one second for an indexed record page or saved summary report, excluding third-party API calls and file downloads; a useful dashboard report visible within two seconds on the agreed reference client/network. Measure end-to-end authenticated API latency, including Worker startup and Convex round trips, rather than only function execution. Report cold/warm behavior separately. Set the concrete concurrent-client test during Phase 0 and publish its parameters with results.

Initial reporting contracts include date ranges, application stage/source counts, and transaction totals by date/category/currency. Maintain incremental daily buckets and counts in retry-safe writes or bounded materialization jobs. Do not sum different currencies without an explicit conversion policy and rate timestamp. Use exact money representations (integer minor units with currency metadata, or an explicitly chosen decimal representation), not ordinary floating-point accumulation. Corrected/deleted records and schema changes must adjust or rebuild affected summaries without double counting. Validate against source records in tests.

The query planner serves indexed pages and bounded summary ranges. It does not rescan all historical raw records for each dashboard load. Return dataAsOf/lastSuccessfulSyncAt and pending aggregation state. Recommended v1 freshness target: committed record changes appear in relevant summaries within 60 seconds under the tested workload; a source API that has not synced remains visibly stale. Refreshing a report must not require a fresh upstream API request. Unplanned heavy ad hoc reports run as visible background jobs and save their results; distinguish those from the fast supported report paths.

Acceptance evidence must include ingestion throughput, p50/p95 latency, summary correctness/freshness, read/write amplification from projections and summaries, storage, and measured usage costs. Daily volume alone cannot establish latency or fit within any vendor free tier. Add another storage/query engine only if these tests demonstrate a concrete limitation.

Use fixed Convex platform tables containing runtime-defined logical collections. Creating a user's collection or field must not require a Convex schema deployment. A record envelope contains workspaceId, collectionId, schemaVersion, values keyed by stable field ID, revision, and timestamps. Values are validated by the collection's published runtime schema, not accepted blindly as arbitrary JSON.

Initial field types: text, number, boolean, timestamp, date-only, select, multi-select, structured object, record reference, artifact reference. Nested object values have explicit depth and size limits. References include collection and record identity; validate workspace and target on write. Relationships are explicit fields and are not unlimited recursive joins. Record-reference deletion defaults to restriction while referenced; offer tombstones rather than silently breaking pages.

Schemas are immutable versions. Renaming changes a label, not a field ID. Adding an optional field is compatible. Incompatible type/requiredness changes require a migration plan, dry run, and explicit activation after validation/backfill. During migration, current reads normalize supported historical versions; block activation if incompatible records remain. Preserve previous versions and report rollback limitations if transformed values lose information. Enforce optimistic revisions on definitions and record edits.

Do not promise arbitrary indexed queries over JSON. Fixed indexes cover workspace, collection, createdAt, updatedAt, and identity. User-enabled filter/sort fields use typed projection entries in recordIndexEntries, maintained transactionally with records. Initial query planner uses one selective indexed predicate then bounded residual filters. Reference resolution and aggregate work have budgets. Defer generalized multi-column indexes and unrestricted ad hoc joins. Return QueryTooExpensive with a materialization suggestion instead of silently truncating.

External upserts use a separate recordIdentities mapping from a workspace/collection/key-namespace/external-key to a record ID. Convex mutation lookup-and-insert ensures retry-safe identity assignment. Missing source records are not treated as deleted unless a complete authoritative snapshot sync succeeds.

## Logical collections in Convex

All workspace-owned rows carry workspaceId. Names below are proposed, not generated code. All mutable definitions carry revision and timestamps; version tables are append-only.

| Table | Principal fields / invariant |
| --- | --- |
| workspaces, memberships | Name; authenticated subject, role owner/editor/viewer; every lookup checks membership |
| collections | Slug, label, activeSchemaVersionId, archivedAt; unique slug per workspace enforced transactionally |
| collectionSchemaVersions | Collection, version, field definitions with stable IDs, migration metadata, state |
| records | Collection, schemaVersionId, typed values, revision, createdAt, updatedAt, deletedAt |
| recordIdentities | Collection, key namespace, externalKey, recordId; transactionally unique within owner scope |
| recordIndexEntries | Collection, fieldId, type, comparable typed value, recordId; fixed compound indexes support planner |
| connections | Connector kind/version, allowed origin and operations, secretRef, health, non-secret config |
| recipes, recipeVersions | Name, active version; immutable validated steps, input/output schema, budgets, connector version pins |
| schedules | Recipe version, enabled, UTC cron or runAt, nextRunAt, overlap and catch-up policy |
| runs | Recipe version, scheduled/manual input, occurrenceKey, status, lease/heartbeat, workflow ID, started/finished times |
| runSteps | Run, stable step ID, attempt metadata, status, redacted error, output artifact/result reference |
| syncStates | Connection/recipe/collection scope, committed cursor or watermark, last successful run |
| queryDefinitions | Versioned validated query AST, result schema, source collections, freshness metadata |
| pages, pageVersions | Slug, title, active version; immutable ordered blocks, layout, query/artifact references |
| artifacts | Private object key, hash, MIME, byte size, state, provenance, retention, createdBy/runId |
| operations, auditEvents | Caller idempotency key/result; actor and operation history with redacted metadata |

Index paths always begin with workspace scope where applicable. Prevent cross-workspace references, including through page blocks, query IDs, record relations, and artifacts. IDs supplied by callers never prove authorization. Avoid storing raw API response bodies or unbounded logs in Convex records.

## Query and aggregation contracts

Queries are a versioned JSON AST: source collection, field selection, typed filters, sort, cursor, bounded limit, and optional group/aggregate. Operators begin with equality/range/in, count/sum/min/max/average, and bounded date bucketing. No caller-supplied SQL or JavaScript expressions. Validate field/type references at publication and execution.

Live widgets use bounded queries. Expensive aggregation is a scheduled/manual recipe that writes a materialized output collection. Joins initially use equality over declared keys with explicit input limits; larger jobs require precomputed datasets. Pagination cursors bind workspace, query version, and sort definition. Clearly distinguish complete, paginated, and budget-exceeded results.

Return result schema, evaluatedAt, source lastSuccessfulSyncAt, queryVersion, and completeness metadata. An empty result is not the same as an error or never-synced source. Never imply multiple API fetches form a globally atomic snapshot. Pages show per-source timestamps when inputs have different freshness.

## Deterministic compute

Initial runtime is an interpreted recipe specification with fixed trusted step types: fetch connector, paginate, map/validate fields, filter, lookup/join within limits, aggregate, upsert records, write artifact, and invoke a named saved query. Recipes form a validated DAG with no cycles, bounded pagination, row counts, bytes, time, and concurrency. Values can reference previous step outputs through a small typed expression AST. No eval, shell, uploaded JS, or runtime dependency installation.

Agents author these definitions through MCP. New unsupported behavior requires a reviewed deployed connector/step implementation. A future code-execution extension would use a separate isolation product and capability contract; it is not hidden inside v1's recipe runner.

Start with one GitHub read-only connector plus a configured generic JSON HTTP connector with fixed allowed origin, route/method policy, request schema, auth strategy, pagination rules, and response schema. Generic HTTP config cannot turn the Worker into an open proxy. Redirect destinations must remain permitted; private/loopback/link-local/metadata destinations are disallowed. A trusted connector implementation owns network resolution/policy enforcement. Phase-one external calls are reads; add external write actions only through a separate capability and idempotency design.

Use separate durable steps for external I/O, transformation checkpoints, and commits. External reads are not mathematically deterministic: exact reproducibility means replaying saved input snapshots with a frozen recipe/version, not expecting a live API to return the same data tomorrow. Save raw inputs when configured, record fetch times, and retain only bounded metadata otherwise.

Cursor advancement commits only after corresponding records/artifacts are finalized. Upsert partial progress is allowed but visible. For snapshot datasets, write a new dataset revision and atomically activate its pointer after all chunks complete, so reports do not consume half a snapshot.

## Scheduling and reliability

V1 accepts five-field UTC cron and one-off UTC timestamps; UI displays the next execution in the user's timezone and explicitly labels the schedule's UTC basis. Local-time/DST calendar scheduling can follow as a separate feature.

Default overlap policy: skip while the same recipe's prior run is active. Default missed-run policy: coalesce to one latest due occurrence, not replay an unbounded backlog. Occurrence identity combines scheduleId, scheduleRevision, and scheduledAt. Manual starts use caller-scoped idempotency keys. Bounded claim leases and deterministic Workflow IDs allow safe reconciliation after dispatcher failure.

Runs transition queued -> running -> succeeded/failed/cancelled; cancellation is cooperative between durable steps. Record intermediate retrying state at the step level. Retry transient 429/timeouts/5xx with bounded backoff and Retry-After handling. Stop on invalid schemas or credentials and expose actionable redacted errors. Pin the recipe version for each schedule and run; editing a recipe does not silently change active schedules. Disabling/deleting a schedule prevents new runs; existing runs require separate cancellation.

Cloudflare/Convex/R2 cannot share a transaction. Make cross-system stages explicit and idempotent. Delivery is at least once, with deduplication, not an exactly-once promise. Periodically reconcile queued runs, stale leases, and pending uploads. Display failures and last successful refresh on pages; never hide stale data behind a successful empty chart.

## Dynamic dashboards

Two complementary output types:

1. Live structured pages: validated declarative blocks for markdown, table, metric, line/bar/area/pie/scatter charts, artifact, and custom report. Blocks bind saved query IDs, parameters, expected result schema, presentation settings, and refresh policy. Agent changes go draft -> preview -> publish to an immutable page version. Users can keep the last published version or roll back. Do not let markdown inject arbitrary active HTML into the authenticated app.
2. Custom HTML reports: agent-generated HTML/CSS/JS stored as an immutable artifact, rendered in a sandboxed iframe on a separate untrusted origin. This preserves the T3-style freedom to generate a bespoke report or visualization. Snapshot data is bundled at generation time by default. It does not inherit the application's cookies, bearer tokens, or raw database access.

For live custom HTML, later add a narrow postMessage data bridge: only published query bindings, validated result schemas, per-page allowlists, a session-bound MessageChannel, rate and row limits, and parent-enforced authorization. Never send credentials to the iframe. Initial v1 can ship snapshot HTML plus live structured blocks; generic live arbitrary HTML is a later milestone.

HTML artifact responses need CSP, no ambient authentication, no navigation/popups/forms by default, and sandboxing without allow-same-origin. Inline code can run inside the sandbox, but network access is denied by default. Bundle assets or resolve approved artifact references. Do not treat visual appearance or successful preview as code authorization.

TanStack Charts is the renderer, not the persistent dashboard protocol. Store an app-owned serializable ChartSpec with semantic types, field bindings, labels, formats, and series. Translate to the chart library. This decouples saved pages from library function APIs and version changes. Always offer a table view and accessible labels. Validate chart bindings against query results.

## Authentication, secrets, and limits

Retain/reassess the existing login integration during implementation. Dashboard sessions and revocable scoped MCP tokens map to workspace membership and capabilities. Read-only tokens cannot create recipes/schedules or edit pages. Commands receive authenticated request context, never a caller-asserted owner ID. Convex reads enforce the same permissions.

First milestone is a single-owner deployment with a workspace-aware data model. Connection secretRefs resolve to manually configured Cloudflare secret bindings; raw credential entry and OAuth lifecycle UI are deferred. Do not store tokens in collection values, recipe specs, HTML, MCP responses, logs, or browser state. Multi-tenant credential storage requires a dedicated encrypted credential vault/secret service before enabling arbitrary accounts.

Budget records per collection, indexed fields, query rows/bytes, per-job steps/duration, per-connection request rate, artifact size, and total retention. Choose initial configurable caps from measured platform limits during the foundation spike. Enforce limits before allocating work, report usage, and avoid claiming this replaces a warehouse for arbitrary-scale analytics. Support JSON/CSV and definition exports to keep data portable.

## Effect design and T3 reference

Application services: WorkspaceService, CollectionService, RecordService, QueryService, ConnectionService, RecipeService, ScheduleService, RunService, ArtifactService, PageService. Adapter services: ConvexRepository, ObjectStore, ConnectorRegistry, SecretResolver, WorkflowLauncher, Clock, IdGenerator. Split further only when concrete dependencies justify it.

Schemas define stable IDs, typed values, command/result shapes, tagged errors, and protocol versions. Boundary validation parses unknown input once; persisted metadata remains untrusted at adapter boundaries. Happy-path orchestration reads as Effect.gen, errors are translated by each layer, and request-scoped authorization is supplied per call. No environment reads or global clients in domain logic.

Adopt T3's separation between tool schema, handler, service, and transport, plus explicit Layers and request identity. T3 reference was updated to commit 30654b3e91 on 2026-11-02 and uses Effect 4; this app currently uses Effect 3.21.4. Run a small compatibility spike for Effect MCP transport + Cloudflare Workers before selecting the major version. Do not copy incompatible APIs. Avoid building a custom MCP protocol implementation if a supported transport can be adapted.

Typed failures include PermissionDenied, RevisionConflict, InvalidSchema, InvalidQuery, QueryTooExpensive, ConnectorUnavailable, CredentialMissing, RateLimited, UploadIncomplete, and RunConflict. Domain methods expose domain errors; adapters translate vendor details and redact secrets. Scoped resources and cancellation remain explicit.

## MCP and API surface

Discovery: workspace.describe, capabilities.list, collections.describe. Data: collections.create/evolve, records.upsert/query, queries.save/run. Integration: connections.list/describe, recipes.validate/preview/publish, runs.start/get/cancel, schedules.create/update/pause. Artifacts: artifacts.begin_upload/finalize/get_download. Pages: pages.save_draft/preview/publish/get. Operations and run history are inspectable.

Tool results return stable IDs, definition versions, concise summaries, pagination, and actionable errors. Writes use idempotency keys and expectedRevision where relevant. Contract tests prove the HTTP and MCP adapters invoke equivalent application behavior. No application-specific tools such as cv.save_version in the platform core; those become workspace templates/collections and agent instructions.

## Delivery plan and acceptance

Phase 0: confirm this product scope; validate Workers/Effect/MCP/Charts integration, Convex runtime schemas/index projections, and the proposed durable scheduling handoff. Deliver a short decision log and pinned dependencies. Do not start app implementation before user agreement.

Phase 1: workspace auth, schema versions, generic records, indexed bounded queries, artifacts, minimal MCP and table page. Acceptance: an agent creates a jobs collection and changes its schema without deployment; cross-workspace access fails; retries do not duplicate records; exports preserve IDs/provenance.

Phase 1 authentication includes the auth.md registration work specified below, not only manual API tokens. Complete its end-to-end tests before calling agent onboarding ready.

Phase 2: connector/recipe runtime, manual durable runs, run history, then schedules and reconciliation. Acceptance: GitHub API data is paginated, mapped, upserted, and displayed; interrupted runs recover without duplicate identities or cursor loss; overlap/catch-up policy is visible; credentials are absent from logs and outputs.

Phase 3: structured page renderer with charts, query bindings, page revisions, snapshot HTML sandbox, and artifact browser. Acceptance: an agent publishes a useful page without frontend code changes; invalid field bindings fail clearly; stale/error states are distinct; custom HTML cannot read application credentials or reach arbitrary endpoints.

Phase 4: a job-search workspace template and dry-run importer for the Mac folder, preserving original files/provenance. A second small GitHub activity example proves the core is domain-independent. Import only after reviewing the mapping and exception report. Do not import caches, dependencies, credentials, or hidden runtime files by default.

Later: live HTML bridge, reusable connector SDK, richer schema migrations, local-time scheduling, public read-only sharing, richer code execution isolation, and collaborative document editing. These are extensions, not v1 prerequisites.

Tests should focus on schema evolution, query budgets, reference/ownership enforcement, replay/idempotency, cross-system crash windows, scheduler duplicates/overlap, connector pagination/rate limits, and HTML isolation. Use fake clocks/adapters; separately run integration checks against local Convex/Workers and a controlled API fixture. Test the user journey through MCP, not just isolated helper functions.

## Instructions for the implementation agent

This file is a proposal, not authorization. Start only after the user explicitly agrees; preserve any later corrections. Read repository AGENTS.md and applicable skills. Inspect current code and git state before edits; preserve unrelated changes. Treat existing job-specific code as migration input, not a requirement to retain the old architecture. No production deployment, destructive database reset, personal-data import, or external write action is implied by agreeing to build the platform.

Begin with Phase 0 and write the compatibility decisions. Then define shared contracts before splitting backend/MCP and dashboard work. The user asked for subagents and permits another configured Codex account for load balancing. Discover providers before cross-account delegation; do not assume a model/account is available. Give agents explicit file ownership and agreed contracts. Parent owns integration and acceptance checks. Preserve this plan and update its decision log as implementation choices become concrete.

Key scope assumptions to confirm with the user: single-owner v1, runtime-defined collections rather than per-dataset Convex tables, declarative compute rather than arbitrary uploaded code, UTC schedules initially, live blocks plus snapshot custom HTML initially. Do not quietly reduce arbitrary visualization support to charts only.

## Sources and verification notes

Primary documentation checked 2026-11-02. Re-check package APIs and runtime limits when implementing.

- TanStack Charts: https://tanstack.com/charts/latest and https://tanstack.com/charts/catalog . Current docs describe a stable Charts 1.0 API and SVG/Canvas chart grammar. Exact React API should be verified in the compatibility spike.
- Convex dynamic record types: https://docs.convex.dev/database/types . Runtime collections above are an application design, not native runtime-created Convex tables.
- Convex indexes: https://docs.convex.dev/database/reading-data/indexes . Fixed physical indexes motivate typed projection rows and bounded planning.
- Convex limits: https://docs.convex.dev/production/state/limits . Large blobs and outputs belong in R2; limits must inform configurable budgets.
- Cloudflare Cron: https://developers.cloudflare.com/workers/configuration/cron-triggers/ . One platform tick dispatches application schedules.
- Workers limits: https://developers.cloudflare.com/workers/platform/limits/ . Compute must fit actual runtime/account budgets; do not infer unlimited execution.
- Local reference: /home/zul/Code/Resources/t3code, current Effect/MCP separation examined during planning.

## Decision log

- User-selected infrastructure: Convex database, Cloudflare R2 storage, Cloudflare compute/hosting, TanStack dashboard, Effect service architecture.
- User changed direction from a job-only tracker to an agent-first general data workspace.
- This proposal recommends constrained versioned primitives and sandboxed custom visualizations to balance flexibility with operability.
- Pending user agreement: all implementation phases and proposed v1 scope assumptions above.
- Removed the proposed connections.manage scope. No agent route configures connections: a person adds connections and secrets in the dashboard, so secret values never pass through MCP. connections.use stays the separate permission to execute a connection.

## Follow-up: concrete storage and user-provided secrets

User asked how Convex data would look and suggested WorkOS AuthKit plus Vault. This section is a proposal, not an accepted vendor decision. It extends the initial manually configured secrets milestone if user-managed credentials enter scope.

Logical datasets share physical tables: collections, collectionSchemaVersions, records. Example: an applications collection has a published schema defining stable field IDs f_company (text) and f_status (select). Each records document references the collection and schema version and stores values { f_company: 'Example Co', f_status: 'interviewing' }. Runtime schema validation happens server-side inside trusted write logic; arbitrary client values cannot bypass it. Index projections copy only approved non-secret typed fields.

Add secretRefs (workspaceId, optional ownerUserId, label, provider, providerObjectId, revision, state, timestamps). Connections reference a secretRefs ID and an approved usage policy. A field of type secretRef stores a reference to this table, never plaintext or ciphertext mixed with ordinary values. Generic record queries/export omit secret values; they may show a safe label and configured state. Secret references cannot be filtered, sorted, grouped, or included in index projections. A general user ID or reference ID does not confer permission to use a secret.

Recommended WorkOS integration, subject to pricing: AuthKit establishes identity; one WorkOS organization maps to the workspace and is looked up server-side; Vault hosted KV stores API/OAuth credentials with organization context. An application SecretService owns create/replace/delete/use and hides provider specifics. The gateway and runner check membership plus connection-use grants and approved network destinations before resolving secrets. Vault key context is cryptographic separation, not a substitute for application authorization. Per-user private secrets require separate grants even within the same organization. The platform WorkOS API key stays in a Cloudflare Worker secret binding.

Secret input uses a dedicated authenticated HTTPS settings endpoint/form. Disable body logging, analytics/session replay capture, error-body capture, and state persistence on that path. Do not submit secret values through ordinary MCP tool arguments where model context/transcripts may retain them. Agents request a setup action or secret reference, not the plaintext credential. Trusted runner code fetches the value just in time and injects it only into approved connector requests. Plaintext must not be persisted in Workflow step outputs/checkpoints, retry arguments, run inputs, raw response snapshots, artifacts, or logs. Keep secret retrieval and authenticated HTTP request inside the same trusted execution step and return only sanitized output. Do not cache secret plaintext durably.

Generic HTTP response handling also needs output policies: third-party endpoints may echo authorization or return fresh access tokens. Allowlist response fields, redact headers/errors, and route refresh/access tokens back through SecretService rather than storing entire responses blindly. Credentials cannot be interpolated into arbitrary recipe outputs or URLs. Narrow origin/route/method capabilities prevent an agent from using a permitted secret to send data to an attacker-controlled endpoint.

Use explicit pending/ready/deleting metadata states and retry-safe operation IDs for cross-system Vault/Convex changes. Reconcile orphan Vault objects and failed replacements/deletions. Rotation uses the current credential for future requests without pinning plaintext into a recipe revision. Stop use when deleted/revoked; record redacted use/rotation events. Deleting a stored token does not revoke it at the third-party provider unless that separate revocation succeeds.

Accidentally pasted secrets remain a distinct problem. Sensitive schema fields route through SecretService, common credential-pattern detection rejects likely tokens before storage with value-free errors, and all import/export/preview paths apply classification. Detection is best effort: it cannot recognize arbitrary secrets in prose, binaries, screenshots, or API payloads. The UI must not claim every stored blob is automatically sanitized. If a secret was persisted or sent to a model, removal/redaction plus provider rotation may be necessary. Encrypted-at-rest general storage is not equivalent to removing credentials from ordinary app access.

WorkOS pricing verified 2026-11-02: public pricing explicitly lists AuthKit free up to one million monthly active users and all products free to try in staging. It does not publish a Vault production rate or explicit Vault production free-tier entitlement on the checked pricing page. Do not assume AuthKit's free allowance includes production Vault, and do not use staging as a production workaround. Confirm production Vault availability, request/storage limits, and price with WorkOS before adopting it. Sources: https://workos.com/pricing , https://workos.com/docs/vault , https://workos.com/docs/vault/quick-start .

Vault also supports local envelope encryption where ciphertext is stored in our infrastructure and WorkOS manages wrapped data keys. Hosted Vault storage is simpler for credentials; local encryption may suit larger sensitive data and is not a pricing workaround. Provider choice remains behind SecretService. Source: https://workos.com/blog/how-vault-local-encryption-works .

## Follow-up: auth.md agent registration

Status (2026-11-08): the user-claimed service_auth flow is implemented and verified. See [ADR 0009](../../architecture/decisions/0009-user-claimed-agent-authorization.md) for the shipped choices and `convex/agentAuth.test.ts` for the acceptance checks. Agent-verified registration (see the end of this section) is not implemented. The text below is the original design.

### Proposed initial flow

Implement the user-claimed service_auth entrypoint first. An agent provides an email hint, receives a confirmation URL and code, and presents them to the user. The user signs in with WorkOS AuthKit, selects a workspace, reviews requested capabilities, and enters the code on our claim page. Only after confirmation does the agent receive an access token and service-signed identity assertion. Reject other registration types initially; no anonymous workspace access. This does not require an agent provider to issue identity attestations. These are proposed v1 choices, not additional user-confirmed decisions.

### Discovery and protocol contract

Serve /auth.md as concise public registration instructions and publish /.well-known/oauth-protected-resource plus /.well-known/oauth-authorization-server. Structured discovery is authoritative. Derive all documents from one canonical origin/issuer and capability configuration to avoid drift; never trust arbitrary forwarded host headers. Publish only supported registration types, grants, scopes, and real endpoints. Include discovery hints on unauthorized API/MCP responses.

Implement POST /agent/identity for service_auth, a service-owned authenticated claim page and confirmation action, POST /oauth2/token for claim polling and JWT-bearer assertion exchange, and POST /oauth2/revoke. Re-check the exact protocol revision before implementation, especially how retrying an expired service_auth ceremony differs from the anonymous-only claim-initiation endpoint. Do not invent endpoint semantics from naming alone.

The auth.md document must include discovery, supported registration requests/responses, claim instructions, token exchange/use/expiry, errors, revocation, integration contact, and real policy links. Keep it focused on authentication rather than workspace tutorials. Claims are confirmed on our site, not by sending the code back to the agent. The profile uses an assertion exchange instead of an OAuth refresh token.

### Authorization design

Proposed scopes: data.read, data.write, artifacts.read, artifacts.write, pages.read, pages.write, jobs.read, jobs.run, jobs.manage, connections.use. Read-only onboarding is the default. Requested scopes are intersected with user-approved scopes and current workspace permissions. Model permission to execute a connection separately from permission to configure it. No scope reveals third-party credentials. A code confirmation cannot grant access to another workspace or bypass revoked membership.

WorkOS AuthKit establishes the human session; the application owns agent registrations and workspace grants. auth.md is an open protocol, not evidence that AuthKit automatically hosts these endpoints. Evaluate a compatible managed authorization-server option during Phase 0, including production entitlement; otherwise scope the application's standards-based authorization-server responsibilities explicitly. Keep that choice separate from WorkOS Vault pricing.

### Convex state and secret handling

Add agentRegistrations (entrypoint, email binding, status, requested/granted scopes, user/workspace binding, expiration, revision), agentClaimAttempts (registration, token/code digests, expiry, attempt count, polling timestamps), and agentCredentials (registration, token digest, scopes, audience, expiry, revocation). Reuse auditEvents for redacted changes. Suggested states: pending -> claimed / denied / expired; claimed -> revoked. State transitions and consent binding must be transactional.

High-entropy claim tokens and bearer access tokens are returned over TLS and persisted only as hashes. Because a six-digit code has low entropy, use a keyed digest for code storage, strict attempt limits, and short expiration. Store signing/private digest keys in server-managed secret storage, with rotation IDs. Do not persist plaintext assertions or credentials in ordinary records or job history. Unlike third-party connector secrets, an issued agent token necessarily reaches the harness: document that distinction and require secure harness credential storage rather than report or conversation output.

Proposed defaults to validate: ten-minute claim window, five-second minimum poll interval, one-hour access tokens, and bounded assertion lifetime. Validate assertion issuer, audience, signature, algorithm, expiry, and registration state on exchange. Reusable assertions follow the published protocol until expiry; do not accidentally apply single-use replay rules intended for provider assertions. Prefer opaque access tokens backed by credential state for immediate revocation; verify that the chosen gateway/Convex auth integration can enforce them without trusting a caller-provided user ID.

Keep public claim URLs and responses out of request-body/query-string logs and third-party analytics. Use no-store responses, referrer protection, CSRF protection for the authenticated confirmation, email-account matching on both display and submit, and bounded polling/creation limits. Changing the email or workspace starts a fresh approval rather than silently rebinding an existing registration. Show requested scopes clearly and allow rejection.

Credential revocation invalidates that access token. Workspace settings must also expose registration-wide revocation that blocks future assertion exchanges and derived tokens. Removing membership takes effect on subsequent authorized operations. Neither action is equivalent to revoking an external API key in Vault.

### Acceptance and later provider support

Acceptance: a generic HTTP client can discover the flow, register, wait pending, complete AuthKit confirmation, obtain a scoped token, call MCP/API, and revoke it. Cover wrong-account confirmation, expired/incorrect codes, excessive attempts, fast polling, concurrent confirmation, permission downgrade, audience mismatch, tampered assertions, cross-workspace IDs, disabled registration, and secret-free logs. Include discovery/auth.md consistency checks. Use standard OAuth libraries and controlled clocks rather than handwritten cryptography.

Later agent-verified registration needs a pinned issuer trust registry, ID-JAG validation, replay protection, first-link confirmation for existing users, and authenticated provider Security Event Token handling for registration revocation. Do not accept arbitrary issuer URLs or silently merge accounts by an asserted email. Advertise these capabilities only when implemented and verified; provider availability is not assumed from the current harness.

Sources verified 2026-11-02: https://workos.com/auth-md , https://workos.com/auth-md/docs/apps , https://workos.com/auth-md/docs/auth-md , https://workos.com/auth-md/docs/flows/claimed . The implementation agent must re-check the protocol because it is evolving.
