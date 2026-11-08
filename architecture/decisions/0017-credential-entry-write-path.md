# ADR 0017: Write user credentials to Cloudflare Secrets Store slots

- Status: Proposed
- Date: 2026-11-08
- Basis: Issue #251. The user selected Cloudflare secret bindings as the production secret backend in #142.
- Related: [0007](0007-secret-references-and-vault-boundary.md), [0002](0002-platform-technology-boundaries.md)
- Open decision: give the production Worker an API token with the account-wide **Account Secrets Store Edit** permission.
- Replaces: the WorkOS Vault adapter of ADR 0007. Other parts of ADR 0007 stay.

## Context

Issue #251 asks for UI where a user enters a credential or connects an OAuth account, and for token refresh and revocation. Thus the application must write secrets at runtime. Secrets must never go into collection values, recipe specs, HTML, MCP responses, logs or retained browser state. A password field that holds the value until submit is permitted. Storage, URLs, cookies and client caches are not permitted.

Current code: connector requests run in a Convex action (`convex/lib/connectorFetch.ts`). They read the value through `SecretService`, and the only adapter is the optional WorkOS Vault adapter. The Worker has no connection-secret bindings. In #142 the user selected Cloudflare secret bindings as the production backend. Another change moves resolution to the Worker. Convex cannot read Cloudflare bindings.

Two Cloudflare write paths exist. Facts were checked on 2026-11-08 and must be checked again before acceptance:

| | Secrets Store | Per-Worker secrets |
| --- | --- | --- |
| Status | Open beta | GA |
| Price | No published price. This does not prove that production use is free. | Included in Workers |
| Limits | 1 store and 100 secrets for each account. Value up to 64 KiB. | 64 (Free) or 128 (Paid) variables for each Worker. Value up to 5 KB. |
| Write API | Create: `POST …/stores/{store}/secrets`. Update: `PATCH …/secrets/{secret_id}`. Delete: `DELETE …/secrets/{secret_id}`. | `PUT /accounts/{account}/workers/scripts/{name}/secrets` |
| Effect of a write | An edit changes the value for all services that use the secret. No new Worker version. No documented propagation time. | Each write makes a new Worker version. |
| Token permission | Account Secrets Store Edit: create, edit, delete and bind, for the full account. No store scope. No create-only scope. | Workers Scripts Write: this can also change Worker code. |
| Read back | Never. Values are write-only. | Never |

A Worker reads a store secret only through a `secrets_store_secrets` binding (`store_id`, `secret_name`) declared at deploy time, with `await env.BINDING.get()`. No runtime API reads a secret by name. Thus a new secret name needs a new binding and a deploy. The global Cloudflare API limit is 1,200 requests in 5 minutes for each user.

## Proposed decision

Use Secrets Store with a fixed pool of pre-bound slots. This replaces the WorkOS Vault adapter of ADR 0007. The ownership, grants, lifecycle states and ingress rules of ADR 0007 stay. The write lease is the one in `architecture/secrets-and-connectors.md`.

### Slots

The deploy config binds N secrets, `CRED_SLOT_01` to `CRED_SLOT_N`. Start with N = 20. Each secret has the `workers` scope. More slots need a deploy.

Convex keeps one record for each slot. The record holds the Cloudflare secret ID and a state. The secret ID stays in internal queries only. The states are:

- `free`: the slot holds the placeholder.
- `writing`: one reference and revision hold a write lease. The slot was `free`.
- `bound`: the slot holds the value of one ready reference and revision.
- `refreshing`: a `bound` slot. One refresh holds a write lease.
- `clearing`: one claim holds a lease to write the placeholder.
- `retired`: a write has no known result. The slot is never used or reused again.

Each state change is one Convex mutation. The mutation checks the expected state, reference, revision and lease. Thus only one write can occur on a slot at a time.

The `PATCH` API has no revision check. A write that timed out can still complete later and overwrite a newer value. Thus each uncertain result retires the slot: a timeout, a lost response, or an expired `writing`, `refreshing` or `clearing` lease. A retired slot stays in the deploy config but has no further use. The operator adds new slots with a deploy when the free count is low. The settings page shows the free count.

The slot value is a JSON envelope: `{ ref, revision, credential }`. Before each use, the Worker compares `ref` and `revision` with the Convex record. If they do not match, the Worker stops the request with a fixed safe error. Thus a slow request cannot use a credential of a different reference.

### Write path

1. The browser sends the credential to an authenticated Worker route on the app origin. The value does not go to Convex.
2. A Convex mutation sets a `free` slot to `writing` for the reference and revision. The mutation gets metadata only.
3. The Worker calls `PATCH` on the slot. The Cloudflare token is the Worker secret binding `SECRETS_STORE_TOKEN`.
4. If the `PATCH` succeeds, one mutation sets the slot to `bound` and the reference to ready. The mutation checks the lease first.
5. If the `PATCH` fails with a clear Cloudflare error response, the slot goes back to `free` and the reference stays pending. Any other result retires the slot, and the reference stays pending. The user can submit again into a different slot.

Convex never calls the Cloudflare API. Convex never holds the token or the value. The Worker does not log request bodies, callback URLs or provider responses.

### Use path

Convex calls an internal Worker route. The Worker calls back to a Convex HTTP route that returns metadata only. One service token authenticates both directions. This is the pattern of `RECIPE_DISPATCH_TOKEN` today: a Worker secret binding, and the same value in a Convex environment variable. The token gives no access to credentials. The call contains the connection ID, route, query, cursor, limits and the run principal. The run principal comes from trusted Convex code, never from a public caller. The call does not contain a slot, a destination or a credential. The Convex HTTP route checks the token, then runs an internal query for the slot, revision, destination and grants. Then the Worker makes the request. The current checks stay: membership, grants, origin policy, no redirects, cursor rules, credential echo checks and the response field mapping. The Worker returns only mapped scalar rows and fixed safe errors.

### OAuth

1. The Worker makes a server-side OAuth transaction. The transaction is bound to the session, workspace, connection, provider, redirect URI and revision. It has a short expiry and uses PKCE with `S256`. The PKCE verifier stays on the server.
2. The callback consumes the transaction in one mutation. A second use fails.
3. The Worker writes the refresh token, the access token and its expiry to the slot through the write path.
4. A refresh before a run first sets the slot from `bound` to `refreshing`, with the expected reference and revision. This lease is taken before the provider refresh call, so two refresh calls cannot occur at the same time. On success, the Worker writes the new tokens and the slot goes back to `bound`. On a clear provider or Cloudflare error, the slot goes back to `bound` and the reference is marked "reconnect needed". Any other result retires the slot and marks the reference "reconnect needed".
5. Disconnect first sets the reference to `deleting`. This stops new use. Then the Worker calls the provider revocation endpoint, sets the slot to `clearing`, writes the placeholder and sets the slot to `free`. A failure keeps the reference in `deleting`, and the user can try again.
6. Each OAuth client secret is a binding that the operator sets.

### Cleanup

A cleanup job claims a slot only when it is `bound` to a deleted reference. It sets the slot to `clearing` with a new lease, writes the placeholder, and sets the slot to `free`. A clear error sets the slot back to `bound` for a later try. Any other result retires the slot. The job also retires each slot with an expired `writing`, `refreshing` or `clearing` lease. It never claims a slot with an active lease.

## Decision needed from the user

This design gives the production Worker a token that can create, change, delete and bind **every** Secrets Store secret in the account. This includes the secrets of other projects. Cloudflare has no narrower scope. Approve one of these before implementation:

- **A. Accept the token.** Use a dedicated Cloudflare account for dfe, so that the token reaches only dfe secrets. Accept the beta status, the unpublished price and the 100-secret limit.
- **B. Keep manual bindings.** No runtime write path. The UI shows the binding name and state of each connection. The owner sets the value in the Cloudflare dashboard or with `wrangler secrets-store secret update`. OAuth stays out of scope.
- **C. App-managed encryption.** A key-encryption key is a Cloudflare secret binding that the operator sets. The Worker encrypts each credential, and Convex stores only the ciphertext. No write token is necessary, but we become responsible for key rotation. ADR 0007 lists this option as an alternative and did not select it.

The recommendation is A on a dedicated account. Use B until the user approves A.

## Alternatives

- Per-Worker secrets API: each write makes a new Worker version, and the token can change Worker code.
- A Cloudflare token in Convex environment variables: this puts a production secret outside Cloudflare bindings, against #142.
- WorkOS Vault: the user did not select it in #142.

## Consequences

The app depends on a beta product. The slot count limits the number of stored credentials. Retired slots reduce this count until the operator adds slots. If an attacker gets control of the Worker, the attacker gets the Secrets Store write rights of the account. When a slot is cleared, the provider token stays valid. Only the OAuth disconnect step revokes it.

## Validation and revisit

Before acceptance: check that a deploy succeeds with slot bindings. Check that `PATCH` on a bound slot takes effect without a deploy, and measure the time until a new value is visible. Test slot reuse: a request with an old revision must fail. Test that no credential appears in Worker logs, Convex logs, MCP responses or retained browser state after submit. Check the price and the limits again when Secrets Store becomes GA.

Sources: [Secrets Store](https://developers.cloudflare.com/secrets-store/), [manage secrets](https://developers.cloudflare.com/secrets-store/manage-secrets/), [access control](https://developers.cloudflare.com/secrets-store/access-control/), [Workers integration](https://developers.cloudflare.com/secrets-store/integrations/workers/), [secrets API](https://developers.cloudflare.com/api/resources/secrets_store/), [Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/), [Worker limits](https://developers.cloudflare.com/workers/platform/limits/), [API limits](https://developers.cloudflare.com/fundamentals/api/reference/limits/).
