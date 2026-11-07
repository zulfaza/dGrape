import type { CSSProperties, ReactNode } from "react"
import type { Id } from "../../convex/_generated/dataModel"
import type { PageBlock, PanelLayout } from "../../convex/lib/pageDomain"
import { DashboardPanel } from "./dashboard-panel"
import {
  PANEL_GAP,
  PANEL_ROW_HEIGHT,
  placeBlocks,
  readingOrder,
} from "@/lib/dashboard-layout"

/**
 * Custom properties that the grid classes read: the row height and gap, and
 * a panel's 1-based grid lines (`x`, `y`) and spans (`w`, `h`).
 */
type GridStyle = CSSProperties & {
  "--panel-row"?: string
  "--panel-gap"?: string
  "--panel-x"?: string
  "--panel-y"?: string
  "--panel-w"?: string
  "--panel-h"?: string
}

/** One panel of a grid: a stable key, its cells and its content. */
export type GridPanel = { key: string; layout: PanelLayout; node: ReactNode }

/**
 * A read-only dashboard grid: 12 columns from `md` up, one column below it.
 * Panels sit in reading order in the DOM, so tab order and the stacked
 * small-screen order follow the layout.
 */
export function StaticDashboardGrid({
  panels,
}: {
  panels: readonly GridPanel[]
}) {
  const order = readingOrder(panels.map((panel) => panel.layout))
  const gridStyle: GridStyle = {
    "--panel-row": `${PANEL_ROW_HEIGHT}px`,
    "--panel-gap": `${PANEL_GAP}px`,
  }
  return (
    <div
      className="grid auto-rows-(--panel-row) grid-cols-1 gap-(--panel-gap) md:grid-cols-12"
      style={gridStyle}
    >
      {order.flatMap((index) => {
        const panel = panels[index]
        if (!panel) return []
        const { x, y, w, h } = panel.layout
        const style: GridStyle = {
          "--panel-x": String(x + 1),
          "--panel-y": String(y + 1),
          "--panel-w": String(w),
          "--panel-h": String(h),
        }
        return [
          <div
            key={panel.key}
            className="row-span-(--panel-h) min-w-0 md:col-span-(--panel-w) md:col-start-(--panel-x) md:row-start-(--panel-y)"
            style={style}
          >
            {panel.node}
          </div>,
        ]
      })}
    </div>
  )
}

/**
 * The blocks of one page version as a read-only grid. Live blocks read the
 * stored revision, so pass `stored: null` for unsaved edits.
 */
export function PageBlocksGrid({
  workspaceId,
  stored,
  blocks,
}: {
  workspaceId: Id<"workspaces">
  stored: { pageId: Id<"pages">; revision: number } | null
  blocks: readonly PageBlock[]
}) {
  return (
    <StaticDashboardGrid
      panels={placeBlocks(blocks).map(({ block, layout }, blockIndex) => ({
        key: String(blockIndex),
        layout,
        node: (
          <DashboardPanel
            workspaceId={workspaceId}
            block={block}
            live={stored && { ...stored, blockIndex }}
          />
        ),
      }))}
    />
  )
}
