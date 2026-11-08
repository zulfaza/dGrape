# ADR 0017: Write user credentials to Cloudflare Secrets Store slots

- Status: Proposed
- Date: 2026-11-08
- Basis: Issue #251. The user selected Cloudflare secret bindings as the production secret backend in #142.
- Related: [0007](0007-secret-references-and-vault-boundary.md), [0002](0002-platform-technology-boundaries.md)
- Open decision: give the production Worker an API token with the account-wide **Account Secrets Store Edit** permission.

## Context

Today an operator sets each connection secret by hand as a Cloudflare secret binding. Issue #251 asks for UI where a user enters a credential or connects an OAuth account, and for token refresh and revocation. Then the application must write secrets at runtime. Secrets must never go into collection values, recipe specs, HTML, MCP responses, logs or browser state.

Two Cloudflare write paths exist. Facts were checked on 2026-11-08 and must be checked again before acceptance:

|                   | Secrets Store                                                                                                             | Per-Worker secrets                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Status            | Open beta                                                                                                                 | GA                                                                  |
| Price             | No price published during beta                                                                                            | Included in Workers                                                 |
| Limits            | 1 store and 100 secrets for each account; value up to 64 KiB                                                              | 64 (Free) or 128 (Paid) variables for each Worker; value up to 5 KB |
| Write API         | `POST`, `PATCH`, `DELETE` on `/accounts/{account}/secrets_store/stores/{store}/secrets`                                   | `PUT /accounts/{account}/workers/scripts/{name}/secrets`            |
| Effect of a write | `PATCH` on a bound secret changes the value for all users of it, with no new version                                      | Each write makes a new Worker version                               |
| Token permission  | Account Secrets Store Edit: create, edit, delete and bind, for the full account. No store scope and no create-only scope. | Workers Scripts Write: can also change Worker code                  |
| Read back         | Never. Values are write-only.                                                                                             | Never                                                               |

A Worker reads a store secret only through a `secrets_store_secrets` binding (`store_id`, `secret_name`) declared at deploy time, with `await env.BINDING.get()`. No runtime API reads a secret by name. Thus a new secret name needs a new binding and a deploy. The global Cloudflare API limit is 1,200 requests in 5 minutes for each user.

Convex cannot read Cloudflare bindings. Connector requests run in a Convex action (`convex/lib/connectorFetch.ts`) today. Issue #142 moves secret resolution to the Worker.

## Proposed decision

Use Secrets Store with a fixed pool of pre-bound slots.

1. **Slots.** The deploy config binds N secrets, `CRED_SLOT_01` to `CRED_SLOT_N` (start with N = 20). Each has the `workers` scope and a placeholder value. Convex `secretRefs` keeps the slot that holds each reference, with the ownership, label, revision and lifecycle state that ADR 0007 sets. A slot holds one reference at a time. More slots need a deploy.
2. **Write path.** The browser sends the credential to an authenticated Worker route on the app origin, not to Convex. The Worker reserves a slot through a Convex mutation with metadata only. Then it calls `PATCH` on the slot with the Cloudflare token from a Worker secret binding (`SECRETS_STORE_TOKEN`), and marks the reference ready. Convex never calls the Cloudflare API and never holds the token or the value. The Worker does not log request bodies.
3. **Use path.** The Worker reads the slot binding and makes the connector request, as #142 sets. Only mapped scalar rows go back to Convex.
4. **OAuth.** The Worker starts the authorization code flow with PKCE and a state value bound to the session. It receives the callback and writes the refresh token, plus the access token and its expiry, to the slot. A refresh before a run replaces the slot value with `PATCH`, under the ADR 0007 write lease. Disconnect first calls the provider's revocation endpoint, then writes the placeholder to the slot and frees it. Each OAuth client secret is an operator-set binding.
5. **Failure.** A failed `PATCH` keeps the reference pending, as in ADR 0007. A reconcile job writes the placeholder to slots that have no ready reference.

## Decision needed from the user

This design gives the production Worker a token that can create, change, delete and bind **every** Secrets Store secret in the account, including the secrets of other projects. Cloudflare has no narrower scope. Approve one of these before implementation:

- **A. Accept the token.** Use a dedicated Cloudflare account for dfe, so that the token reaches only dfe secrets. Accept the beta status and the 100-secret limit.
- **B. Keep manual bindings.** No runtime write path. The UI shows each connection's binding name and state. The owner sets the value in the Cloudflare dashboard or with `wrangler secrets-store secret update`. OAuth stays out of scope.
- **C. App-managed encryption.** A key-encryption key is a Cloudflare secret binding set by hand. The Worker encrypts each credential, and Convex stores only the ciphertext. No write token is needed, but key rotation becomes our responsibility. ADR 0007 rejected this option before, so it needs a new decision.

The recommendation is A on a dedicated account. Use B until the user approves A.

## Alternatives

- Per-Worker secrets API: each write makes a new Worker version, and the token can change Worker code.
- A Cloudflare token in Convex environment variables: this puts a production secret outside Cloudflare bindings, against #142.
- WorkOS Vault: the user rejected it in #142.

## Consequences

The app depends on a beta product. The slot count limits the number of stored credentials. A breach of the Worker exposes the account's Secrets Store write rights. Deleting a slot value does not revoke a provider token. Only the OAuth disconnect step does that.

## Validation and revisit

Before acceptance: check that a deploy succeeds with slot bindings, that `PATCH` on a bound slot takes effect without a deploy, and the time until a new value is visible. Test that no credential appears in Worker logs, Convex logs, MCP responses or the browser after submit. Check the price and the limits again when Secrets Store becomes GA.

Sources: [Secrets Store](https://developers.cloudflare.com/secrets-store/), [manage secrets](https://developers.cloudflare.com/secrets-store/manage-secrets/), [access control](https://developers.cloudflare.com/secrets-store/access-control/), [Workers integration](https://developers.cloudflare.com/secrets-store/integrations/workers/), [secrets API](https://developers.cloudflare.com/api/resources/secrets_store/), [Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/), [Worker limits](https://developers.cloudflare.com/workers/platform/limits/), [API limits](https://developers.cloudflare.com/fundamentals/api/reference/limits/).
