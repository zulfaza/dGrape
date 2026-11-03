import { useQuery } from "convex/react"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import type { PageBlock } from "../../convex/lib/pageDomain"

export function PageLiveBlock({
  pageId,
  revision,
  blockIndex,
  block,
}: {
  pageId: Id<"pages">
  revision: number
  blockIndex: number
  block: Extract<PageBlock, { kind: "table" | "metric" }>
}) {
  const live = useQuery(api.pages.liveBlock, { pageId, revision, blockIndex })
  if (live === undefined) return <p role="status">Loading live values…</p>
  if (live.problem || !live.result)
    return <p role="alert">{live.problem ?? "Live values unavailable"}</p>
  const result = live.result
  const partial = result.completeness === "partial"
  const numbers =
    block.kind === "metric"
      ? result.page.flatMap((row) => {
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
        · Live
      </p>
      {block.kind === "table" ? (
        <div className="overflow-auto">
          <table className="w-full text-left">
            <caption>
              {block.title} · {result.page.length} rows
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
              {result.page.map((row) => (
                <tr key={row._id}>
                  {block.fields.map((field) => (
                    <td key={field} className="border-t p-2">
                      {row.values[field] === undefined
                        ? "Missing"
                        : String(row.values[field])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {result.page.length === 0 && <p>No matching records.</p>}
        </div>
      ) : (
        <>
          <p className="text-2xl">
            {block.operation === "count"
              ? result.page.length
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
            {block.operation === "sum" && numbers.length < result.page.length
              ? ` · ${result.page.length - numbers.length} missing or invalid numeric values excluded`
              : ""}
          </p>
        </>
      )}
    </section>
  )
}
