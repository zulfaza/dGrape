# ADR 0016: Share sliding segmented tabs and stacked Sonner toasts

- Status: Accepted
- Date: 2026-11-02
- Basis: Explicit user feedback on the design-system sample.
- Related: [0010](0010-shadcn-ui-components.md), [0015](0015-component-feedback-and-shared-geometry.md)

## Context

The dataset tabs retained rectangular underline styling despite shared rounding elsewhere. The user also requested shadcn toasts that handle several concurrent updates.

## Decision

Use the shared shadcn Radix Tabs wrapper as a rounded segmented control. A single selection indicator slides to the active trigger and adapts to its measured size. Keep Radix selection semantics, arrow-key navigation, disabled states, and focus behavior. Reduced motion changes selection immediately. Use the existing panel and control radius tokens, including in the authenticated app.

Use shadcn's Sonner recipe for the notification renderer and queue. Show up to four notifications in the visible stack, expand on hover or Alt+T keyboard focus, and provide dismissal controls. Keep one notification per action, without duplicated inline completion text. Retain the existing toast entry point as a compatibility adapter for app callers; do not maintain a second queue.

## Alternatives

- Per-page tab backgrounds: repeat styling and cannot provide a continuous indicator.
- A private toast state list: duplicates shadcn behavior and requires separate queue, stacking, and accessibility maintenance.
- Always animate selection: ignores the user's reduced-motion preference.

## Consequences

Tabs measure their triggers on resize, content, and selection changes. Observers must disconnect when the component unmounts. Shared geometry styles and the Sonner wrapper must work outside the standalone specimen. Sonner adds one runtime dependency; existing dependency resolutions are preserved.

## Validation and revisit

Check pointer and arrow-key selection, different trigger widths, narrow screens, reduced motion, concurrent notifications, dismissal, and theme inheritance. Keep the interactive stack example in the component gallery. Revisit if tab counts require an overflow navigation pattern.
