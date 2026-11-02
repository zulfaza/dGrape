# ADR 0014: Explore a working-set visual hierarchy

- Status: Proposed
- Date: 2026-11-02
- Basis: The user rejected the initial specimen as generic and requested reference-driven refinement.
- Related: [0012](0012-friendly-feature-led-ui-and-sloth-mascot.md), [reference study](../design/reference-study.md)

## Context

The first design-system specimen used a large lavender greeting banner, Manrope/Source Sans typography, and similar rounded cards. Its implementation was functional, but its visual hierarchy did not reflect the approved references or the usefulness of an operational workspace.

## Proposed decision

Prototype a personal workbench whose collection records lead the page. Use a restrained white/cool-gray base, forest action color, and a small yellow accent. Use IBM Plex Sans with clear weight/size roles rather than another rounded display/body pairing. Apply corner radii by function: 4–6px controls, 8px data panels, 12px contextual notes.

Separate the main data surface from open supporting run history and artifact context. Replace the motivational banner with concrete workspace information and one small actionable mascot note. Keep shadcn controls, the original sloth identity, light/dark support, and the existing demo interactions.

These are candidate design choices for review, not newly accepted brand colors or a production theme rollout. Historical ADR 0012's friendly/sloth direction remains accepted.

## Alternatives

- Change only accent color: retains the rejected visual composition.
- Copy an approved reference wholesale: ignores DFE's own data and agent workflows.
- Remove personality and make every edge square: loses the user-selected approachable character.

## Consequences

The design-system foundations, examples, source tokens, and DESIGN.md must change together. Report states and accessibility still constrain visual choices. Full application rollout waits for curation; this iteration updates the sample and its live preview.

## Validation and revisit

Compare the new specimen with the research findings, not just the old screenshot. Verify clear data hierarchy, distinct surface roles, readable type, meaningful geometry, responsive layout, contrast, keyboard/focus behavior, and preserved sample interactions. The user must curate the new direction before this ADR becomes Accepted.
