import {
  cloneLayout,
  moveElement,
  verticalCompactor,
  type Layout,
  type LayoutItem,
} from "react-grid-layout"
import {
  GRID_COLUMNS,
  MAX_PANEL_HEIGHT,
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

/**
 * Pulls panels up into free space, as the edit grid does after each drag,
 * and pushes overlapping panels down.
 */
export function compactLayout(layout: Layout): Layout {
  return verticalCompactor.compact(layout, GRID_COLUMNS)
}

/** The keyboard moves of the panel menu. */
export const panelMoves = [
  { move: "left", label: "Move left" },
  { move: "right", label: "Move right" },
  { move: "up", label: "Move up" },
  { move: "down", label: "Move down" },
  { move: "wider", label: "Wider" },
  { move: "narrower", label: "Narrower" },
  { move: "taller", label: "Taller" },
  { move: "shorter", label: "Shorter" },
] as const
export type PanelMove = (typeof panelMoves)[number]["move"]

const columnsOverlap = (a: PanelLayout, b: PanelLayout) =>
  a.x < b.x + b.w && b.x < a.x + a.w

/** The nearest panel directly above `item` that shares a column with it. */
function panelAbove(layout: Layout, item: LayoutItem) {
  return layout
    .filter(
      (other) =>
        other.i !== item.i &&
        columnsOverlap(other, item) &&
        other.y + other.h <= item.y
    )
    .sort((a, b) => b.y + b.h - (a.y + a.h))[0]
}

/** The nearest panel directly below `item` that shares a column with it. */
function panelBelow(layout: Layout, item: LayoutItem) {
  return layout
    .filter(
      (other) =>
        other.i !== item.i &&
        columnsOverlap(other, item) &&
        other.y >= item.y + item.h
    )
    .sort((a, b) => a.y - b.y)[0]
}

/** Moves `item` up past the panel above it, which moves down. */
function moveUp(layout: Layout, id: string): Layout | null {
  const next = cloneLayout(layout)
  const item = next.find((other) => other.i === id)
  if (!item || item.y === 0) return null
  const above = panelAbove(next, item)
  return moveElement(
    next,
    item,
    item.x,
    above ? above.y : item.y - 1,
    true,
    false,
    "vertical",
    GRID_COLUMNS
  )
}

/**
 * The layout after one keyboard move of panel `id`, compacted as a drag
 * would be, or null when the move cannot change anything.
 */
export function applyPanelMove(
  layout: Layout,
  id: string,
  move: PanelMove
): Layout | null {
  const next = cloneLayout(layout)
  const item = next.find((other) => other.i === id)
  if (!item) return null
  const moved = ((): Layout | null => {
    switch (move) {
      case "left":
      case "right": {
        const x = item.x + (move === "left" ? -1 : 1)
        if (x < 0 || x + item.w > GRID_COLUMNS) return null
        return moveElement(
          next,
          item,
          x,
          item.y,
          true,
          false,
          "vertical",
          GRID_COLUMNS
        )
      }
      case "up":
        return moveUp(next, id)
      case "down": {
        // Moving down is moving the panel below up past this one.
        const below = panelBelow(next, item)
        return below ? moveUp(next, below.i) : null
      }
      case "wider":
        if (item.w >= GRID_COLUMNS) return null
        if (item.x + item.w >= GRID_COLUMNS) item.x -= 1
        item.w += 1
        return next
      case "narrower":
        if (item.w <= 1) return null
        item.w -= 1
        return next
      case "taller":
        if (item.h >= MAX_PANEL_HEIGHT) return null
        item.h += 1
        return next
      case "shorter":
        if (item.h <= 1) return null
        item.h -= 1
        return next
    }
  })()
  if (!moved) return null
  const compacted = compactLayout(moved)
  return sameLayout(layout, compacted) ? null : compacted
}

/** True when both layouts place every panel in the same cells. */
export function sameLayout(a: Layout, b: Layout) {
  return (
    a.length === b.length &&
    a.every((item) => {
      const other = b.find((candidate) => candidate.i === item.i)
      return (
        other !== undefined &&
        other.x === item.x &&
        other.y === item.y &&
        other.w === item.w &&
        other.h === item.h
      )
    })
  )
}
