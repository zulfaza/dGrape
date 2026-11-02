# ADR 0013: Use DFE as the provisional product name

- Status: Accepted
- Date: 2026-11-02
- Basis: Explicit user selection of a temporary name and intended domain.

## Context

The general workspace has outgrown the job-specific dGrape identity. The user intends to revisit naming later, but needs a consistent current name and recognizable browser icon.

## Decision

Use DFE, expanded as Dashboard for Everything, as the provisional display name. Use a simple sloth head for the browser favicon and the design-system brand mark. Record dfe.makarima.dev as the intended production domain.

This records naming intent, not a completed domain deployment. Existing tunnel links remain preview infrastructure until a domain deployment is separately requested. Do not change DNS, production routing, OAuth callbacks, repository directory names, or historical ADR text merely to apply the display name.

## Alternatives

- Keep dGrape as the current display name: does not reflect the user's new selection.
- Finalize an unrelated permanent name now: premature while the user is still exploring the identity.

## Consequences

Current UI labels, document titles, manifest, and favicon use DFE. The acronym is not baked into data IDs or authentication identifiers. Historical records may continue to refer to dGrape.

## Validation and revisit

Check the served page title, brand mark, manifest, and favicon after rebuilding the preview. Revisit this decision when the user selects a final name; supersede it rather than erasing the naming history. Confirm production hostname and configured callbacks during deployment, not during a visual rename.
