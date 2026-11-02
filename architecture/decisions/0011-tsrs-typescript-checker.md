# ADR 0011: Use tsrs for TypeScript checking

- Status: Accepted
- Date: 2026-11-02
- Scope: User-selected checker. Package version and compiler compatibility require validation during implementation.

## Context

The project currently runs tsc --noEmit and declares TypeScript 6. The user selected tsrs, the Rust port of the TypeScript checker. The upstream project targets a pinned TypeScript 7 compiler baseline, so changing tools is not evidence that all current configuration and diagnostics remain identical.

## Decision

Use the oxc-project/tsrs package as the primary TypeScript checker for the rebuilt project. Pin a verified version and use tsrs --noEmit in the project's typecheck command and CI. Keep linting, runtime schema validation, bundling, and tests as separate responsibilities.

Do not silently substitute tsgo, tsc-rs, or a similarly named Rust type-generation library. Do not discard compiler/type packages that other build tools still require. Evaluate optional fast mode separately from the baseline checker configuration.

## Alternatives

- Keep tsc as primary: familiar but does not implement the user's tool selection.
- Switch to tsgo instead: another tool, not the selected checker.
- Treat checker adoption as a blind dependency replacement: risks mismatched compiler semantics and tooling.

## Consequences

The foundation phase must validate tsconfig options, generated TanStack routes, Convex types, Effect types, JSX, supported platforms, and diagnostic behavior against the selected version. Record known gaps rather than suppressing unexpected errors. A temporary reference-compiler comparison is validation, not a replacement of tsrs.

## Validation and revisit

Compare existing diagnostics with a documented baseline and run the representative build. Establish compatible TypeScript declarations/compiler packages before updating scripts. Source: [upstream tsrs](https://github.com/oxc-project/tsrs), checked 2026-11-02.

Implementation note: the user subsequently authorized a design system and representative sample. tsrs 0.20.1-ts7.1.0-beta is pinned and typecheck scripts now use it, including an isolated sample check. Compiler package declarations remain available for existing build tools. This does not imply the full backend rewrite has begun.
