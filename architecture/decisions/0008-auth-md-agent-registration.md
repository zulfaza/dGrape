# ADR 0008: Include auth.md agent registration

- Status: Accepted
- Date: 2026-11-02
- Scope: The user requested auth.md support in the plan, not immediate endpoint implementation.
- Related proposal: [0009](0009-user-claimed-agent-authorization.md)

## Context

The main interface is MCP/API access from existing harnesses. Browser login alone does not explain how an agent establishes a user-bound, scoped credential. auth.md describes a registration protocol, not merely a static document.

## Decision

Include auth.md agent registration in the implementation scope. Deliver working registration, discovery, authorization, token lifecycle, and revocation behavior together. A public Markdown file must describe only supported flows and real endpoints. Keep structured OAuth metadata and prose discovery consistent. The feature remains planned until its end-to-end flow is implemented and verified.

This decision does not select every registration type, a token lifetime, a managed authorization-server product, or a provider trust list. Those need explicit design and validation. WorkOS AuthKit's human login and Vault's connector credential storage are distinct from the agent registration protocol.

## Alternatives

- Browser login only: leaves agent onboarding undefined.
- Manual tokens only: useful for bootstrap, but does not satisfy the requested protocol support.
- Publish documentation before handlers exist: advertises a capability that does not work.

## Consequences

Agent onboarding adds protocol state, consent, security tests, and revocation responsibilities. Include it in the first authenticated MCP milestone, rather than declaring onboarding complete with manual tokens alone.

## Validation and revisit

Verify discovery, registration, human authorization where required, scoped MCP/API access, expiry, revocation, and discovery/document consistency. Pin/recheck the evolving protocol before implementation. Source: [auth.md apps guide](https://workos.com/auth-md/docs/apps).
