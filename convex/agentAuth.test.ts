// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { convexTest } from "convex-test"
import { Schema } from "effect"
import { exportJWK, generateKeyPair } from "jose"
import schema from "./schema"
import { api } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import type { AgentScope } from "./lib/agentScope"
import {
  CLAIM_GRANT,
  JWT_BEARER_GRANT,
  authMd,
  authorizationServerMetadata,
} from "./lib/agentAuthDiscovery"

/**
 * End-to-end checks of the auth.md user-claimed flow over HTTP: discover,
 * register, wait, confirm on the claim page, get a scoped token, call the
 * agent API, exchange the assertion, and revoke. The clock is fake, and the
 * WorkOS user lookup is a stub.
 */

const modules = import.meta.glob("./**/*.ts")
const SITE = "https://dfe-test.convex.site"
const APP = "https://dfe.test"
const EMAIL = "ada@example.com"
const T0 = Date.UTC(2026, 10, 8, 12)

/** The response bodies these tests read. Each test decodes before it reads. */
const OAuthError = Schema.Struct({ error: Schema.String })
const ClaimBlock = Schema.Struct({
  user_code: Schema.String,
  verification_uri: Schema.String,
  interval: Schema.Number,
})
const Registered = Schema.Struct({
  registration_type: Schema.Literal("service_auth"),
  claim_token: Schema.String,
  claim: ClaimBlock,
})
const NewClaimAttempt = Schema.Struct({ claim_attempt: ClaimBlock })
const ClaimTokens = Schema.Struct({
  access_token: Schema.String,
  token_type: Schema.Literal("Bearer"),
  expires_in: Schema.Number,
  scope: Schema.String,
  identity_assertion: Schema.String,
})
const ExchangedTokens = Schema.Struct({
  access_token: Schema.String,
  scope: Schema.String,
  identity_assertion: Schema.optionalKey(Schema.String),
})
const WorkspaceInfo = Schema.Struct({
  workspace: Schema.Struct({ id: Schema.String }),
})
const ProtectedResource = Schema.Struct({
  authorization_servers: Schema.Array(Schema.String),
  scopes_supported: Schema.Array(Schema.String),
})
const JsonObject = Schema.Record(Schema.String, Schema.Unknown)
const Jwks = Schema.Struct({ keys: Schema.Array(JsonObject) })

/** Decodes a JSON response body, or fails the test. */
async function read<S extends Schema.Codec<unknown, unknown>>(
  response: Response,
  schema: S
): Promise<S["Type"]> {
  const body: unknown = await response.json()
  return Schema.decodeUnknownSync(schema)(body)
}

/** WorkOS users by ID, as the stubbed user API returns them. */
const workosUsers = new Map<string, { email: string; verified: boolean }>()

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(T0)
  const { privateKey } = await generateKeyPair("ES256", { extractable: true })
  vi.stubEnv("CONVEX_SITE_URL", SITE)
  vi.stubEnv("APP_ORIGIN", APP)
  vi.stubEnv("AGENT_AUTH_CODE_KEY", "test-code-key-".repeat(4))
  vi.stubEnv(
    "AGENT_AUTH_SIGNING_KEY",
    JSON.stringify({ ...(await exportJWK(privateKey)), kid: "test" })
  )
  vi.stubEnv("WORKOS_API_KEY", "sk_test")
  workosUsers.clear()
  workosUsers.set("user_ada", { email: EMAIL, verified: true })
  workosUsers.set("user_eve", { email: "eve@example.com", verified: true })
  workosUsers.set("user_unverified", { email: EMAIL, verified: false })
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : input)
    const prefix = "/user_management/users/"
    if (
      url.origin !== "https://api.workos.com" ||
      !url.pathname.startsWith(prefix)
    )
      throw new Error(`Unexpected fetch: ${url}`)
    const user = workosUsers.get(
      decodeURIComponent(url.pathname.slice(prefix.length))
    )
    if (!user) return new Response("Not found", { status: 404 })
    return Response.json({ email: user.email, email_verified: user.verified })
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

async function setup() {
  const t = convexTest(schema, modules)
  const workspaceId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("workspaces", { name: "Lab" })
    await ctx.db.insert("workspaceMembers", {
      workspaceId: id,
      userId: "ada",
      role: "owner",
    })
    await ctx.db.insert("workspaceMembers", {
      workspaceId: id,
      userId: "eve",
      role: "owner",
    })
    return id
  })
  const otherWorkspaceId = await t.run((ctx) =>
    ctx.db.insert("workspaces", { name: "Elsewhere" })
  )
  // Grants made before the current membership row do not work, so the
  // claim must come after the seeded members.
  advance(1_000)
  const ada = t.withIdentity({ tokenIdentifier: "ada", subject: "user_ada" })
  const eve = t.withIdentity({ tokenIdentifier: "eve", subject: "user_eve" })
  const unverified = t.withIdentity({
    tokenIdentifier: "ada",
    subject: "user_unverified",
  })

  const json = (path: string, body: Readonly<Record<string, string>>) =>
    t.fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  const form = (path: string, fields: Record<string, string>) =>
    t.fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(fields).toString(),
    })
  const bearer = (path: string, token: string, init: RequestInit = {}) =>
    t.fetch(path, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${token}` },
    })

  async function register(email = EMAIL) {
    const response = await json("/agent/identity", {
      type: "service_auth",
      login_hint: email,
    })
    expect(response.status).toBe(200)
    const body = await read(response, Registered)
    return {
      claimToken: body.claim_token,
      userCode: body.claim.user_code,
      attemptToken: attemptToken(body.claim.verification_uri),
      body,
    }
  }

  const poll = (claimToken: string) =>
    form("/oauth2/token", { grant_type: CLAIM_GRANT, claim_token: claimToken })

  const confirm = (
    who: typeof ada,
    attempt: string,
    userCode: string,
    scopes: Array<AgentScope> = ["data.read"],
    workspace: Id<"workspaces"> = workspaceId
  ) =>
    who.action(api.agentRegistrations.confirmClaim, {
      attemptToken: attempt,
      userCode,
      workspaceId: workspace,
      scopes,
    })

  return {
    t,
    workspaceId,
    otherWorkspaceId,
    ada,
    eve,
    unverified,
    json,
    form,
    bearer,
    register,
    poll,
    confirm,
  }
}

function attemptToken(verificationUri: string) {
  const url = new URL(verificationUri)
  expect(url.origin + url.pathname).toBe(`${APP}/claim`)
  const token = url.searchParams.get("claim_attempt_token")
  if (!token) throw new Error("No claim_attempt_token in verification_uri")
  return token
}

function advance(ms: number) {
  vi.setSystemTime(Date.now() + ms)
}

async function errorCode(response: Response) {
  return {
    status: response.status,
    error: (await read(response, OAuthError)).error,
  }
}

describe("auth.md discovery", () => {
  it("serves metadata and auth.md that name the same real endpoints", async () => {
    const { t } = await setup()
    const unauthorized = await t.fetch("/agent/workspace")
    expect(unauthorized.status).toBe(401)
    const challenge = unauthorized.headers.get("WWW-Authenticate") ?? ""
    const resourceUrl = /resource_metadata="([^"]+)"/.exec(challenge)?.[1]
    expect(resourceUrl).toBe(`${SITE}/.well-known/oauth-protected-resource`)

    const resource = await read(
      await t.fetch("/.well-known/oauth-protected-resource"),
      ProtectedResource
    )
    expect(resource.authorization_servers).toEqual([SITE])
    const served = await read(
      await t.fetch("/.well-known/oauth-authorization-server"),
      JsonObject
    )
    const server = authorizationServerMetadata()
    expect(served).toEqual(server)
    expect(server.issuer).toBe(SITE)
    expect(server.agent_auth.identity_types_supported).toEqual(["service_auth"])
    expect(resource.scopes_supported).toEqual(server.scopes_supported)

    const doc = await t.fetch("/auth.md")
    expect(doc.headers.get("Content-Type")).toContain("text/markdown")
    const text = await doc.text()
    expect(text).toBe(authMd())
    // Every endpoint an agent calls after it reads auth.md is in auth.md.
    const agentCalls = [
      server.token_endpoint,
      server.revocation_endpoint,
      server.agent_auth.identity_endpoint,
      server.agent_auth.claim_endpoint,
    ]
    for (const endpoint of agentCalls) expect(text).toContain(endpoint)
    // Every advertised endpoint is a route that answers.
    for (const endpoint of [
      ...agentCalls,
      server.agent_auth.skill,
      server.jwks_uri,
    ]) {
      const path = new URL(endpoint).pathname
      const method = path.startsWith("/.well-known") || path === "/auth.md"
      const response = await t.fetch(path, {
        method: method ? "GET" : "POST",
        body: method ? undefined : "",
      })
      expect(response.status === 404 ? path : null).toBeNull()
    }
    for (const grant of server.grant_types_supported)
      expect(text).toContain(grant)
    for (const scope of server.scopes_supported) expect(text).toContain(scope)

    const jwks = await read(await t.fetch("/.well-known/jwks.json"), Jwks)
    expect(jwks.keys).toHaveLength(1)
    expect(jwks.keys[0]).not.toHaveProperty("d")
  })
})

describe("auth.md service_auth registration", () => {
  it("runs register, claim, token, API call, assertion exchange, and revoke", async () => {
    const { t, ada, bearer, form, register, poll, confirm, workspaceId } =
      await setup()
    const { claimToken, userCode, attemptToken, body } = await register()
    expect(body.registration_type).toBe("service_auth")
    expect(body.claim.interval).toBe(5)

    expect(await errorCode(await poll(claimToken))).toEqual({
      status: 400,
      error: "authorization_pending",
    })
    expect(
      await ada.query(api.agentRegistrations.claimDetails, { attemptToken })
    ).toMatchObject({ status: "open", email: EMAIL })

    advance(5_000)
    expect(await confirm(ada, attemptToken, userCode)).toBe("claimed")
    const tokenResponse = await poll(claimToken)
    expect(tokenResponse.status).toBe(200)
    expect(tokenResponse.headers.get("Cache-Control")).toBe("no-store")
    const tokens = await read(tokenResponse, ClaimTokens)
    expect(tokens).toMatchObject({
      token_type: "Bearer",
      expires_in: 3600,
      scope: "data.read",
    })

    // The token reads the chosen workspace.
    const described = await bearer("/agent/workspace", tokens.access_token)
    expect(described.status).toBe(200)
    expect((await read(described, WorkspaceInfo)).workspace.id).toBe(
      workspaceId
    )

    // The claim token works once.
    advance(5_000)
    expect(await errorCode(await poll(claimToken))).toEqual({
      status: 400,
      error: "invalid_grant",
    })

    // The assertion gets a new token after the first one expires.
    advance(60 * 60 * 1000)
    expect((await bearer("/agent/workspace", tokens.access_token)).status).toBe(
      403
    )
    const exchanged = await form("/oauth2/token", {
      grant_type: JWT_BEARER_GRANT,
      assertion: tokens.identity_assertion,
    })
    expect(exchanged.status).toBe(200)
    const second = await read(exchanged, ExchangedTokens)
    expect(second.scope).toBe("data.read")
    expect(second).not.toHaveProperty("identity_assertion")
    expect((await bearer("/agent/workspace", second.access_token)).status).toBe(
      200
    )

    // Revoking one access token stops only that token.
    const revoked = await form("/oauth2/revoke", {
      token: second.access_token,
      token_type_hint: "access_token",
    })
    expect(revoked.status).toBe(200)
    expect((await bearer("/agent/workspace", second.access_token)).status).toBe(
      403
    )
    // Unknown tokens get the same answer, so they cannot be probed.
    expect(
      (await form("/oauth2/revoke", { token: "f".repeat(64) })).status
    ).toBe(200)

    // Only digests of tokens and codes reach the database.
    const rows = await t.run(async (ctx) =>
      JSON.stringify([
        await ctx.db.query("agentRegistrations").collect(),
        await ctx.db.query("agentClaimAttempts").collect(),
        await ctx.db.query("agentGrants").collect(),
      ])
    )
    for (const secret of [
      claimToken,
      attemptToken,
      userCode,
      tokens.access_token,
      second.access_token,
      tokens.identity_assertion,
    ])
      expect(rows).not.toContain(secret)
  })

  it("revoking the registration stops its tokens and its assertion", async () => {
    const { ada, bearer, form, register, poll, confirm, workspaceId } =
      await setup()
    const { claimToken, userCode, attemptToken } = await register()
    await confirm(ada, attemptToken, userCode)
    const tokens = await read(await poll(claimToken), ClaimTokens)
    const list = await ada.query(api.agentRegistrations.listForWorkspace, {
      workspaceId,
      paginationOpts: { numItems: 10, cursor: null },
    })
    const registrationId = list.page[0]?._id
    if (!registrationId) throw new Error("Expected a connected agent")
    await ada.mutation(api.agentRegistrations.revokeRegistration, {
      workspaceId,
      registrationId,
    })
    expect((await bearer("/agent/workspace", tokens.access_token)).status).toBe(
      403
    )
    expect(
      await errorCode(
        await form("/oauth2/token", {
          grant_type: JWT_BEARER_GRANT,
          assertion: tokens.identity_assertion,
        })
      )
    ).toEqual({ status: 400, error: "invalid_grant" })
  })

  it("gives only the scopes the user chose", async () => {
    const { ada, bearer, register, poll, confirm } = await setup()
    const { claimToken, userCode, attemptToken } = await register()
    await confirm(ada, attemptToken, userCode, ["data.read"])
    const { access_token } = await read(await poll(claimToken), ClaimTokens)
    const write = await bearer("/agent/collections", access_token, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Notes",
        fields: [{ id: "title", label: "Title", type: "text" }],
      }),
    })
    expect(write.status).toBe(403)
    expect(await write.text()).toContain("data.write")
  })

  it("stops the token when the user loses the workspace", async () => {
    const { t, ada, bearer, register, poll, confirm, workspaceId } =
      await setup()
    const { claimToken, userCode, attemptToken } = await register()
    await confirm(ada, attemptToken, userCode)
    const { access_token } = await read(await poll(claimToken), ClaimTokens)
    await t.run(async (ctx) => {
      const member = await ctx.db
        .query("workspaceMembers")
        .withIndex("by_workspace_user", (q) =>
          q.eq("workspaceId", workspaceId).eq("userId", "ada")
        )
        .unique()
      if (member) await ctx.db.patch(member._id, { role: "viewer" })
    })
    expect((await bearer("/agent/workspace", access_token)).status).toBe(403)
  })

  it("rejects tampered and foreign assertions", async () => {
    const { ada, form, register, poll, confirm } = await setup()
    const { claimToken, userCode, attemptToken } = await register()
    await confirm(ada, attemptToken, userCode)
    const { identity_assertion } = await read(
      await poll(claimToken),
      ClaimTokens
    )
    const [header = "", payload = "", signature = ""] =
      identity_assertion.split(".")
    const claims = Schema.decodeUnknownSync(Schema.fromJsonString(JsonObject))(
      atob(payload.replace(/-/g, "+").replace(/_/g, "/"))
    )
    const encode = (json: string) =>
      btoa(json).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
    const resigned = (changes: Readonly<Record<string, string>>) =>
      `${header}.${encode(JSON.stringify({ ...claims, ...changes }))}.${signature}`
    const forged = [
      resigned({ aud: "https://other.example" }),
      resigned({ sub: "someone-else" }),
      `${encode(JSON.stringify({ alg: "none", typ: "oauth-id-jag+jwt" }))}.${payload}.`,
      "not-a-jwt",
    ]
    for (const assertion of forged)
      expect(
        await errorCode(
          await form("/oauth2/token", {
            grant_type: JWT_BEARER_GRANT,
            assertion,
          })
        )
      ).toEqual({ status: 400, error: "invalid_grant" })
    // A new signing key makes old assertions invalid.
    const { privateKey } = await generateKeyPair("ES256", { extractable: true })
    vi.stubEnv(
      "AGENT_AUTH_SIGNING_KEY",
      JSON.stringify({ ...(await exportJWK(privateKey)), kid: "rotated" })
    )
    expect(
      await errorCode(
        await form("/oauth2/token", {
          grant_type: JWT_BEARER_GRANT,
          assertion: identity_assertion,
        })
      )
    ).toEqual({ status: 400, error: "invalid_grant" })
  })
})

describe("auth.md claim confirmation", () => {
  it("refuses a signed-in user whose email is not the hinted one", async () => {
    const { eve, unverified, register, poll, confirm } = await setup()
    const { claimToken, userCode, attemptToken } = await register()
    expect(await confirm(eve, attemptToken, userCode)).toBe("wrong_account")
    expect(await confirm(unverified, attemptToken, userCode)).toBe(
      "unverified_email"
    )
    expect(await errorCode(await poll(claimToken))).toEqual({
      status: 400,
      error: "authorization_pending",
    })
  })

  it("locks a code after five wrong tries", async () => {
    const { ada, register, poll, confirm } = await setup()
    const { claimToken, userCode, attemptToken } = await register()
    const wrong = userCode === "000000" ? "111111" : "000000"
    for (let i = 0; i < 4; i++)
      expect(await confirm(ada, attemptToken, wrong)).toBe("wrong_code")
    expect(await confirm(ada, attemptToken, wrong)).toBe("locked")
    expect(await confirm(ada, attemptToken, userCode)).toBe("unavailable")
    expect(await errorCode(await poll(claimToken))).toEqual({
      status: 400,
      error: "expired_token",
    })
  })

  it("lets one of two confirmations win", async () => {
    const { ada, register, confirm } = await setup()
    const { userCode, attemptToken } = await register()
    const results = await Promise.all([
      confirm(ada, attemptToken, userCode),
      confirm(ada, attemptToken, userCode),
    ])
    expect(results.sort()).toEqual(["claimed", "unavailable"])
  })

  it("needs owner access to the chosen workspace", async () => {
    const { ada, register, confirm, otherWorkspaceId } = await setup()
    const { userCode, attemptToken } = await register()
    expect(
      await confirm(
        ada,
        attemptToken,
        userCode,
        ["data.read"],
        otherWorkspaceId
      )
    ).toBe("no_workspace_access")
  })

  it("rejects an empty scope set", async () => {
    const { ada, register, confirm } = await setup()
    const { userCode, attemptToken } = await register()
    expect(await confirm(ada, attemptToken, userCode, [])).toBe(
      "invalid_scopes"
    )
  })
})

describe("auth.md polling and expiry", () => {
  it("asks fast pollers to slow down", async () => {
    const { register, poll } = await setup()
    const { claimToken } = await register()
    expect((await errorCode(await poll(claimToken))).error).toBe(
      "authorization_pending"
    )
    advance(1_000)
    expect((await errorCode(await poll(claimToken))).error).toBe("slow_down")
    advance(5_000)
    expect((await errorCode(await poll(claimToken))).error).toBe(
      "authorization_pending"
    )
  })

  it("expires a code, and a new claim attempt replaces it", async () => {
    const { ada, json, register, poll, confirm } = await setup()
    const first = await register()
    advance(10 * 60 * 1000)
    expect(await confirm(ada, first.attemptToken, first.userCode)).toBe(
      "unavailable"
    )
    expect((await errorCode(await poll(first.claimToken))).error).toBe(
      "expired_token"
    )

    expect(
      await errorCode(
        await json("/agent/identity/claim", {
          claim_token: first.claimToken,
          email: "eve@example.com",
        })
      )
    ).toEqual({ status: 400, error: "invalid_claim_token" })
    const renewed = await json("/agent/identity/claim", {
      claim_token: first.claimToken,
      email: EMAIL,
    })
    expect(renewed.status).toBe(200)
    const attempt = (await read(renewed, NewClaimAttempt)).claim_attempt
    const next = attemptToken(attempt.verification_uri)
    expect(await confirm(ada, next, attempt.user_code)).toBe("claimed")
    expect((await poll(first.claimToken)).status).toBe(200)
    expect(
      await errorCode(
        await json("/agent/identity/claim", {
          claim_token: first.claimToken,
          email: EMAIL,
        })
      )
    ).toEqual({ status: 409, error: "claimed_or_in_flight" })
  })

  it("replaces the previous link when a new code is issued", async () => {
    const { ada, json, register, confirm } = await setup()
    const first = await register()
    await json("/agent/identity/claim", {
      claim_token: first.claimToken,
      email: EMAIL,
    })
    expect(await confirm(ada, first.attemptToken, first.userCode)).toBe(
      "unavailable"
    )
  })

  it("closes the claim window after 24 hours", async () => {
    const { json, register } = await setup()
    const { claimToken } = await register()
    advance(24 * 60 * 60 * 1000)
    expect(
      await errorCode(
        await json("/agent/identity/claim", {
          claim_token: claimToken,
          email: EMAIL,
        })
      )
    ).toEqual({ status: 410, error: "claim_expired" })
  })
})

describe("auth.md registration limits and errors", () => {
  it("rejects bad registration requests", async () => {
    const { json, form, t } = await setup()
    expect(
      await errorCode(await json("/agent/identity", { type: "anonymous" }))
    ).toEqual({ status: 400, error: "anonymous_not_enabled" })
    expect(
      await errorCode(await json("/agent/identity", { type: "agent_verified" }))
    ).toEqual({ status: 400, error: "invalid_request" })
    expect(
      await errorCode(
        await json("/agent/identity", {
          type: "service_auth",
          login_hint: "not-an-email",
        })
      )
    ).toEqual({ status: 400, error: "invalid_login_hint" })
    expect(
      await errorCode(
        await t.fetch("/agent/identity", { method: "POST", body: "{" })
      )
    ).toEqual({ status: 400, error: "invalid_request" })
    expect(
      await errorCode(
        await json("/agent/identity", {
          type: "service_auth",
          login_hint: EMAIL,
          padding: "x".repeat(5000),
        })
      )
    ).toEqual({ status: 400, error: "invalid_request" })
    expect(
      await errorCode(await form("/oauth2/token", { grant_type: "password" }))
    ).toEqual({ status: 400, error: "unsupported_grant_type" })
    expect(
      await errorCode(await form("/oauth2/token", { grant_type: CLAIM_GRANT }))
    ).toEqual({ status: 400, error: "invalid_request" })
  })

  it("allows five waiting registrations per email", async () => {
    const { json, register } = await setup()
    for (let i = 0; i < 5; i++) await register()
    expect(
      await errorCode(
        await json("/agent/identity", {
          type: "service_auth",
          login_hint: EMAIL.toUpperCase(),
        })
      )
    ).toEqual({ status: 429, error: "rate_limited" })
    await register("eve@example.com")
  })

  it("allows ten codes per registration", async () => {
    const { json, register } = await setup()
    const { claimToken } = await register()
    const renew = () =>
      json("/agent/identity/claim", { claim_token: claimToken, email: EMAIL })
    for (let i = 0; i < 9; i++) expect((await renew()).status).toBe(200)
    expect(await errorCode(await renew())).toEqual({
      status: 429,
      error: "rate_limited",
    })
  })
})
