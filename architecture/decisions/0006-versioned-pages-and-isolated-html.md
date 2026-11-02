# ADR 0006: Combine live page blocks with isolated custom HTML reports

- Status: Proposed
- Date: 2026-11-02
- Confirmed requirement: Agent-created dynamic dashboards and arbitrary HTML visualizations.

## Context

Reusable tables/charts support live dashboards, but the user also wants bespoke reports like T3's inline HTML. Executing arbitrary generated HTML inside the authenticated application's origin would expose its privileges.

## Proposed decision

Store immutable page versions containing declarative markdown, table, metric, chart, and artifact blocks. Bind live blocks to authorized saved queries and validate field/result schemas. Agents draft, preview, and publish pages; rollbacks restore earlier definitions.

Store an application-owned serializable chart specification and translate it through a TanStack Charts adapter. Do not persist library functions as the dashboard protocol. Offer accessible labels and table alternatives.

Store custom HTML reports as private R2 artifacts and display them on an isolated origin in a sandbox. Initially bundle snapshot data. Do not provide application cookies, raw database access, credentials, arbitrary network access, or same-origin privileges. Gate download and rendering access through workspace authorization.

A later live HTML bridge may expose only named published queries through a session-bound message channel with result validation and row/rate limits. Its permission model requires a separate review before release.

## Alternatives

- Predefined charts only: fails bespoke visualization needs.
- Arbitrary HTML in the main app: merges untrusted code with authenticated privileges.
- Full generated applications for every page: duplicates auth/data plumbing and complicates updates.

## Consequences

Live blocks and custom reports have different freshness and execution models. Snapshot reports must display their data timestamp. Schema changes can invalidate bindings and must produce clear errors. Supporting arbitrary HTML does not grant arbitrary backend code execution.

## Validation and revisit

Verify cross-workspace access, rollback, invalid bindings, inaccessible/stale data, keyboard access, and sandbox restrictions. Test attempted credential access, navigation, and external requests in generated HTML. Validate chart compatibility before selecting an exact package version.
