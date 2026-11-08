import {
  createRemoteJWKSet,
  decodeJwt,
  errors,
  jwtVerify,
  type JWTPayload,
} from "jose"
import { Option, Schema } from "effect"
import { parseLoginHint } from "./agentRegistration"
import { findTrustedIssuer, type TrustedIssuer } from "./trustedIssuers"

/**
 * Verification of identity assertions (ID-JAG, `oauth-id-jag+jwt`) that a
 * trusted agent provider signs, for agent-verified auth.md registration.
 * The provider must be in the pinned registry (convex/lib/trustedIssuers.ts),
 * and its key must come from the pinned `jwks_uri`. jose does the signature
 * and standard claim checks; this module adds the auth.md rules.
 *
 * A valid assertion is not yet accepted: the caller must also record its
 * `jti` (convex/lib/assertionReplay.ts) in the same transaction that uses it.
 */

export const ID_JAG_TYPE = "oauth-id-jag+jwt"
export const ID_JAG_ASSERTION_TYPE = "urn:ietf:params:oauth:token-type:id-jag"

/** Asymmetric algorithms only, so a shared secret cannot sign an assertion. */
const ALGORITHMS = ["ES256", "ES384", "RS256", "PS256", "EdDSA"]
/** Allowed difference between the provider's clock and this service's. */
export const CLOCK_SKEW_SECONDS = 60
/** The longest assertion lifetime (`exp - iat`) this service accepts. */
const MAX_ASSERTION_LIFETIME_SECONDS = 10 * 60
/** How long ago the user may have last signed in at the provider. */
export const MAX_AUTH_AGE_SECONDS = 60 * 60
const MAX_JTI_LENGTH = 256

/** Why an assertion was refused, as the auth.md error code. */
export type AssertionFailure =
  | "invalid_request"
  | "invalid_issuer"
  | "invalid_signature"
  | "expired"
  | "invalid_audience"
  | "invalid_client_id"
  | "missing_verified_email"
  | "login_required"

/** The user identity in a valid provider assertion. */
export type ProviderIdentity = {
  provider: TrustedIssuer
  /** The provider's opaque user identifier. */
  subject: string
  /** The lowercased verified email. */
  email: string
  jti: string
  /** Until when the `jti` must stay recorded, in milliseconds. */
  replayExpiresAt: number
}

export type VerifiedAssertion =
  | { status: "valid"; identity: ProviderIdentity }
  | { status: "invalid"; error: AssertionFailure }

/** The unverified issuer, read only to pick the pinned key set. */
const decodeIssuer = Schema.decodeUnknownOption(
  Schema.Struct({ iss: Schema.String })
)

/** The claims every accepted assertion has. Other claims are read apart. */
const decodeClaims = Schema.decodeUnknownOption(
  Schema.Struct({
    sub: Schema.NonEmptyString,
    jti: Schema.NonEmptyString.check(Schema.isMaxLength(MAX_JTI_LENGTH)),
    iat: Schema.Number,
    exp: Schema.Number,
    /** When the user last signed in at the provider, in seconds. */
    auth_time: Schema.Number,
  })
)

/** auth.md needs a verified email or phone; this service needs the email. */
const decodeVerifiedEmail = Schema.decodeUnknownOption(
  Schema.Struct({ email: Schema.String, email_verified: Schema.Literal(true) })
)

/** Remote key sets by URL. jose caches keys and refetches on a new `kid`. */
const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>()

/** The key set at a pinned `jwks_uri`. */
function providerKeys(jwksUri: string) {
  const existing = keySets.get(jwksUri)
  if (existing) return existing
  const keys = createRemoteJWKSet(new URL(jwksUri), {
    cacheMaxAge: 10 * 60 * 1000,
  })
  keySets.set(jwksUri, keys)
  return keys
}

/** Maps a jose verification error to an auth.md error code. */
function verificationFailure(error: Error): AssertionFailure {
  if (error instanceof errors.JWTExpired) return "expired"
  if (error instanceof errors.JWTClaimValidationFailed)
    return error.claim === "aud" ? "invalid_audience" : "invalid_request"
  if (error instanceof errors.JWTInvalid || error instanceof errors.JWSInvalid)
    return "invalid_request"
  // A bad signature, an unknown `kid`, a disallowed algorithm, or a key set
  // that could not be fetched.
  return "invalid_signature"
}

/**
 * Verifies a provider assertion for this service (`audience`) at `now`
 * (milliseconds). Returns the identity, or the auth.md error code.
 */
export async function verifyProviderAssertion(
  assertion: string,
  audience: string,
  now: number
): Promise<VerifiedAssertion> {
  const invalid = (error: AssertionFailure): VerifiedAssertion => ({
    status: "invalid",
    error,
  })
  let unverified: JWTPayload
  try {
    unverified = decodeJwt(assertion)
  } catch {
    return invalid("invalid_request")
  }
  const issuer = decodeIssuer(unverified)
  const provider = Option.isSome(issuer)
    ? findTrustedIssuer(issuer.value.iss)
    : null
  if (!provider) return invalid("invalid_issuer")
  let payload: JWTPayload
  try {
    const verified = await jwtVerify(
      assertion,
      providerKeys(provider.jwksUri),
      {
        issuer: provider.issuer,
        audience,
        typ: ID_JAG_TYPE,
        algorithms: ALGORITHMS,
        clockTolerance: CLOCK_SKEW_SECONDS,
        // Also rejects an `iat` in the future.
        maxTokenAge: MAX_ASSERTION_LIFETIME_SECONDS,
        requiredClaims: ["sub", "jti", "iat", "exp"],
        currentDate: new Date(now),
      }
    )
    payload = verified.payload
  } catch (error) {
    return invalid(
      error instanceof Error ? verificationFailure(error) : "invalid_signature"
    )
  }
  const claims = decodeClaims(payload)
  if (Option.isNone(claims)) return invalid("invalid_request")
  const { sub, jti, iat, exp, auth_time: authTime } = claims.value
  if (exp - iat > MAX_ASSERTION_LIFETIME_SECONDS)
    return invalid("invalid_request")
  if (payload.client_id !== provider.clientId)
    return invalid("invalid_client_id")
  const verifiedEmail = decodeVerifiedEmail(payload)
  const email = Option.isSome(verifiedEmail)
    ? parseLoginHint(verifiedEmail.value.email)
    : null
  if (!email) return invalid("missing_verified_email")
  const nowSeconds = now / 1000
  if (authTime > nowSeconds + CLOCK_SKEW_SECONDS)
    return invalid("invalid_request")
  if (nowSeconds - authTime > MAX_AUTH_AGE_SECONDS)
    return invalid("login_required")
  return {
    status: "valid",
    identity: {
      provider,
      subject: sub,
      email,
      jti,
      replayExpiresAt: (exp + CLOCK_SKEW_SECONDS) * 1000,
    },
  }
}
