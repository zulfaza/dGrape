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

### Implementation evidence: static snapshots (2026-11-03)

The initial HTML preview is a script-free static snapshot, not a live HTML
runtime or bridge. Existing membership-authorized artifact reads fetch private
R2 bytes server-side with redirects disabled and a streaming 512 KB limit.
A separately stored, member-validated report data timestamp is required;
upload time is never presented as the report data time.

Before insertion into iframe srcdoc, DOMPurify applies an explicit allowlist
of static formatting, tables, inline CSS and basic SVG shapes/text. No authored
URL attributes, scripts, handlers, forms, links, embedded documents, SVG
animation, or external stylesheets survive. The iframe has an empty sandbox,
giving each document an opaque origin, and no messaging/API bridge.
Its first document policy denies all default resources, scripts, connections,
objects, frames, forms and base URLs; only inline styles are allowed.
CSS URL loads are denied by CSP. Navigation elements/attributes are removed
rather than depending on sandbox restrictions on own-frame navigation.
No source HTML is inserted into the authenticated document.

PNG/JPEG/WebP/GIF previews validate declared MIME against byte signatures and
stream at most 1 MB; SVG files remain unsupported. Raster bytes return as a
generated data URL. This is a signature gate, not a full image decoder or
decompression-bomb defense. HTML snapshots intentionally omit embedded images
and authored interactivity. No ADR status is changed by this evidence.
