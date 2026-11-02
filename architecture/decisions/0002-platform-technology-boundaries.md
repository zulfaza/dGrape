# ADR 0002: Use Convex, Cloudflare, TanStack, and Effect

- Status: Accepted
- Date: 2026-11-02
- Scope: User-selected technology families. Specific versions and deployment topology remain open.

## Context

The product needs structured state, file storage, API compute, deterministic jobs, and a dynamic dashboard. The user explicitly selected Convex for the database, Cloudflare R2 for storage, Cloudflare infrastructure, and TanStack with Effect.

## Decision

- Convex stores structured application state, metadata, and authorization records.
- Private R2 stores artifact bodies, including HTML, PDFs, images, and approved source snapshots.
- Cloudflare hosts the application/API and integration compute.
- TanStack supplies the dashboard foundation; evaluate TanStack Charts for chart rendering.
- Effect models backend workflows and explicit service dependencies.

Adopt service and transport separation informed by the T3 Code reference. MCP and HTTP should share application behavior; database operations must independently enforce authorization and invariants. The precise adapter, package, and Worker layout is proposed implementation design, not a user-selected constraint.

## Alternatives

A separate SQL database, Convex file storage, or another hosting platform would contradict the current selections without demonstrated need. No additional analytics database is required at the initial workload.

## Consequences

Convex, Workers, and R2 cannot share a transaction. Integration boundaries need retry-safe transitions and reconciliation. Authorization must cover both gateway requests and any direct Convex subscriptions.

## Validation and revisit

Before implementation, verify the MCP transport, Effect APIs, TanStack build, and Workers runtime together. The inspected T3 reference uses Effect 4 while the existing project uses Effect 3; no major-version migration has been accepted. Pin compatible versions after the spike. Add infrastructure only when measured requirements justify it.
