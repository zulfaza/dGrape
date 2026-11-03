import type { Doc, Id } from "../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../_generated/server"
import type { RecordValues } from "./collectionDomain"
import { checkRecord } from "./references"
import { insertRecord, replaceRecordValues } from "./records"

function key(value: string) {
  if (!value.trim() || value.length > 200)
    throw new Error("Identity must be 1 to 200 characters")
}

/** Authorization belongs to the caller. All writes share its transaction. */
export async function upsertSourceRecord(
  ctx: MutationCtx,
  args: {
    collection: Doc<"collections">
    source: string
    key: string
    expectedRevision: number | null
    values: RecordValues
  }
): Promise<{
  recordId: Id<"collectionRecords">
  revision: number
  status: "created" | "updated"
}> {
  key(args.source)
  key(args.key)
  const checked = await checkRecord(ctx, args.collection, args.values)
  if (!checked.ok) throw new Error(checked.message)
  const identity = await ctx.db
    .query("recordIdentities")
    .withIndex("by_collectionId_and_source_and_key", (q) =>
      q
        .eq("collectionId", args.collection._id)
        .eq("source", args.source)
        .eq("key", args.key)
    )
    .unique()
  if (identity) {
    const record = await ctx.db.get(identity.recordId)
    if (!record || record.collectionId !== args.collection._id)
      throw new Error("Source identity is invalid")
    if (record.revision !== args.expectedRevision)
      throw new Error("Source revision conflict")
    const revision = await replaceRecordValues(
      ctx,
      args.collection,
      record,
      checked.value
    )
    return { recordId: record._id, revision, status: "updated" }
  }
  if (args.expectedRevision !== null)
    throw new Error("Source revision conflict")
  const recordId = await insertRecord(ctx, args.collection, checked.value)
  await ctx.db.insert("recordIdentities", {
    collectionId: args.collection._id,
    source: args.source,
    key: args.key,
    recordId,
  })
  return { recordId, revision: 1, status: "created" }
}

export async function readSourceCursor(
  ctx: QueryCtx,
  args: { collectionId: Id<"collections">; source: string }
): Promise<string | null> {
  const row = await ctx.db
    .query("sourceCursors")
    .withIndex("by_collectionId_and_source", (q) =>
      q.eq("collectionId", args.collectionId).eq("source", args.source)
    )
    .unique()
  return row?.cursor ?? null
}

/** Call after outputs; throw rolls back outputs and cursor together. */
export async function commitSourceCursor(
  ctx: MutationCtx,
  args: {
    collectionId: Id<"collections">
    source: string
    expectedCursor: string | null
    cursor: string
  }
): Promise<void> {
  key(args.source)
  if (args.cursor.length > 2000)
    throw new Error("Cursor exceeds 2000 characters")
  const row = await ctx.db
    .query("sourceCursors")
    .withIndex("by_collectionId_and_source", (q) =>
      q.eq("collectionId", args.collectionId).eq("source", args.source)
    )
    .unique()
  if ((row?.cursor ?? null) !== args.expectedCursor)
    throw new Error("Source cursor conflict")
  if (row) await ctx.db.patch(row._id, { cursor: args.cursor })
  else
    await ctx.db.insert("sourceCursors", {
      collectionId: args.collectionId,
      source: args.source,
      cursor: args.cursor,
    })
}

/** Staged rows stay separate from primary records and visible snapshots. */
export async function stageSnapshotChunk(
  ctx: MutationCtx,
  args: {
    collection: Doc<"collections">
    generation: string
    chunkId: string
    values: RecordValues[]
  }
): Promise<{ status: "staged" | "existing"; count: number }> {
  key(args.generation)
  key(args.chunkId)
  if (args.values.length > 10)
    throw new Error("A snapshot chunk permits at most 10 records")
  for (const values of args.values) {
    const checked = await checkRecord(ctx, args.collection, values)
    if (!checked.ok) throw new Error(checked.message)
  }
  const canonical = JSON.stringify(
    args.values.map((values) =>
      Object.entries(values).sort(([a], [b]) => a.localeCompare(b))
    )
  )
  if (new TextEncoder().encode(canonical).length > 500_000)
    throw new Error("Snapshot chunk exceeds byte budget")
  const digest = Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical))
    ),
    (byte) => byte.toString(16).padStart(2, "0")
  ).join("")
  let generation = await ctx.db
    .query("snapshotGenerations")
    .withIndex("by_collectionId_and_generation", (q) =>
      q
        .eq("collectionId", args.collection._id)
        .eq("generation", args.generation)
    )
    .unique()
  if (!generation) {
    const id = await ctx.db.insert("snapshotGenerations", {
      collectionId: args.collection._id,
      generation: args.generation,
      schemaVersion: args.collection.definition.version,
      published: false,
      createdAt: Date.now(),
    })
    generation = await ctx.db.get(id)
  }
  if (!generation) throw new Error("Snapshot generation missing")
  const chunk = await ctx.db
    .query("snapshotChunks")
    .withIndex("by_generationId_and_chunkId", (q) =>
      q.eq("generationId", generation._id).eq("chunkId", args.chunkId)
    )
    .unique()
  if (chunk) {
    if (chunk.digest !== digest) throw new Error("Snapshot chunk conflict")
    return { status: "existing", count: chunk.count }
  }
  if (generation.published) throw new Error("Published snapshots are immutable")
  if (generation.schemaVersion !== args.collection.definition.version)
    throw new Error("Snapshot schema changed")
  const chunks = await ctx.db
    .query("snapshotChunks")
    .withIndex("by_generationId_and_chunkId", (q) =>
      q.eq("generationId", generation._id)
    )
    .take(100)
  if (chunks.length >= 100)
    throw new Error("Snapshot permits at most 100 chunks")
  for (const values of args.values)
    await ctx.db.insert("snapshotRows", {
      generationId: generation._id,
      chunkId: args.chunkId,
      values,
    })
  await ctx.db.insert("snapshotChunks", {
    generationId: generation._id,
    chunkId: args.chunkId,
    digest,
    count: args.values.length,
  })
  return { status: "staged", count: args.values.length }
}

/** Exact chunk manifest and pointer CAS prevent partial or stale publication. */
export async function publishSnapshot(
  ctx: MutationCtx,
  args: {
    collection: Doc<"collections">
    generation: string
    expectedGeneration: string | null
    expectedChunks: string[]
  }
): Promise<{ generation: string; rowCount: number }> {
  if (
    args.expectedChunks.length < 1 ||
    args.expectedChunks.length > 100 ||
    new Set(args.expectedChunks).size !== args.expectedChunks.length
  )
    throw new Error("Invalid snapshot manifest")
  const generation = await ctx.db
    .query("snapshotGenerations")
    .withIndex("by_collectionId_and_generation", (q) =>
      q
        .eq("collectionId", args.collection._id)
        .eq("generation", args.generation)
    )
    .unique()
  if (
    !generation ||
    generation.schemaVersion !== args.collection.definition.version
  )
    throw new Error("Snapshot schema changed or generation missing")
  const chunks = await ctx.db
    .query("snapshotChunks")
    .withIndex("by_generationId_and_chunkId", (q) =>
      q.eq("generationId", generation._id)
    )
    .take(101)
  if (
    chunks.length !== args.expectedChunks.length ||
    chunks.some((chunk) => !args.expectedChunks.includes(chunk.chunkId))
  )
    throw new Error("Snapshot is incomplete")
  const current = await ctx.db
    .query("snapshotPublications")
    .withIndex("by_collectionId", (q) =>
      q.eq("collectionId", args.collection._id)
    )
    .unique()
  const rowCount = chunks.reduce((sum, chunk) => sum + chunk.count, 0)
  if (current?.generation === args.generation)
    return { generation: args.generation, rowCount }
  if (generation.published)
    throw new Error("Cannot republish an older snapshot")
  if ((current?.generation ?? null) !== args.expectedGeneration)
    throw new Error("Snapshot publication conflict")
  const publication = {
    collectionId: args.collection._id,
    generation: args.generation,
    generationId: generation._id,
    publishedAt: Date.now(),
    rowCount,
  }
  if (current) await ctx.db.replace(current._id, publication)
  else await ctx.db.insert("snapshotPublications", publication)
  await ctx.db.patch(generation._id, { published: true })
  return { generation: args.generation, rowCount }
}
