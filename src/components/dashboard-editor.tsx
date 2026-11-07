import { useMutation, useQuery } from "convex/react"
import { EllipsisVertical, GripVertical, Plus } from "lucide-react"
import { useBlocker, useNavigate } from "@tanstack/react-router"
import { useEffect, useId, useRef, useState, type ReactNode } from "react"
import ReactGridLayout, {
  noCompactor,
  useContainerWidth,
  type Layout,
} from "react-grid-layout"
import { api } from "../../convex/_generated/api"
import type { Doc, Id } from "../../convex/_generated/dataModel"
import {
  GRID_COLUMNS,
  MAX_PANEL_HEIGHT,
  type PageBlock,
  type PageDefinition,
} from "../../convex/lib/pageDomain"
import { ConfirmDialog } from "./confirm-dialog"
import { StaticDashboardGrid } from "./dashboard-grid"
import { DashboardPanel, type PanelControls } from "./dashboard-panel"
import { PageHeader } from "./page-header"
import { PanelDialog } from "./panel-dialog"
import { LoadingRows } from "./loading-rows"
import { Alert, AlertDescription, AlertTitle } from "./ui/alert"
import { Button } from "./ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu"
import { Field, FieldLabel } from "./ui/field"
import { Input } from "./ui/input"
import { toast } from "./ui/toast"
import { useIsMobile } from "@/hooks/use-mobile"
import {
  PANEL_GAP,
  PANEL_ROW_HEIGHT,
  applyPanelMove,
  compactLayout,
  defaultPanelSize,
  firstFreePlace,
  gridBottom,
  panelMoves,
  placeBlocks,
  readingOrder,
  sameLayout,
  type PanelSize,
} from "@/lib/dashboard-layout"
import { errorMessage } from "@/lib/error-message"

/**
 * One panel being edited. `live` is the index of the same block in the
 * saved revision, so the panel can show live data; it is null once the
 * content changes, until the next save.
 */
type EditorPanel = { id: string; block: PageBlock; live: number | null }

type Draft = { title: string; panels: EditorPanel[]; layout: Layout }

type DialogState = { mode: "add" } | { mode: "edit"; id: string } | null

const newId = () => crypto.randomUUID()

/**
 * The draft from a stored definition, with every panel placed. Stored
 * positions stay as they are: only a user change compacts the layout.
 */
function draftOf(definition: PageDefinition): Draft {
  const placed = placeBlocks(definition.blocks).map((item, index) => ({
    ...item,
    id: newId(),
    index,
  }))
  return {
    title: definition.title,
    panels: placed.map(({ id, block, index }) => ({ id, block, live: index })),
    layout: placed.map(({ id, layout }) => ({ i: id, ...layout })),
  }
}

/** The definition to save: blocks in reading order, each with its layout. */
function definitionOf(draft: Draft) {
  const cells = draft.panels.map((panel) => {
    const item = draft.layout.find((cell) => cell.i === panel.id)
    return item
      ? { x: item.x, y: item.y, w: item.w, h: item.h }
      : { x: 0, y: gridBottom(draft.layout), ...defaultPanelSize(panel.block) }
  })
  const panels = readingOrder(cells).flatMap((index) => {
    const panel = draft.panels[index]
    const layout = cells[index]
    return panel && layout ? [{ panel, block: { ...panel.block, layout } }] : []
  })
  const definition: PageDefinition = {
    title: draft.title,
    blocks: panels.map(({ block }) => block),
  }
  return {
    definition,
    panels: panels.map(({ panel }) => panel),
  }
}

const serialize = (draft: Draft) =>
  JSON.stringify(definitionOf(draft).definition)

/**
 * Edit mode of a dashboard: drag, resize, add, edit, and remove panels,
 * then save a draft revision or publish it. It edits the latest revision,
 * which can be newer than the published one.
 */
export function DashboardEditor({
  workspaceId,
  page,
  onExit,
}: {
  workspaceId: Id<"workspaces">
  page: Doc<"pages">
  onExit: () => void
}) {
  const [revision, setRevision] = useState(page.revision)
  const stored = useQuery(api.pages.get, { pageId: page._id, revision })
  const [draft, setDraft] = useState<Draft | null>(null)
  const [baseline, setBaseline] = useState("")
  useEffect(() => {
    if (draft || stored?.version?.revision !== revision) return
    const initial = draftOf(stored.version.definition)
    setDraft(initial)
    setBaseline(serialize(initial))
  }, [draft, revision, stored])
  if (!draft) return <LoadingRows label="Loading dashboard" />
  return (
    <EditorBody
      workspaceId={workspaceId}
      page={page}
      revision={revision}
      draft={draft}
      setDraft={setDraft}
      dirty={serialize(draft) !== baseline}
      saved={(next, savedRevision) => {
        setRevision(savedRevision)
        setDraft(next)
        setBaseline(serialize(next))
      }}
      reload={() => {
        setRevision(page.revision)
        setDraft(null)
      }}
      onExit={onExit}
    />
  )
}

function EditorBody({
  workspaceId,
  page,
  revision,
  draft,
  setDraft,
  dirty,
  saved,
  reload,
  onExit,
}: {
  workspaceId: Id<"workspaces">
  page: Doc<"pages">
  revision: number
  draft: Draft
  setDraft: (draft: Draft) => void
  dirty: boolean
  saved: (draft: Draft, revision: number) => void
  /** Drops the draft and edits the latest revision. */
  reload: () => void
  onExit: () => void
}) {
  const save = useMutation(api.pages.save)
  const publish = useMutation(api.pages.publish)
  const [pending, setPending] = useState(false)
  const [dialog, setDialog] = useState<DialogState>(null)
  const [removing, setRemoving] = useState<EditorPanel | null>(null)
  const [discarding, setDiscarding] = useState(false)
  const [reloading, setReloading] = useState(false)
  const navigate = useNavigate()
  const titleId = useId()
  const mobile = useIsMobile()
  const full = draft.panels.length >= 20
  const published = page.publishedRevision ?? null
  // Someone else saved after this draft started, so a save would fail. The
  // check waits while a save runs, as `page` can show it before `revision`.
  const conflict = !pending && page.revision > revision

  // Ask before any navigation, in the app or out of it, that loses unsaved
  // changes. `exit` leaves on purpose, after a publish or a discard.
  const leaving = useRef(false)
  const guarded = () => dirty && !leaving.current
  const blocker = useBlocker({
    shouldBlockFn: guarded,
    enableBeforeUnload: guarded,
    withResolver: true,
  })
  const exit = () => {
    leaving.current = true
    onExit()
  }

  /** Saves the draft as a new revision; returns it, or null on failure. */
  async function saveDraft(): Promise<number | null> {
    const { definition, panels } = definitionOf(draft)
    try {
      const result = await save({
        workspaceId,
        pageId: page._id,
        expectedRevision: revision,
        definition,
      })
      // Panels now match the saved blocks one to one, in saved order.
      saved(
        {
          ...draft,
          panels: panels.map((panel, index) => ({ ...panel, live: index })),
        },
        result.revision
      )
      return result.revision
    } catch (error) {
      toast.error(
        errorMessage(error, "Check the panels and try again."),
        "Could not save"
      )
      return null
    }
  }

  async function run(action: () => Promise<void>) {
    if (pending) return
    setPending(true)
    try {
      await action()
    } finally {
      setPending(false)
    }
  }

  const onSave = () =>
    run(async () => {
      const next = await saveDraft()
      if (next !== null) toast.success(`Saved revision ${next}`)
    })

  const onPublish = () =>
    run(async () => {
      const next = dirty ? await saveDraft() : revision
      if (next === null) return
      try {
        await publish({
          pageId: page._id,
          revision: next,
          expectedRevision: next,
          expectedPublishedRevision: published,
        })
        toast.success(`Published revision ${next}`)
        exit()
      } catch (error) {
        toast.error(
          errorMessage(error, "Reload the page and try again."),
          "Could not publish"
        )
      }
    })

  /** Places a new `size` panel in the first free place at or after `after`. */
  /** Saves the draft as a new dashboard and edits that one. */
  const onSaveCopy = () =>
    run(async () => {
      const { definition } = definitionOf(draft)
      const title = `${definition.title.trim()} (copy)`.slice(0, 100)
      try {
        const { pageId } = await save({
          workspaceId,
          definition: { ...definition, title },
        })
        toast.success("Saved as a new dashboard")
        leaving.current = true
        await navigate({
          to: "/dashboard/workspaces/$workspaceId/pages/$pageId",
          params: { workspaceId, pageId },
          search: { edit: true },
        })
      } catch (error) {
        toast.error(
          errorMessage(error, "Check the panels and try again."),
          "Could not save a copy"
        )
      }
    })

  function place(size: PanelSize, after: { x: number; y: number }) {
    const id = newId()
    const layout = compactLayout([
      ...draft.layout,
      { i: id, ...firstFreePlace(draft.layout, size, after) },
    ])
    return { id, layout }
  }

  function addPanel(block: PageBlock) {
    const { id, layout } = place(defaultPanelSize(block), {
      x: 0,
      y: gridBottom(draft.layout),
    })
    setDraft({
      ...draft,
      panels: [...draft.panels, { id, block, live: null }],
      layout,
    })
  }

  function duplicate(panel: EditorPanel) {
    const cell = draft.layout.find((item) => item.i === panel.id)
    // The copy keeps the original size.
    const { id, layout } = cell
      ? place({ w: cell.w, h: cell.h }, { x: cell.x, y: cell.y })
      : place(defaultPanelSize(panel.block), {
          x: 0,
          y: gridBottom(draft.layout),
        })
    setDraft({
      ...draft,
      panels: [...draft.panels, { ...panel, id }],
      layout,
    })
  }

  function replace(id: string, block: PageBlock) {
    setDraft({
      ...draft,
      panels: draft.panels.map((panel) =>
        panel.id === id ? { id, block, live: null } : panel
      ),
    })
  }

  function remove(id: string) {
    setDraft({
      ...draft,
      panels: draft.panels.filter((panel) => panel.id !== id),
      layout: compactLayout(draft.layout.filter((item) => item.i !== id)),
    })
  }

  const controls = (panel: EditorPanel, handle: boolean): PanelControls => {
    const name =
      panel.block.kind === "markdown" ? "Text panel" : panel.block.title
    return {
      handle: handle && (
        <span
          aria-hidden
          className="dashboard-drag-handle -ml-1 flex cursor-move items-center text-muted-foreground"
        >
          <GripVertical className="size-4" />
        </span>
      ),
      menu: (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`${name} menu`}
              disabled={pending}
            >
              <EllipsisVertical aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {panel.block.kind !== "artifact" &&
              panel.block.kind !== "htmlReport" && (
                <DropdownMenuItem
                  onSelect={() => setDialog({ mode: "edit", id: panel.id })}
                >
                  Edit
                </DropdownMenuItem>
              )}
            <DropdownMenuItem disabled={full} onSelect={() => duplicate(panel)}>
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {panelMoves.map(({ move, label }) => {
              const next = applyPanelMove(draft.layout, panel.id, move)
              return (
                <DropdownMenuItem
                  key={move}
                  disabled={next === null}
                  onSelect={() => {
                    if (next) setDraft({ ...draft, layout: next })
                  }}
                >
                  {label}
                </DropdownMenuItem>
              )
            })}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => setRemoving(panel)}
            >
              Remove
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    }
  }

  const panelNode = (panel: EditorPanel, handle: boolean) => (
    <DashboardPanel
      workspaceId={workspaceId}
      block={panel.block}
      live={
        panel.live === null
          ? null
          : { pageId: page._id, revision, blockIndex: panel.live }
      }
      controls={controls(panel, handle)}
    />
  )

  const editing =
    dialog?.mode === "edit"
      ? draft.panels.find((panel) => panel.id === dialog.id)
      : undefined

  return (
    <article className="flex flex-col gap-6">
      <PageHeader
        title={draft.title.trim() || "Untitled dashboard"}
        description={
          dirty
            ? "Editing. Unsaved changes."
            : published === revision
              ? `Editing revision ${revision}. Published.`
              : `Editing revision ${revision}. Not published.`
        }
        actions={
          <>
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() => (dirty ? setDiscarding(true) : onExit())}
            >
              Discard
            </Button>
            <Button
              variant="outline"
              disabled={pending || conflict || !dirty || !draft.title.trim()}
              onClick={() => void onSave()}
            >
              Save
            </Button>
            <Button
              disabled={
                pending ||
                conflict ||
                !draft.title.trim() ||
                (!dirty && published === revision)
              }
              onClick={() => void onPublish()}
            >
              Publish
            </Button>
          </>
        }
      />
      {conflict && (
        <Alert variant="destructive">
          <AlertTitle>This dashboard changed</AlertTitle>
          <AlertDescription>
            Someone saved revision {page.revision}. Load it, or save your
            changes as a new dashboard.
          </AlertDescription>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => (dirty ? setReloading(true) : reload())}
            >
              Load latest
            </Button>
            {dirty && (
              <Button
                variant="outline"
                size="sm"
                disabled={!draft.title.trim()}
                onClick={() => void onSaveCopy()}
              >
                Save as copy
              </Button>
            )}
          </div>
        </Alert>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <Field className="max-w-md flex-1">
          <FieldLabel htmlFor={titleId}>Title</FieldLabel>
          <Input
            id={titleId}
            maxLength={100}
            value={draft.title}
            disabled={pending}
            onChange={(event) =>
              setDraft({ ...draft, title: event.target.value })
            }
          />
        </Field>
        <Button
          variant="outline"
          disabled={pending || full}
          onClick={() => setDialog({ mode: "add" })}
        >
          <Plus aria-hidden />
          Add panel
        </Button>
      </div>
      {draft.panels.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed bg-card p-12 text-center">
          <p className="text-muted-foreground">No panels yet.</p>
          <Button onClick={() => setDialog({ mode: "add" })}>
            <Plus aria-hidden />
            Add panel
          </Button>
        </div>
      ) : mobile ? (
        <StaticDashboardGrid
          panels={draft.panels.flatMap((panel) => {
            const cell = draft.layout.find((item) => item.i === panel.id)
            return cell
              ? [{ key: panel.id, layout: cell, node: panelNode(panel, false) }]
              : []
          })}
        />
      ) : (
        <EditableGrid
          layout={draft.layout}
          disabled={pending}
          onLayoutChange={(layout) => {
            if (!sameLayout(layout, draft.layout))
              setDraft({ ...draft, layout })
          }}
        >
          {draft.panels.map((panel) => (
            <div key={panel.id}>{panelNode(panel, true)}</div>
          ))}
        </EditableGrid>
      )}
      <PanelDialog
        workspaceId={workspaceId}
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open) setDialog(null)
        }}
        block={editing?.block ?? null}
        onSubmit={(block) => {
          if (editing) replace(editing.id, block)
          else addPanel(block)
        }}
      />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null)
        }}
        onConfirm={() => {
          if (removing) remove(removing.id)
        }}
        title="Remove panel?"
        description="The panel leaves this draft. Saved revisions keep it."
        confirmLabel="Remove"
        destructive
      />
      <ConfirmDialog
        open={reloading}
        onOpenChange={setReloading}
        onConfirm={reload}
        title="Load the latest revision?"
        description="Your unsaved changes to this dashboard are lost."
        confirmLabel="Load latest"
        destructive
      />
      <ConfirmDialog
        open={discarding || blocker.status === "blocked"}
        onOpenChange={(open) => {
          if (open) return
          setDiscarding(false)
          blocker.reset?.()
        }}
        onConfirm={() => (blocker.proceed ? blocker.proceed() : exit())}
        title="Discard changes?"
        description="Your unsaved changes to this dashboard are lost."
        confirmLabel="Discard"
        destructive
      />
    </article>
  )
}

/**
 * The drag-and-resize grid. It measures its own container, so it must mount
 * with that container: a dashboard that starts empty renders no grid until
 * its first panel, and the measurement then starts with the grid.
 *
 * The grid itself never compacts, so it shows stored positions as they are
 * and reports no change on mount. A drag or resize that moved a panel
 * compacts the layout before `onLayoutChange` gets it.
 */
function EditableGrid({
  layout,
  disabled,
  onLayoutChange,
  children,
}: {
  layout: Layout
  disabled: boolean
  onLayoutChange: (layout: Layout) => void
  children: ReactNode
}) {
  const { width, containerRef, mounted } = useContainerWidth({
    measureBeforeMount: true,
  })
  const commit = (next: Layout) => {
    if (!sameLayout(next, layout)) onLayoutChange(compactLayout(next))
  }
  return (
    <div ref={containerRef}>
      {mounted && (
        <ReactGridLayout
          width={width}
          layout={layout.map((item) => ({ ...item, maxH: MAX_PANEL_HEIGHT }))}
          gridConfig={{
            cols: GRID_COLUMNS,
            rowHeight: PANEL_ROW_HEIGHT,
            margin: [PANEL_GAP, PANEL_GAP],
            containerPadding: [0, 0],
          }}
          compactor={noCompactor}
          dragConfig={{ enabled: !disabled, handle: ".dashboard-drag-handle" }}
          resizeConfig={{ enabled: !disabled, handles: ["se"] }}
          onDragStop={commit}
          onResizeStop={commit}
        >
          {children}
        </ReactGridLayout>
      )}
    </div>
  )
}
