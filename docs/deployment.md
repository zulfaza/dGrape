# CI and production deployment

CI runs on pull requests and pushes to main. It uses Node 24.18.0 and pnpm
12.10.1, a frozen lockfile, frontend/backend/design-system type checks, lint,
Vitest, both builds, and an offline `cf deploy --prebuilt --dry-run`.
Fork PRs get no deployment secrets. Checkout does not keep its GitHub token.
Vitest runs the repository test suite; its existing passWithNoTests policy remains.

Formatting checks cover changed TS/JS/JSON source files, excluding generated
Convex files. The full `pnpm check` fails on 28 existing files as of main
66e8323; fixing that baseline is separate work. Manual deployment validation
has no comparison base and runs the other checks; the selected main commit
must already have passed PR CI.

## Production setup

`deploy.yml` has only a manual trigger from main. Pushes and merges cannot
deploy. Each run waits for approval on the `production` environment before
any secret-bearing step starts. The job guard had a literal `false` until
#141 removed it. An owner must complete and verify this setup before the
first run:

1. In Settings → Environments, create `production`. Require reviewers, prevent
   self-review, and disable administrator bypass. Restrict deployment branches
   to `main`. Confirm the repository plan supports and enforces these rules.
   If required approval is unavailable, leave the source guard disabled.
2. In Settings → Rules → Rulesets (or branch protection), protect main with
   required PR review and the `checks` status from CI. Use the actual status
   name shown by a completed PR. Do not enable bypass for the deploy workflow.
3. Add the following **environment** settings, not repository-wide credentials.
   Use GitHub's secret editor or an approved secret delivery tool. Never put
   values in commits, workflow inputs, issues, or logs.

| Kind | Name | Value/purpose |
| --- | --- | --- |
| Variable | `CONVEX_DEPLOYMENT_NAME` | Exact existing production deployment name, without `prod:` |
| Variable | `CLOUDFLARE_ACCOUNT_ID` | Account containing existing Worker `dfe` |
| Secret | `CONVEX_DEPLOY_KEY` | Production deployment key for that exact deployment (`prod:<name>\|…`), not a project/preview/dev key |
| Secret | `CLOUDFLARE_API_TOKEN` | Token restricted to the target account and required Worker deployment permissions |
| Secret | `WORKOS_CLIENT_ID` | Production WorkOS client ID |
| Secret | `WORKOS_API_KEY` | Production WorkOS API key |
| Secret | `WORKOS_COOKIE_PASSWORD` | Existing production cookie encryption password |
| Secret | `WORKOS_REDIRECT_URI` | `https://dfe.makarima.dev/callback` |
| Secret | `SECRET_BINDING_TOKEN` | At least 32 random characters. Convex sends it to the Worker to read secretRef values. Use the same value in Convex |

4. Verify existing resources before enabling. The Worker and its custom domain
   must already exist. Review the account-scoped Workers Scripts edit permission
   and any permissions needed by existing bindings/custom-domain configuration
   against Cloudflare's token documentation. Do not grant account-wide admin.
   Deployment uses `--provision=false` to reject missing binding resources.
   The existing `cloudflare.config.ts` remains the source of Worker domains,
   bindings and triggers; CI does not introduce another infra config.
5. Configure and verify Convex production environment settings separately:
   `WORKOS_CLIENT_ID`, `WORKOS_API_KEY`, `APP_ORIGIN=https://dfe.makarima.dev`,
   `AGENT_AUTH_CODE_KEY`, `AGENT_AUTH_SIGNING_KEY`, and the artifact component's
   `R2_BUCKET`, `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`.
   For connector credentials (ADR 0007), also set
   `SECRET_VAULT_PROVIDER=cloudflare`, `SECRET_BINDING_TOKEN` (the same value
   as the GitHub environment secret), and `CONNECTOR_ALLOWED_ORIGINS`. See
   "Connector credentials" below.
   `CONVEX_SITE_URL` is provided by Convex. Check existing auth/agent and artifact
   setup docs for key formats. Verify WorkOS allows the production callback.
   This workflow does not set Convex runtime variables or run data migrations.
6. Coordinate with the secrets/connectors and recipes/Workflow/Cron owners
   before enabling. Add any new Worker runtime secrets to both the preflight
   and JSON secret upload; add bindings/triggers in the owned Cloudflare config.
   Pre-provision new resources through a separately authorized change. Verify
   secret service credentials on their actual runtime (Worker or Convex).
7. #141 removed `false &&` from the deploy guard. Verify the first manual
   run waits for a different reviewer's approval before
   any secret-bearing step starts. Do not approve it without production release
   authorization. A missing environment can be auto-created without protection;
   its name alone is not an approval gate.

## Connector credentials

Connector credentials (secretRefs) are Cloudflare Worker secrets on `dfe`
(ADR 0007). Convex runs connector requests, so it reads each value from the
Worker at `APP_ORIGIN` + `/internal/secrets/resolve` with
`SECRET_BINDING_TOKEN`. The Worker gives only `SECRET_REF_*` secrets.

| Runtime | Name | Value/purpose |
| --- | --- | --- |
| Convex | `SECRET_VAULT_PROVIDER` | `cloudflare`. Without it, or without the next two settings, every credential call fails |
| Convex | `APP_ORIGIN` | `https://dfe.makarima.dev`, the Worker origin (also used by agent auth) |
| Convex | `SECRET_BINDING_TOKEN` | Same value as the Worker secret |
| Convex | `CONNECTOR_ALLOWED_ORIGINS` | Comma-separated HTTPS origins that HTTP connections can call, without paths or trailing slashes. Empty denies all. GitHub connections do not need it |
| Worker | `SECRET_BINDING_TOKEN` | Declared in `cloudflare.config.ts`; the deploy uploads it |
| Worker | `SECRET_REF_<NAME>` | One secret for each credential. Not declared; `cf deploy` keeps them |

Users cannot store credential values through settings with this backend.
Never type a real credential in the settings form. To add one, the workspace
owner and an operator do these steps:

1. In settings, the owner enters a name and a placeholder such as `pending`
   in "API key or token", then selects **Store credential**. The save fails
   with an error, and the credential stays pending. The failed save holds a
   60-second write lease.
2. The operator reads the pending reference's `state.name` (a UUID) in the
   Convex dashboard data view, table `secretRefs`. Read only; do not edit.
3. The binding name is `SECRET_REF_` and the UUID in upper case, with `_` in
   place of `-`. Example: `0f8b2c4e-1a2b-…` becomes `SECRET_REF_0F8B2C4E_1A2B_…`.
4. The operator adds a Worker secret with that name on `dfe`: Workers →
   `dfe` → Settings → Variables and Secrets, or `cf workers secrets update`.
   Adding a Worker secret deploys a new Worker version.
5. After the lease expires, the owner leaves the pending credential's field
   empty and selects **Save**. The credential becomes ready.

To rotate, start the rotation in settings and add the new binding. Then
delete the old binding and save an empty value. To delete, start the deletion
in settings, delete the binding, and retry the deletion. Each step fails until
the old binding is gone. After a failed save, wait 60 seconds before the retry. A Worker holds at most 128 variables and
secrets (Workers paid plan), so this backend suits a single owner.
Deleting a binding does not revoke the token with its provider.

## Release procedure after setup

Select Actions → Deploy production → Run workflow, choose main and production.
Review the selected commit and green CI, target deployment, schema changes,
bindings, domain and environment settings before approving the environment.
The job validates that the key is scoped to the selected production deployment,
then deploys Convex, builds against that deployment's cloud/site URLs, validates
Worker output, and deploys the prebuilt Worker `dfe` to the selected account.
WorkOS values are uploaded as JSON secrets from a temporary mode-0600 file that
is deleted on exit. They are never embedded as Vite public variables.

Production runs are serialized and are not cancelled mid-release. Backend and
Worker deployment are not atomic: if a later step fails, the backend may already
be updated. Use backward-compatible schema/API changes; inspect failures and
approve a deliberate retry or rollback. Do not automatically undo database data.

There are no PR/feature deploys. In particular CI never targets shared dev
`mild-swan-103`. Local proof uses placeholder Convex URLs and offline Cloudflare
validation. No Convex deploy/dry-run with live credentials is needed for CI proof.
An isolated live preview and the first approved production release remain
operator checks; no live deployment was made for this pipeline change.

References: [cf CI](https://developers.cloudflare.com/cf/ci/),
[cf deployment options](https://developers.cloudflare.com/cf/projects/),
[Convex deploy](https://docs.convex.dev/cli/reference/deploy), and
[Convex custom hosting](https://docs.convex.dev/production/hosting/custom).
The pinned Convex 1.41.0 CLI runs `--cmd` before backend deployment, so the
workflow deliberately uses separate commands to deploy the backend first.
