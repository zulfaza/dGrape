import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { useAction, useMutation, useQuery } from "convex/react"
import { format } from "date-fns"
import {
  FileCheck2,
  Download,
  History,
  LayoutTemplate,
  ListChecks,
  Loader2,
  MessageSquare,
  MessageSquarePlus,
  Minus,
  PanelRightClose,
  PanelRightOpen,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Send,
  Trash2,
} from "lucide-react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { getHotkeyManager } from "@tanstack/hotkeys"

import { api } from "../../convex/_generated/api"
import { Button } from "#/components/ui/button.tsx"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog.tsx"
import { Input } from "#/components/ui/input.tsx"
import { Label } from "#/components/ui/label.tsx"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select.tsx"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "#/components/ui/sheet.tsx"
import { Skeleton } from "#/components/ui/skeleton.tsx"
import { Textarea } from "#/components/ui/textarea.tsx"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "#/components/ui/tooltip.tsx"
import { toast } from "#/components/ui/toast.tsx"
import {
  CvDocumentPreview,
  type CvTemplateId,
} from "#/components/cv-document-preview.tsx"
import { cvPdfFilename, downloadCvPdf } from "#/lib/cv-pdf.ts"

const STARTER_PROMPTS = [
  "Tailor my CV for this role and explain the important changes.",
  "Help me prepare for an interview for this position.",
  "Create a technical test preparation plan based on this job.",
]
const PHONE_LAYOUT_MAX_WIDTH = 900
const WIDE_LAYOUT_MIN_WIDTH = 1180
const COMPACT_CHAT_WIDTH = 640
const MIN_CHAT_WIDTH = 360
const MIN_PREVIEW_WIDTH = 360
const CV_TEMPLATE_OPTIONS: Array<{ id: CvTemplateId; label: string }> = [
  { id: "classic", label: "Classic" },
  { id: "compact", label: "Compact" },
]

type PreviewLayout = "sheet" | "compact" | "wide"

function previewLayoutForWidth(width: number): PreviewLayout {
  if (width <= 0) return "wide"
  if (width < PHONE_LAYOUT_MAX_WIDTH) return "sheet"
  if (width < WIDE_LAYOUT_MIN_WIDTH) return "compact"
  return "wide"
}

export function ApplicationAgentWorkspace({
  applicationId,
  companyName,
  position,
  onSelectThread,
  selectedThreadId,
}: {
  applicationId: string
  companyName: string
  position: string
  onSelectThread: (id: string | undefined) => void
  selectedThreadId: string | undefined
}) {
  const threads = useQuery(api.applicationAgent.listThreads, { applicationId })
  const createThread = useMutation(api.applicationAgent.createThread)
  const renameThread = useMutation(api.applicationAgent.renameThread)
  const deleteThread = useMutation(api.applicationAgent.deleteThread)
  const streamMessage = useAction(api.applicationAgent.streamMessage)
  const retryResponse = useAction(api.applicationAgent.retryResponse)
  const saveDraft = useMutation(api.applicationAgent.saveTailoredCvDraft)
  const deleteVersion = useMutation(
    api.applicationAgent.deleteTailoredCvVersion
  )
  const versions = useQuery(api.applicationAgent.listTailoredCvVersions, {
    applicationId,
  })
  const [composer, setComposer] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [savingDraftId, setSavingDraftId] = useState<string>()
  const [versionsOpen, setVersionsOpen] = useState(false)
  const [selectedVersionId, setSelectedVersionId] = useState<string>()
  const [cvTemplateId, setCvTemplateId] = useState<CvTemplateId>("classic")
  const [deletingVersionId, setDeletingVersionId] = useState<string>()
  const [manageThread, setManageThread] = useState<{
    id: string
    title: string
  }>()
  const [previewVisible, setPreviewVisible] = useState(true)
  const [chatWidth, setChatWidth] = useState(520)
  const [dragging, setDragging] = useState(false)
  const [workspaceWidth, setWorkspaceWidth] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const thread = useQuery(
    api.applicationAgent.getThread,
    selectedThreadId ? { threadId: selectedThreadId } : "skip"
  )
  const selectedVersion = useQuery(
    api.applicationAgent.getTailoredCvVersion,
    selectedVersionId ? { versionId: selectedVersionId } : "skip"
  )
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const activeDraft =
    thread && thread.drafts.length > 0
      ? thread.drafts[thread.drafts.length - 1]
      : undefined
  const previewLayout = previewLayoutForWidth(workspaceWidth)
  const showPreview = Boolean(activeDraft && previewVisible)
  const inlinePreview = showPreview && previewLayout !== "sheet"
  const sheetPreview = showPreview && previewLayout === "sheet"
  const resizablePreview = inlinePreview && previewLayout === "wide"
  const chatColumnWidth = inlinePreview
    ? previewLayout === "wide"
      ? chatWidth
      : Math.min(
          COMPACT_CHAT_WIDTH,
          Math.max(MIN_CHAT_WIDTH, workspaceWidth - MIN_PREVIEW_WIDTH)
        )
    : undefined

  useEffect(() => {
    if (threads === undefined) return
    if (threads.length === 0) {
      onSelectThread(undefined)
      return
    }
    const current = selectedThreadId
    const next =
      current && threads.some((candidate) => candidate._id === current)
        ? current
        : threads[0]?._id
    if (next !== current) {
      onSelectThread(next)
    }
  }, [threads, onSelectThread, selectedThreadId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "nearest" })
  }, [thread?.messages.length])

  useEffect(() => {
    if (!dragging || previewLayout !== "wide") return
    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const newWidth = e.clientX - rect.left
      const maxWidth = rect.width - MIN_PREVIEW_WIDTH
      setChatWidth(Math.max(MIN_CHAT_WIDTH, Math.min(maxWidth, newWidth)))
    }
    const handleMouseUp = () => {
      setDragging(false)
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
    }
    window.addEventListener("mousemove", handleMouseMove)
    window.addEventListener("mouseup", handleMouseUp)
    return () => {
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseup", handleMouseUp)
    }
  }, [dragging, previewLayout])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let frame = 0
    const update = () => {
      if (frame) window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        const nextWidth = container.getBoundingClientRect().width
        setWorkspaceWidth(nextWidth)
        if (previewLayoutForWidth(nextWidth) !== "wide") setDragging(false)
      })
    }

    const observer = new ResizeObserver(update)
    observer.observe(container)
    let parent = container.parentElement
    let depth = 0
    while (parent && depth < 3) {
      observer.observe(parent)
      parent = parent.parentElement
      depth += 1
    }
    const mutationObserver = new MutationObserver(update)
    mutationObserver.observe(document.body, {
      attributeFilter: ["class", "style", "data-state"],
      attributes: true,
      subtree: true,
    })
    window.addEventListener("resize", update)
    update()
    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      observer.disconnect()
      mutationObserver.disconnect()
      window.removeEventListener("resize", update)
    }
  }, [])

  useEffect(() => {
    const manager = getHotkeyManager()
    const handle = manager.register(
      { key: "p", mod: true, shift: true },
      () => {
        if (activeDraft) setPreviewVisible((current) => !current)
      },
      { preventDefault: true }
    )
    return () => {
      handle.unregister()
    }
  }, [activeDraft])

  const pending = thread?.messages.some(
    (message) =>
      message.payload.type === "assistant_pending" ||
      message.payload.type === "assistant_streaming"
  )

  const handleCreateThread = useCallback(async () => {
    try {
      const threadId = await createThread({ applicationId })
      onSelectThread(threadId)
      setComposer("")
    } catch (cause) {
      toast.error(toErrorMessage(cause))
    }
  }, [applicationId, createThread, onSelectThread])

  const sendMessageText = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!selectedThreadId || !trimmed || pending) return
      setSubmitting(true)
      try {
        await streamMessage({
          threadId: selectedThreadId,
          text: trimmed,
          requestId: crypto.randomUUID(),
        })
        setComposer("")
      } catch (cause) {
        toast.error(toErrorMessage(cause))
      } finally {
        setSubmitting(false)
      }
    },
    [pending, selectedThreadId, streamMessage]
  )

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      void sendMessageText(composer)
    },
    [composer, sendMessageText]
  )

  const handleRetry = useCallback(
    async (messageId: string) => {
      setSubmitting(true)
      try {
        await retryResponse({ messageId })
      } catch (cause) {
        toast.error(toErrorMessage(cause))
      } finally {
        setSubmitting(false)
      }
    },
    [retryResponse]
  )

  const handleSaveDraft = useCallback(
    async (draftId: string) => {
      setSavingDraftId(draftId)
      try {
        const versionId = await saveDraft({ draftId })
        setSelectedVersionId(versionId)
        setVersionsOpen(true)
      } catch (cause) {
        toast.error(toErrorMessage(cause))
      } finally {
        setSavingDraftId(undefined)
      }
    },
    [saveDraft]
  )

  return (
    <>
      <section
        className={`flex min-h-0 flex-1 overflow-hidden bg-background ${
          inlinePreview ? "items-stretch" : "min-w-0 flex-col"
        }`}
        ref={containerRef}
      >
        <div
          className={`flex min-h-0 min-w-0 flex-col ${
            inlinePreview ? "h-full shrink-0" : "w-full flex-1"
          }`}
          style={{ width: chatColumnWidth }}
        >
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div className="min-w-0">
              <h2 className="text-sm font-medium text-foreground">
                Application agent
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Discuss the role, prepare for stages, or create a tailored CV.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    aria-keyshortcuts="Meta+Shift+P Control+Shift+P"
                    aria-label={`${previewVisible ? "Hide" : "Show"} CV preview`}
                    disabled={!activeDraft}
                    onClick={() => setPreviewVisible((current) => !current)}
                    size="icon-sm"
                    type="button"
                    variant="outline"
                  >
                    {previewVisible ? <PanelRightClose /> : <PanelRightOpen />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {previewVisible ? "Hide CV" : "Show CV"} (⇧⌘P)
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    aria-label={`CV versions${versions?.length ? ` (${versions.length})` : ""}`}
                    disabled={!versions || versions.length === 0}
                    onClick={() => {
                      setSelectedVersionId(versions?.[0]?._id)
                      setVersionsOpen(true)
                    }}
                    size="icon-sm"
                    type="button"
                    variant="outline"
                  >
                    <History />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  CV versions{versions?.length ? ` (${versions.length})` : ""}
                </TooltipContent>
              </Tooltip>
            </div>
          </div>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <ThreadSwitcher
              onCreateThread={handleCreateThread}
              onManageThread={(id, title) => setManageThread({ id, title })}
              onSelectThread={onSelectThread}
              selectedThreadId={selectedThreadId}
              threads={threads}
            />

            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
              {threads === undefined ? (
                <AgentSkeleton />
              ) : threads.length === 0 ? (
                <EmptyChats onCreate={() => void handleCreateThread()} />
              ) : thread === undefined ? (
                <AgentSkeleton />
              ) : thread === null ? (
                <p className="text-sm text-muted-foreground">Chat not found.</p>
              ) : thread.messages.length === 0 ? (
                <PromptStarters onSend={sendMessageText} />
              ) : (
                <div className="flex flex-col gap-4">
                  {thread.messages.map((message) => (
                    <Message
                      key={message._id}
                      message={message}
                      onRetry={() => void handleRetry(message._id)}
                      retrying={submitting}
                    />
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {selectedThreadId ? (
              <form
                className="sticky bottom-0 border-t border-border bg-background p-3"
                onSubmit={handleSubmit}
              >
                <Textarea
                  aria-label="Message application agent"
                  className="max-h-64 min-h-20 resize-y bg-background"
                  disabled={pending}
                  onChange={(event) => setComposer(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault()
                      event.currentTarget.form?.requestSubmit()
                    }
                  }}
                  placeholder={
                    pending
                      ? "Waiting for agent response..."
                      : "Ask about this application"
                  }
                  value={composer}
                />
                <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">
                    Enter to send. Shift+Enter for newline.
                  </p>
                  <Button
                    disabled={!composer.trim() || pending || submitting}
                    size="sm"
                    type="submit"
                  >
                    {submitting ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <Send />
                    )}
                    Send
                  </Button>
                </div>
              </form>
            ) : null}
          </div>
        </div>

        {inlinePreview && activeDraft ? (
          <>
            {resizablePreview ? (
              <button
                aria-label="Resize panels"
                className="relative z-10 flex w-1.5 shrink-0 cursor-col-resize items-center justify-center bg-border hover:bg-primary active:bg-primary"
                onMouseDown={() => {
                  setDragging(true)
                  document.body.style.cursor = "col-resize"
                  document.body.style.userSelect = "none"
                }}
                type="button"
              >
                <div className="h-8 w-0.5 rounded-full bg-muted-foreground/30" />
              </button>
            ) : null}
            <div
              className={`min-w-0 flex-1 overflow-hidden bg-muted/20 p-4 ${
                inlinePreview
                  ? "h-full self-stretch"
                  : "h-[80svh] w-full border-t border-border"
              }`}
            >
              <TailoredCvDraft
                draft={activeDraft}
                onSave={() => void handleSaveDraft(activeDraft._id)}
                saving={savingDraftId === activeDraft._id}
                templateId={cvTemplateId}
                onTemplateChange={setCvTemplateId}
              />
            </div>
          </>
        ) : null}
      </section>

      {activeDraft ? (
        <Sheet
          onOpenChange={(open) => {
            setPreviewVisible(open)
          }}
          open={sheetPreview}
        >
          <SheetContent className="w-[min(100vw,42rem)] max-w-none gap-0 overflow-hidden p-0 sm:max-w-2xl">
            <SheetHeader className="sr-only">
              <SheetTitle>Tailored CV draft</SheetTitle>
              <SheetDescription>
                Review before saving a version.
              </SheetDescription>
            </SheetHeader>
            <div className="h-full p-3">
              <TailoredCvDraft
                draft={activeDraft}
                onSave={() => void handleSaveDraft(activeDraft._id)}
                saving={savingDraftId === activeDraft._id}
                templateId={cvTemplateId}
                onTemplateChange={setCvTemplateId}
              />
            </div>
          </SheetContent>
        </Sheet>
      ) : null}

      <VersionHistorySheet
        companyName={companyName}
        deletingVersionId={deletingVersionId}
        onDelete={async (versionId) => {
          const version = versions?.find(
            (candidate) => candidate._id === versionId
          )
          if (
            !version ||
            !window.confirm(
              `Delete CV version ${version.versionNumber}? This cannot be undone.`
            )
          ) {
            return
          }
          setDeletingVersionId(versionId)
          try {
            await deleteVersion({ versionId })
            const remaining =
              versions?.filter((candidate) => candidate._id !== versionId) ?? []
            const nextVersionId = remaining[0]?._id
            setSelectedVersionId(nextVersionId)
            if (!nextVersionId) setVersionsOpen(false)
          } catch (cause) {
            toast.error(toErrorMessage(cause))
          } finally {
            setDeletingVersionId(undefined)
          }
        }}
        onOpenChange={setVersionsOpen}
        onSelect={setSelectedVersionId}
        open={versionsOpen}
        position={position}
        selectedVersion={selectedVersion}
        selectedVersionId={selectedVersionId}
        templateId={cvTemplateId}
        onTemplateChange={setCvTemplateId}
        versions={versions ?? []}
      />

      <ChatManageDialog
        onDelete={async () => {
          if (!manageThread) return
          try {
            await deleteThread({ threadId: manageThread.id })
            setManageThread(undefined)
          } catch (cause) {
            toast.error(toErrorMessage(cause))
          }
        }}
        onOpenChange={(open) => {
          if (!open) setManageThread(undefined)
        }}
        onSave={async (title) => {
          if (!manageThread) return
          try {
            await renameThread({ threadId: manageThread.id, title })
            setManageThread(undefined)
          } catch (cause) {
            toast.error(toErrorMessage(cause))
          }
        }}
        open={Boolean(manageThread)}
        title={manageThread?.title ?? ""}
      />
    </>
  )
}

function ChatManageDialog({
  open,
  onOpenChange,
  title: initialTitle,
  onSave,
  onDelete,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  onSave: (title: string) => Promise<void>
  onDelete: () => Promise<void>
}) {
  const [title, setTitle] = useState(initialTitle)
  const [submitting, setSubmitting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) setTitle(initialTitle)
  }, [initialTitle, open])

  useEffect(() => {
    if (open) {
      // Small delay to let the dialog mount and become focusable
      const timeout = setTimeout(() => {
        inputRef.current?.focus()
      }, 0)
      return () => clearTimeout(timeout)
    }
  }, [open])

  const handleSave = async () => {
    const normalizedTitle = title.trim()
    if (!normalizedTitle) return
    setSubmitting(true)
    try {
      await onSave(normalizedTitle)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async () => {
    setSubmitting(true)
    try {
      await onDelete()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Chat settings</DialogTitle>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="chat-title">Chat title</Label>
          <Input
            id="chat-title"
            onChange={(event) => setTitle(event.target.value)}
            ref={inputRef}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                void handleSave()
              }
            }}
            value={title}
          />
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            disabled={submitting}
            onClick={() => void handleDelete()}
            type="button"
            variant="destructive"
          >
            Delete chat
          </Button>
          <div className="flex gap-2">
            <Button
              disabled={submitting}
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={submitting || !title.trim()}
              onClick={() => void handleSave()}
              type="button"
            >
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Message({
  message,
  onRetry,
  retrying,
}: {
  message: NonNullable<
    ReturnType<typeof useQuery<typeof api.applicationAgent.getThread>>
  >["messages"][number]
  onRetry: () => void
  retrying: boolean
}) {
  if (message.payload.type === "assistant_pending") {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Agent is working...
      </div>
    )
  }
  if (message.payload.type === "assistant_streaming") {
    const text = message.payload.text.trim()
    return (
      <div className="min-w-0 max-w-2xl overflow-hidden rounded-md border border-border bg-background px-3 py-2 text-sm leading-6 text-foreground">
        {text ? (
          <div className="prose prose-sm dark:prose-invert max-w-none break-words leading-7 [&_p]:my-3 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_pre]:overflow-x-auto">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
          </div>
        ) : (
          <span className="text-muted-foreground">thinking...</span>
        )}
        <span className="ml-0.5 inline-block h-2 w-2 animate-pulse rounded-full bg-primary align-middle" />
        <MessageTime createdAt={message.createdAt} />
      </div>
    )
  }
  if (message.payload.type === "assistant_failed") {
    return (
      <div className="min-w-0 max-w-2xl overflow-hidden rounded-md border border-destructive/40 bg-destructive/5 p-3">
        <p className="text-sm text-destructive">{message.payload.error}</p>
        <MessageTime createdAt={message.createdAt} />
        <Button
          className="mt-2"
          disabled={retrying}
          onClick={onRetry}
          size="xs"
          variant="outline"
        >
          <RotateCcw />
          Retry
        </Button>
      </div>
    )
  }
  const userMessage = message.payload.type === "user"
  const baseClasses = userMessage
    ? "ml-auto bg-primary text-primary-foreground prose-invert"
    : "border border-border bg-background text-foreground"
  return (
    <div
      className={`min-w-0 max-w-2xl overflow-hidden rounded-md px-3 py-2 text-sm leading-6 ${baseClasses}`}
    >
      {userMessage ? (
        <p className="whitespace-pre-wrap break-words">
          {message.payload.text}
        </p>
      ) : (
        <div className="prose prose-sm dark:prose-invert max-w-none break-words leading-7 [&_p]:my-3 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_pre]:overflow-x-auto">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {message.payload.text}
          </ReactMarkdown>
        </div>
      )}
      <MessageTime createdAt={message.createdAt} userMessage={userMessage} />
    </div>
  )
}

function MessageTime({
  createdAt,
  userMessage = false,
}: {
  createdAt: number
  userMessage?: boolean
}) {
  return (
    <time
      className={`mt-1 block text-[11px] leading-none ${
        userMessage ? "text-primary-foreground/70" : "text-muted-foreground"
      }`}
      dateTime={new Date(createdAt).toISOString()}
      title={format(createdAt, "MMM d, yyyy 'at' h:mm a")}
    >
      {format(createdAt, "h:mm a")}
    </time>
  )
}

function TailoredCvDraft({
  draft,
  onSave,
  onTemplateChange,
  saving,
  templateId,
}: {
  draft: NonNullable<
    ReturnType<typeof useQuery<typeof api.applicationAgent.getThread>>
  >["drafts"][number]
  onSave: () => void
  onTemplateChange: (templateId: CvTemplateId) => void
  saving: boolean
  templateId: CvTemplateId
}) {
  const { profileSnapshot } = draft.artifact
  const appliedChanges = draft.artifact.analysis.appliedChanges
  const [changesOpen, setChangesOpen] = useState(false)
  const [zoom, setZoom] = useState(1)
  const MIN_ZOOM = 0.5
  const MAX_ZOOM = 2
  const ZOOM_STEP = 0.1

  const handleZoomIn = () => {
    setZoom((z) => Math.min(MAX_ZOOM, Math.round((z + ZOOM_STEP) * 10) / 10))
  }
  const handleZoomOut = () => {
    setZoom((z) => Math.max(MIN_ZOOM, Math.round((z - ZOOM_STEP) * 10) / 10))
  }
  const handleZoomReset = () => {
    setZoom(1)
  }

  return (
    <article className="flex h-full min-w-0 flex-col rounded-md border border-border bg-background">
      <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-foreground">
            Tailored CV draft
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Review before saving a version.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            disabled={Boolean(draft.savedVersionId) || saving}
            onClick={onSave}
            size="sm"
          >
            {saving ? <Loader2 className="animate-spin" /> : <FileCheck2 />}
            {draft.savedVersionId ? "Saved" : "Save version"}
          </Button>
          <Button
            disabled={appliedChanges.length === 0}
            onClick={() => setChangesOpen(true)}
            size="sm"
            type="button"
            variant="outline"
          >
            <ListChecks />
            Applied changes
            {appliedChanges.length > 0 ? ` (${appliedChanges.length})` : ""}
          </Button>
        </div>
      </div>

      <Sheet onOpenChange={setChangesOpen} open={changesOpen}>
        <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-xl">
          <SheetHeader className="border-b border-border">
            <SheetTitle>Applied changes</SheetTitle>
            <SheetDescription>
              Edits made while tailoring this CV draft to the job description.
            </SheetDescription>
          </SheetHeader>
          <div className="p-4">
            {appliedChanges.length > 0 ? (
              <AppliedChanges changes={appliedChanges} />
            ) : (
              <p className="text-sm text-muted-foreground">
                No changes were recorded.
              </p>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
        <CvTemplateSelect onValueChange={onTemplateChange} value={templateId} />
        <div className="mx-1 h-3 w-px bg-border" />
        <Button
          aria-label="Zoom out"
          disabled={zoom <= MIN_ZOOM}
          onClick={handleZoomOut}
          size="icon-xs"
          type="button"
          variant="ghost"
        >
          <Minus className="size-3.5" />
        </Button>
        <span className="min-w-[3ch] text-center text-xs text-muted-foreground">
          {Math.round(zoom * 100)}%
        </span>
        <Button
          aria-label="Zoom in"
          disabled={zoom >= MAX_ZOOM}
          onClick={handleZoomIn}
          size="icon-xs"
          type="button"
          variant="ghost"
        >
          <Plus className="size-3.5" />
        </Button>
        <div className="mx-1 h-3 w-px bg-border" />
        <Button
          aria-label="Reset zoom"
          className="h-6 text-xs"
          disabled={zoom === 1}
          onClick={handleZoomReset}
          size="xs"
          type="button"
          variant="ghost"
        >
          Reset
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div
          className="mx-auto w-fit origin-top"
          style={{
            transform: `scale(${zoom})`,
          }}
        >
          <CvDocumentPreview
            profile={profileSnapshot}
            templateId={templateId}
          />
        </div>
      </div>
    </article>
  )
}

function VersionHistorySheet({
  companyName,
  deletingVersionId,
  onDelete,
  open,
  onOpenChange,
  position,
  versions,
  selectedVersionId,
  templateId,
  onSelect,
  onTemplateChange,
  selectedVersion,
}: {
  companyName: string
  deletingVersionId: string | undefined
  onDelete: (versionId: string) => Promise<void>
  open: boolean
  onOpenChange: (open: boolean) => void
  position: string
  versions: NonNullable<
    ReturnType<
      typeof useQuery<typeof api.applicationAgent.listTailoredCvVersions>
    >
  >
  selectedVersionId: string | undefined
  templateId: CvTemplateId
  onSelect: (versionId: string) => void
  onTemplateChange: (templateId: CvTemplateId) => void
  selectedVersion:
    | ReturnType<
        typeof useQuery<typeof api.applicationAgent.getTailoredCvVersion>
      >
    | undefined
}) {
  const previewRef = useRef<HTMLDivElement>(null)
  const [downloading, setDownloading] = useState(false)

  const handleDownload = async () => {
    if (!selectedVersion || !previewRef.current) return
    setDownloading(true)
    try {
      await downloadCvPdf(
        previewRef.current,
        cvPdfFilename(
          selectedVersion.profileSnapshot.name,
          companyName,
          position
        )
      )
    } catch (cause) {
      toast.error(toErrorMessage(cause))
    } finally {
      setDownloading(false)
    }
  }

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent className="w-[min(96vw,72rem)] max-w-none gap-0 overflow-hidden sm:max-w-6xl">
        <SheetHeader className="shrink-0 border-b border-border">
          <SheetTitle>Saved CV versions</SheetTitle>
          <SheetDescription>
            Immutable CV snapshots used for this application.
          </SheetDescription>
        </SheetHeader>
        <div className="grid min-h-0 flex-1 overflow-hidden md:grid-cols-[11rem_minmax(0,1fr)]">
          <div className="overflow-y-auto border-b border-border p-2 md:border-r md:border-b-0">
            {versions.map((version) => (
              <button
                className={`block w-full rounded-md px-2 py-2 text-left text-sm ${
                  selectedVersionId === version._id
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground"
                }`}
                key={version._id}
                onClick={() => onSelect(version._id)}
                type="button"
              >
                <span className="block font-medium">
                  Version {version.versionNumber}
                </span>
                <span className="block text-xs">
                  {format(version.savedAt, "MMM d, yyyy")}
                </span>
              </button>
            ))}
          </div>
          <div className="min-w-0 overflow-auto p-4">
            {selectedVersion === undefined && selectedVersionId ? (
              <AgentSkeleton />
            ) : selectedVersion ? (
              <div className="space-y-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-medium text-foreground">
                      Version {selectedVersion.versionNumber}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Saved{" "}
                      {format(
                        selectedVersion.savedAt,
                        "MMM d, yyyy 'at' h:mm a"
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <CvTemplateSelect
                      onValueChange={onTemplateChange}
                      value={templateId}
                    />
                    <Button
                      disabled={downloading}
                      onClick={() => void handleDownload()}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      {downloading ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <Download />
                      )}
                      Download PDF
                    </Button>
                    <Button
                      aria-label={`Delete CV version ${selectedVersion.versionNumber}`}
                      disabled={deletingVersionId === selectedVersion._id}
                      onClick={() => void onDelete(selectedVersion._id)}
                      size="icon-sm"
                      type="button"
                      variant="destructive"
                    >
                      {deletingVersionId === selectedVersion._id ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <Trash2 />
                      )}
                    </Button>
                  </div>
                </div>
                <div className="min-w-0 overflow-x-auto">
                  <div className="min-w-max space-y-2" ref={previewRef}>
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Preview
                    </p>
                    <CvDocumentPreview
                      profile={selectedVersion.profileSnapshot}
                      templateId={templateId}
                    />
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-foreground">
                    Job description snapshot
                  </h4>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                    {selectedVersion.jobDescriptionSnapshot}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Select a CV version.
              </p>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function CvTemplateSelect({
  onValueChange,
  value,
}: {
  onValueChange: (templateId: CvTemplateId) => void
  value: CvTemplateId
}) {
  return (
    <Select
      onValueChange={(nextValue) => {
        const templateId = parseCvTemplateId(nextValue)
        if (templateId) onValueChange(templateId)
      }}
      value={value}
    >
      <SelectTrigger
        aria-label="CV template"
        className="h-7 gap-1.5 px-2 text-xs"
      >
        <LayoutTemplate className="size-3.5" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {CV_TEMPLATE_OPTIONS.map((template) => (
          <SelectItem key={template.id} value={template.id}>
            {template.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function parseCvTemplateId(value: string): CvTemplateId | undefined {
  if (value === "classic" || value === "compact") return value
  return undefined
}

type CvChange = {
  section: string
  previousText: string
  replacement: string
  rationale: string
}

function AppliedChanges({ changes }: { changes: CvChange[] }) {
  return (
    <div className="space-y-3">
      {changes.map((change, index) => (
        <div
          className="rounded-md border border-border p-3 text-sm"
          key={`${change.section}-${index}`}
        >
          <p className="font-medium text-foreground">{change.section}</p>
          <p className="mt-1 text-muted-foreground">{change.rationale}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            Before: {change.previousText || "New"}
          </p>
          <p className="mt-1 text-foreground">After: {change.replacement}</p>
        </div>
      ))}
    </div>
  )
}

function EmptyChats({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="m-auto max-w-sm text-center">
      <p className="text-sm font-medium text-foreground">No chats yet</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Start a conversation about this application.
      </p>
      <Button className="mt-4" onClick={onCreate} size="sm">
        <MessageSquarePlus />
        New chat
      </Button>
    </div>
  )
}

function PromptStarters({ onSend }: { onSend: (prompt: string) => void }) {
  return (
    <div className="m-auto w-full max-w-xl">
      <p className="text-center text-sm text-muted-foreground">
        Try one of these prompts.
      </p>
      <div className="mt-3 grid gap-2">
        {STARTER_PROMPTS.map((prompt) => (
          <button
            className="rounded-md border border-border bg-background px-3 py-3 text-left text-sm text-foreground hover:bg-muted/50"
            key={prompt}
            onClick={() => onSend(prompt)}
            type="button"
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  )
}

type ThreadCandidate = {
  _id: string
  title: string
}

function ThreadSwitcher({
  threads,
  selectedThreadId,
  onSelectThread,
  onCreateThread,
  onManageThread,
}: {
  threads: ThreadCandidate[] | undefined
  selectedThreadId: string | undefined
  onSelectThread: (id: string | undefined) => void
  onCreateThread: () => Promise<void>
  onManageThread: (id: string, title: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)
  const selectedTitle =
    threads?.find((t) => t._id === selectedThreadId)?.title ?? "Select chat"

  const filteredThreads = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return threads ?? []
    return (threads ?? []).filter((t) => t.title.toLowerCase().includes(q))
  }, [threads, query])

  useEffect(() => {
    const manager = getHotkeyManager()
    const handle = manager.register(
      { key: "k", mod: true },
      () => {
        setOpen((current) => !current)
      },
      {
        preventDefault: true,
      }
    )
    return () => {
      handle.unregister()
    }
  }, [])

  useEffect(() => {
    const manager = getHotkeyManager()
    const handle = manager.register(
      { key: "O", mod: true, shift: true },
      () => {
        setOpen(false)
        setQuery("")
        void onCreateThread()
      },
      {
        preventDefault: true,
      }
    )
    return () => {
      handle.unregister()
    }
  }, [onCreateThread])

  useEffect(() => {
    if (open) {
      const timeout = setTimeout(() => inputRef.current?.focus(), 0)
      return () => clearTimeout(timeout)
    }
  }, [open])

  return (
    <>
      <div className="flex items-center gap-2 border-b border-border p-3">
        <Button
          className="h-8 min-w-0 flex-1 justify-between px-3 text-sm text-muted-foreground"
          onClick={() => setOpen(true)}
          type="button"
          variant="outline"
        >
          <span className="truncate">{selectedTitle}</span>
          <span className="inline-flex items-center gap-1 text-xs opacity-50">
            <kbd className="hidden rounded border bg-muted px-1 font-mono text-[10px] sm:inline">
              {navigator.platform.startsWith("Mac") ? "Cmd" : "Ctrl"}+K
            </kbd>
          </span>
        </Button>
      </div>

      <Dialog
        onOpenChange={(openValue) => {
          setOpen(openValue)
          if (!openValue) setQuery("")
        }}
        open={open}
      >
        <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-lg">
          <DialogTitle className="sr-only">Switch chat</DialogTitle>
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 size-4 shrink-0 opacity-50" />
            <Input
              className="flex h-10 w-full rounded-md border-0 bg-transparent py-3 text-sm shadow-none outline-none placeholder:text-muted-foreground focus-visible:ring-0 dark:bg-transparent"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search chats..."
              ref={inputRef}
              value={query}
            />
          </div>
          <div className="max-h-[300px] overflow-y-auto overflow-x-hidden p-1">
            {filteredThreads.length === 0 && query.trim().length > 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No chats found.
              </p>
            ) : null}
            {filteredThreads.length > 0 ? (
              <div className="space-y-1">
                <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                  Chats
                </p>
                {filteredThreads.map((candidate) => (
                  <div
                    className="group relative flex items-center rounded-sm"
                    key={candidate._id}
                  >
                    <button
                      className="flex flex-1 cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none select-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
                      onClick={() => {
                        onSelectThread(candidate._id)
                        setOpen(false)
                        setQuery("")
                      }}
                      type="button"
                    >
                      <MessageSquare className="size-4 shrink-0 opacity-50" />
                      <span className="flex-1 truncate">{candidate.title}</span>
                      {candidate._id === selectedThreadId ? (
                        <span className="ml-2 text-xs text-muted-foreground">
                          Current
                        </span>
                      ) : null}
                    </button>
                    <Button
                      aria-label={`Manage ${candidate.title}`}
                      className="mr-1 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                      onClick={(event) => {
                        event.stopPropagation()
                        setOpen(false)
                        setQuery("")
                        onManageThread(candidate._id, candidate.title)
                      }}
                      size="icon-xs"
                      type="button"
                      variant="ghost"
                    >
                      <Pencil />
                    </Button>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="mt-1 border-t pt-1">
              <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                Actions
              </p>
              <button
                className="flex w-full cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none select-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
                onClick={() => {
                  void onCreateThread()
                  setOpen(false)
                  setQuery("")
                }}
                type="button"
              >
                <MessageSquarePlus className="size-4 shrink-0" />
                <span>New chat</span>
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

function AgentSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-16 w-3/4" />
      <Skeleton className="ml-auto h-12 w-1/2" />
      <Skeleton className="h-20 w-2/3" />
    </div>
  )
}

function toErrorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : "Request failed"
}
