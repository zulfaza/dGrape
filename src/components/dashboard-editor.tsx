import { useMutation, useQuery } from "convex/react"
import { EllipsisVertical, GripVertical, Plus } from "lucide-react"
import { useBlocker, useNavigate } from "@tanstack/react-router"
import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type ReactNode,
} from "react"
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

/** How long the editor waits after the last change before it saves. */
const AUTOSAVE_DELAY_MS = 1000

/**
 * A saved revision: its definition as `serialize` writes it, and for each
 * saved panel, its block and its index in that revision.
 */
type Saved = {
  revision: number
  serialized: string
  blocks: ReadonlyMap<string, { block: PageBlock; index: number }>
}

/**
 * `draft` after a save. A panel shows live data again when the save has
 * its current block; a panel added or changed during the save waits for
 * the next one.
 */
function withSaved(draft: Draft, saved: Saved): Draft {
  return {
    ...draft,
    panels: draft.panels.map((panel) => {
      const item = saved.blocks.get(panel.id)
      return {
        ...panel,
        live: item && item.block === panel.block ? item.index : null,
      }
    }),
  }
}

/**
 * Edit mode of a dashboard: rename it, and drag, resize, add, edit, and
 * remove panels. Each change saves and publishes a new revision after a
 * short pause. It edits the latest revision, which can be newer than the
 * published one.
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
      saved={(result) => {
        setRevision(result.revision)
        setBaseline(result.serialized)
        // Changes made during the save stay in the draft.
        setDraft((current) => current && withSaved(current, result))
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
  saved: (result: Saved) => void
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
  // A revision this editor saved that is not published yet.
  const [unpublished, setUnpublished] = useState<number | null>(null)
  // The draft and revision that failed to save or publish. Autosave tries
  // again after the next change.
  const [failed, setFailed] = useState<string | null>(null)
  const navigate = useNavigate()
  const mobile = useIsMobile()
  const full = draft.panels.length >= 20
  const serialized = serialize(draft)
  // Someone else saved after this draft started, so a save would fail. The
  // check waits while a save runs, as `page` can show it before `revision`.
  const conflict = !pending && page.revision > revision
  const attempt = `${revision}:${serialized}`

  // Ask before any navigation, in the app or out of it, that loses changes
  // that are not saved yet. `exit` leaves on purpose.
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
  // Autosave waits while the user decides to discard changes.
  const canAutosave =
    (dirty || unpublished !== null) &&
    !pending &&
    !conflict &&
    failed !== attempt &&
    !discarding &&
    blocker.status !== "blocked"

  /**
   * Saves the draft as a new revision when it has changes, then publishes
   * the revision this editor saved. `always` also publishes a revision that
   * was not published when editing started. False on failure.
   */
  async function sync(always: boolean): Promise<boolean> {
    let target = revision
    if (dirty) {
      const { definition, panels } = definitionOf(draft)
      try {
        const result = await save({
          workspaceId,
          pageId: page._id,
          expectedRevision: revision,
          definition,
        })
        target = result.revision
        setUnpublished(target)
        saved({
          revision: target,
          serialized: JSON.stringify(definition),
          blocks: new Map(
            panels.map((panel, index) => [
              panel.id,
              { block: panel.block, index },
            ])
          ),
        })
      } catch (error) {
        setFailed(attempt)
        toast.error(
          errorMessage(error, "Check the panels and try again."),
          "Could not save"
        )
        return false
      }
    }
    if (page.publishedRevision === target) return true
    if (!always && unpublished !== target && !dirty) return true
    try {
      await publish({
        pageId: page._id,
        revision: target,
        expectedRevision: target,
        expectedPublishedRevision: page.publishedRevision ?? null,
      })
      setUnpublished(null)
      return true
    } catch (error) {
      setFailed(`${target}:${serialized}`)
      toast.error(
        errorMessage(error, "Reload the page and try again."),
        "Could not publish"
      )
      return false
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

  const autosave = useEffectEvent(() => {
    void run(async () => {
      await sync(false)
    })
  })
  useEffect(() => {
    if (!canAutosave) return
    const timer = setTimeout(autosave, AUTOSAVE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [canAutosave, attempt])

  /** Saves and publishes what is left, then leaves edit mode. */
  const onDone = () => {
    // A newer revision exists, so there is nothing this editor can publish.
    if (conflict) {
      if (dirty) setDiscarding(true)
      else exit()
      return
    }
    void run(async () => {
      if (await sync(true)) exit()
    })
  }

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

  /** Places a new `size` panel in the first free place at or after `after`. */
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
        title={
          <EditableTitle
            value={draft.title}
            disabled={pending}
            onChange={(title) => setDraft({ ...draft, title })}
          />
        }
        actions={
          <>
            <span
              aria-live="polite"
              className="self-center text-sm text-muted-foreground"
            >
              {pending || canAutosave
                ? "Saving…"
                : dirty || unpublished !== null
                  ? "Not saved"
                  : "Saved"}
            </span>
            <Button
              variant="outline"
              disabled={pending || full}
              onClick={() => setDialog({ mode: "add" })}
            >
              <Plus aria-hidden />
              Add panel
            </Button>
            <Button disabled={pending} onClick={onDone}>
              Done
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
      {draft.panels.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed bg-card p-12 text-center">
          <p className="text-muted-foreground">No panels yet.</p>
          <Button disabled={pending} onClick={() => setDialog({ mode: "add" })}>
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
        description="Your latest changes to this dashboard are not saved yet."
        confirmLabel="Discard"
        destructive
      />
    </article>
  )
}

/**
 * The dashboard title. Double-click it, or press Enter on it, to rename.
 * Enter or leaving the field keeps the new name; Escape or an empty name
 * keeps the old one.
 */
function EditableTitle({
  value,
  disabled,
  onChange,
}: {
  value: string
  disabled: boolean
  onChange: (title: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (editing) input.current?.select()
  }, [editing])
  if (editing)
    return (
      <Input
        ref={input}
        aria-label="Dashboard title"
        maxLength={100}
        defaultValue={value}
        onBlur={(event) => {
          const title = event.currentTarget.value.trim()
          if (title && title !== value) onChange(title)
          setEditing(false)
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") event.currentTarget.value = value
          if (event.key === "Enter" || event.key === "Escape")
            event.currentTarget.blur()
        }}
      />
    )
  return (
    <button
      type="button"
      title="Double-click to rename"
      disabled={disabled}
      className="cursor-text rounded-md text-left hover:bg-muted"
      onDoubleClick={() => setEditing(true)}
      onKeyDown={(event) => {
        if (event.key !== "Enter") return
        event.preventDefault()
        setEditing(true)
      }}
    >
      {value.trim() || "Untitled dashboard"}
    </button>
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
