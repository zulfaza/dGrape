import { validate } from "convex-helpers/validators"
import {
  ConvexError,
  convexToJson,
  v,
  type GenericValidator,
  type Infer,
  type JSONValue,
  type Value,
} from "convex/values"
import type { Id } from "../_generated/dataModel"
import type { MutationCtx } from "../_generated/server"
import type { Grant } from "./agentGrant"
import { sha256 } from "./agentAuthCrypto"

/**
 * Idempotent agent writes. An agent sends an `idempotencyKey` with a write.
 * The first request runs the write and keeps its result in the `operations`
 * table, in the same transaction. A retry with the same key and the same
 * input returns that result and does not write again. A retry with the same
 * key and a different input fails with 409.
 *
 * A key belongs to one caller in one workspace (see callerKey). A row stays
 * for OPERATION_TTL_MS; convex/operations.ts deletes expired rows. After
 * that, the key is free again.
 *
 * Only a write that returns is kept. A write that throws rolls back with its
 * row, so the agent can retry it.
 */

export const OPERATION_TTL_MS = 24 * 60 * 60 * 1000
export const MAX_OPERATION_KEY_LENGTH = 200

export const operationFields = {
  workspaceId: v.id("workspaces"),
  /** See callerKey. */
  caller: v.string(),
  key: v.string(),
  /** The name of the write, for example "collections.create". */
  operation: v.string(),
  /** SHA-256 of the operation name and its canonical input. */
  fingerprint: v.string(),
  /** The first result, as Convex JSON. */
  result: v.string(),
  expiresAt: v.number(),
}

/**
 * The caller that owns a key. A token issued to an auth.md registration
 * is replaced when it expires, so keys belong to the registration. Other
 * credentials own their keys.
 */
export function callerKey(
  grant: Pick<Grant, "grantId" | "registrationId">
): string {
  return grant.registrationId
    ? `registration:${grant.registrationId}`
    : `grant:${grant.grantId}`
}

/** The same value with object keys in sorted order. */
function sortKeys(value: JSONValue): JSONValue {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value instanceof Object)
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, item]) => [key, sortKeys(item)])
    )
  return value
}

export type OperationRequest = {
  workspaceId: Id<"workspaces">
  caller: string
  operation: string
  /** No key: the write runs each time. */
  key: string | undefined
  /** The write's input, without the credential and the key. */
  input: Value
}

/**
 * Runs `run` once for each key. `result` is the validator of the value that
 * `run` returns; a replayed result must still match it.
 */
export async function runOnce<V extends GenericValidator>(
  ctx: MutationCtx,
  request: OperationRequest,
  result: V,
  run: () => Promise<Infer<V>>
): Promise<Infer<V>> {
  const { workspaceId, caller, operation, key } = request
  if (key === undefined) return run()
  if (!key || key.length > MAX_OPERATION_KEY_LENGTH)
    throw new ConvexError({
      status: 400,
      message: `idempotencyKey must be 1 to ${MAX_OPERATION_KEY_LENGTH} characters`,
    })
  const fingerprint = await sha256(
    JSON.stringify(sortKeys(convexToJson({ operation, input: request.input })))
  )
  const now = Date.now()
  const existing = await ctx.db
    .query("operations")
    .withIndex("by_workspaceId_and_caller_and_key", (q) =>
      q.eq("workspaceId", workspaceId).eq("caller", caller).eq("key", key)
    )
    .unique()
  if (existing && existing.expiresAt > now) {
    if (existing.fingerprint !== fingerprint)
      throw new ConvexError({
        status: 409,
        message:
          "This idempotencyKey was used for a different request. Use a new key for a new request.",
      })
    const stored: unknown = JSON.parse(existing.result)
    if (!validate(result, stored))
      throw new ConvexError({
        status: 409,
        message:
          "The first result of this idempotencyKey cannot be returned. Use a new key.",
      })
    return stored
  }
  if (existing) await ctx.db.delete(existing._id)
  const value = await run()
  await ctx.db.insert("operations", {
    workspaceId,
    caller,
    key,
    operation,
    fingerprint,
    result: JSON.stringify(convexToJson(value)),
    expiresAt: now + OPERATION_TTL_MS,
  })
  return value
}

/** The request of an agent write made with `grant`; see callerKey. */
export function agentOperation(
  grant: Grant,
  operation: string,
  key: string | undefined,
  input: Value
): OperationRequest {
  return {
    workspaceId: grant.workspaceId,
    caller: callerKey(grant),
    operation,
    key,
    input,
  }
}
