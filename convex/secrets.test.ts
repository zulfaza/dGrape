import type { Json } from "effect/Schema"
// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { describe, expect, it, vi } from "vitest"
import { convexTest } from "convex-test"
import { Effect, Layer, Redacted } from "effect"
import schema from "./schema"
import * as secretServices from "./lib/secretService"
import { api, internal } from "./_generated/api"
import {
  SecretService,
  SecretFailure,
  type SecretStore,
} from "./lib/secretService"
import {
  fetchConnectorPage,
  type ConnectorConfig,
  type PageRequest,
} from "./lib/connectorFetch"
import { checkRoute, type ResponseMapping } from "./lib/secretDomain"

const modules = import.meta.glob("./**/*.ts")
const paginationOpts = { numItems: 100, cursor: null }
const token = "fixture-private-token"
function memoryStore() {
  const values = new Map<string, string>()
  const store: SecretStore = {
    find: (_scope, name) =>
      Effect.succeed(
        values.has(name)
          ? { id: name, value: Redacted.make(values.get(name) ?? "") }
          : null
      ),
    put: (_scope, name, value) =>
      Effect.sync(() => {
        if (!values.has(name)) values.set(name, Redacted.value(value))
        return name
      }),
    remove: (_scope, name) =>
      Effect.sync(() => {
        values.delete(name)
      }),
  }
  return { store, values, layer: Layer.succeed(SecretService, store) }
}
const config: ConnectorConfig = {
  origin: "https://api.example.com",
  routes: [
    {
      path: "/items",
      method: "GET",
      queryKeys: ["cursor"],
      fields: ["id", "total"],
    },
  ],
  name: "object",
  scope: { workspaceId: "workspace", userId: null },
}
const input: PageRequest = {
  route: "/items",
  method: "GET",
  query: {},
  cursor: null,
  limits: { maxRows: 2, maxBytes: 1024 },
}
async function fixture() {
  const t = convexTest(schema, modules)
  const owner = t.withIdentity({ tokenIdentifier: "owner" })
  const other = t.withIdentity({ tokenIdentifier: "other" })
  const workspaceId = await owner.mutation(api.workspaces.create, {
    name: "Proof",
  })
  const secretRef = await owner.mutation(api.secrets.prepare, {
    workspaceId,
    label: "API",
    private: true,
  })
  const meta = await owner.query(internal.secrets.metadata, { secretRef })
  if (meta.state.kind !== "pending") throw new Error("Expected pending")
  await owner.mutation(internal.secrets.finish, {
    secretRef,
    revision: 1,
    name: meta.state.name,
    objectId: "provider-object",
  })
  return { t, owner, other, workspaceId, secretRef }
}

describe("secret reference authorization and lifecycle", () => {
  it("returns references only and rejects other workspaces and users", async () => {
    const { owner, other, workspaceId, secretRef } = await fixture()
    const rows = await owner.query(api.secrets.list, {
      workspaceId,
      paginationOpts,
    })
    expect(rows.page).toEqual([
      {
        id: secretRef,
        label: "API",
        owner: { kind: "user", userId: "owner" },
        revision: 1,
        status: "ready",
        canManage: true,
      },
    ])
    await expect(
      other.query(api.secrets.list, { workspaceId, paginationOpts })
    ).rejects.toThrow("access denied")
    await expect(
      other.mutation(api.secrets.rotate, { secretRef, revision: 1 })
    ).rejects.toThrow("access denied")
  })
  it("blocks use during rotation and retries deletion safely", async () => {
    vi.stubEnv("CONNECTOR_ALLOWED_ORIGINS", "https://api.example.com")
    const { owner, workspaceId, secretRef } = await fixture()
    const connectionId = await owner.mutation(api.connectors.create, {
      workspaceId,
      secretRef,
      label: "API",
      origin: config.origin,
      routes: config.routes,
    })
    const use = { workspaceId, connectionId, principalUserId: "owner" }
    await expect(
      owner.query(internal.connectors.authorizeUse, use)
    ).resolves.toBeNull()
    await owner.mutation(api.secrets.rotate, { secretRef, revision: 1 })
    await expect(
      owner.query(internal.connectors.authorizeUse, use)
    ).rejects.toThrow("access denied")
    await expect(
      owner.mutation(api.secrets.rotate, { secretRef, revision: 1 })
    ).rejects.toThrow("changed")
    const pending = await owner.query(internal.secrets.metadata, { secretRef })
    if (pending.state.kind !== "pending") throw new Error("Expected pending")
    expect(pending.state.previousName).toBeTypeOf("string")
    await owner.mutation(internal.secrets.finish, {
      secretRef,
      revision: 2,
      name: pending.state.name,
      objectId: "new-object",
    })
    await owner.mutation(api.secrets.beginDelete, { secretRef, revision: 2 })
    await owner.mutation(api.secrets.beginDelete, { secretRef, revision: 2 })
    await expect(
      owner.query(internal.connectors.authorizeUse, use)
    ).rejects.toThrow("access denied")
    await owner.mutation(internal.secrets.finishDelete, {
      secretRef,
      revision: 2,
    })
    await owner.mutation(internal.secrets.finishDelete, {
      secretRef,
      revision: 2,
    })
    expect(
      (await owner.query(api.secrets.list, { workspaceId, paginationOpts }))
        .page[0]?.status
    ).toBe("deleted")
  })
  it("checks membership and separate connection and private-secret grants", async () => {
    vi.stubEnv("CONNECTOR_ALLOWED_ORIGINS", "https://api.example.com")
    const { t, owner, other, workspaceId, secretRef } = await fixture()
    const connectionId = await owner.mutation(api.connectors.create, {
      workspaceId,
      secretRef,
      label: "API",
      origin: config.origin,
      routes: config.routes,
    })
    await t.run(async (ctx) => {
      await ctx.db.insert("workspaceMembers", {
        workspaceId,
        userId: "other",
        role: "owner",
      })
    })
    const args = { workspaceId, connectionId, principalUserId: "other" }
    await expect(
      t.query(internal.connectors.authorizeUse, args)
    ).rejects.toThrow("access denied")
    await owner.mutation(api.connectors.grantUse, {
      connectionId,
      userId: "other",
      allowed: true,
      secretUse: false,
    })
    await expect(
      t.query(internal.connectors.authorizeUse, args)
    ).rejects.toThrow("access denied")
    await owner.mutation(api.connectors.grantUse, {
      connectionId,
      userId: "other",
      allowed: true,
      secretUse: true,
    })
    await expect(
      t.query(internal.connectors.authorizeUse, args)
    ).resolves.toBeNull()
    expect(
      (await other.query(api.secrets.list, { workspaceId, paginationOpts }))
        .page
    ).toEqual([])
    await expect(
      other.mutation(api.connectors.grantUse, {
        connectionId,
        userId: "other",
        allowed: true,
        secretUse: true,
      })
    ).rejects.toThrow("access denied")
    await owner.mutation(api.connectors.grantUse, {
      connectionId,
      userId: "other",
      allowed: false,
      secretUse: false,
    })
    await expect(
      t.query(internal.connectors.authorizeUse, args)
    ).rejects.toThrow("access denied")
  })
})
describe("settings list pagination", () => {
  it("continues past private and deleted credentials without exposing private rows", async () => {
    const { t, owner, other, workspaceId, secretRef } = await fixture()
    await t.run(async (ctx) => {
      await ctx.db.insert("workspaceMembers", {
        workspaceId,
        userId: "other",
        role: "owner",
      })
      for (let i = 0; i < 100; i++) {
        await ctx.db.insert("secretRefs", {
          workspaceId,
          createdBy: "owner",
          owner: { kind: "user", userId: "owner" },
          label: "Private deleted",
          revision: 1,
          state: { kind: "deleted" },
        })
      }
    })
    const shared = await owner.mutation(api.secrets.prepare, {
      workspaceId,
      label: "Shared",
      private: false,
    })
    const own = await other.mutation(api.secrets.prepare, {
      workspaceId,
      label: "Own",
      private: true,
    })
    const first = await other.query(api.secrets.list, {
      workspaceId,
      paginationOpts,
    })
    expect(first.page).toEqual([])
    expect(first.isDone).toBe(false)
    const second = await other.query(api.secrets.list, {
      workspaceId,
      paginationOpts: { ...paginationOpts, cursor: first.continueCursor },
    })
    expect(second.page.map((row) => row.id)).toEqual([shared, own])
    expect(second.isDone).toBe(true)
    const ownerFirst = await owner.query(api.secrets.list, {
      workspaceId,
      paginationOpts,
    })
    expect(ownerFirst.page).toHaveLength(100)
    expect(ownerFirst.page[0]?.id).toBe(secretRef)
    const ownerNext = await owner.query(api.secrets.list, {
      workspaceId,
      paginationOpts: { ...paginationOpts, cursor: ownerFirst.continueCursor },
    })
    expect(ownerNext.page.map((row) => row.status)).toEqual([
      "deleted",
      "pending",
    ])
  })
  it("continues past inaccessible connections to owned and granted connections", async () => {
    const { t, owner, other, workspaceId, secretRef } = await fixture()
    const visible = await t.run(async (ctx) => {
      await ctx.db.insert("workspaceMembers", {
        workspaceId,
        userId: "other",
        role: "owner",
      })
      const fields = {
        workspaceId,
        secretRef,
        label: "Connection",
        origin: config.origin,
        routes: config.routes,
      }
      for (let i = 0; i < 100; i++) {
        await ctx.db.insert("connections", { ...fields, createdBy: "owner" })
      }
      const own = await ctx.db.insert("connections", {
        ...fields,
        createdBy: "other",
      })
      const granted = await ctx.db.insert("connections", {
        ...fields,
        createdBy: "owner",
      })
      await ctx.db.insert("connectionUseGrants", {
        connectionId: granted,
        userId: "other",
        secretUse: false,
      })
      const elsewhere = await ctx.db.insert("workspaces", { name: "Elsewhere" })
      await ctx.db.insert("connections", {
        ...fields,
        workspaceId: elsewhere,
        createdBy: "other",
      })
      return [own, granted]
    })
    const first = await other.query(api.connectors.list, {
      workspaceId,
      paginationOpts,
    })
    expect(first.page).toEqual([])
    expect(first.isDone).toBe(false)
    const second = await other.query(api.connectors.list, {
      workspaceId,
      paginationOpts: { ...paginationOpts, cursor: first.continueCursor },
    })
    expect(second.page.map((row) => row.id)).toEqual(visible)
    expect(second.isDone).toBe(true)
    const outsider = t.withIdentity({ tokenIdentifier: "outsider" })
    await expect(
      outsider.query(api.connectors.list, { workspaceId, paginationOpts })
    ).rejects.toThrow("access denied")
    expect(
      (await owner.query(api.connectors.list, { workspaceId, paginationOpts }))
        .page
    ).toHaveLength(100)
  })
  it.each([0, -1, 101, 1.5])(
    "rejects unbounded page size %s",
    async (numItems) => {
      const { owner, workspaceId } = await fixture()
      const args = { workspaceId, paginationOpts: { numItems, cursor: null } }
      await expect(owner.query(api.secrets.list, args)).rejects.toThrow(
        "Page size"
      )
      await expect(owner.query(api.connectors.list, args)).rejects.toThrow(
        "Page size"
      )
    }
  )
})

describe("provider-independent connector boundary", () => {
  async function run(body: Json, request: PageRequest = input) {
    const memory = memoryStore()
    await Effect.runPromise(
      memory.store.put(config.scope, config.name, Redacted.make(token))
    )
    const transport: typeof fetch = async (url, init) => {
      expect(String(url).startsWith(config.origin)).toBe(true)
      expect(init?.redirect).toBe("error")
      expect(new Headers(init?.headers).get("Authorization")).toBe(
        `Bearer ${token}`
      )
      return Response.json(body)
    }
    return Effect.runPromise(
      fetchConnectorPage(config, request, transport).pipe(
        Effect.provide(memory.layer)
      )
    )
  }
  it("maps only explicit safe fields and returns a cursor without saving it", async () => {
    const page = await run({
      rows: [{ id: 1, total: 3, ignored: "discard" }],
      nextCursor: "page2",
    })
    expect(page.rows).toEqual([{ id: 1, total: 3 }])
    expect(page.nextCursor).toBe("page2")
    expect(page.bytesRead).toBeGreaterThan(0)
  })
  it.each<Json>([
    { rows: [{ id: token }] },
    { rows: [{ ignored: token }] },
    { rows: [], nextCursor: token },
    { rows: [{ id: { nested: "no" } }] },
    { rows: [{ id: 1 }, { id: 2 }, { id: 3 }] },
  ])("rejects unsafe output without a secret echo", async (body) => {
    await expect(run(body)).rejects.toThrow("Connector request failed")
  })
  it("rejects destinations, methods, query injection, and byte overrun", async () => {
    for (const request of [
      { ...input, route: "https://evil.example/items" },
      { ...input, method: "POST" },
      { ...input, query: { redirect: "https://evil.example" } },
      { ...input, limits: { maxRows: 2, maxBytes: 1 } },
    ]) {
      if (request.method !== "GET" && request.method !== "POST")
        throw new Error("Invalid fixture")
      await expect(
        run({ rows: [] }, { ...request, method: request.method })
      ).rejects.toThrow("Connector request failed")
    }
  })
  it("sanitizes provider errors", async () => {
    const fail = () => Effect.fail(new SecretFailure({ message: token }))
    const layer = Layer.succeed(SecretService, {
      find: fail,
      put: fail,
      remove: fail,
    })
    await expect(
      Effect.runPromise(
        fetchConnectorPage(config, input).pipe(Effect.provide(layer))
      )
    ).rejects.toThrow("Connector request failed")
  })
})

describe("connector response mapping and pagination", () => {
  const route = config.routes[0]
  if (!route) throw new Error("Invalid fixture")
  async function fetchWith(
    response: ResponseMapping,
    reply: (url: URL) => Response,
    request: Partial<PageRequest> = {}
  ) {
    const memory = memoryStore()
    await Effect.runPromise(
      memory.store.put(config.scope, config.name, Redacted.make(token))
    )
    const urls: URL[] = []
    const transport: typeof fetch = async (url) => {
      const parsed = new URL(String(url))
      urls.push(parsed)
      return reply(parsed)
    }
    const routes = [{ ...route, queryKeys: ["page", "per_page"], response }]
    const page = await Effect.runPromise(
      fetchConnectorPage(
        { ...config, routes },
        { ...input, ...request },
        transport
      ).pipe(Effect.provide(memory.layer))
    )
    return { page, urls }
  }
  const none: ResponseMapping["next"] = { kind: "none" }
  it("maps a plain array and a nested rows path", async () => {
    const plain = await fetchWith({ rows: [], next: none }, () =>
      Response.json([{ id: 1, ignored: "x" }])
    )
    expect(plain.page).toMatchObject({ rows: [{ id: 1 }], nextCursor: null })
    const nested = await fetchWith(
      { rows: ["data", "items"], next: none },
      () => Response.json({ data: { items: [{ id: 2, total: 4 }] } })
    )
    expect(nested.page.rows).toEqual([{ id: 2, total: 4 }])
    await expect(
      fetchWith({ rows: ["data"], next: none }, () => Response.json({}))
    ).rejects.toThrow("Connector request failed")
    await expect(
      fetchWith({ rows: [], next: none }, () => Response.json([]), {
        cursor: "2",
      })
    ).rejects.toThrow("Connector request failed")
  })
  it("reads a body cursor at a path and sends it as the configured parameter", async () => {
    const response: ResponseMapping = {
      rows: ["items"],
      next: { kind: "body", path: ["meta", "next"], param: "page" },
    }
    const { page, urls } = await fetchWith(
      response,
      () => Response.json({ items: [], meta: { next: "3" } }),
      { cursor: "2" }
    )
    expect(page.nextCursor).toBe("3")
    expect(urls[0]?.searchParams.get("page")).toBe("2")
    await expect(
      fetchWith(response, () => Response.json({ items: [] }), {
        query: { page: "9" },
      })
    ).rejects.toThrow("Connector request failed")
  })
  it("follows a Link next URL only on the same origin and path", async () => {
    const linked = (next: string) => () =>
      Response.json([{ id: 1 }], {
        headers: {
          Link: `<${next}>; rel="next", <${config.origin}/items?page=9>; rel="last"`,
        },
      })
    const link: ResponseMapping = { rows: [], next: { kind: "link" } }
    const first = await fetchWith(
      link,
      linked(`${config.origin}/items?page=2&per_page=50`),
      { query: { per_page: "50" } }
    )
    expect(first.page.nextCursor).toBe(
      `${config.origin}/items?page=2&per_page=50`
    )
    const second = await fetchWith(link, () => Response.json([]), {
      cursor: first.page.nextCursor,
    })
    expect(second.page.nextCursor).toBeNull()
    expect(second.urls[0]?.searchParams.get("page")).toBe("2")
    const relative = await fetchWith(link, linked("?page=3"))
    expect(relative.page.nextCursor).toBe(`${config.origin}/items?page=3`)
    for (const next of [
      "https://evil.example/items?page=2",
      `${config.origin}/other?page=2`,
      `${config.origin}/items?page=2&q=${token}`,
    ])
      await expect(fetchWith(link, linked(next))).rejects.toThrow(
        "Connector request failed"
      )
    for (const cursor of [
      "https://evil.example/items?page=2",
      `${config.origin}/items?redirect=x`,
    ])
      await expect(
        fetchWith(link, () => Response.json([]), { cursor })
      ).rejects.toThrow("Connector request failed")
  })
  it("rejects unsafe mapping paths and unknown cursor parameters", () => {
    for (const response of [
      { rows: ["access_token"], next: none },
      { rows: ["a", "b", "c", "d", "e", "f"], next: none },
      { rows: [], next: { kind: "body", path: [], param: "page" } },
      { rows: [], next: { kind: "body", path: ["next"], param: "after" } },
    ] satisfies ResponseMapping[])
      expect(() =>
        checkRoute({ ...route, queryKeys: ["page"], response })
      ).toThrow(/Invalid route|Unsafe field/)
    expect(() => checkRoute({ ...route, queryKeys: [] })).not.toThrow()
  })
})

describe("authenticated HTTP settings recovery", () => {
  it("stores no plaintext metadata and reconciles a failed rotation cleanup", async () => {
    const { owner, other, workspaceId, secretRef } = await fixture()
    const memory = memoryStore()
    vi.spyOn(secretServices, "configuredSecretLayer").mockReturnValue(
      memory.layer
    )
    const original = await owner.query(internal.secrets.metadata, { secretRef })
    if (original.state.kind !== "ready") throw new Error("Expected ready")
    memory.values.set(original.state.name, "old-private-token")
    await owner.mutation(api.secrets.rotate, { secretRef, revision: 1 })
    const post = (client: typeof owner, value: string) =>
      client.fetch("/settings/secrets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secretRef, revision: 2, value }),
      })
    expect((await post(other, token)).status).toBe(400)
    const broken = Layer.succeed(SecretService, {
      ...memory.store,
      remove: () => Effect.fail(new SecretFailure({ message: token })),
    })
    vi.spyOn(secretServices, "configuredSecretLayer").mockReturnValue(broken)
    const failed = await post(owner, token)
    expect(failed.status).toBe(400)
    expect(await failed.text()).not.toContain(token)
    const pending = await owner.query(internal.secrets.metadata, { secretRef })
    expect(pending.state.kind).toBe("pending")
    expect(
      JSON.stringify(
        await owner.query(api.secrets.list, { workspaceId, paginationOpts })
      )
    ).not.toContain(token)
    // Expire only the local test clock; no real wait or deployment is used.
    const now = Date.now()
    vi.spyOn(Date, "now").mockReturnValue(now + 61000)
    vi.spyOn(secretServices, "configuredSecretLayer").mockReturnValue(
      memory.layer
    )
    const restored = await post(owner, "")
    expect(restored.status).toBe(200)
    expect(memory.values.has(original.state.name)).toBe(false)
    expect(
      (await owner.query(internal.secrets.metadata, { secretRef })).state.kind
    ).toBe("ready")
    vi.restoreAllMocks()
  })
  it("cancels an empty pending reference and rejects unauthenticated ingress", async () => {
    const t = convexTest(schema, modules)
    expect(
      (await t.fetch("/settings/secrets", { method: "POST", body: "{}" }))
        .status
    ).toBe(401)
    const owner = t.withIdentity({ tokenIdentifier: "owner" })
    const workspaceId = await owner.mutation(api.workspaces.create, {
      name: "Empty",
    })
    const secretRef = await owner.mutation(api.secrets.prepare, {
      workspaceId,
      label: "Empty",
      private: false,
    })
    await owner.mutation(api.secrets.beginDelete, { secretRef, revision: 1 })
    const memory = memoryStore()
    vi.spyOn(secretServices, "configuredSecretLayer").mockReturnValue(
      memory.layer
    )
    const result = await owner.fetch("/settings/secrets", {
      method: "POST",
      body: JSON.stringify({ secretRef, revision: 1, value: "" }),
    })
    expect(result.status).toBe(200)
    expect(
      (await owner.query(api.secrets.list, { workspaceId, paginationOpts }))
        .page[0]?.status
    ).toBe("deleted")
    vi.restoreAllMocks()
  })
})
describe("agent connection discovery", () => {
  it("lists and describes visible connections over HTTP without secret values", async () => {
    vi.stubEnv("CONNECTOR_ALLOWED_ORIGINS", "https://api.example.com")
    const { t, owner, workspaceId, secretRef } = await fixture()
    const connectionId = await owner.mutation(api.connectors.create, {
      workspaceId,
      secretRef,
      label: "API",
      origin: config.origin,
      routes: config.routes,
    })
    const { digestToken } = await import("./agentAccess")
    const bearer = "b".repeat(64)
    const otherBearer = "c".repeat(64)
    await t.run(async (ctx) => {
      await ctx.db.insert("workspaceMembers", {
        workspaceId,
        userId: "other",
        role: "owner",
      })
      for (const [owner, value] of [
        ["owner", bearer],
        ["other", otherBearer],
      ])
        await ctx.db.insert("agentGrants", {
          workspaceId,
          owner,
          digest: await digestToken(value),
          scope: "readonly",
          state: "active",
          expiresAt: Date.now() + 60000,
        })
    })
    const get = (path: string, value = bearer) =>
      t.fetch(path, { headers: { Authorization: `Bearer ${value}` } })
    const expected = {
      id: connectionId,
      label: "API",
      origin: config.origin,
      routes: config.routes,
      credential: { label: "API", owner: "user", status: "ready" },
      usable: true,
    }
    const list = await get("/agent/connections")
    expect(list.status).toBe(200)
    const listText = await list.text()
    expect(JSON.parse(listText).page).toEqual([expected])
    const one = await get(
      `/agent/connections/describe?connectionId=${connectionId}`
    )
    expect(await one.json()).toEqual(expected)
    const meta = await owner.query(internal.secrets.metadata, { secretRef })
    if (meta.state.kind !== "ready") throw new Error("Expected ready")
    for (const hidden of [secretRef, meta.state.name, meta.state.objectId])
      expect(listText).not.toContain(hidden)
    // A member without a use grant sees nothing.
    expect(
      (await (await get("/agent/connections", otherBearer)).json()).page
    ).toEqual([])
    expect(
      (
        await get(
          `/agent/connections/describe?connectionId=${connectionId}`,
          otherBearer
        )
      ).status
    ).toBe(403)
    await owner.mutation(api.secrets.rotate, { secretRef, revision: 1 })
    expect(
      await (
        await get(`/agent/connections/describe?connectionId=${connectionId}`)
      ).json()
    ).toMatchObject({ credential: { status: "pending" }, usable: false })
    vi.stubEnv("CONVEX_SITE_URL", "https://example.convex.site")
    expect((await t.fetch("/agent/connections")).status).toBe(401)
    expect((await get("/agent/connections?limit=0")).status).toBe(400)
    vi.unstubAllEnvs()
  })
})
