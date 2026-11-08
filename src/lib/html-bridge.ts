import { Result, Schema } from "effect"
import type { FunctionReturnType } from "convex/server"
import type { api } from "../../convex/_generated/api"

/**
 * The live HTML report bridge (ADR 0006). A live report runs its own scripts
 * in an inner frame with `sandbox="allow-scripts"` and no other token: an
 * opaque origin with no cookies, storage, popups, forms or top navigation.
 * An outer frame with no script holds it. The policy of both documents denies
 * all resource requests, and `frame-src 'none'` in the outer document stops
 * the inner frame from loading any URL.
 *
 * The report reads data only through one MessageChannel per document:
 * 1. The parent writes a random session nonce into the report bootstrap.
 * 2. The bootstrap makes the channel and posts `{ type: HELLO, nonce }` with
 *    one port to the app window.
 * 3. The parent accepts the first hello from the report window with that
 *    nonce and one port, and sends the binding names on that port. It
 *    ignores all other window messages.
 * 4. The report sends `{ id, type: "query", name }` on the port. The parent
 *    parses each message, applies the rate and pending limits, and calls
 *    `read`, which runs the authorized server read (pages.bridgeQuery).
 *
 * The report never receives credentials or query IDs: only the binding names
 * and the result fields and values.
 */

/** One bridge result as pages.bridgeQuery returns it. */
export type BridgeRead = FunctionReturnType<typeof api.pages.bridgeQuery>
export type BridgeResult = NonNullable<BridgeRead["result"]>

export const BRIDGE_PROTOCOL_VERSION = 1
const HELLO = "dgrape.bridge.hello"
const INIT = "dgrape.bridge.init"

/** Request limits: a burst of 10, then one per second; 4 pending at once. */
export const BRIDGE_LIMITS = {
  burst: 10,
  refillPerSecond: 1,
  maxPending: 4,
} satisfies Record<string, number>

export type BridgeErrorCode =
  | "invalid_request"
  | "rate_limited"
  | "too_many_pending"
  | "unavailable"
  | "failed"

/** A message the parent sends on the port. */
export type BridgeResponse =
  | { id: string; ok: true; result: BridgeResult }
  | {
      id: string | null
      ok: false
      error: { code: BridgeErrorCode; message: string }
    }

const Request = Schema.Struct({
  id: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(64)),
  type: Schema.Literal("query"),
  name: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(32)),
})
const RequestId = Schema.Struct({
  id: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(64)),
})
const Hello = Schema.Struct({
  type: Schema.Literal(HELLO),
  nonce: Schema.String,
})

/** A token bucket. `take` returns false when no token is left. */
export function rateLimiter(
  { burst, refillPerSecond }: { burst: number; refillPerSecond: number },
  now: () => number = Date.now
) {
  let tokens = burst
  let updated = now()
  return {
    take(): boolean {
      const at = now()
      tokens = Math.min(
        burst,
        tokens + ((at - updated) / 1000) * refillPerSecond
      )
      updated = at
      if (tokens < 1) return false
      tokens -= 1
      return true
    },
  }
}

/** A random session nonce, 128 bits as hex. */
export function bridgeNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
}

/** The report policy. The wrapper adds `frame-src 'none'` above it. */
const REPORT_POLICY = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src data:",
  "connect-src 'none'",
  "font-src 'none'",
  "media-src 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "child-src 'none'",
  "worker-src 'none'",
  "manifest-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
].join("; ")

/** Escapes text for a double-quoted HTML attribute value. */
function attribute(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll('"', "&quot;")
}

/**
 * The document of the outer frame of a live report. It holds no script: only
 * the inner report frame, under a policy that the inner `srcdoc` document
 * also inherits. Its `frame-src 'none'` stops the inner frame from loading
 * any URL, so the report cannot send data out by navigating its own frame.
 * The inner frame also has only the `allow-scripts` sandbox token.
 */
export function liveReportDocument(source: string, nonce: string): string {
  return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${REPORT_POLICY}"><meta charset="utf-8"><meta name="referrer" content="no-referrer"><style>html,body,iframe{margin:0;border:0;width:100%;height:100%;display:block}</style></head><body><iframe sandbox="allow-scripts" referrerpolicy="no-referrer" title="Report" srcdoc="${attribute(reportDocument(source, nonce))}"></iframe></body></html>`
}

/**
 * The inner report document. Its own policy repeats the wrapper policy, so
 * it holds even if the inherited one changes. Authored HTML goes in the body
 * unchanged: the sandbox and the policies, not sanitizing, contain it.
 */
function reportDocument(source: string, nonce: string): string {
  return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${REPORT_POLICY}"><meta charset="utf-8"><meta name="referrer" content="no-referrer"><script>${bootstrap(nonce)}</script></head><body>${source}</body></html>`
}

/**
 * The frame side of the protocol. It defines `window.dgrape` with
 * `ready` (a promise), `bindings()` and `query(name)`. The report document
 * makes the channel and sends one port with its hello, so the port stays
 * with this document even if the frame later holds another one. The app
 * window is the parent of the wrapper. The nonce is hex, so it is safe in
 * the script text.
 */
function bootstrap(nonce: string): string {
  if (!/^[0-9a-f]{32}$/.test(nonce)) throw new Error("Invalid bridge nonce")
  return `(() => {
  const channel = new MessageChannel(), port = channel.port1, pending = new Map()
  let next = 0, names = [], open, opened = false
  const ready = new Promise((resolve) => { open = resolve })
  port.onmessage = (message) => {
    const data = message.data
    if (!opened) {
      if (!data || data.type !== "${INIT}" || data.version !== ${BRIDGE_PROTOCOL_VERSION}) return
      opened = true
      names = Array.isArray(data.bindings) ? data.bindings.slice() : []
      open()
      return
    }
    const waiting = data && pending.get(data.id)
    if (!waiting) return
    pending.delete(data.id)
    if (data.ok) waiting.resolve(data.result)
    else waiting.reject(Object.assign(new Error(data.error.message), { code: data.error.code }))
  }
  window.dgrape = Object.freeze({
    ready,
    bindings: () => names.slice(),
    query: (name) => ready.then(() => new Promise((resolve, reject) => {
      const id = String(++next)
      pending.set(id, { resolve, reject })
      port.postMessage({ id, type: "query", name: String(name) })
    })),
  })
  parent.parent.postMessage({ type: "${HELLO}", nonce: "${nonce}" }, "*", [channel.port2])
})()`
}

/** A running parent side of the bridge for one frame document. */
export type BridgeSession = { stop: () => void }

/**
 * Starts the parent side for one live report. `frame` is the window of the
 * outer (wrapper) frame. Call `stop` when the frame unmounts; it removes the
 * listener and closes the port. `read` must authorize on the server for each
 * call.
 */
export function startBridgeSession({
  frame,
  nonce,
  bindings,
  read,
  now = Date.now,
}: {
  frame: Window
  nonce: string
  bindings: readonly string[]
  read: (name: string) => Promise<BridgeRead>
  now?: () => number
}): BridgeSession {
  let port: MessagePort | null = null
  let stopped = false
  let pending = 0
  const limiter = rateLimiter(BRIDGE_LIMITS, now)
  const allowed = new Set(bindings)

  const reply = (message: BridgeResponse) => {
    if (!stopped) port?.postMessage(message)
  }
  const fail = (id: string | null, code: BridgeErrorCode, message: string) =>
    reply({ id, ok: false, error: { code, message } })

  const onRequest = (event: MessageEvent<unknown>) => {
    const parsed = Schema.decodeUnknownResult(Request)(event.data)
    if (Result.isFailure(parsed)) {
      const id = Schema.decodeUnknownResult(RequestId)(event.data)
      fail(
        Result.isSuccess(id) ? id.success.id : null,
        "invalid_request",
        'Send { id, type: "query", name } with a string id and binding name.'
      )
      return
    }
    const { id, name } = parsed.success
    if (!allowed.has(name)) {
      fail(id, "unavailable", `This report has no binding "${name}".`)
      return
    }
    if (pending >= BRIDGE_LIMITS.maxPending) {
      fail(id, "too_many_pending", "Wait for a pending query to finish.")
      return
    }
    if (!limiter.take()) {
      fail(id, "rate_limited", "Too many queries. Wait and try again.")
      return
    }
    pending += 1
    read(name).then(
      (result) => {
        pending -= 1
        if (result.problem !== null) fail(id, "unavailable", result.problem)
        else reply({ id, ok: true, result: result.result })
      },
      () => {
        pending -= 1
        fail(id, "failed", "The query could not be read. Check your access.")
      }
    )
  }

  const onHello = (event: MessageEvent<unknown>) => {
    // The report is the only frame in the wrapper (`frame` is the wrapper).
    if (port || stopped || frame.length !== 1 || event.source !== frame[0])
      return
    const hello = Schema.decodeUnknownResult(Hello)(event.data)
    if (Result.isFailure(hello) || hello.success.nonce !== nonce) return
    const [received, ...extra] = event.ports
    if (!received || extra.length > 0) return
    port = received
    port.onmessage = onRequest
    port.postMessage({
      type: INIT,
      version: BRIDGE_PROTOCOL_VERSION,
      bindings: [...bindings],
    })
    window.removeEventListener("message", onHello)
  }

  window.addEventListener("message", onHello)
  return {
    stop() {
      stopped = true
      window.removeEventListener("message", onHello)
      port?.close()
      port = null
    },
  }
}
