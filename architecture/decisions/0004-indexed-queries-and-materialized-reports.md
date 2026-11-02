# ADR 0004: Use bounded indexed queries and prepared report summaries

- Status: Proposed
- Date: 2026-11-02
- Confirmed requirement: Hundreds of job applications and hundreds of transactions daily, with fast on-demand reports.

## Context

Growing data volume is manageable only if common reads avoid scanning the entire history. User-defined fields complicate indexes, and report aggregation can dominate the cost of a small chart.

## Proposed decision

Scope indexed reads by workspace and collection, paginate results, and explicitly budget rows/bytes examined. Maintain typed projections only for selected filter/sort fields. Use validated query specifications, not arbitrary SQL or JavaScript. Reject over-budget queries explicitly instead of silently truncating results.

Maintain daily summary collections for common reports: application counts by stage/source and transaction totals by date/category/currency. Update or rebuild affected buckets after record corrections/deletions with retry-safe processing. Use integer minor units with safe bounds or a chosen exact decimal representation for money. Do not combine currencies without an explicit conversion policy.

Read saved reports from stored records/summaries, without waiting for upstream APIs. Return freshness and completeness. Expensive unplanned reports run as background jobs with visible progress.

## Alternatives

- Scan raw history on every report: simple initially, increasingly slow and expensive.
- Add a warehouse now: more operational complexity before a demonstrated need.
- Precompute every possible query: excessive write amplification and storage.

## Consequences

Fast common reports trade additional writes/storage for bounded reads. Summaries may lag writes; distinguish stale, pending, failed, and empty data. Arbitrary historical queries do not inherit the latency targets of indexed/summarized paths.

## Validation and revisit

Illustrative sizing: 500 applications plus 500 transactions daily yields 365,000 new primary records annually, excluding indexes/events. Benchmark at least 500,000 primary records, concurrent readers/writers, and a retryable 1,000-record batch import.

Proposed, unmeasured targets: API p95 below one second for supported indexed pages/summary reports; a useful dashboard within two seconds on a documented client/network; summaries within 60 seconds of committed changes under the tested workload. Include cold/warm behavior, gateway-to-Convex latency, projection costs, summary correctness, and vendor usage. Fix concurrency and record-size assumptions before the benchmark. Revisit an analytical engine only if results demonstrate a limitation.
