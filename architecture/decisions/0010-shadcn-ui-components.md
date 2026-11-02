# ADR 0010: Use shadcn/ui as the component foundation

- Status: Accepted
- Date: 2026-11-02
- Basis: Explicit user selection of shadcn for frontend UI components.
- Related: [0002](0002-platform-technology-boundaries.md), [0012](0012-friendly-feature-led-ui-and-sloth-mascot.md)

## Context

The TanStack dashboard needs accessible, composable controls and a consistent design language. The existing repository already has shadcn components and components.json. Its previous monochrome, square visual direction does not match the user's new friendly UI brief.

## Decision

Use shadcn/ui for controls, forms, navigation, dialogs, menus, tables, and similar application components. Retain TanStack for routing/data and the chart adapter. Theme the components through shared semantic tokens rather than treating the default shadcn appearance as the final product identity.

Use the official shadcn skill from shadcn-ui/ui, skills/shadcn, installed project-locally under .agents/skills/shadcn. It supplements the project's architecture and design rules. Inspect current components.json and installed base primitives before generating components; do not accidentally mix incompatible base-specific APIs.

## Alternatives

- Custom controls everywhere: duplicates accessibility and interaction work.
- Another component system: contradicts the selected foundation and increases migration work.
- Unmodified starter styling: does not satisfy the accepted visual direction.

## Consequences

Generated component source is owned by this repository and must be reviewed. Integrate without replacing unrelated components or running a blanket reinitialization. The existing components.json CSS path must be checked against the actual stylesheet before CLI mutations; do not assume it is correct. Preserve keyboard behavior, focus indicators, accessible labels, and reduced-motion support.

## Validation and revisit

During implementation, check representative form, dialog, navigation, table, and chart compositions against the selected primitive base. No package/component migration is performed by accepting this ADR. Source: [official skills documentation](https://ui.shadcn.com/docs/skills).
