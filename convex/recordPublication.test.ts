/// <reference types="vite/client" />
import { convexTest } from "convex-test"
import { describe, expect, test } from "vitest"
import schema from "./schema"
import {
  commitSourceCursor,
  publishSnapshot,
  readSourceCursor,
  stageSnapshotChunk,
  upsertSourceRecord,
} from "./lib/recordPublication"
const modules = import.meta.glob("./**/*.ts")

async function setup() {
  const t = convexTest(schema, modules)
  const collection = await t.run(async (ctx) => {
    const workspaceId = await ctx.db.insert("workspaces", { name: "Test" })
    const id = await ctx.db.insert("collections", {
      workspaceId,
      name: "Totals",
      definition: {
        version: 1,
        fields: [
          { id: "total", label: "Total", type: "number", indexed: true },
        ],
      },
    })
    const collection = await ctx.db.get(id)
    if (!collection) throw new Error("Missing fixture")
    return collection
  })
  return { t, collection }
}

describe("source output transactions", () => {
  test("cursor conflict rolls back outputs; source revisions prevent overwrite", async () => {
    const { t, collection } = await setup()
    const first = await t.run(async (ctx) => {
      const result = await upsertSourceRecord(ctx, {
        collection,
        source: "bank",
        key: "1",
        expectedRevision: null,
        values: { total: 10 },
      })
      await commitSourceCursor(ctx, {
        collectionId: collection._id,
        source: "bank",
        expectedCursor: null,
        cursor: "a",
      })
      return result
    })
    await expect(
      t.run(async (ctx) => {
        await upsertSourceRecord(ctx, {
          collection,
          source: "bank",
          key: "1",
          expectedRevision: first.revision,
          values: { total: 20 },
        })
        await commitSourceCursor(ctx, {
          collectionId: collection._id,
          source: "bank",
          expectedCursor: null,
          cursor: "b",
        })
      })
    ).rejects.toThrow("Source cursor conflict")
    expect(await t.run((ctx) => ctx.db.get(first.recordId))).toMatchObject({
      values: { total: 10 },
      revision: 1,
    })
    await expect(
      t.run((ctx) =>
        upsertSourceRecord(ctx, {
          collection,
          source: "bank",
          key: "1",
          expectedRevision: null,
          values: { total: 30 },
        })
      )
    ).rejects.toThrow("revision conflict")
    expect(
      await t.run((ctx) =>
        readSourceCursor(ctx, { collectionId: collection._id, source: "bank" })
      )
    ).toBe("a")
    const result = await t.run((ctx) =>
      upsertSourceRecord(ctx, {
        collection,
        source: "bank",
        key: "1",
        expectedRevision: 1,
        values: { total: 30 },
      })
    )
    expect(result).toMatchObject({ recordId: first.recordId, revision: 2 })
    const entries = await t.run((ctx) =>
      ctx.db
        .query("recordIndexEntries")
        .withIndex("by_recordId", (q) => q.eq("recordId", first.recordId))
        .collect()
    )
    expect(entries.map((row) => row.value)).toEqual([30])
  })
})

describe("snapshot publication", () => {
  test("retries chunks, rejects partial sets, and atomically switches complete snapshots", async () => {
    const { t, collection } = await setup()
    const stage = (generation: string, chunkId: string, total: number) =>
      t.run((ctx) =>
        stageSnapshotChunk(ctx, {
          collection,
          generation,
          chunkId,
          values: [{ total }],
        })
      )
    const publish = (
      generation: string,
      expectedGeneration: string | null,
      expectedChunks: string[]
    ) =>
      t.run((ctx) =>
        publishSnapshot(ctx, {
          collection,
          generation,
          expectedGeneration,
          expectedChunks,
        })
      )
    await stage("g1", "a", 1)
    expect(await stage("g1", "a", 1)).toEqual({ status: "existing", count: 1 })
    await expect(stage("g1", "a", 2)).rejects.toThrow("chunk conflict")
    await expect(publish("g1", null, ["a", "b"])).rejects.toThrow("incomplete")
    await stage("g1", "b", 2)
    expect(await publish("g1", null, ["a", "b"])).toEqual({
      generation: "g1",
      rowCount: 2,
    })
    expect(await publish("g1", null, ["a", "b"])).toEqual({
      generation: "g1",
      rowCount: 2,
    })
    await expect(stage("g1", "c", 3)).rejects.toThrow("immutable")
    await stage("g2", "a", 4)
    await expect(publish("g2", null, ["a"])).rejects.toThrow(
      "publication conflict"
    )
    const before = await t.run((ctx) =>
      ctx.db
        .query("snapshotPublications")
        .withIndex("by_collectionId", (q) =>
          q.eq("collectionId", collection._id)
        )
        .unique()
    )
    expect(before?.generation).toBe("g1")
    await publish("g2", "g1", ["a"])
    await expect(publish("g1", "g2", ["a", "b"])).rejects.toThrow(
      "older snapshot"
    )
    expect(
      await t.run((ctx) =>
        ctx.db
          .query("collectionRecords")
          .withIndex("by_collection", (q) =>
            q.eq("collectionId", collection._id)
          )
          .collect()
      )
    ).toEqual([])
  })
  test("schema changes and invalid values cannot be published", async () => {
    const { t, collection } = await setup()
    await expect(
      t.run((ctx) =>
        stageSnapshotChunk(ctx, {
          collection,
          generation: "bad",
          chunkId: "a",
          values: [{ total: "invalid" }],
        })
      )
    ).rejects.toThrow("finite number")
    await t.run((ctx) =>
      stageSnapshotChunk(ctx, {
        collection,
        generation: "g",
        chunkId: "a",
        values: [{ total: 1 }],
      })
    )
    const changed = {
      ...collection,
      definition: { ...collection.definition, version: 2 },
    }
    await expect(
      t.run((ctx) =>
        publishSnapshot(ctx, {
          collection: changed,
          generation: "g",
          expectedGeneration: null,
          expectedChunks: ["a"],
        })
      )
    ).rejects.toThrow("schema changed")
  })
})
