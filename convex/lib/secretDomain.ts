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
export const routeValidator = v.object({
  path: v.string(),
  method: methodValidator,
  queryKeys: v.array(v.string()),
  fields: v.array(v.string()),
})
export const connectionFields = {
  workspaceId: v.id("workspaces"),
  createdBy: v.string(),
  label: v.string(),
  secretRef: v.id("secretRefs"),
  origin: v.string(),
  routes: v.array(routeValidator),
}
export const rowValidator = v.record(
  v.string(),
  v.union(v.string(), v.number(), v.boolean())
)
export type ConnectorRoute = Infer<typeof routeValidator>
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
  if (
    !/^\/[a-zA-Z0-9/_-]*$/.test(route.path) ||
    route.path.includes("//") ||
    route.path.length > 240 ||
    route.queryKeys.length > 20 ||
    route.fields.length < 1 ||
    route.fields.length > 50
  )
    throw new Error("Invalid route")
  for (const key of [...route.queryKeys, ...route.fields]) {
    if (
      !/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(key) ||
      /token|secret|password|credential|authorization|cookie|api.?key/i.test(
        key
      )
    )
      throw new Error("Unsafe field")
  }
}
