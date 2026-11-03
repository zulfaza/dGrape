# Lint policy

Run `pnpm lint`. CI uses this command. Errors fail the command.
Use `pnpm lint:fix` for supported fixes. Keep oxfmt for formatting.
Upgrade oxlint and @oxlint/plugins together, with exact versions.

## TypeScript

Enable the generic anti-slop rules, with these policy adaptations:

- Keep oxfmt as the format owner. Do not enable require-readable-spacing.
  Its 773 spacing findings would change most source files without a
  contract or behavior change.
- Permit unknown parameters and typeof only in the listed boundary parser
  and primitive-union renderer files. These files must check external JSON,
  credentials, records, or search input before use. A claimed input type
  would remove that check. No Convex directory is excluded.
- Permit unknown returns only in the two HTTP JSON readers. Their callers
  parse the returned value. Permit unknown dictionaries only in the listed
  object guards. These guards establish object membership before field checks.
- Permit conditional empty-object spreads in agentRequests, agent-api, and
  record-export. These payload builders must omit absent optional properties;
  assigning undefined can change Convex validation and exported JSON contracts.
- Permit explicit string dictionaries in the two scope/page title lookup
  files. Arbitrary lookup keys are part of their existing API.
- Reject all non-const type assertions, non-null assertions, and explicit
  any types. A safety comment does not permit an assertion.

All five Effect rules are errors. Effect 4.1.1 is a direct dependency.
Existing Schema.TaggedError, Schema.Struct, and Effect.catch APIs remain valid.
The constructor import rule checks relative imports; it does not check aliases.
The rules use syntax and local scope, not full TypeScript type inference.

The Oxlint upgrade adds React compiler diagnostics. Keep purity, refs, and
set-state-in-effect off to preserve the prior React policy. Other existing
correctness rules remain active.

## Design system

Use DESIGN.md and accepted ADR 0015/0016. Enable no-restyle,
no-raw-colors, no-arbitrary-values, no-inline-styles, and
require-static-classes as errors.

- Shared UI components own their appearance. Disable no-restyle only there.
  Permit the listed existing focus-ring, calendar, checkbox, and transition
  values there; new arbitrary values still fail.
- Callers own layout. Titles accept typography. Named containers accept
  spacing. Table cells accept data alignment and truncation. Technical ID
  inputs accept mono text. Existing destructive/quiet button text, identity
  radii, menu open states, and contextual empty surfaces have exact contracts.
  No contract permits arbitrary new radius or color classes on controls.
- The specimen has established CSS classes outside Tailwind. Exact names are
  allowed by component contract. Shadcn prints an advisory for these names.
- The landing product illustrations have exact existing color, shadow, and
  geometry allowances. These are illustration values, not workspace tokens.
  No landing source was changed. The route's percentage mascot offsets and
  heading line height are also retained explicitly.
- Measured landing animation properties and specimen token/contrast swatches
  have file-scoped inline property allowances. These retain existing behavior.
  The waving sloth permits only animationPlayState to pause when not visible.
  Tabs use measured CSS variables. Sonner uses shared radius and color tokens.
- Static class analysis is off only in calendar and the specimen: calendar
  consumes react-day-picker class names; the specimen demonstrates CSS classes.
- Leave no-unknown-classes off. The specimen uses plain CSS selectors, and
  this rule cannot validate those through the app's Tailwind theme.

Lint cannot prove focus handling, reduced motion, toast count, chart access,
or computed radii. Runtime proof is still required for changes to those parts.

## Scope

Exclude generated Convex files, the generated route tree, vendored rules,
and installed agent tooling. Retain all prior ignores. Do not exclude app
source. Keep vendor source out of app type checks and formatting; it has
its own upstream type and format policy. Retain both MIT licenses and the
exact source revision in oxlint/anti-slop/UPSTREAM.md.
