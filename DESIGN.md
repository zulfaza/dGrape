---
name: DFE
status: working design system for curation
components: shadcn/ui
checker: tsrs
mascot: original simple illustrated sloth
---

# DFE design system

DFE stands for Dashboard for Everything. This is a provisional product name; the intended production domain is dfe.makarima.dev. Use the simple sloth head in public/favicon.svg for browser identity and compact brand marks.

A friendly workspace that helps people and their agents keep useful information organized. The interface should feel capable, approachable, and calm. Operational detail stays legible; the sloth adds character without becoming a distraction.

This is the reusable reference for new screens. The executable specimen lives in src/design-system and builds separately from the authenticated application. It uses existing shadcn components and local demonstration data; it does not implement the planned backend. Exact visual choices remain open for user curation.

## Approved references

- Oyenza: approachable product explanations and a simple illustrated character.
- GitHub: show the product through recognizable developer workflows.
- PostHog: make a broad set of capabilities understandable without removing personality.
- Duolingo: a coherent mascot silhouette and expression system.

Resend is excluded by user request. Do not imitate reference logos or mascots directly. See architecture/design/README.md for the curated rationale.

## Foundations

Use semantic CSS variables. The standalone specimen scopes its theme rather than changing the old application's appearance before curation. Its theme stylesheet is the implementation reference; synchronize this document when a token changes.

| Role | Starting light palette | Purpose |
| --- | --- | --- |
| Background | #F5F7F5 | Cool, quiet workspace canvas |
| Secondary/muted surface | #EEF1EE | Quiet grouping and control states |
| Foreground | #24332B | Main text and headings |
| Card/popover | #FFFFFF | Surfaces with a clear content purpose |
| Primary | #315847 | One main action per group |
| Primary foreground | #FFFFFF | Text on primary action |
| Accent | #E6BD5B | Small selection or bookmark-like emphasis |
| Muted foreground | #59665D | Secondary information with readable contrast |
| Structural border | #C3CBC5 | Define data and control boundaries where needed |

Dark mode uses neutral dark-gray backgrounds and surfaces, with green action/selection accents. Do not give the canvas and every panel a green tint. Never invert an entire page. All text pairs must reach WCAG AA for their rendered size. Do not use yellow or illustration accents as low-contrast text on white. The specimen should display calculated contrast ratios rather than claim the palette is accessible without checking.

Typography: IBM Plex Sans for headings, navigation, prose, and data, self-hosted through Fontsource. Use 400 for body, 500 for controls, and 600 for primary headings; hierarchy comes from scale and weight rather than decorative font pairing. System sans-serif fallback is required. Use JetBrains Mono only for code, IDs, and technical snippets. Use tabular figures for numerical tables. Keep typical body text at 14–16px and primary controls comfortably readable; captions must not carry essential instructions alone.

Spacing: a 4px base with 8, 12, 16, 24, 32, and 48px steps. Prefer layout gaps over stacked margins. Shared radius roles: 4px small elements, 6px controls, 8px panels/dialogs, 12px contextual notes. Equivalent components use the same token across the app and specimen, including portals. Reserve full pills for compact statuses. Elevation: borders define the main data surface; supporting logs and metadata can remain open. Ordinary controls and cards are flat. Floating layers use restrained separation only. Do not repeat the same card geometry around every block.

The previous lavender welcome banner and Manrope/Source Sans pairing were rejected as generic. Do not restore them as defaults. See architecture/design/reference-study.md and ADR 0014 for the measured reference observations and the reasoning behind this candidate revision.

## Component recipes

- Actions: one primary action, secondary/outline alternatives, clear destructive intent. Disabled and loading states retain a readable name. Icon-only controls need accessible labels.
- Forms: use the installed shadcn field/input composition, visible labels, concise help, and inline errors with aria-invalid. Align comparable labels and controls; keep preferences/checkboxes in their own group rather than an empty text-input cell. Never rely on placeholders as labels. Show where a secret is configured, not its value.
- Dataset tabs: use the shared rounded shadcn Tabs wrapper with a sliding selection indicator. Use panel/control radius tokens, preserve keyboard navigation, and disable motion for reduced-motion users. Do not restore rectangular underline tabs per screen.
- Navigation: stable workspace sidebar, clear current location, and focused page actions. Small screens need an accessible navigation alternative; do not squeeze a desktop sidebar into unreadable text.
- Data: use semantic tables for records with labeled filters, stable alignment, visible units/currency, and overflow behavior. Never abbreviate away essential status or amounts. Long values truncate only when their full content remains accessible.
- Workspace composition: lead with the actual working set and concise freshness information. Keep a returning user's data ahead of promotional or motivational copy. A small contextual sloth note may explain a concrete next action.
- Reports: state the date range, source, and data freshness. Every graph has labeled data-point tooltips for hover and keyboard focus, with values/units and touch access. Provide a text/table alternative to visual marks. The sample's local chart is illustrative; the production renderer remains the planned TanStack adapter.
- Feedback: loading, empty, error, stale, and completed are different states. Each failure includes a recovery action; the demo must label simulated behavior and never imply a live connection.
- Action confirmations: use the shared shadcn Sonner component, with up to four visible stacked notifications and expansion on hover or Alt+T keyboard focus. Show one toast. Never repeat the same completion in a banner, a small line under the button, or another notification elsewhere. Persistent failures and field errors remain visible where recovery happens.
- Small identity elements: use square, evenly padded file markers. Omit decorative company-initial boxes when the company name already provides the useful identity.
- Overlays: real dialog triggers, titles, close controls, correct focus handling, and theme inheritance for portaled content.

Use built-in shadcn variants before custom component recipes. Edit semantic tokens for themes rather than overriding each instance. Match the installed primitive base and APIs; the existing project's configuration and older wrappers are not perfectly aligned, so inspect actual component code.

## Mascot

The current direction is the simple sloth in public/brand/sloth-concept.png. The earlier furry rendering is iteration history, not the active style.

Use flat warm-brown shapes, a pale face, clear sloth eye patches, simple dark outlines, and minimal prop accents. Keep shapes readable at small sizes. Avoid fur detail, glossy 3D eyes, pouches, jewelry, and elaborate props. The initial sheet shows welcome, organizing, and report poses with earlier lilac props; that does not require a lilac UI theme. A final production asset set can follow after selection.

Production poses are individual transparent 512×512 PNGs in public/brand/mascot, rendered through the Mascot component (src/components/mascot.tsx) as decorative images:

| Pose | Use |
| --- | --- |
| wave | Landing hero, first workspace, first collection |
| laptop | Connect your agent, landing call to action |
| chart | Empty collection: add your first record |
| celebrate | A new credential, other completion moments |
| thinking | Not-found and nothing-matches states |
| lying (2:1) | Resting on the top edge of the landing dashboard example |

Generate a new pose from the model reference rather than editing an existing pose, and record its prompt. Landing motion (user requested): the example dashboard rises in once, then changes use case every 5 seconds; the sloth settles once, bobs when the view changes, and (user requested) slowly swings its hand, leg, and foot in a loop. The lying pose is split into stacked layers in public/brand/mascot/lying for that loop. Rotation pauses on hover and focus, the use-case tabs work by hand, and reduced-motion users get a static page with no rotation. Do not carry this auto-rotation into the workspace. Use the mascot in welcome/setup, helpful empty states, and occasional completion moments. It does not replace a status label, act as a progress indicator, cover data, or celebrate a failed operation. No endless idle movement. Reduced-motion users receive a static equivalent.

## Feature explanations

Explain the five capabilities through one concrete workflow: create a collection, configure a connection, schedule a fixed recipe, save artifacts, and read a useful dashboard. The agent keeps doing research and writing in the user's harness. Do not add an embedded agent conversation just to demonstrate the interface.

## Do and do not

- Do keep the data workspace quiet while allowing onboarding to be more expressive. Do not place a mascot inside every card.
- Do show truthful timestamps, permissions, and local-demo labels. Do not advertise unmeasured latency or pretend sample data is synchronized.
- Do provide text with status colors. Do not encode meaning solely through green/red, animation, or expressions.
- Do reuse tokens, component variants, and existing controls. Do not copy a different set of hex values or geometry into each new screen.

## Verification and known gaps

Check keyboard interaction, focus order, dialog closing/return focus, contrast pairs in both themes, form errors, long values, empty/error/loading states, mobile overflow, and reduced motion. Build the standalone specimen and run tsrs against it.

The original three-pose mascot sheet has a light background. The transparent model reference (public/brand/mascot-reference.png) is the character reference for new poses; prompts are in architecture/design/assets/mascot-library.md. The authenticated app and the landing page use these tokens (src/app.css) and IBM Plex Sans. Do not claim backend, connection, scheduler, or production chart functionality from this local specimen.

Geometry is shared through src/styles/geometry.css and imported by both app and specimen stylesheets. The live sample was checked after the component feedback: dialog 8px, input/buttons 6px in the portaled form; 40×40px file markers; one recipe toast and no duplicate result line; labeled chart tooltips on keyboard focus and touch. These are regression checks, not reasons to introduce per-screen CSS exceptions.
