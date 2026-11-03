import { Effect, Redacted, Schema } from "effect"
import { SecretService, type SecretScope } from "./secretService"
import {
  defaultResponse,
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
export type ConnectorConfig = {
  origin: string
  routes: ConnectorRoute[]
  name: string
  scope: SecretScope
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
function onRoute(raw: string, config: ConnectorConfig, route: ConnectorRoute) {
  const url = new URL(raw, config.origin)
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
  route: ConnectorRoute,
  mapping: ResponseMapping,
  input: PageRequest
) {
  const url = new URL(route.path, config.origin)
  const cursorParam = mapping.next.kind === "body" ? mapping.next.param : null
  for (const [key, value] of Object.entries(input.query)) {
    if (
      !route.queryKeys.includes(key) ||
      key === cursorParam ||
      value.length > 2048
    )
      throw denied()
    url.searchParams.set(key, value)
  }
  if (input.cursor === null) return url
  if (input.cursor.length > 2048) throw denied()
  switch (mapping.next.kind) {
    case "none":
      throw denied()
    case "body":
      if (!route.queryKeys.includes(mapping.next.param)) throw denied()
      url.searchParams.set(mapping.next.param, input.cursor)
      return url
    case "link": {
      const next = onRoute(input.cursor, config, route)
      if ([...next.searchParams.keys()].length > 20) throw denied()
      for (const [key, value] of next.searchParams) {
        if (!route.queryKeys.includes(key) || value.length > 2048)
          throw denied()
        url.searchParams.set(key, value)
      }
      return url
    }
  }
}
/** No response bodies, headers, or provider errors escape this boundary. */
export function fetchConnectorPage(
  config: ConnectorConfig,
  input: PageRequest,
  transport: typeof fetch = fetch
) {
  return Effect.gen(function* () {
    const route = config.routes.find(
      (r) => r.path === input.route && r.method === input.method
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
    return yield* Effect.tryPromise({
      try: async () => {
        const token = Redacted.value(secret.value)
        if (!token || /[\r\n]/.test(token)) throw denied()
        const response = await transport(url, {
          method: input.method,
          redirect: "error",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
          signal: AbortSignal.timeout(15000),
        })
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
          Schema.Array(Schema.Record(Schema.String, Schema.Unknown)).check(
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
            nextCursor = parseCursor(onRoute(link, config, route).href) ?? null
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
            const value = parseValue(item[field])
            if (value === undefined || value === null) continue
            row[field] = value
          }
          rows.push(row)
        }
        return { rows, nextCursor, bytesRead }
      },
      catch: denied,
    })
  }).pipe(Effect.catchCause(() => Effect.fail(denied())))
}
