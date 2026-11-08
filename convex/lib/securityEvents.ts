import { Option, Schema } from "effect"
import {
  CLOCK_SKEW_SECONDS,
  MAX_JTI_LENGTH,
  verifyTrustedJwt,
  type JwtFailure,
} from "./providerAssertion"
import type { TrustedIssuer } from "./trustedIssuers"

/**
 * Security Event Tokens (RFC 8417) that a trusted agent provider pushes to
 * `POST /agent/event/notify` (RFC 8935). The SET is authenticated by its
 * signature, with the same pinned issuer and keys as identity assertions.
 */

export const SET_TYPE = "secevent+jwt"
export const SET_CONTENT_TYPE = "application/secevent+jwt"
/** The provider revoked the identity assertions of one of its users. */
export const ASSERTION_REVOKED_EVENT =
  "https://schemas.workos.com/events/agent/auth/identity/assertion/revoked"
/** The events this service acts on. It ignores other events. */
export const SUPPORTED_EVENTS = [ASSERTION_REVOKED_EVENT]

/**
 * How old a SET may be when it arrives, so a provider can deliver it after
 * an outage. It bounds how long a `jti` stays recorded. A SET acts only on
 * registrations made before its `iat`, so a late or repeated SET cannot
 * revoke a newer link.
 */
const MAX_SET_AGE_SECONDS = 7 * 24 * 60 * 60

/** RFC 8935 error codes. */
export type SetFailure =
  | "invalid_request"
  | "invalid_issuer"
  | "invalid_audience"
  | "invalid_key"

/** The RFC 8935 code for each failed provider JWT check. */
const SET_FAILURES: Record<JwtFailure, SetFailure> = {
  invalid_request: "invalid_request",
  invalid_issuer: "invalid_issuer",
  invalid_audience: "invalid_audience",
  invalid_signature: "invalid_key",
  expired: "invalid_request",
}

const decodeSetClaims = Schema.decodeUnknownOption(
  Schema.Struct({
    sub: Schema.NonEmptyString,
    jti: Schema.NonEmptyString.check(Schema.isMaxLength(MAX_JTI_LENGTH)),
    iat: Schema.Number,
    /** RFC 8417: each event value is a JSON object. */
    events: Schema.Record(
      Schema.String,
      Schema.Record(Schema.String, Schema.Unknown)
    ),
  })
)

export type VerifiedSet =
  | {
      status: "valid"
      provider: TrustedIssuer
      /** The provider's opaque user identifier. */
      subject: string
      jti: string
      /** When the provider issued the event, in milliseconds. */
      issuedAt: number
      replayExpiresAt: number
      /** True when the SET has the assertion-revoked event. */
      revokesAssertions: boolean
    }
  | { status: "invalid"; error: SetFailure }

/** Verifies a SET for this service (`audience`) at `now` (milliseconds). */
export async function verifySecurityEvent(
  jwt: string,
  audience: string,
  now: number
): Promise<VerifiedSet> {
  const verified = await verifyTrustedJwt(jwt, {
    audience,
    typ: SET_TYPE,
    maxAgeSeconds: MAX_SET_AGE_SECONDS,
    now,
  })
  if (verified.status === "invalid")
    return { status: "invalid", error: SET_FAILURES[verified.error] }
  const claims = decodeSetClaims(verified.payload)
  if (Option.isNone(claims))
    return { status: "invalid", error: "invalid_request" }
  const { sub, jti, iat, events } = claims.value
  return {
    status: "valid",
    provider: verified.provider,
    subject: sub,
    jti,
    issuedAt: iat * 1000,
    replayExpiresAt: (iat + MAX_SET_AGE_SECONDS + CLOCK_SKEW_SECONDS) * 1000,
    revokesAssertions: Object.hasOwn(events, ASSERTION_REVOKED_EVENT),
  }
}
