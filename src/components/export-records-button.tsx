import { useConvex } from "convex/react"
import type { PaginationResult } from "convex/server"
import { Download } from "lucide-react"
import { useState } from "react"
import { api } from "../../convex/_generated/api"
import type { Doc } from "../../convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { toast } from "@/components/ui/toast"
import {
  download,
  fileStem,
  toCsv,
  toJson,
  type ExportFormat,
} from "@/lib/record-export"

const PAGE_SIZE = 50

/**
 * Downloads every record of a collection as JSON or CSV. It reads the
 * records page by page, in the order they were added.
 */
export function ExportRecordsButton({
  collection,
  disabled,
}: {
  collection: Doc<"collections">
  disabled: boolean
}) {
  const convex = useConvex()
  const [exporting, setExporting] = useState(false)

  async function exportAs(format: ExportFormat) {
    if (exporting) return
    setExporting(true)
    try {
      const records: Array<Doc<"collectionRecords">> = []
      let cursor: string | null = null
      for (;;) {
        const page: PaginationResult<Doc<"collectionRecords">> =
          await convex.query(api.workspaces.listRecords, {
            collectionId: collection._id,
            paginationOpts: { numItems: PAGE_SIZE, cursor },
          })
        records.push(...page.page)
        if (page.isDone) break
        cursor = page.continueCursor
      }
      const stem = fileStem(collection.name, "collection")
      if (format === "json")
        download(
          toJson(collection, records),
          `${stem}.json`,
          "application/json"
        )
      else download(toCsv(collection, records), `${stem}.csv`, "text/csv")
      toast.success(
        records.length === 1
          ? "Exported 1 record"
          : `Exported ${records.length} records`
      )
    } catch {
      toast.error("Could not export records")
    } finally {
      setExporting(false)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" disabled={disabled || exporting}>
          <Download aria-hidden />
          {exporting ? "Exporting…" : "Export"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => exportAs("csv")}>
          CSV
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => exportAs("json")}>
          JSON
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
