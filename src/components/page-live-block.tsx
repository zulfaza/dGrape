import { PageChart } from "./page-chart"
import { SourceFreshness } from "./source-freshness"
import { useQuery } from "convex/react"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import type { PageBlock } from "../../convex/lib/pageDomain"
import { valueText } from "@/lib/field-types"

export function PageLiveBlock({
  pageId,
  revision,
  blockIndex,
  block,
}: {
  pageId: Id<"pages">
  revision: number
  blockIndex: number
  block: Extract<PageBlock, { kind: "table" | "metric" | "chart" }>
}) {
  const live = useQuery(api.pages.liveBlock, { pageId, revision, blockIndex })
  if (live === undefined) return <p role="status">Loading live values…</p>
  if (live.problem || !live.result)
    return <p role="alert">{live.problem ?? "Live values unavailable"}</p>
  const result = live.result
  const partial = result.completeness === "partial"
  // An aggregate result has one row per group; its key is unique.
  const rows =
    result.kind === "records"
      ? result.page
      : result.rows.map((row) => ({ _id: row.key, values: row.values }))
  const numbers =
    block.kind === "metric"
      ? rows.flatMap((row) => {
          const value = row.values[block.field]
          // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Stored numeric values require validation before arithmetic.
          return typeof value === "number" && Number.isFinite(value)
            ? [value]
            : []
        })
      : []
  const sum = numbers.reduce((total, value) => total + value, 0)
  return (
    <section
      className="space-y-2 rounded-md border p-3"
      aria-label={block.title}
    >
      <h4 className="font-semibold">{block.title}</h4>
      <p>
        {partial
          ? "Partial result · first bounded sample, not a complete total"
          : "Complete result"}{" "}
        · Read at{" "}
        <time dateTime={new Date(result.evaluatedAt).toISOString()}>
          {new Date(result.evaluatedAt).toISOString()} (UTC)
        </time>
      </p>
      <p>
        <SourceFreshness source={result.source} />
      </p>
      {block.kind !== "table" && rows.length === 0 && (
        <p>No matching records.</p>
      )}
      {/* oxlint-disable-next-line anti-slop-effect/prefer-effect-match -- JSX follows the serializable block discriminant. */}
      {block.kind === "chart" ? (
        <PageChart
          block={block}
          rows={rows}
          fields={result.resultSchema.fields}
        />
      ) : block.kind === "table" ? (
        <div className="overflow-auto">
          <table className="w-full text-left">
            <caption>
              {block.title} · {rows.length} rows
              {partial ? " (partial)" : ""}
            </caption>
            <thead>
              <tr>
                {block.fields.map((field) => (
                  <th scope="col" key={field} className="p-2">
                    {result.resultSchema.fields.find(
                      (item) => item.id === field
                    )?.label ?? field}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row._id}>
                  {block.fields.map((field) => (
                    <td key={field} className="border-t p-2">
                      {row.values[field] === undefined
                        ? "Missing"
                        : valueText(row.values[field])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <p>No matching records.</p>}
        </div>
      ) : (
        <>
          <p className="text-2xl">
            {block.operation === "count"
              ? rows.length
              : numbers.length === 0
                ? "No numeric values"
                : Number.isFinite(sum)
                  ? sum.toLocaleString()
                  : "Numeric result out of range"}{" "}
            {block.unit}
          </p>
          <p>
            {partial ? "Sample " : ""}
            {block.operation === "count" ? "record count" : "sum"}
            {block.operation === "sum" && numbers.length < rows.length
              ? ` · ${rows.length - numbers.length} missing or invalid numeric values excluded`
              : ""}
          </p>
        </>
      )}
    </section>
  )
}
