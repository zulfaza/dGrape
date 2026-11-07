import {
  GRID_COLUMNS,
  overlaps,
  type PageBlock,
  type PanelLayout,
} from "../../convex/lib/pageDomain"

/**
 * Dashboard grid geometry, shared by the static grid (CSS grid) and the
 * edit grid (react-grid-layout), so a panel has the same size in both.
 */
export const PANEL_ROW_HEIGHT = 32
export const PANEL_GAP = 8

/** A panel's width and height in grid cells. */
export type PanelSize = Pick<PanelLayout, "w" | "h">

/** The size a new panel, or a stored block without a layout, gets. */
export function defaultPanelSize(block: PageBlock): PanelSize {
  switch (block.kind) {
    case "metric":
      return { w: 3, h: 4 }
    case "chart":
    case "artifact":
    case "htmlReport":
      return { w: 6, h: 8 }
    case "table":
      return { w: 12, h: 8 }
    case "markdown":
      return { w: 12, h: 4 }
  }
}

/**
 * The first free place for a `w` by `h` panel at or after `after` in
 * reading order (top to bottom, then left to right).
 */
export function firstFreePlace(
  taken: readonly PanelLayout[],
  size: PanelSize,
  after: { x: number; y: number } = { x: 0, y: 0 }
): PanelLayout {
  const w = Math.min(size.w, GRID_COLUMNS)
  for (let y = after.y; ; y++)
    for (let x = y === after.y ? after.x : 0; x + w <= GRID_COLUMNS; x++) {
      const candidate = { x, y, w, h: size.h }
      if (!taken.some((item) => overlaps(item, candidate))) return candidate
    }
}

/** The row under the lowest panel. */
export function gridBottom(layouts: readonly PanelLayout[]) {
  return layouts.reduce((bottom, item) => Math.max(bottom, item.y + item.h), 0)
}

/**
 * Each block with its layout. Stored layouts stay as they are. Blocks
 * without one (old pages, agents that send none) flow below them, in block
 * order, with the default size of their kind.
 */
export function placeBlocks(blocks: readonly PageBlock[]) {
  const taken = blocks.flatMap((block) => (block.layout ? [block.layout] : []))
  let cursor = { x: 0, y: gridBottom(taken) }
  return blocks.map((block) => {
    if (block.layout) return { block, layout: block.layout }
    const layout = firstFreePlace(taken, defaultPanelSize(block), cursor)
    taken.push(layout)
    cursor = { x: layout.x + layout.w, y: layout.y }
    return { block, layout }
  })
}

/** Indexes of `layouts` in reading order, for DOM, tab and stacking order. */
export function readingOrder(layouts: readonly PanelLayout[]): number[] {
  return layouts
    .map((layout, index) => ({ layout, index }))
    .sort((a, b) => a.layout.y - b.layout.y || a.layout.x - b.layout.x)
    .map(({ index }) => index)
}
