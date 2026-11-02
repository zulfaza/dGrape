# ADR 0003: Store runtime-defined collections in fixed Convex tables

- Status: Proposed
- Date: 2026-11-02
- Related: [0002](0002-platform-technology-boundaries.md), [0004](0004-indexed-queries-and-materialized-reports.md)

## Context

Agents must create and evolve datasets without deploying a physical Convex schema for every use case. Unvalidated JSON would allow incompatible values and broken dashboard bindings.

## Proposed decision

Use fixed physical platform tables with versioned logical collections. Validate records server-side against their referenced runtime schema. All private records and references are workspace-scoped.

| Physical table | Responsibility |
| --- | --- |
| workspaces, memberships | Ownership and access roles |
| collections | Dataset name, stable identity, active schema version |
| collectionSchemaVersions | Immutable field definitions and migration metadata |
| records | Collection/schema references, typed values, revision, timestamps |
| recordIdentities | External source key to record mapping for retry-safe upserts |
| recordIndexEntries | Typed projections for selected indexed fields |
| queryDefinitions | Versioned query specifications and result schemas |
| artifacts | Private R2 object metadata and provenance |

For example, an Applications record contains collectionId, schemaVersionId, and values such as `{ "f_company": "Example Co", "f_status": "applied" }`. A Transactions record uses another collection/schema and fields such as amount in minor units, currency, category, and date. Summary datasets use this same logical record model.

Fields have stable IDs independent of labels. Renames preserve bindings. New optional fields are compatible changes; incompatible type/requiredness changes require a migration and validation before activation. References use explicit record/artifact/secret-reference types and cannot cross unauthorized workspace boundaries. Mutable writes use optimistic revisions.

## Alternatives

- A physical table per user dataset: strong native schema/index support, but requires deployment/schema management for routine agent edits.
- Unvalidated JSON blobs: flexible ingestion but unreliable queries and migrations.
- A projection row for every value: more generic lookup at substantial storage and write cost.

## Consequences

The application owns runtime schema validation, migrations, query planning, and reference integrity. Generic collections do not imply arbitrary efficient joins or filters. External identity uniqueness must be enforced transactionally.

## Validation and revisit

Test field changes, incompatible migrations, concurrent revisions, import retries, and cross-workspace references. Measure projection overhead using the workload in ADR 0004. Revisit physical storage strategies for a measured hot dataset rather than changing the agent-facing collection API.
