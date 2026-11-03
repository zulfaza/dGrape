import { v, type Infer } from "convex/values"

export const secretOwner = v.union(
  v.object({ kind: v.literal("workspace") }),
  v.object({ kind: v.literal("user"), userId: v.string() })
)
export const secretState = v.union(
  v.object({
    kind: v.literal("pending"),
    writeUntil: v.number(),
    name: v.string(),
    previousName: v.union(v.string(), v.null()),
  }),
  v.object({
    kind: v.literal("ready"),
    name: v.string(),
    objectId: v.string(),
  }),
  v.object({ kind: v.literal("deleting"), names: v.array(v.string()) }),
  v.object({ kind: v.literal("deleted") })
)
export const secretFields = {
  workspaceId: v.id("workspaces"),
  createdBy: v.string(),
  owner: secretOwner,
  label: v.string(),
  revision: v.number(),
  state: secretState,
}
export const methodValidator = v.union(v.literal("GET"), v.literal("POST"))
/**
 * Where rows and the next page are in a JSON response.
 * `rows` is a key path to the row array; an empty path means the body is the array.
 * `next` is `none` (one page), `body` (a string at `path`, sent back as query `param`),
 * or `link` (the `rel="next"` URL of the Link header, on the same origin and path).
 */
export const responseValidator = v.object({
  rows: v.array(v.string()),
  next: v.union(
    v.object({ kind: v.literal("none") }),
    v.object({
      kind: v.literal("body"),
      path: v.array(v.string()),
      param: v.string(),
    }),
    v.object({ kind: v.literal("link") })
  ),
})
export const routeValidator = v.object({
  path: v.string(),
  method: methodValidator,
  queryKeys: v.array(v.string()),
  fields: v.array(v.string()),
  /** Absent means `{ rows, nextCursor }` with the `cursor` query parameter. */
  response: v.optional(responseValidator),
})
const connectionBase = {
  workspaceId: v.id("workspaces"),
  createdBy: v.string(),
  label: v.string(),
  secretRef: v.id("secretRefs"),
}
/**
 * A generic HTTP connection stores its approved origin and routes.
 * A GitHub connection stores none: trusted code owns its origin and reads.
 * Rows from before connector kinds have no `kind` and are HTTP connections.
 */
export const connectionFields = v.union(
  v.object({
    ...connectionBase,
    kind: v.optional(v.literal("http")),
    origin: v.string(),
    routes: v.array(routeValidator),
  }),
  v.object({ ...connectionBase, kind: v.literal("github") })
)
export const rowValidator = v.record(
  v.string(),
  v.union(v.string(), v.number(), v.boolean())
)
export type ConnectorRoute = Infer<typeof routeValidator>
export type ResponseMapping = Infer<typeof responseValidator>
export const defaultResponse: ResponseMapping = {
  rows: ["rows"],
  next: { kind: "body", path: ["nextCursor"], param: "cursor" },
}
export function safeLabel(value: string) {
  if (!/^[a-zA-Z][a-zA-Z0-9 ._-]{0,79}$/.test(value))
    throw new Error("Use a short label with letters and numbers")
  return value
}
/** Exact HTTPS origins only. IP addresses and local names are not destinations. */
export function checkOrigin(value: string) {
  const url = new URL(value)
  if (
    url.protocol !== "https:" ||
    url.origin !== value ||
    !/^[a-z][a-z0-9.-]*\.[a-z]{2,}$/i.test(url.hostname) ||
    /(^|\.)(localhost|local|internal|test|invalid)$/.test(url.hostname)
  )
    throw new Error("Use a public HTTPS origin")
  return value
}
export function checkRoute(route: ConnectorRoute) {
  const response = route.response ?? defaultResponse
  const paths = [
    response.rows,
    ...(response.next.kind === "body" ? [response.next.path] : []),
  ]
  if (
    paths.some((path) => path.length > 5) ||
    (response.next.kind === "body" && response.next.path.length < 1) ||
    // Older routes without a mapping may omit `cursor`; they then fetch one page.
    (route.response?.next.kind === "body" &&
      !route.queryKeys.includes(route.response.next.param))
  )
    throw new Error("Invalid route")
  if (
    !/^\/[a-zA-Z0-9/_-]*$/.test(route.path) ||
    route.path.includes("//") ||
    route.path.length > 240 ||
    route.queryKeys.length > 20 ||
    route.fields.length < 1 ||
    route.fields.length > 50
  )
    throw new Error("Invalid route")
  for (const key of [...route.queryKeys, ...route.fields, ...paths.flat()]) {
    if (
      !/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(key) ||
      /token|secret|password|credential|authorization|cookie|api.?key/i.test(
        key
      )
    )
      throw new Error("Unsafe field")
  }
}
