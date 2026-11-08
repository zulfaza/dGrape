import { Option, Schema } from "effect"
import { httpAction, type ActionCtx } from "./_generated/server"
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
  CLAIM_GRANT,
  JWT_BEARER_GRANT,
  apiResource,
  authMd,
  authorizationServerMetadata,
  endpoints,
  protectedResourceMetadata,
} from "./lib/agentAuthDiscovery"
import {
  publicJwks,
  signAssertion,
  verifyAssertion,
} from "./lib/identityAssertion"
import {
  CLAIM_ATTEMPT_MS,
  POLL_INTERVAL_SECONDS,
  parseLoginHint,
} from "./lib/agentRegistration"
import { OFFERED_SCOPES } from "./lib/agentScope"
import {
  ID_JAG_ASSERTION_TYPE,
  MAX_AUTH_AGE_SECONDS,
  verifyProviderAssertion,
  type AssertionFailure,
} from "./lib/providerAssertion"
import { trustedIssuers } from "./lib/trustedIssuers"

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

/** The fields `POST /agent/identity` reads. Other fields are ignored. */
const RegisterRequest = Schema.Struct({
  type: Schema.optionalKey(Schema.Unknown),
  login_hint: Schema.optionalKey(Schema.Unknown),
  assertion_type: Schema.optionalKey(Schema.Unknown),
  assertion: Schema.optionalKey(Schema.Unknown),
})

/** The fields of an agent-verified registration request. */
const AssertionRequest = Schema.Struct({
  assertion_type: Schema.Literal(ID_JAG_ASSERTION_TYPE),
  assertion: Schema.NonEmptyString,
})
const decodeAssertionRequest = Schema.decodeUnknownOption(AssertionRequest)

/** The fields `POST /agent/identity/claim` reads. Other fields are ignored. */
const NewClaimRequest = Schema.Struct({
  claim_token: Schema.String,
  email: Schema.optionalKey(Schema.Unknown),
})

const isText = Schema.is(Schema.String)

/**
 * Reads a JSON body of at most 4 KiB and decodes it with `schema`. Returns
 * `None` when the body is too large, is not JSON, or does not match.
 */
async function readJson<S extends Schema.Codec<unknown, unknown>>(
  request: Request,
  schema: S
): Promise<Option.Option<S["Type"]>> {
  const text = await request.text()
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES)
    return Option.none()
  return Schema.decodeUnknownOption(Schema.fromJsonString(schema))(text)
}

export const register = httpAction(async (ctx, request) => {
  const decoded = await readJson(request, RegisterRequest)
  if (Option.isNone(decoded))
    return oauthError(400, "invalid_request", "Send a JSON object.")
  const body = decoded.value
  if (body.type === "anonymous")
    return oauthError(
      400,
      "anonymous_not_enabled",
      'This service does not accept anonymous registration. Use "service_auth".'
    )
  if (body.type === "identity_assertion")
    return registerWithAssertion(ctx, decodeAssertionRequest(body))
  if (body.type !== "service_auth")
    return oauthError(400, "invalid_request", 'Set "type" to "service_auth".')
  const loginHint = isText(body.login_hint)
    ? parseLoginHint(body.login_hint)
    : null
  if (!loginHint)
    return oauthError(
      400,
      "invalid_login_hint",
      "Set login_hint to the email address of the user you act for."
    )
  const claim = newClaimSecrets()
  try {
    const result = await ctx.runMutation(internal.agentRegistrations.register, {
      loginHint,
      ...(await claim.digests()),
    })
    if (result.status === "rate_limited") return tooManyPending()
    return Response.json(pendingRegistration("service_auth", result, claim), {
      headers: noStore,
    })
  } catch {
    return oauthError(503, "temporarily_unavailable", "Try again later.")
  }
})

/** A new claim token, claim attempt token, and user code. */
function newClaimSecrets() {
  const claimToken = randomToken("clm")
  const attemptToken = randomToken("cat")
  const userCode = randomUserCode()
  return {
    claimToken,
    attemptToken,
    userCode,
    /** The digests that the registration mutations store. */
    digests: async () => ({
      claimTokenDigest: await sha256(claimToken),
      attemptTokenDigest: await sha256(attemptToken),
      userCodeDigest: await keyedDigest(codeKey(), userCode),
      now: Date.now(),
    }),
  }
}

function tooManyPending() {
  return oauthError(
    429,
    "rate_limited",
    "This email has too many registrations waiting. Finish or wait for one of them."
  )
}

/** The registration and claim fields of a pending registration. */
function pendingRegistration(
  type: "service_auth" | "identity_assertion",
  result: { registrationId: string; claimExpiresAt: number },
  claim: ReturnType<typeof newClaimSecrets>
) {
  return {
    registration_id: result.registrationId,
    registration_type: type,
    claim_url: endpoints().claim,
    claim_token: claim.claimToken,
    claim_token_expires: new Date(result.claimExpiresAt).toISOString(),
    post_claim_scopes: OFFERED_SCOPES,
    claim: claimBlock(claim.attemptToken, claim.userCode),
  }
}

/** A 401 with the auth.md `AgentAuth` challenge. */
function agentAuthChallenge(
  error: "interaction_required" | "login_required",
  description: string,
  body: { max_age: number } | ReturnType<typeof pendingRegistration>,
  maxAge?: number
) {
  const params = [
    `error="${error}"`,
    ...(maxAge === undefined ? [] : [`max_age="${maxAge}"`]),
    `error_description="${description}"`,
  ]
  return Response.json(
    { error, error_description: description, ...body },
    {
      status: 401,
      headers: {
        ...noStore,
        "Access-Control-Expose-Headers": "WWW-Authenticate",
        "WWW-Authenticate": `AgentAuth ${params.join(", ")}`,
      },
    }
  )
}

/** Descriptions of the refused provider assertions, by auth.md error code. */
const ASSERTION_ERRORS: Record<
  Exclude<AssertionFailure, "login_required">,
  string
> = {
  invalid_request: "The assertion is malformed or misses a required claim.",
  invalid_issuer: "This service does not trust the assertion issuer.",
  invalid_signature: "The assertion signature could not be verified.",
  expired: "The assertion expired. Get a new one from your provider.",
  invalid_audience:
    "Set the assertion audience to the issuer in /.well-known/oauth-authorization-server.",
  invalid_client_id: "The assertion client_id is not the trusted provider.",
  missing_verified_email: "The assertion needs a verified email.",
}

/**
 * Agent-verified registration (`type: "identity_assertion"`). A trusted
 * provider's ID-JAG names the user. The first time, the user confirms on the
 * claim page, as in service_auth; after that, the same provider user gets
 * the linked registration's identity assertion at once.
 */
async function registerWithAssertion(
  ctx: ActionCtx,
  request: Option.Option<typeof AssertionRequest.Type>
) {
  if (trustedIssuers().length === 0)
    return oauthError(
      400,
      "identity_assertion_not_enabled",
      'This service trusts no agent provider. Use "service_auth".'
    )
  if (Option.isNone(request))
    return oauthError(
      400,
      "invalid_request",
      `Send assertion_type "${ID_JAG_ASSERTION_TYPE}" and the assertion.`
    )
  const now = Date.now()
  const verified = await verifyProviderAssertion(
    request.value.assertion,
    issuer(),
    now
  )
  if (verified.status === "invalid") {
    if (verified.error === "login_required")
      return agentAuthChallenge(
        "login_required",
        "The user signed in at the provider too long ago. Ask the user to sign in again.",
        { max_age: MAX_AUTH_AGE_SECONDS },
        MAX_AUTH_AGE_SECONDS
      )
    return oauthError(400, verified.error, ASSERTION_ERRORS[verified.error])
  }
  const { identity } = verified
  const claim = newClaimSecrets()
  try {
    const result = await ctx.runMutation(
      internal.agentRegistrations.registerVerified,
      {
        issuer: identity.provider.issuer,
        subject: identity.subject,
        email: identity.email,
        jti: identity.jti,
        replayExpiresAt: identity.replayExpiresAt,
        ...(await claim.digests()),
      }
    )
    if (result.status === "replay_detected")
      return oauthError(
        400,
        "replay_detected",
        "This assertion was already used. Get a new one from your provider."
      )
    if (result.status === "rate_limited") return tooManyPending()
    if (result.status === "registered")
      return agentAuthChallenge(
        "interaction_required",
        "The user must confirm this agent once. Show them the claim link and code.",
        pendingRegistration("identity_assertion", result, claim)
      )
    const signed = await signAssertion(
      issuer(),
      result.registrationId,
      identity.email,
      now
    )
    return Response.json(
      {
        registration_id: result.registrationId,
        registration_type: "identity_assertion",
        identity_assertion: signed.assertion,
        assertion_expires: new Date(signed.expiresAt).toISOString(),
        scopes: result.scopes,
      },
      { headers: noStore }
    )
  } catch {
    return oauthError(503, "temporarily_unavailable", "Try again later.")
  }
}

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
  const decoded = await readJson(request, NewClaimRequest)
  if (Option.isNone(decoded))
    return oauthError(400, "invalid_request", "Send { claim_token, email }.")
  const body = decoded.value
  const email = isText(body.email) ? parseLoginHint(body.email) : null
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

/** Reads an `application/x-www-form-urlencoded` body of at most 16 KiB. */
async function readForm(request: Request) {
  const text = await request.text()
  if (new TextEncoder().encode(text).length > 16 * 1024) return null
  return new URLSearchParams(text)
}

/** A successful `/oauth2/token` body. Only the claim grant has an assertion. */
type TokenResponse = {
  access_token: string
  token_type: "Bearer"
  expires_in: number
  scope: string
  identity_assertion?: string
  assertion_expires?: string
}

function tokenResponse(body: TokenResponse) {
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
        scope: result.scopes.join(" "),
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
        scope: result.scopes.join(" "),
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

const publicJson = {
  "Cache-Control": "public, max-age=300",
  "Access-Control-Allow-Origin": "*",
}

/** `GET /.well-known/oauth-authorization-server` (RFC 8414 + auth.md). */
export const authorizationServer = httpAction(async () =>
  Response.json(authorizationServerMetadata(), { headers: publicJson })
)

/** `GET /.well-known/oauth-protected-resource` for the agent HTTP API. */
export const protectedResource = httpAction(async () =>
  Response.json(protectedResourceMetadata(apiResource()), {
    headers: publicJson,
  })
)

/** `GET /auth.md`: registration instructions for agents. */
export const skill = httpAction(
  async () =>
    new Response(authMd(), {
      headers: {
        ...publicJson,
        "Content-Type": "text/markdown; charset=utf-8",
      },
    })
)

/** A 401 that points agents to the discovery metadata. */
export function unauthorized() {
  return new Response("Unauthorized", {
    status: 401,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Expose-Headers": "WWW-Authenticate",
      "WWW-Authenticate": `Bearer resource_metadata="${endpoints().protectedResource}"`,
    },
  })
}
