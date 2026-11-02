# ADR 0001: Build a general workspace operated through agent harnesses

- Status: Accepted
- Date: 2026-11-02
- Basis: The user changed the product direction from a job tracker to a dashboard for many use cases, built for agents.

## Context

The user already asks agents to research jobs, tailor CVs, preview results, and apply. Similar work needs reusable data, API aggregation, deterministic schedules, files, and dynamic reports. Rebuilding all agent interactions inside another application would disrupt that flow.

## Decision

Build a general workspace whose primary agent interface is MCP, with an HTTP API and human dashboard over the same capabilities. Existing harnesses continue model execution, research, writing, and interactive browser tasks. dGrape persists and operates the resulting datasets, jobs, artifacts, and pages.

Job applications and transactions are initial use cases, not hardcoded platform entities. Their domain models belong in workspace collections/templates. The platform must also support custom agent-generated HTML visualizations, not only predefined charts.

## Alternatives

- Continue a job-only product: simpler domain rules but does not meet the new scope.
- Build an embedded autonomous agent platform: duplicates the user's harness and increases execution and credential complexity.
- Build a full Notion replacement immediately: adds collaborative editing and unrelated product scope before the data workflow works.

## Consequences

The platform needs stable, discoverable contracts that agents can compose. Generic primitives require explicit schemas and limits. A job template plus another distinct dataset should demonstrate reuse.

## Validation and revisit

Validate that the existing gather -> tailor -> preview -> apply flow works through MCP without requiring a new agent chat interface. Revisit embedded agents only if a concrete workflow cannot be handled by existing harnesses plus deterministic compute.
