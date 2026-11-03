import { Effect, Redacted, Schema } from "effect"
import { SecretService, type SecretScope } from "./secretService"
import type { ConnectorRoute } from "./secretDomain"

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
    const url = new URL(route.path, config.origin)
    for (const [key, value] of Object.entries(input.query)) {
      if (
        !route.queryKeys.includes(key) ||
        key === "cursor" ||
        value.length > 2048
      )
        throw denied()
      url.searchParams.set(key, value)
    }
    if (input.cursor !== null) {
      if (!route.queryKeys.includes("cursor") || input.cursor.length > 2048)
        throw denied()
      url.searchParams.set("cursor", input.cursor)
    }
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
        const body: unknown = JSON.parse(text)
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
        const page = Schema.decodeUnknownSync(
          Schema.Struct({
            rows: Schema.Array(
              Schema.Record(Schema.String, Schema.Unknown)
            ).check(Schema.isMaxLength(input.limits.maxRows)),
            nextCursor: Schema.optionalKey(
              Schema.NullOr(safeText.check(Schema.isMaxLength(2048)))
            ),
          })
        )(body)
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
        for (const item of page.rows) {
          const row: Row = {}
          for (const field of route.fields) {
            const value = parseValue(item[field])
            if (value === undefined || value === null) continue
            row[field] = value
          }
          rows.push(row)
        }
        const nextCursor = page.nextCursor ?? null
        return { rows, nextCursor, bytesRead }
      },
      catch: denied,
    })
  }).pipe(Effect.catchCause(() => Effect.fail(denied())))
}
