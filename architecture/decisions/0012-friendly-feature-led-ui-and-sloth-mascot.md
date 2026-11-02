# ADR 0012: Use an approachable feature-led UI with a sloth mascot

- Status: Accepted
- Date: 2026-11-02
- Scope: Friendly, feature-led direction and sloth subject are user-selected. Exact palette, artwork, typography, and motion remain proposed for curation.
- Related: [0010](0010-shadcn-ui-components.md), [0006](0006-versioned-pages-and-isolated-html.md)

## Context

The user wants a friendly UI that highlights what the workspace can do, citing Oyenza and GitHub's homepage. The previous job-only product notes favored a severe, monochrome interface. That visual assumption must not constrain the new direction.

## Decision

Give dGrape a friendly character and an original sloth mascot. Use the references for approachability, character presence, and product explanation. Keep the actual data workspace readable and efficient, with personality concentrated in onboarding, empty states, setup completion, and feature illustrations.

Explain flexible data, API connections, deterministic schedules, artifacts, and agent-built dashboards through concrete examples and real product views. Marketing/demo content and operational workspace screens serve different reading densities. Do not present proposed latency targets as measured product claims.

Explore sloth designs with a clear face mask, rounded silhouette, and expressive but calm poses. A sloth can suggest dependable background assistance; its presence must not imply a stalled job or hide real progress. Status text and indicators remain authoritative. Reference characters are inspiration; production artwork should have its own silhouette, face, proportions, and accessories.

User clarification: use a simpler, flat illustrated sloth like the simplicity of Oyenza's character, rather than the initial furry rendered exploration. The approved reference set is Oyenza, GitHub, PostHog, and Duolingo. Resend is excluded. Exact artwork, colors, and type remain open.

## Alternatives

- Preserve the old austere theme: conflicts with the new user brief.
- Add decorations to every report/control: reduces usable space and scanability.
- Use another product's mascot directly: does not build a distinct sloth identity.

## Consequences

The character needs a small coherent expression set before widespread use. Do not add streak pressure or gamification without a user request. Decorative art must not replace labels, color-independent status, keyboard access, or error recovery. Support reduced motion and avoid infinite mascot animation during routine work.

## Validation and revisit

The user will curate the inspiration shortlist before final visual selection. The durable [design direction and shortlist](../design/README.md) contains proposed tokens and placement rules; it is independent of disposable planning docs. Initial generated art is a concept, not a selected final logo. References: [Oyenza](https://oyenza.com/), [GitHub](https://github.com/home).
