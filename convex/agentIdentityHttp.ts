import { httpAction } from "./_generated/server"
import { internal } from "./_generated/api"
import {
  keyedDigest,
  randomAccessToken,
  randomToken,
  randomUserCode,
  sha256,
} from "./lib/agentAuthCrypto"
import { appOrigin, codeKey, issuer } from "./lib/agentAuthConfig"
import {
  publicJwks,
  signAssertion,
  verifyAssertion,
} from "./lib/identityAssertion"
import {
  CLAIM_ATTEMPT_MS,
  POLL_INTERVAL_SECONDS,
  SCOPES,
  parseLoginHint,
} from "./lib/agentRegistration"

/**
 * auth.md registration endpoint (`POST /agent/identity`). This service
 * accepts only `service_auth`: the agent names the user's email, and the
 * user confirms on the claim page before any access exists.
 */

const MAX_BODY_BYTES = 4 * 1024

/** auth.md responses carry tokens, so no cache may keep them. */
export const noStore = {
  "Cache-Control": "no-store",
  Pragma: "no-cache",
  "Access-Control-Allow-Origin": "*",
}

export function oauthError(status: number, error: string, description: string) {
  return Response.json(
    { error, error_description: description },
    { status, headers: noStore }
  )
}

async function readJson(request: Request): Promise<unknown> {
  const text = await request.text()
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) return undefined
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export const register = httpAction(async (ctx, request) => {
  const body = await readJson(request)
  if (!isObject(body))
    return oauthError(400, "invalid_request", "Send a JSON object.")
  if (body.type === "anonymous")
    return oauthError(
      400,
      "anonymous_not_enabled",
      'This service does not accept anonymous registration. Use "service_auth".'
    )
  if (body.type !== "service_auth")
    return oauthError(400, "invalid_request", 'Set "type" to "service_auth".')
  const loginHint = parseLoginHint(body.login_hint)
  if (!loginHint)
    return oauthError(
      400,
      "invalid_login_hint",
      "Set login_hint to the email address of the user you act for."
    )
  const claimToken = randomToken("clm")
  const attemptToken = randomToken("cat")
  const userCode = randomUserCode()
  try {
    const result = await ctx.runMutation(internal.agentRegistrations.register, {
      loginHint,
      claimTokenDigest: await sha256(claimToken),
      attemptTokenDigest: await sha256(attemptToken),
      userCodeDigest: await keyedDigest(codeKey(), userCode),
      now: Date.now(),
    })
    if (result.status === "rate_limited")
      return oauthError(
        429,
        "rate_limited",
        "This email has too many registrations waiting. Finish or wait for one of them."
      )
    const siteUrl = issuer()
    return Response.json(
      {
        registration_id: result.registrationId,
        registration_type: "service_auth",
        claim_url: `${siteUrl}/agent/identity/claim`,
        claim_token: claimToken,
        claim_token_expires: new Date(result.claimExpiresAt).toISOString(),
        post_claim_scopes: SCOPES.readwrite,
        claim: claimBlock(attemptToken, userCode),
      },
      { headers: noStore }
    )
  } catch {
    return oauthError(503, "temporarily_unavailable", "Try again later.")
  }
})

/** The claim link and code for one claim attempt, as auth.md returns them. */
function claimBlock(attemptToken: string, userCode: string) {
  const verificationUri = new URL("/claim", appOrigin())
  verificationUri.searchParams.set("claim_attempt_token", attemptToken)
  return {
    user_code: userCode,
    expires_in: CLAIM_ATTEMPT_MS / 1000,
    verification_uri: verificationUri.toString(),
    interval: POLL_INTERVAL_SECONDS,
  }
}

/**
 * `POST /agent/identity/claim`: a new code and link for a pending
 * registration, for example after `expired_token`.
 */
export const newClaim = httpAction(async (ctx, request) => {
  const body = await readJson(request)
  if (!isObject(body) || typeof body.claim_token !== "string")
    return oauthError(400, "invalid_request", "Send { claim_token, email }.")
  const email = parseLoginHint(body.email)
  if (!email)
    return oauthError(
      400,
      "invalid_request",
      "Send the same email you registered with."
    )
  const attemptToken = randomToken("cat")
  const userCode = randomUserCode()
  try {
    const result = await ctx.runMutation(
      internal.agentRegistrations.newClaimAttempt,
      {
        claimTokenDigest: await sha256(body.claim_token),
        email,
        attemptTokenDigest: await sha256(attemptToken),
        userCodeDigest: await keyedDigest(codeKey(), userCode),
        now: Date.now(),
      }
    )
    if (result.status === "invalid_claim_token")
      return oauthError(
        400,
        "invalid_claim_token",
        "The claim token is not valid for this email."
      )
    if (result.status === "claimed_or_in_flight")
      return oauthError(
        409,
        "claimed_or_in_flight",
        "This registration is already claimed. Poll /oauth2/token or exchange your identity_assertion."
      )
    if (result.status === "claim_expired")
      return oauthError(
        410,
        "claim_expired",
        "The claim window closed. Register again."
      )
    if (result.status === "rate_limited")
      return oauthError(
        429,
        "rate_limited",
        "Too many codes for this registration. Register again."
      )
    return Response.json(
      {
        registration_id: result.registrationId,
        claim_attempt_id: result.claimAttemptId,
        status: "initiated",
        expires_at: new Date(result.expiresAt).toISOString(),
        claim_attempt: claimBlock(attemptToken, userCode),
      },
      { headers: noStore }
    )
  } catch {
    return oauthError(503, "temporarily_unavailable", "Try again later.")
  }
})

const CLAIM_GRANT = "urn:workos:agent-auth:grant-type:claim"
const JWT_BEARER_GRANT = "urn:ietf:params:oauth:grant-type:jwt-bearer"

/** Reads an `application/x-www-form-urlencoded` body of at most 16 KiB. */
async function readForm(request: Request) {
  const text = await request.text()
  if (new TextEncoder().encode(text).length > 16 * 1024) return null
  return new URLSearchParams(text)
}

function tokenResponse(body: Record<string, unknown>) {
  return Response.json(body, { headers: noStore })
}

/** `POST /oauth2/token`: the claim grant and the JWT-bearer grant. */
export const token = httpAction(async (ctx, request) => {
  const form = await readForm(request)
  if (!form)
    return oauthError(400, "invalid_request", "The request body is too large.")
  const grantType = form.get("grant_type")
  try {
    if (grantType === CLAIM_GRANT) {
      const claimToken = form.get("claim_token")
      if (!claimToken)
        return oauthError(400, "invalid_request", "Send claim_token.")
      const accessToken = randomAccessToken()
      const now = Date.now()
      const result = await ctx.runMutation(
        internal.agentRegistrations.pollClaim,
        {
          claimTokenDigest: await sha256(claimToken),
          accessTokenDigest: await sha256(accessToken),
          now,
        }
      )
      if (result.status === "pending")
        return oauthError(
          400,
          "authorization_pending",
          "The user has not confirmed yet. Poll again after the interval."
        )
      if (result.status === "slow_down")
        return oauthError(
          400,
          "slow_down",
          `Poll at most once every ${POLL_INTERVAL_SECONDS} seconds.`
        )
      if (result.status === "expired")
        return oauthError(
          400,
          "expired_token",
          "The code or the claim window expired. Start a new claim attempt or register again."
        )
      if (result.status === "used")
        return oauthError(
          400,
          "invalid_grant",
          "This claim token was already used. Exchange your identity_assertion instead."
        )
      const assertion = await signAssertion(
        issuer(),
        result.registrationId,
        result.email,
        now
      )
      return tokenResponse({
        access_token: accessToken,
        token_type: "Bearer",
        expires_in: Math.round((result.expiresAt - now) / 1000),
        scope: SCOPES[result.scope].join(" "),
        identity_assertion: assertion.assertion,
        assertion_expires: new Date(assertion.expiresAt).toISOString(),
      })
    }
    if (grantType === JWT_BEARER_GRANT) {
      const assertion = form.get("assertion")
      const registrationId =
        assertion && (await verifyAssertion(issuer(), assertion))
      if (!registrationId)
        return oauthError(
          400,
          "invalid_grant",
          "The assertion is expired or not valid. Register again."
        )
      const accessToken = randomAccessToken()
      const now = Date.now()
      const result = await ctx.runMutation(
        internal.agentRegistrations.exchangeAssertion,
        {
          registrationId,
          accessTokenDigest: await sha256(accessToken),
          now,
        }
      )
      if (result.status !== "issued")
        return oauthError(
          400,
          "invalid_grant",
          "This registration was revoked. Register again."
        )
      return tokenResponse({
        access_token: accessToken,
        token_type: "Bearer",
        expires_in: Math.round((result.expiresAt - now) / 1000),
        scope: SCOPES[result.scope].join(" "),
      })
    }
    return oauthError(
      400,
      "unsupported_grant_type",
      `Use grant_type ${CLAIM_GRANT} or ${JWT_BEARER_GRANT}.`
    )
  } catch {
    return oauthError(503, "temporarily_unavailable", "Try again later.")
  }
})

/** `POST /oauth2/revoke` (RFC 7009). Always 200, so tokens cannot be probed. */
export const revoke = httpAction(async (ctx, request) => {
  const form = await readForm(request)
  const value = form?.get("token")
  if (value && /^[a-f0-9]{64}$/.test(value))
    await ctx.runMutation(internal.agentRegistrations.revokeAccessToken, {
      digest: await sha256(value),
    })
  return new Response(null, { status: 200, headers: noStore })
})

/** `GET /.well-known/jwks.json`: the key that signs identity assertions. */
export const jwks = httpAction(async () =>
  Response.json(publicJwks(), {
    headers: {
      "Cache-Control": "public, max-age=300",
      "Access-Control-Allow-Origin": "*",
    },
  })
)
