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

### Implementation evidence: live HTML bridge (2026-11-08)

An `htmlReport` block with `live.bindings` is a live report. It names 1 to 5
saved query revisions. Each name is a lowercase identifier. Save and publish
check each binding like other query bindings. Agent credentials need
`data.read` as well as `pages.write` to save live bindings.

The frame has only the `allow-scripts` sandbox token, so the report runs in an
opaque origin with no cookies, storage, popups, forms or top navigation. The
first document policy allows inline scripts and styles and `data:` images, and
denies all connections, fonts, media, frames, workers, forms and base URLs.
Authored HTML is not sanitized: the sandbox and the policy contain it.

The parent writes a random nonce into the frame bootstrap. It transfers one
MessageChannel port only to the first hello from its own frame window with that
nonce, and it ignores all other window messages. Each port request names a
binding. The parent parses it, allows only declared names, and permits a burst
of 10 requests, then 1 each second, with at most 4 pending. It then calls
`pages.bridgeQuery`, which checks membership on each call. Viewers can read
only the revision that viewers see. Writers can also read other revisions.
A result has at most 200 rows and 256 KB, and holds only result field values:
no record metadata (record, collection or query IDs) and no secret reference
fields. Record reference fields keep their values, which are record IDs, as in
other page blocks. The frame
receives no credentials.

Known limit: the sandbox cannot stop a report from navigating its own frame,
and a navigation URL can carry data that the report read. The parent stops the
bridge when the frame loads a second document, but that cannot recall data
that already left. So only a person or credential that can already read the
workspace data can save live bindings. Browser checks on 2026-11-08 confirmed
blocked cookie, storage, parent document and fetch access, an unknown binding
refusal, the rate and pending limits, and the bridge stop after navigation.
This evidence does not change the ADR status.
