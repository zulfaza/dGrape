import { Clock, Effect, Redacted, Schema } from "effect"
import { SecretService, type SecretScope } from "./secretService"
import {
  defaultResponse,
  fieldKey,
  type ConnectorRoute,
  type ResponseMapping,
} from "./secretDomain"

export type PageRequest = {
  route: string
  method: "GET" | "POST"
  query: Record<string, string>
  cursor: string | null
  limits: { maxRows: number; maxBytes: number }
}
/**
 * A route as trusted code runs it. Recipes name it by `id`. `query` is fixed:
 * callers and Link cursors cannot change it. Only trusted connector code sets
 * `query` and `headers`; stored HTTP connections use {@link httpRoutes}.
 */
export type FetchRoute = ConnectorRoute & {
  id: string
  query: Record<string, string>
}
export type ConnectorConfig = {
  origin: string
  routes: FetchRoute[]
  headers: Record<string, string>
  name: string
  scope: SecretScope
}
/** Stored HTTP routes are named by their path and have no fixed query. */
export function httpRoutes(routes: ConnectorRoute[]): FetchRoute[] {
  return routes.map((route) => ({ ...route, id: route.path, query: {} }))
}
export type Row = Record<string, string | number | boolean>
const denied = () => new Error("Connector request failed")
const isObject = Schema.is(Schema.Record(Schema.String, Schema.Json))
/** Follow own keys only, so a path cannot reach prototype members. */
function at(body: Schema.Json, path: readonly string[]) {
  let value: Schema.Json | undefined = body
  for (const key of path) {
    if (!isObject(value) || Array.isArray(value) || !Object.hasOwn(value, key))
      return undefined
    value = value[key]
  }
  return value
}
/** A Link cursor must stay on the route: same origin and path, no credentials. */
function onRoute(
  raw: string,
  base: URL | string,
  config: ConnectorConfig,
  route: FetchRoute
) {
  const url = new URL(raw, base)
  if (
    url.origin !== config.origin ||
    url.pathname !== route.path ||
    url.username ||
    url.password ||
    url.hash
  )
    throw denied()
  return url
}
/** Returns the `rel="next"` target of an RFC 8288 Link header, if any. */
function nextLink(header: string | null) {
  if (header === null) return null
  if (header.length > 8192) throw denied()
  for (const [, target, params] of header.matchAll(/<([^>]*)>([^,]*)/g)) {
    const rel = /;\s*rel\s*=\s*"?([^";]*)"?/i.exec(params ?? "")?.[1]
    if (
      target !== undefined &&
      rel?.toLowerCase().split(/\s+/).includes("next")
    )
      return target
  }
  return null
}
function requestUrl(
  config: ConnectorConfig,
  route: FetchRoute,
  mapping: ResponseMapping,
  input: PageRequest
) {
  const url = new URL(route.path, config.origin)
  const cursorParam = mapping.next.kind === "body" ? mapping.next.param : null
  const open = (key: string) =>
    route.queryKeys.includes(key) && !Object.hasOwn(route.query, key)
  for (const [key, value] of Object.entries(input.query)) {
    if (!open(key) || key === cursorParam || value.length > 2048) throw denied()
    url.searchParams.set(key, value)
  }
  if (input.cursor !== null) {
    if (input.cursor.length > 2048) throw denied()
    switch (mapping.next.kind) {
      case "none":
        throw denied()
      case "body":
        if (!open(mapping.next.param)) throw denied()
        url.searchParams.set(mapping.next.param, input.cursor)
        break
      case "link": {
        const next = onRoute(input.cursor, config.origin, config, route)
        if ([...next.searchParams.keys()].length > 20) throw denied()
        for (const [key, value] of next.searchParams) {
          // A Link URL repeats the fixed query; it is set again below.
          if (Object.hasOwn(route.query, key)) continue
          if (!open(key) || value.length > 2048) throw denied()
          url.searchParams.set(key, value)
        }
      }
    }
  }
  for (const [key, value] of Object.entries(route.query))
    url.searchParams.set(key, value)
  return url
}
/** Attempts per page, including the first. */
const MAX_ATTEMPTS = 3
/** A longer wait fails the page; the recipe run retries the step later. */
const MAX_WAIT_MS = 10_000
/** Rate limits (GitHub also uses 403) and transient gateway errors. */
function transient(response: Response) {
  if ([429, 502, 503, 504].includes(response.status)) return true
  return (
    response.status === 403 &&
    (response.headers.has("retry-after") ||
      response.headers.get("x-ratelimit-remaining") === "0")
  )
}
/**
 * The wait that the provider asks for: `Retry-After` in seconds or as an
 * HTTP date, or GitHub's `x-ratelimit-reset` when no requests remain.
 */
function requestedWait(headers: Headers, now: number) {
  const retryAfter = headers.get("retry-after")?.trim()
  if (retryAfter) {
    if (/^\d{1,9}$/.test(retryAfter)) return Number(retryAfter) * 1000
    const date = Date.parse(retryAfter)
    return Number.isNaN(date) ? null : Math.max(0, date - now)
  }
  const reset = headers.get("x-ratelimit-reset")
  if (
    headers.get("x-ratelimit-remaining") === "0" &&
    reset?.match(/^\d{1,12}$/)
  )
    return Math.max(0, Number(reset) * 1000 - now)
  return null
}
/** The wait before the next attempt, or null when this response is final. */
function retryWait(response: Response, attempt: number, now: number) {
  if (!transient(response) || attempt >= MAX_ATTEMPTS) return null
  const wait = requestedWait(response.headers, now) ?? 1000 * 2 ** (attempt - 1)
  return wait <= MAX_WAIT_MS ? wait : null
}
/**
 * No response bodies, headers, or provider errors escape this boundary.
 * A rate-limited or transient response is retried with bounded backoff.
 */
export function fetchConnectorPage(
  config: ConnectorConfig,
  input: PageRequest,
  transport: typeof fetch = fetch
) {
  return Effect.gen(function* () {
    const route = config.routes.find(
      (r) => r.id === input.route && r.method === input.method
    )
    if (
      !route ||
      !Number.isSafeInteger(input.limits.maxRows) ||
      input.limits.maxRows < 1 ||
      input.limits.maxRows > 1000 ||
      !Number.isSafeInteger(input.limits.maxBytes) ||
      input.limits.maxBytes < 1 ||
      input.limits.maxBytes > 1048576 ||
      Object.keys(input.query).length > 20
    )
      throw denied()
    const mapping = route.response ?? defaultResponse
    const url = requestUrl(config, route, mapping, input)
    const store = yield* SecretService
    const secret = yield* store.find(config.scope, config.name)
    if (!secret) throw denied()
    const token = Redacted.value(secret.value)
    if (!token || /[\r\n]/.test(token)) throw denied()
    const send = Effect.tryPromise({
      try: () =>
        transport(url, {
          method: input.method,
          redirect: "error",
          headers: {
            Accept: "application/json",
            ...config.headers,
            Authorization: `Bearer ${token}`,
          },
          signal: AbortSignal.timeout(15000),
        }),
      catch: denied,
    })
    let response = yield* send
    for (let attempt = 1; ; attempt++) {
      const wait = retryWait(response, attempt, yield* Clock.currentTimeMillis)
      if (wait === null) break
      const discarded = response
      yield* Effect.ignore(
        Effect.tryPromise(async () => discarded.body?.cancel())
      )
      yield* Effect.sleep(wait)
      response = yield* send
    }
    const final = response
    return yield* Effect.tryPromise({
      try: async () => {
        const response = final
        if (
          !response.ok ||
          !response.body ||
          !response.headers.get("content-type")?.includes("application/json")
        )
          throw denied()
        const reader = response.body.getReader()
        let bytesRead = 0
        let text = ""
        const decoder = new TextDecoder()
        try {
          for (;;) {
            const part = await reader.read()
            if (part.done) break
            bytesRead += part.value.byteLength
            if (bytesRead > input.limits.maxBytes) throw denied()
            text += decoder.decode(part.value, { stream: true })
          }
        } finally {
          await reader.cancel()
        }
        text += decoder.decode()
        // Reject an echo before mapping, including JSON-escaped strings.
        const body = Schema.decodeUnknownSync(Schema.Json)(JSON.parse(text))
        const encodedToken = JSON.stringify(token).slice(1, -1)
        if (
          text.includes(token) ||
          text.includes(encodedToken) ||
          text.includes(encodeURIComponent(token))
        )
          throw denied()
        const safeText = Schema.String.check(
          Schema.makeFilter(
            (value) =>
              !value.includes(token) &&
              !value.includes(encodeURIComponent(token))
          )
        )
        const pageRows = Schema.decodeUnknownSync(
          Schema.Array(Schema.Record(Schema.String, Schema.Json)).check(
            Schema.isMaxLength(input.limits.maxRows)
          )
        )(at(body, mapping.rows))
        const parseCursor = Schema.decodeUnknownSync(
          Schema.UndefinedOr(
            Schema.NullOr(safeText.check(Schema.isMaxLength(2048)))
          )
        )
        let nextCursor: string | null = null
        if (mapping.next.kind === "body")
          nextCursor = parseCursor(at(body, mapping.next.path)) ?? null
        if (mapping.next.kind === "link") {
          const link = nextLink(response.headers.get("link"))
          if (link !== null)
            nextCursor =
              parseCursor(onRoute(link, url, config, route).href) ?? null
        }
        const parseValue = Schema.decodeUnknownSync(
          Schema.Union([
            safeText.check(Schema.isMaxLength(8192)),
            Schema.Number,
            Schema.Boolean,
            Schema.Null,
            Schema.Undefined,
          ])
        )
        const rows: Row[] = []
        for (const item of pageRows) {
          const row: Row = {}
          for (const field of route.fields) {
            const value = parseValue(at(item, field.split(".")))
            if (value === undefined || value === null) continue
            row[fieldKey(field)] = value
          }
          rows.push(row)
        }
        return { rows, nextCursor, bytesRead }
      },
      catch: denied,
    })
  }).pipe(Effect.catchCause(() => Effect.fail(denied())))
}
