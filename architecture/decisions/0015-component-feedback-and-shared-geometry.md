# ADR 0015: Apply shared component geometry and single action feedback

- Status: Accepted
- Date: 2026-11-02
- Basis: Explicit user feedback on the live design-system sample.
- Related: [0010](0010-shadcn-ui-components.md), [0014](0014-working-set-visual-hierarchy.md)

## Context

The live sample repeated recipe completion in a banner and beneath its button. The user also identified inconsistent corners in portaled dialogs, awkward form layout, rectangular file markers, excessive shadow, missing chart tooltips, and a green-tinted dark theme.

## Decision

- Use one toast for a completed user action. Do not repeat that completion as a banner, inline subtitle, or second notification. Persistent problems and field validation remain visible at their source; they are not transient success feedback.
- Use shared radius tokens throughout the app and sample, including portaled dialogs/popovers: 4px small elements, 6px controls, 8px panels/dialogs, and 12px contextual notes. Equivalent components must use the same role token rather than private constants or a zero-radius default.
- Use neutral dark-gray backgrounds and surfaces in dark mode, with green for action/selection accents. Do not tint every background green.
- Use borders and spacing before shadow. Ordinary data surfaces, buttons, and inputs do not need elevation. Floating layers may use restrained separation.
- File markers are square with balanced padding. Remove decorative company-initial boxes where they add no useful information.
- Use actual shadcn inputs with coherent label/control/help spacing and clear field errors. Avoid aligning an unrelated checkbox as if it were another text input.
- Every chart provides data-point tooltips through hover and keyboard focus, with clear labels, values, and units. Keep an accessible textual/table alternative and support touch interaction.

## Alternatives

- Add per-instance fixes: allows visual drift, especially in portaled content.
- Keep multiple success indicators for visibility: repeats the same event and distracts from work.
- Change only dark text colors: leaves the rejected green canvas and surface hierarchy intact.

## Consequences

The geometry source must be imported by both the main application stylesheet and the standalone specimen. Popups cannot depend on being descendants of the specimen wrapper. Behavior and presentation rules belong in DESIGN.md and the component examples so future screens inherit them.

## Validation and revisit

Check computed dialog/input/button radii in both themes, a single toast per action, absence of duplicate recipe-result subtitles, square file markers, form alignment, point tooltips via pointer and keyboard, and neutral dark backgrounds. Keep the rules when later palette or naming proposals change. The user can supersede them through a later ADR.
