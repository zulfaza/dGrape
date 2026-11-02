# ADR 0005: Execute versioned recipes with durable scheduling

- Status: Proposed
- Date: 2026-11-02
- Confirmed requirement: API aggregation and deterministic cron/scheduled jobs.

## Context

Agents can configure compute once, but scheduled executions must not reinterpret instructions through an LLM. API failures, duplicate delivery, partial writes, and scheduler crashes must be recoverable.

## Proposed decision

Agents publish validated, immutable recipe versions composed of trusted steps: connector fetch/pagination, mapping, filtering, bounded joins, aggregation, record upserts, and artifact writes. Apply budgets for rows, bytes, steps, duration, and concurrency. Do not accept uploaded JavaScript or shell execution in this runtime.

A single Cloudflare Cron dispatcher claims due occurrences transactionally in Convex and launches durable Cloudflare Workflow runs. Deterministic occurrence IDs, claim leases, and reconciliation repair the gap between database state and Workflow creation. Do not run an independent second scheduler for the same occurrences.

Schedules pin recipe versions. Proposed initial policies: UTC cron or one-off timestamps; skip overlaps; coalesce missed occurrences to the latest due run. Manual triggers use idempotency keys. Runs retain step-level retries, redacted errors, and final outcomes. Cancellation is cooperative between steps.

Connections permit explicit origins/routes/methods and sanitize results. Commit source cursors only after associated outputs are saved. Activate whole snapshot datasets only when their chunks complete. Live API inputs vary; reproducible replay requires saved input snapshots.

## Alternatives

- Scheduled LLM prompts: flexible but violate the deterministic requirement.
- Raw uploaded code: more expressive but needs a separate isolation/capability design.
- Multiple independent schedulers: increases duplicate execution and ownership ambiguity.

## Consequences

Delivery is at least once with deduplication, not exactly once. Cross-system writes require explicit pending/finalized states. New unsupported recipe operations require a trusted implementation. API and runtime budgets constrain job scope.

## Validation and revisit

Exercise crashes around claims/launches, expired leases, duplicate triggers, rate limits, pagination, cursor commits, cancellation, and partial snapshots. Validate Cron/Workflow integration in the runtime spike. Revisit local-time schedules or isolated custom code only for concrete unmet use cases.
