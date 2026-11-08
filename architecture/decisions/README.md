# Architecture decision records

These records preserve dGrape's architecture rationale independently of temporary plans and visualizations in `docs/`. Keep this directory when those documents are removed.

Accepted means the user has selected the stated direction, not that it is implemented or that deployment is authorized. Proposed means a recommended design still needs agreement or validation. Each record limits acceptance to its stated scope; implementation details do not inherit acceptance merely by appearing nearby.

| ADR                                                          | Status   | Decision                                                                                    |
| ------------------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------- |
| [0001](0001-agent-built-data-workspace.md)                   | Accepted | Build a general workspace operated through the user's agent harness                         |
| [0002](0002-platform-technology-boundaries.md)               | Accepted | Use Convex, Cloudflare, TanStack, and Effect                                                |
| [0003](0003-runtime-defined-collections.md)                  | Proposed | Represent flexible datasets with versioned logical collections                              |
| [0004](0004-indexed-queries-and-materialized-reports.md)     | Proposed | Serve bounded indexed queries and prepared report summaries                                 |
| [0005](0005-deterministic-recipes-and-durable-scheduling.md) | Proposed | Execute versioned recipes with durable, retry-safe scheduling                               |
| [0006](0006-versioned-pages-and-isolated-html.md)            | Proposed | Support live dashboard blocks and isolated custom HTML                                      |
| [0007](0007-secret-references-and-vault-boundary.md)         | Proposed | Keep credentials behind a server-side secret service                                        |
| [0008](0008-auth-md-agent-registration.md)                   | Accepted | Include auth.md agent registration in the implementation scope                              |
| [0009](0009-user-claimed-agent-authorization.md)             | Proposed | Start registration with explicit user confirmation                                          |
| [0010](0010-shadcn-ui-components.md)                         | Accepted | Use shadcn/ui as the component foundation                                                   |
| [0011](0011-tsrs-typescript-checker.md)                      | Accepted | Use tsrs for TypeScript checking                                                            |
| [0012](0012-friendly-feature-led-ui-and-sloth-mascot.md)     | Accepted | Build an approachable feature-led UI with a sloth mascot                                    |
| [0013](0013-provisional-dfe-name-and-domain.md)              | Accepted | Use DFE as the provisional name and dfe.makarima.dev as the intended domain                 |
| [0014](0014-working-set-visual-hierarchy.md)                 | Proposed | Refine the sample around a working set, clearer type, and functional geometry               |
| [0015](0015-component-feedback-and-shared-geometry.md)       | Accepted | Share geometry, use one action toast, provide chart tooltips, and use neutral dark surfaces |
| [0016](0016-segmented-tabs-and-stacked-toasts.md)            | Accepted | Use shared rounded sliding tabs and shadcn Sonner notification stacks                       |
| [0017](0017-credential-entry-write-path.md)                  | Proposed | Write user credentials to Cloudflare Secrets Store slots                                    |

## Working with ADRs

Read the relevant records before implementation. Proposed choices may be explored in a compatibility spike, but do not describe them as approved or shipped. Record evidence and obtain agreement before marking them Accepted. Implementation is underway. These records do not approve proposed decisions.

Use sequential numbers and stable descriptive filenames. Include status, date, context, decision, alternatives, consequences, and validation or revisit criteria. Keep durable tradeoffs here; keep task checklists, transient examples, and execution logs elsewhere.

When an accepted choice changes materially, add a new ADR and mark the old one Superseded with a link to its replacement. Do not rewrite history to imply the old choice was never made. Clarifications and implementation evidence may be appended without changing the original decision's meaning.

This index and its linked ADRs are the durable source of architecture decisions. Planning documents must defer to their statuses. None of these records requires `docs/` to exist.
