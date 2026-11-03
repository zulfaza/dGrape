import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server"
import { Effect } from "effect"
import { v, type Infer } from "convex/values"
import { internal } from "./_generated/api"
import type { Doc, Id } from "./_generated/dataModel"
import {
  internalAction,
  internalQuery,
  mutation,
  query,
  type QueryCtx,
} from "./_generated/server"
import { resolveGrant } from "./lib/agentGrant"
import { requireMembership, requireUserId } from "./lib/auth"
import {
  checkOrigin,
  checkRoute,
  connectionFields,
  methodValidator,
  routeValidator,
  rowValidator,
  safeLabel,
} from "./lib/secretDomain"
import { configuredSecretLayer } from "./lib/secretService"
import { fetchConnectorPage } from "./lib/connectorFetch"

/** Only trusted recipe ownership/run code may supply principalUserId. */
export const useArgs = {
  workspaceId: v.id("workspaces"),
  connectionId: v.id("connections"),
  principalUserId: v.string(),
}
export async function requireConnectionUse(
  ctx: QueryCtx,
  args: {
    workspaceId: Id<"workspaces">
    connectionId: Id<"connections">
    principalUserId: string
  }
) {
  const member = await ctx.db
    .query("workspaceMembers")
    .withIndex("by_workspace_user", (q) =>
      q.eq("workspaceId", args.workspaceId).eq("userId", args.principalUserId)
    )
    .unique()
  const connection = await ctx.db.get(args.connectionId)
  if (!member || !connection || connection.workspaceId !== args.workspaceId)
    throw new Error("Connection access denied")
  const secret = await ctx.db.get(connection.secretRef)
  const grant = await ctx.db
    .query("connectionUseGrants")
    .withIndex("by_connectionId_and_userId", (q) =>
      q.eq("connectionId", args.connectionId).eq("userId", args.principalUserId)
    )
    .unique()
  if (
    !secret ||
    secret.workspaceId !== args.workspaceId ||
    secret.state.kind !== "ready" ||
    (connection.createdBy !== args.principalUserId && !grant) ||
    (secret.owner.kind === "user" &&
      secret.owner.userId !== args.principalUserId &&
      !grant?.secretUse)
  )
    throw new Error("Connection access denied")
  checkOrigin(connection.origin)
  if (
    !(process.env.CONNECTOR_ALLOWED_ORIGINS ?? "")
      .split(",")
      .includes(connection.origin)
  )
    throw new Error("Connection access denied")
  connection.routes.forEach(checkRoute)
  return { connection, secret }
}
export const authorizeUse = internalQuery({
  args: useArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireConnectionUse(ctx, args)
    return null
  },
})
export const executionConfig = internalQuery({
  args: useArgs,
  returns: v.object({
    origin: v.string(),
    routes: v.array(routeValidator),
    name: v.string(),
    scope: v.object({
      workspaceId: v.string(),
      userId: v.union(v.string(), v.null()),
    }),
  }),
  handler: async (ctx, args) => {
    const { connection, secret } = await requireConnectionUse(ctx, args)
    if (secret.state.kind !== "ready")
      throw new Error("Connection access denied")
    return {
      origin: connection.origin,
      routes: connection.routes,
      name: secret.state.name,
      scope: {
        workspaceId: secret.workspaceId,
        userId: secret.owner.kind === "user" ? secret.owner.userId : null,
      },
    }
  },
})
export const fetchPage = internalAction({
  args: {
    ...useArgs,
    route: v.string(),
    method: methodValidator,
    query: v.record(v.string(), v.string()),
    cursor: v.union(v.string(), v.null()),
    limits: v.object({ maxRows: v.number(), maxBytes: v.number() }),
  },
  returns: v.object({
    rows: v.array(rowValidator),
    nextCursor: v.union(v.string(), v.null()),
    bytesRead: v.number(),
  }),
  handler: async (
    ctx,
    args
  ): Promise<{
    rows: Record<string, string | number | boolean>[]
    nextCursor: string | null
    bytesRead: number
  }> => {
    const config = await ctx.runQuery(internal.connectors.executionConfig, {
      workspaceId: args.workspaceId,
      connectionId: args.connectionId,
      principalUserId: args.principalUserId,
    })
    return Effect.runPromise(
      fetchConnectorPage(config, args).pipe(
        Effect.provide(configuredSecretLayer())
      )
    )
  },
})
/** A user sees a connection that they created or that they may use. */
async function canSeeConnection(
  ctx: QueryCtx,
  connection: Doc<"connections">,
  userId: string
) {
  if (connection.createdBy === userId) return true
  const grant = await ctx.db
    .query("connectionUseGrants")
    .withIndex("by_connectionId_and_userId", (q) =>
      q.eq("connectionId", connection._id).eq("userId", userId)
    )
    .unique()
  return grant !== null
}

/**
 * A connection as agents see it. It holds no secret value, provider object
 * name or ID, or secret reference ID: only the credential's safe label,
 * owner kind, and lifecycle status.
 */
const agentConnectionValidator = v.object({
  id: v.id("connections"),
  label: v.string(),
  origin: v.string(),
  routes: v.array(routeValidator),
  credential: v.object({
    label: v.string(),
    owner: v.union(v.literal("workspace"), v.literal("user")),
    status: v.union(
      v.literal("ready"),
      v.literal("pending"),
      v.literal("deleting"),
      v.literal("deleted"),
      v.literal("missing")
    ),
  }),
  /** True when a recipe of the credential owner can fetch with it now. */
  usable: v.boolean(),
})

async function agentConnection(
  ctx: QueryCtx,
  connection: Doc<"connections">,
  principalUserId: string
): Promise<Infer<typeof agentConnectionValidator>> {
  const secret = await ctx.db.get(connection.secretRef)
  const credential: Infer<typeof agentConnectionValidator>["credential"] =
    secret && secret.workspaceId === connection.workspaceId
      ? {
          label: secret.label,
          owner: secret.owner.kind,
          status: secret.state.kind,
        }
      : { label: "", owner: "workspace", status: "missing" }
  let usable = true
  try {
    await requireConnectionUse(ctx, {
      workspaceId: connection.workspaceId,
      connectionId: connection._id,
      principalUserId,
    })
  } catch {
    usable = false
  }
  return {
    id: connection._id,
    label: connection.label,
    origin: connection.origin,
    routes: connection.routes,
    credential,
    usable,
  }
}

/** Connections that the agent credential's owner can see, one page. */
export const agentList = internalQuery({
  args: {
    digest: v.string(),
    cursor: v.union(v.string(), v.null()),
    limit: v.number(),
    now: v.number(),
  },
  returns: v.union(
    v.literal("denied"),
    paginationResultValidator(agentConnectionValidator)
  ),
  // Callers (convex/agentDiscoveryHttp.ts) validate limit and cursor size.
  handler: async (ctx, args) => {
    const grant = await resolveGrant(ctx, args.digest, args.now)
    if (!grant) return "denied"
    const connections = await ctx.db
      .query("connections")
      .withIndex("by_workspaceId", (q) =>
        q.eq("workspaceId", grant.workspaceId)
      )
      .paginate({ cursor: args.cursor, numItems: args.limit })
    const page: Infer<typeof agentConnectionValidator>[] = []
    for (const connection of connections.page)
      if (await canSeeConnection(ctx, connection, grant.owner))
        page.push(await agentConnection(ctx, connection, grant.owner))
    return {
      page,
      isDone: connections.isDone,
      continueCursor: connections.continueCursor,
    }
  },
})

/** One connection that the agent credential's owner can see. */
export const agentDescribe = internalQuery({
  args: { digest: v.string(), connectionId: v.string(), now: v.number() },
  returns: v.union(v.literal("denied"), agentConnectionValidator),
  handler: async (ctx, args) => {
    const grant = await resolveGrant(ctx, args.digest, args.now)
    if (!grant) return "denied"
    const id = ctx.db.normalizeId("connections", args.connectionId)
    const connection = id && (await ctx.db.get(id))
    if (
      !connection ||
      connection.workspaceId !== grant.workspaceId ||
      !(await canSeeConnection(ctx, connection, grant.owner))
    )
      return "denied"
    return agentConnection(ctx, connection, grant.owner)
  },
})
export const list = query({
  args: {
    workspaceId: v.id("workspaces"),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(
    v.object({
      id: v.id("connections"),
      label: v.string(),
      secretRef: v.id("secretRefs"),
      origin: v.string(),
      routes: v.array(routeValidator),
    })
  ),
  handler: async (ctx, { workspaceId, paginationOpts }) => {
    const member = await requireMembership(ctx, workspaceId)
    if (
      !Number.isInteger(paginationOpts.numItems) ||
      paginationOpts.numItems < 1 ||
      paginationOpts.numItems > 100
    )
      throw new Error("Page size must be between 1 and 100")
    const connections = await ctx.db
      .query("connections")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", workspaceId))
      .paginate(paginationOpts)
    const visible: {
      id: Id<"connections">
      label: string
      secretRef: Id<"secretRefs">
      origin: string
      routes: Doc<"connections">["routes"]
    }[] = []
    for (const c of connections.page) {
      if (await canSeeConnection(ctx, c, member.userId))
        visible.push({
          id: c._id,
          label: c.label,
          secretRef: c.secretRef,
          origin: c.origin,
          routes: c.routes,
        })
    }
    return { ...connections, page: visible }
  },
})
export const create = mutation({
  args: {
    workspaceId: connectionFields.workspaceId,
    secretRef: connectionFields.secretRef,
    label: v.string(),
    origin: v.string(),
    routes: v.array(routeValidator),
  },
  returns: v.id("connections"),
  handler: async (ctx, args) => {
    const member = await requireMembership(ctx, args.workspaceId)
    const secret = await ctx.db.get(args.secretRef)
    if (
      !secret ||
      secret.workspaceId !== args.workspaceId ||
      secret.createdBy !== member.userId ||
      secret.state.kind !== "ready"
    )
      throw new Error("Secret access denied")
    if (args.routes.length < 1 || args.routes.length > 10)
      throw new Error("Use 1 to 10 routes")
    checkOrigin(args.origin)
    // Operators must approve destinations, including their DNS/network policy.
    const origins = (process.env.CONNECTOR_ALLOWED_ORIGINS ?? "").split(",")
    if (!origins.includes(args.origin))
      throw new Error("This origin is not approved")
    args.routes.forEach(checkRoute)
    return ctx.db.insert("connections", {
      ...args,
      label: safeLabel(args.label),
      createdBy: member.userId,
    })
  },
})
export const grantUse = mutation({
  args: {
    connectionId: v.id("connections"),
    userId: v.string(),
    allowed: v.boolean(),
    secretUse: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId)
    if (!connection) throw new Error("Connection access denied")
    await requireMembership(ctx, connection.workspaceId)
    if (connection.createdBy !== (await requireUserId(ctx)))
      throw new Error("Connection access denied")
    const existing = await ctx.db
      .query("connectionUseGrants")
      .withIndex("by_connectionId_and_userId", (q) =>
        q.eq("connectionId", connection._id).eq("userId", args.userId)
      )
      .unique()
    if (existing) await ctx.db.delete(existing._id)
    if (args.allowed)
      await ctx.db.insert("connectionUseGrants", {
        connectionId: connection._id,
        userId: args.userId,
        secretUse: args.secretUse,
      })
    return null
  },
})
export const remove = mutation({
  args: { connectionId: v.id("connections") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId)
    if (!connection) throw new Error("Connection access denied")
    await requireMembership(ctx, connection.workspaceId)
    if (connection.createdBy !== (await requireUserId(ctx)))
      throw new Error("Connection access denied")
    await ctx.db.delete(connection._id)
    return null
  },
})
