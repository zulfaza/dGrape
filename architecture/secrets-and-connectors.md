# Secret references and connectors

ADR 0007 selects Cloudflare Worker secret bindings for production. An
operator adds each credential as a `SECRET_REF_*` Worker secret.

## Configuration

Set these Convex variables only on an approved deployment:

- `SECRET_VAULT_PROVIDER=cloudflare` selects the Worker binding adapter.
- `APP_ORIGIN` is the Worker origin. `SECRET_BINDING_TOKEN` authenticates
  Convex to the Worker. The Worker has the same secret.
- `CONNECTOR_ALLOWED_ORIGINS` holds comma-separated HTTPS origins, without paths
  or trailing slashes. An empty value denies all destinations.

docs/deployment.md lists the bindings and the operator steps.

The browser needs `VITE_CONVEX_SITE_URL` for the authenticated HTTP settings
endpoint. Never put the binding token in a browser variable.

An operator must approve each API host and its DNS/network policy. Do not approve
hosts with private network targets, user-controlled DNS, or request proxy routes.
The application rejects IP literals and local names. It cannot pin DNS resolution
with the Convex fetch API. Redirects are disabled.

## Lifecycle

Settings first reserve a reference. The credential goes to `POST /settings/secrets`
with a user bearer token. It never becomes a Convex action or mutation argument.
Metadata stores a server-generated object name, provider object ID, revision,
workspace, owner, safe label, and lifecycle state. Public reads omit provider IDs.

A pending revision blocks new connector requests. A 60-second write lease prevents
concurrent saves and cancellation during a save. Provider calls have a 10-second
timeout and no automatic retries. A failed save keeps the pending reference.
After the lease expires, submit an empty value to reconcile an object already
stored, or submit the credential again. The provider's unique object name makes
retries use the same revision. Rotation removes the prior object before the new
revision becomes ready. Failed cleanup stays pending.

Deletion first marks the reference deleting, which denies new use. Retry the HTTP
settings call to finish provider cleanup. Empty pending references can be cancelled
when no save holds the lease. Deleted references remain as tombstones. Deleting a
stored credential does not revoke a token with the third-party provider.

## Recipe contract

`requireConnectionUse(ctx, { workspaceId, connectionId, principalUserId })` is a
shared helper for a recipe publish mutation. Normalize a recipe's string connection
ID with `ctx.db.normalizeId("connections", rawId)` first. Deny a null result.
`internal.connectors.authorizeUse` has the same arguments and returns null on
success. These interfaces require a trusted recipe owner or run principal.
Never forward a public caller's principal argument.

`internal.connectors.fetchPage` takes those three arguments plus `route`,
`method` (`GET` or `POST`), `query` (string values), nullable `cursor`, and
`limits: { maxRows, maxBytes }`. It returns `{ rows, nextCursor, bytesRead }`.
Rows contain string, number, or boolean values. Missing and null fields are
omitted. Recipes save the cursor only with their output mutation.

The remote JSON envelope is `{ rows: [...], nextCursor?: string | null }`.
Only configured scalar fields leave the connector. Nested selected values,
credential echoes, unsafe cursors, oversized results, redirects, and provider
errors fail with a fixed safe message. Credential detection does not guarantee
recognition of arbitrary encodings or transformations. Do not select sensitive
API fields. Connector output contains no response headers or raw response body.

Every request checks membership, lifecycle state, origin policy, and grants.
The connection creator can use it. Other workspace members need a connection
use grant. Use of another user's private credential also needs `secretUse: true`.
Only the connection creator can change these grants. Existing agent credentials
and agent scopes are unchanged.

## Verification

Run `pnpm test`, `pnpm typecheck`, `pnpm typecheck:backend`, `pnpm lint`, and
`pnpm build`. Focused tests use an in-memory SecretService and Convex test runtime.
They require no deployment or vendor account. CI has no deployment command.

The removed WorkOS Vault adapter is in git history (ADR 0007 alternatives).
