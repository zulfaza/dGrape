import {
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

type ConfirmText = {
  /** A question that names the change, such as "Remove Ana?". */
  title: string
  /** What happens, in one sentence. */
  description: string
  /** The verb on the confirm button, such as "Remove". */
  confirmLabel: string
  /** Red confirm button for a change that deletes or revokes. */
  destructive?: boolean
}

/**
 * Asks before a change that is hard to undo. Use it instead of
 * `window.confirm`, so the question has the app's look and focus handling.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  title,
  description,
  confirmLabel,
  destructive = false,
  returnFocusTo,
}: ConfirmText & {
  /** Where focus goes on close when the opener was not focused, such as a
   * Select that closed before the dialog opened. */
  returnFocusTo?: HTMLElement | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}) {
  // The dialog opens from code, not a DialogTrigger, so Radix has no element
  // to return focus to. Remember the one that had focus and restore it.
  const returnTo = useRef<HTMLElement | null>(null)
  // Callers often clear their state on close, so keep the target from open.
  const explicitReturn = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (open) explicitReturn.current = returnFocusTo ?? null
  }, [open, returnFocusTo])
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-md"
        onOpenAutoFocus={() => {
          returnTo.current =
            document.activeElement instanceof HTMLElement
              ? document.activeElement
              : null
        }}
        onCloseAutoFocus={(event) => {
          const target = explicitReturn.current ?? returnTo.current
          if (!target?.isConnected) return
          event.preventDefault()
          target.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            variant={destructive ? "destructive" : "default"}
            onClick={() => {
              onOpenChange(false)
              onConfirm()
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * A button that runs `onConfirm` only after the user confirms. Give an
 * icon-only button a `tooltip` so its name shows on hover and focus.
 */
export function ConfirmButton({
  children,
  tooltip,
  onConfirm,
  title,
  description,
  confirmLabel,
  destructive,
  ...buttonProps
}: ConfirmText &
  Omit<ComponentProps<typeof Button>, "onClick" | "children"> & {
    children: ReactNode
    tooltip?: string
    onConfirm: () => void
  }) {
  const [open, setOpen] = useState(false)
  const trigger = (
    <Button {...buttonProps} onClick={() => setOpen(true)}>
      {children}
    </Button>
  )
  return (
    <>
      {tooltip ? (
        <Tooltip>
          <TooltipTrigger asChild>{trigger}</TooltipTrigger>
          <TooltipContent>{tooltip}</TooltipContent>
        </Tooltip>
      ) : (
        trigger
      )}
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        onConfirm={onConfirm}
        title={title}
        description={description}
        confirmLabel={confirmLabel}
        destructive={destructive}
      />
    </>
  )
}
