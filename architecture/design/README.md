# Frontend direction and reference shortlist

Current provisional identity: DFE — Dashboard for Everything, intended for dfe.makarima.dev. Use the simple sloth-head favicon/brand mark. See [ADR 0013](../decisions/0013-provisional-dfe-name-and-domain.md).

Status: the user approved Oyenza, GitHub, PostHog, and Duolingo as references and excluded Resend. The user selected shadcn/ui, a friendly feature-led experience, and a simple sloth mascot. Exact theme and final artwork remain subject to curation. Keep this file with the ADRs when temporary docs are removed.

## Reference shortlist

These are proposed lessons to borrow from the approved reference set, not instructions to copy every part of a reference. Links checked 2026-11-02; sites may change.

| Reference | Status | Proposed lesson | Restraint |
| --- | --- | --- | --- |
| [Oyenza](https://oyenza.com/) | User-supplied | Make features understandable through familiar examples and a warm character presence | Adapt the storytelling to an agent/data workspace rather than a finance app |
| [GitHub homepage](https://github.com/home) | User-supplied | Connect a developer-facing product story to recognizable workflows and product demonstrations | Choose an original sloth; do not transplant GitHub branding or make every app screen a marketing scene |
| [PostHog](https://posthog.com/) | User-approved | Show how many tools fit together while retaining character and concrete product context | Keep our main navigation and data views calmer |
| [Duolingo character design](https://blog.duolingo.com/reshaping-duo/) | User-approved | Start with a recognizable silhouette that can support consistent expressions | Borrow character-system discipline rather than streaks, pressure, or an owl-like face |

## Proposed design system

- Color: white #FFFFFF, cool fog #EEF1EE, ink #24332B, forest #315847, yellow #E6BD5B, and structural border #C3CBC5. These are candidate tokens; validate actual foreground/background contrast before adoption. Use semantic shadcn tokens and chart palettes rather than scattering hex values. The first lavender theme was rejected.
- Type: IBM Plex Sans throughout the functional UI, with weights and scale communicating hierarchy. Use tabular numbers for financial values. The previous Manrope/Source Sans pairing is no longer the candidate direction.
- Layout: an actual working set leads the workspace. Put the collection table first, open run history/artifact context beside it, and use a small contextual sloth note. Left-align operational text and data. Large marketing banners belong outside the returning user's workspace.
- Geometry: 4–6px controls, 8px data panels, 12px notes. Supporting metadata does not need another rounded container.
- Hierarchy: clear page title, primary action, current freshness/status, then the useful content. A first-time workspace should explain what to do next without suggesting a new embedded agent chat is required.

Initial sketch:

```text
Operational workspace
Sidebar | Workspace + primary action
        | Working set                  | Next actions
        | Applications / Transactions  | Recipe history
        | Indexed record table         | Files and reports
        | Summary chart                | Small sloth note
```

Review against the brief: the sloth carries the brand personality; useful data and actions carry the feature explanation. Avoid a cream/serif stationery template, a dark neon dashboard, a sharp newspaper grid, or the same card wrapped around every block. See the [reference study](reference-study.md) and [ADR 0014](../decisions/0014-working-set-visual-hierarchy.md) for the first specimen's rejection and the rationale behind this revision.

## Sloth concept brief

An original calm, capable sloth that keeps things organized while the user works with their agent. Use a compact rounded silhouette, clear sloth eye patches, flat warm-neutral shapes, simple outlines, and a small grape/lilac accent. The user explicitly requested a simpler treatment like Oyenza. Avoid fur texture, glossy 3D rendering, detailed accessories, and a sleepy expression as the only face; calm does not mean inactive.

Initial concept-sheet brief: the same character in three poses, welcoming with a small wave; carefully organizing data tiles; presenting a finished report. This tests a coherent identity across tasks, rather than proposing three incompatible mascots. The first image is for curation, not final production use.

The current simplified [concept sheet](assets/sloth-simple-concept.png) replaces the detailed first exploration as the active direction. The original [detailed exploration](assets/sloth-concept.png) is retained only as iteration history.

After selection, derive transparent assets for welcome/empty state, working, success, and needs-attention. Keep data and recovery actions as text outside the illustration. Do not make mascot emotion the only status indicator. Prefer short user-triggered motion with a static reduced-motion state. Ensure the face remains recognizable at small sizes before treating it as a navigation mark.

## Features to demonstrate

1. Flexible data: an agent creates Applications or Transactions without a schema deployment.
2. Connections: configure an API once and reuse authorized access without exposing its key to the agent.
3. Schedules: show a deterministic recipe, next run, and last successful refresh.
4. Artifacts: preview a CV, screenshot, or HTML report beside its source record.
5. Dashboards: show a useful chart/table and an agent-generated custom report with clear freshness.

## Implementation notes

Use the project-local official shadcn skill in .agents/skills/shadcn, plus existing frontend-design guidance. Treat local PRODUCT.md as the current product brief. Inspect components.json before CLI changes; its stylesheet path has been corrected to src/app.css. The standalone sample has its own base/theme styles so refining it does not change the old application's theme.

The user's tsrs selection is recorded in ADR 0011. A standalone design system and representative screen are now authorized and being built in src/design-system. It uses local sample data, actual shadcn controls, and scoped theme tokens. It does not change the authenticated app's appearance or database state. See the root DESIGN.md for reusable rules; build with pnpm design-system:build and check with pnpm typecheck:design-system. Further curation should update the source, tokens, and DESIGN.md together.

The [interactive specimen](showcase.html) is exported from the real React implementation with pnpm design-system:export. It includes a workspace sample, foundations, components, and mascot patterns. Keep its relative public/brand image asset available when moving it; the original build and source remain authoritative. The portable export embeds the Latin font subsets, while the full build retains the complete font subsets.
