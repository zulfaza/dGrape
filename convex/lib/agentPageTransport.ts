import { Schema } from "effect"

/**
 * Wire contract of the agent page operations. The HTTP routes
 * (convex/http.ts) decode with these schemas, and the MCP tools
 * (src/mcp/server.ts) use them for parameters and results. A page definition
 * matches pageDefinitionValidator in convex/lib/pageDomain.ts, with IDs as
 * strings that convex/agentPages.ts checks.
 */

export const MAX_PAGE_SIZE = 20

const Revision = Schema.Int.check(Schema.isGreaterThanOrEqualTo(1))
const Binding = Schema.Struct({ queryId: Schema.String, revision: Schema.Int })
const DataBlock = { title: Schema.String, binding: Binding }

export const Definition = Schema.Struct({
  title: Schema.String,
  blocks: Schema.mutable(
    Schema.Array(
      Schema.Union([
        Schema.Struct({
          kind: Schema.Literal("markdown"),
          text: Schema.String,
        }),
        Schema.Struct({
          kind: Schema.Literal("table"),
          ...DataBlock,
          fields: Schema.mutable(Schema.Array(Schema.String)),
        }),
        Schema.Struct({
          kind: Schema.Literal("metric"),
          ...DataBlock,
          field: Schema.String,
          unit: Schema.String,
          operation: Schema.Literals(["sum", "count"]),
        }),
        Schema.Struct({
          kind: Schema.Literal("chart"),
          ...DataBlock,
          chart: Schema.Union([
            Schema.Struct({
              type: Schema.Literals(["bar", "line", "area", "pie"]),
              labelField: Schema.String,
              valueField: Schema.String,
              unit: Schema.String,
            }),
            Schema.Struct({
              type: Schema.Literal("scatter"),
              labelField: Schema.String,
              xField: Schema.String,
              xUnit: Schema.String,
              valueField: Schema.String,
              unit: Schema.String,
            }),
          ]),
        }),
        Schema.Struct({
          kind: Schema.Literal("artifact"),
          title: Schema.String,
          artifactId: Schema.String,
        }),
        Schema.Struct({
          kind: Schema.Literal("htmlReport"),
          title: Schema.String,
          artifactId: Schema.String,
        }),
      ])
    )
  ),
})

const Page = Schema.Struct({
  pageId: Schema.String,
  title: Schema.String,
  revision: Schema.Number,
  publishedRevision: Schema.NullOr(Schema.Number),
})

export const SaveDraftInput = Schema.Struct({
  pageId: Schema.optionalKey(Schema.String),
  expectedRevision: Schema.optionalKey(Revision),
  definition: Definition,
})

export const SavedDraft = Schema.Struct({
  pageId: Schema.String,
  revision: Schema.Number,
})

export const PublishInput = Schema.Struct({
  pageId: Schema.String,
  revision: Revision,
  expectedRevision: Revision,
  expectedPublishedRevision: Schema.NullOr(Revision),
})

export const Published = Page

export const GetInput = Schema.Struct({
  pageId: Schema.String,
  revision: Schema.optionalKey(Revision),
})

export const PageDetail = Schema.Struct({
  page: Page,
  version: Schema.NullOr(
    Schema.Struct({
      revision: Schema.Number,
      definition: Definition,
      createdAt: Schema.Number,
    })
  ),
  bindings: Schema.Array(Schema.NullOr(Schema.String)),
})

export const ListInput = Schema.Struct({
  limit: Schema.optionalKey(
    Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: MAX_PAGE_SIZE }))
  ),
  cursor: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(4096))),
})

export const PageList = Schema.Struct({
  page: Schema.Array(Page),
  isDone: Schema.Boolean,
  continueCursor: Schema.String,
})
