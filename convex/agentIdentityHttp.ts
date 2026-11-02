import { httpAction } from "./_generated/server"
import { internal } from "./_generated/api"
import {
  keyedDigest,
  randomToken,
  randomUserCode,
  sha256,
} from "./lib/agentAuthCrypto"
import { appOrigin, codeKey } from "./lib/agentAuthConfig"
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
    const siteUrl = new URL(request.url).origin
    const verificationUri = new URL("/claim", appOrigin())
    verificationUri.searchParams.set("claim_attempt_token", attemptToken)
    return Response.json(
      {
        registration_id: result.registrationId,
        registration_type: "service_auth",
        claim_url: `${siteUrl}/agent/identity/claim`,
        claim_token: claimToken,
        claim_token_expires: new Date(result.claimExpiresAt).toISOString(),
        post_claim_scopes: SCOPES.readwrite,
        claim: {
          user_code: userCode,
          expires_in: CLAIM_ATTEMPT_MS / 1000,
          verification_uri: verificationUri.toString(),
          interval: POLL_INTERVAL_SECONDS,
        },
      },
      { headers: noStore }
    )
  } catch {
    return oauthError(503, "temporarily_unavailable", "Try again later.")
  }
})
