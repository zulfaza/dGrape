# ADR 0007: Keep credentials behind a server-side secret service

- Status: Accepted (2026-11-08; vendor choice: Cloudflare Worker secret bindings)
- Date: 2026-11-02

## Context

Users may configure third-party API credentials. Ordinary flexible records, model transcripts, job checkpoints, and report artifacts are inappropriate places for their plaintext values. AuthKit's free allowance does not establish Vault's production pricing.

## Proposed decision

Introduce SecretService for storing, replacing, deleting, and using credentials. Convex secretRefs stores workspace/optional user ownership, safe labels, provider object IDs, revision, and lifecycle state. Connections and explicit secretRef fields hold references only. Generic record reads, indexes, exports, and dashboards do not reveal values.

Prefer WorkOS Vault hosted encrypted objects if production terms are suitable. Scope encryption context using server-resolved organization/workspace mappings, while independently checking membership and connection-use grants. Private user credentials require separate grants within a workspace. Keep platform API/signing keys in server-managed secrets such as Worker secret bindings.

Collect credentials through a dedicated authenticated HTTPS settings flow without body capture or analytics. Agents request setup/reference IDs rather than plaintext. Trusted connector execution resolves secrets just in time, checks allowed destinations/operations, and sanitizes results. Retrieval and authenticated requests happen inside one execution step; plaintext must not enter durable step outputs, logs, URLs, or checkpoints.

Use retry-safe pending/ready/deleting metadata states and reconcile failed Vault/Convex changes. Rotation changes future requests. Deleting stored credentials does not itself revoke the third-party token.

## Decision (2026-11-08)

The user selected Cloudflare Worker secret bindings as the production secret backend, not WorkOS Vault. This acceptance covers the SecretService boundary above and this vendor choice. It does not authorize a deployment.

- Each secretRef value is a `SECRET_REF_*` secret on Worker `dfe`. The name comes from the reference's server-generated object name. An operator adds and deletes these secrets. Users do not store values through settings.
- Convex runs connector requests. Its SecretService adapter reads one value from the Worker endpoint `/internal/secrets/resolve` with the `SECRET_BINDING_TOKEN` bearer token. The Worker gives only `SECRET_REF_*` secrets.
- The adapter cannot write. Rotation and deletion finish only after the operator deletes the old secret.
- A Worker holds at most 128 variables and secrets. This backend suits the single-owner first milestone. Multi-tenant, user-entered credentials need a new decision.

docs/deployment.md lists the settings and operator steps.

## Alternatives

- Plaintext fields or masked inputs: masking does not prevent server/query exposure.
- WorkOS Vault: hosted per-workspace objects and user-managed credentials, but production pricing and limits were not confirmed. Not selected.
- Static Worker bindings only: suitable for initial operator configuration, but awkward for user-managed credentials. Selected for the first milestone.
- Application-managed encryption: possible, with added key lifecycle and rotation responsibility.

## Consequences

Worker availability becomes a connector dependency, and each credential change needs an operator. Encryption does not replace authorization or network restrictions. Pattern detection may reject recognizable pasted tokens, but cannot guarantee sanitization of arbitrary text/files. Response mapping must also prevent token-bearing API responses from entering normal data.

## Validation and revisit

Test ownership, rotation/deletion failures, redacted errors, echoed credentials, and denied destinations. Revisit before user-entered or multi-tenant credentials; Vault production costs were not confirmed. Pricing observations are dated 2026-11-02 and must be rechecked. Sources: [Vault](https://workos.com/docs/vault), [pricing](https://workos.com/pricing), [Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/).
