# ADR 0009: Start agent registration with explicit user confirmation

- Status: Accepted (2026-11-08, after the implementation was verified; see "Implementation evidence")
- Date: 2026-11-02
- Related: [0008](0008-auth-md-agent-registration.md), [0007](0007-secret-references-and-vault-boundary.md)

## Context

The user's harness may not provide an identity-attestation issuer. Anonymous access risks exposing workspace capabilities before an authenticated user grants them. WorkOS browser login is already present, but does not automatically implement the auth.md authorization server.

## Proposed decision

Initially support only user-claimed service_auth registration. The agent supplies an email hint and presents a confirmation URL/code. The human signs in through AuthKit, chooses a workspace, reviews scopes, and confirms on our site. Issue no pre-claim workspace access. The agent polls the token endpoint and receives scoped credentials after approval.

Publish /auth.md, protected-resource metadata, and authorization-server metadata from canonical configuration. Implement identity registration, authenticated claim confirmation, claim polling, assertion exchange, and token revocation using the pinned protocol. Verify its exact service_auth retry semantics; do not copy anonymous-only handlers blindly.

Store agentRegistrations, agentClaimAttempts, and agentCredentials in Convex with transactional transitions. Persist high-entropy tokens only as digests; use keyed code digests because short codes are vulnerable to offline guessing. Protect signing/digest keys server-side. Enforce account/email binding, CSRF defenses, expiry, attempt/poll limits, and no-store/redacted responses.

Tokens authorize the intersection of approved scopes and current membership. Separate read/write, job run/manage, and connection use/manage capabilities. Provide token-level and registration-wide revocation. Prefer state-backed opaque tokens if the gateway/Convex integration can enforce immediate revocation. Never let a supplied user ID stand in for authenticated identity.

## Alternatives

- Anonymous start: earlier access, but more pre-claim state and scope-upgrade risk.
- Agent-verified registration: needs trusted issuers, assertion validation, replay defenses, first-link confirmation, and provider revocation events.
- Assume AuthKit implements everything: leaves an unverified authorization-server dependency.

## Consequences

Initial access needs one human confirmation. The application or a verified compatible managed service must own the protocol state machine. Unlike external connector secrets, the issued agent token must reach the harness; it needs secure harness storage rather than conversation/report output.

## Validation and revisit

Test wrong-account claims, code expiry, brute force, fast polling, concurrent confirmation, scope downgrade, audience/signature failures, revoked membership, and cross-workspace requests. Proposed lifetimes remain tunable, not accepted guarantees. Validate managed-service compatibility and production terms before adoption. Add provider-attested registration only with the full trust/revocation model. Sources: [user-claimed flow](https://workos.com/auth-md/docs/flows/claimed), [file format](https://workos.com/auth-md/docs/auth-md).

## Implementation evidence (2026-11-08)

The user agreed to accept this decision after the flow was implemented and tested. The implementation differs from the proposal as follows:

- Tables: `agentRegistrations`, `agentClaimAttempts`, and `agentGrants`. The `agentGrants` table holds the access tokens; there is no separate `agentCredentials` table.
- States: `pending`, `claimed`, and `revoked`. A pending registration expires by time; there is no stored `denied` or `expired` state.
- Lifetimes: one code and claim link stay valid for 10 minutes. The claim window is 24 hours, and the agent can get a new code in that window. The minimum poll interval is 5 seconds. Access tokens stay valid for 1 hour. Identity assertions stay valid for 30 days.
- Only a workspace owner can confirm a claim. A role change replaces the membership row, and this stops all tokens from a registration that was claimed before the change.

Code: `convex/agentIdentityHttp.ts`, `convex/agentRegistrations.ts`, `convex/lib/agentAuthDiscovery.ts`, `convex/lib/identityAssertion.ts`, `convex/lib/agentGrant.ts`, and `src/routes/claim.tsx`. Tests: `convex/agentAuth.test.ts` covers the validation list above over HTTP, with a controlled clock.
