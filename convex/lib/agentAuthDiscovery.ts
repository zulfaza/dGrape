import { appOrigin, issuer } from "./agentAuthConfig"
import {
  ACCESS_TOKEN_LIFETIME_MS,
  CLAIM_ATTEMPT_MS,
  CLAIM_WINDOW_MS,
  POLL_INTERVAL_SECONDS,
} from "./agentRegistration"
import { OFFERED_SCOPES, SCOPE_DESCRIPTIONS } from "./agentScope"
import { ASSERTION_LIFETIME_SECONDS } from "./identityAssertion"

/**
 * auth.md discovery documents. The structured metadata and the /auth.md
 * text are built from the same configuration and constants, so they cannot
 * describe different endpoints or lifetimes. Advertise only what this
 * service accepts: service_auth registration, the claim grant, and the
 * JWT-bearer grant.
 */

export const CLAIM_GRANT = "urn:workos:agent-auth:grant-type:claim"
export const JWT_BEARER_GRANT = "urn:ietf:params:oauth:grant-type:jwt-bearer"

/** The protected resource of the agent HTTP API on this deployment. */
export function apiResource() {
  return `${issuer()}/agent`
}

export function endpoints() {
  const base = issuer()
  return {
    identity: `${base}/agent/identity`,
    claim: `${base}/agent/identity/claim`,
    token: `${base}/oauth2/token`,
    revoke: `${base}/oauth2/revoke`,
    jwks: `${base}/.well-known/jwks.json`,
    skill: `${base}/auth.md`,
    protectedResource: `${base}/.well-known/oauth-protected-resource`,
  }
}

/** RFC 9728 metadata for a resource that this authorization server protects. */
export function protectedResourceMetadata(resource: string) {
  return {
    resource,
    resource_name: "DFE",
    authorization_servers: [issuer()],
    scopes_supported: OFFERED_SCOPES,
    bearer_methods_supported: ["header"],
  }
}

/** RFC 8414 metadata with the auth.md `agent_auth` block. */
export function authorizationServerMetadata() {
  const e = endpoints()
  return {
    issuer: issuer(),
    token_endpoint: e.token,
    revocation_endpoint: e.revoke,
    jwks_uri: e.jwks,
    grant_types_supported: [JWT_BEARER_GRANT, CLAIM_GRANT],
    scopes_supported: OFFERED_SCOPES,
    agent_auth: {
      skill: e.skill,
      identity_endpoint: e.identity,
      claim_endpoint: e.claim,
      identity_types_supported: ["service_auth"],
    },
  }
}

/** The agent-facing /auth.md document. */
export function authMd() {
  const e = endpoints()
  const app = appOrigin()
  const minutes = CLAIM_ATTEMPT_MS / 60_000
  const hours = CLAIM_WINDOW_MS / 3_600_000
  const tokenSeconds = ACCESS_TOKEN_LIFETIME_MS / 1000
  const assertionDays = ASSERTION_LIFETIME_SECONDS / 86_400
  const scopes = OFFERED_SCOPES.map(
    (scope) => `- \`${scope}\`: ${SCOPE_DESCRIPTIONS[scope]}`
  ).join("\n")
  return `# auth.md

DFE (${app}) is a workspace for collections of typed records that agents
read and write. This file tells you, the agent, how to get a token that
acts for your user in one of their workspaces. The authorization server is
${issuer()}. The MCP server is ${app}/mcp, and the HTTP API is under
${apiResource()}.

## 1. Discover

A request without a token gets \`401\` with a header like:

\`\`\`http
WWW-Authenticate: Bearer resource_metadata="${e.protectedResource}"
\`\`\`

Read that protected resource metadata, then
\`${issuer()}/.well-known/oauth-authorization-server\`. If the metadata and
this file disagree, the metadata is correct.

## 2. Pick a method

This service accepts only \`service_auth\`: you name your user's email, and
your user confirms on our site. Anonymous and agent-verified registration
are not supported.

## 3. Register

\`\`\`http
POST ${e.identity}
Content-Type: application/json

{ "type": "service_auth", "login_hint": "user@example.com" }
\`\`\`

\`\`\`json
{
  "registration_id": "…",
  "registration_type": "service_auth",
  "claim_url": "${e.claim}",
  "claim_token": "clm_…",
  "claim_token_expires": "…",
  "post_claim_scopes": ${JSON.stringify(OFFERED_SCOPES)},
  "claim": {
    "user_code": "123456",
    "expires_in": ${CLAIM_ATTEMPT_MS / 1000},
    "verification_uri": "${app}/claim?claim_attempt_token=…",
    "interval": ${POLL_INTERVAL_SECONDS}
  }
}
\`\`\`

Keep \`claim_token\` secret. One email can have at most 5 registrations
waiting at a time.

## 4. Claim

Show your user one message: "Open this link, sign in, and enter this
6-digit code: 123456", with \`verification_uri\`. Never ask the user to send
you the code. On the claim page the user signs in with the same email,
chooses a workspace and the scopes to grant, and types the code. The user
can grant fewer scopes than \`post_claim_scopes\`; the token response
names the granted scopes.

The code and link expire after ${minutes} minutes. For a new code, call:

\`\`\`http
POST ${e.claim}
Content-Type: application/json

{ "claim_token": "clm_…", "email": "user@example.com" }
\`\`\`

The response has a \`claim_attempt\` block with a new \`user_code\` and
\`verification_uri\`. The previous link stops working. After ${hours} hours,
register again.

Poll for the result, at most once every ${POLL_INTERVAL_SECONDS} seconds:

\`\`\`http
POST ${e.token}
Content-Type: application/x-www-form-urlencoded

grant_type=${CLAIM_GRANT}&claim_token=clm_…
\`\`\`

\`authorization_pending\` means the user has not finished. After the user
confirms, you get:

\`\`\`json
{
  "access_token": "…",
  "token_type": "Bearer",
  "expires_in": ${tokenSeconds},
  "scope": "data.read",
  "identity_assertion": "…",
  "assertion_expires": "…"
}
\`\`\`

The claim token works only once. Store \`identity_assertion\` in your secure
credential storage, never in a conversation or a report.

## 5. Exchange the assertion

When the access token expires, get a new one. The assertion stays valid for
${assertionDays} days unless the user revokes the registration.

\`\`\`http
POST ${e.token}
Content-Type: application/x-www-form-urlencoded

grant_type=${JWT_BEARER_GRANT}&assertion=…
\`\`\`

There is no refresh token.

## 6. Use the access token

Send \`Authorization: Bearer <access_token>\` to the MCP server
(${app}/mcp) or the HTTP API. The token works only in the workspace the user
chose, with the scopes the user chose. No scope includes another. A request
that needs a scope the token does not have gets \`403\` with the name of
that scope.

${scopes}

## 7. Errors

| Error | Endpoint | What to do |
| --- | --- | --- |
| \`anonymous_not_enabled\` | ${e.identity} | Use \`service_auth\`. |
| \`invalid_login_hint\` | ${e.identity} | Send your user's email. |
| \`invalid_request\` | any | Fix the request body. |
| \`rate_limited\` | ${e.identity}, ${e.claim} | Finish or wait for a pending registration, or register again. |
| \`invalid_claim_token\` | ${e.claim} | Send the claim token and email you registered with. |
| \`claimed_or_in_flight\` | ${e.claim} | Poll the token endpoint. |
| \`claim_expired\` | ${e.claim} | Register again. |
| \`authorization_pending\` | ${e.token} | Poll again after the interval. |
| \`slow_down\` | ${e.token} | Wait at least ${POLL_INTERVAL_SECONDS} more seconds between polls. |
| \`expired_token\` | ${e.token} | Get a new code from ${e.claim}, or register again. |
| \`invalid_grant\` | ${e.token} | The claim token was used, or the assertion expired or was revoked. Register again. |
| \`unsupported_grant_type\` | ${e.token} | Use one of the two grant types above. |

## 8. Revocation

Revoke one access token:

\`\`\`http
POST ${e.revoke}
Content-Type: application/x-www-form-urlencoded

token=<access_token>&token_type_hint=access_token
\`\`\`

The response is always \`200\`. Your user can revoke the whole registration
in DFE. After that, the assertion and every token issued to it stop
working.

## Contact

${app}
`
}
