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

## Implementation evidence (2026-11-08)

The user-claimed `service_auth` flow is implemented as [0009](0009-user-claimed-agent-authorization.md) describes. `convex/agentAuth.test.ts` verifies discovery, registration, human confirmation, scoped API access, expiry, revocation, and discovery/document consistency. Anonymous and agent-verified registration are not implemented, and the discovery documents do not advertise them.

## Protocol check (2026-11-08)

The implementation was compared with the published protocol: the apps guide, the auth.md file format, the user-claimed flow, and changelog v0.6.0 (2026-06-10). The registration, claim, token, revocation, and assertion formats agree. These differences remain:

- Metadata does not advertise `events_endpoint` or `events_supported`. The protocol uses them for provider Security Event Tokens, which only agent-verified registration needs. Advertise them only with that feature.
- A claim token that was already used gets `invalid_grant`. The protocol does not say what a used claim token returns. Its lookup rule gives `expired_token` for an absent or expired registration.
- The protocol documents `/agent/identity/claim` as anonymous-only, but changelog v0.4.0 also allows it for email registrations. This service accepts it for `service_auth`, because the claim window is longer than one code.
- The protocol's minimum implementation records an audit event for every state change, for example `registration.created`, `token.issued`, and `token.revoked`. This service records only claim and registration revocation. Audit events belong to a workspace, so a pending registration has no workspace to record against. Follow-up: decide whether to record token issue and revocation.
- Changelog v0.6.0 adds a `first_time_account` advisory on the claim page: warn the user when they have no claimed registration before. The claim page shows only a general warning ("Continue only if you started this from your own agent"). Follow-up: add this advisory. The `first_time_provider` advisory is for agent-verified registration and does not apply.
- The protocol gives HTTP statuses for few errors. The statuses this service uses for `/agent/identity/claim` (400, 409, 410, 429) are its own choice.

Sources: https://workos.com/auth-md/docs/apps , https://workos.com/auth-md/docs/auth-md , https://workos.com/auth-md/docs/flows/claimed , https://github.com/workos/auth.md/blob/main/CHANGELOG.md .
