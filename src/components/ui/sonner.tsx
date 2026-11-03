import type { CSSProperties } from "react"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  CheckmarkCircle02Icon,
  InformationCircleIcon,
  Alert02Icon,
  MultiplicationSignCircleIcon,
  Loading03Icon,
} from "@hugeicons/core-free-icons"
import { cn } from "#/lib/utils.ts"

// shadcn/ui Sonner recipe, using our explicit theme and shared geometry tokens.
function Toaster({ className, style, ...props }: ToasterProps) {
  const toastStyle = {
    "--normal-bg": "var(--popover)",
    "--normal-text": "var(--popover-foreground)",
    "--normal-border": "var(--border)",
    "--border-radius": "var(--dfe-radius-panel)",
    ...style,
  } satisfies CSSProperties & Record<`--${string}`, string>

  return (
    <Sonner
      className={cn("toaster group", className)}
      position="bottom-right"
      visibleToasts={4}
      gap={8}
      closeButton
      icons={{
        success: <HugeiconsIcon icon={CheckmarkCircle02Icon} size={18} />,
        info: <HugeiconsIcon icon={InformationCircleIcon} size={18} />,
        warning: <HugeiconsIcon icon={Alert02Icon} size={18} />,
        error: <HugeiconsIcon icon={MultiplicationSignCircleIcon} size={18} />,
        loading: (
          <HugeiconsIcon
            icon={Loading03Icon}
            size={18}
            className="animate-spin"
          />
        ),
      }}
      style={toastStyle}
      {...props}
    />
  )
}

export { Toaster }
