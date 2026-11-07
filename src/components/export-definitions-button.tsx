import { useConvex } from "convex/react"
import { FileJson } from "lucide-react"
import { useState } from "react"
import { api } from "../../convex/_generated/api"
import type { Doc } from "../../convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/toast"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { download, fileStem } from "@/lib/record-export"

/**
 * Downloads the workspace definitions (collection schemas, saved queries,
 * recipes, schedules, and pages) as one JSON document. The document has no
 * records and no secret values; see convex/lib/workspaceExport.ts.
 */
export function ExportDefinitionsButton({
  workspace,
}: {
  workspace: Doc<"workspaces">
}) {
  const convex = useConvex()
  const [exporting, setExporting] = useState(false)

  async function exportDefinitions() {
    if (exporting) return
    setExporting(true)
    try {
      const result = await convex.query(api.workspaceExport.definitions, {
        workspaceId: workspace._id,
        now: Date.now(),
      })
      if (result.kind === "tooLarge") {
        toast.error(result.message)
        return
      }
      // Convex sorts object keys; the header fields come first in the file.
      const {
        format,
        formatVersion,
        exportedAt,
        workspace: from,
        ...rest
      } = result.document
      download(
        JSON.stringify(
          { format, formatVersion, exportedAt, workspace: from, ...rest },
          null,
          2
        ),
        `${fileStem(workspace.name, "workspace")}-definitions.json`,
        "application/json"
      )
      toast.success("Exported workspace definitions")
    } catch {
      toast.error("Could not export workspace definitions")
    } finally {
      setExporting(false)
    }
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          disabled={exporting}
          onClick={exportDefinitions}
        >
          <FileJson aria-hidden />
          {exporting ? "Exporting…" : "Export setup"}
        </Button>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">
        Downloads collection fields, saved queries, recipes, and pages as JSON.
        Records are not included.
      </TooltipContent>
    </Tooltip>
  )
}
