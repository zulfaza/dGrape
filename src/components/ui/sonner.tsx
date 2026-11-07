import type { CSSProperties } from "react"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import {
  CircleCheck,
  CircleX,
  Info,
  LoaderCircle,
  TriangleAlert,
} from "lucide-react"
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
        success: <CircleCheck className="size-4" />,
        info: <Info className="size-4" />,
        warning: <TriangleAlert className="size-4" />,
        error: <CircleX className="size-4" />,
        loading: <LoaderCircle className="size-4 animate-spin" />,
      }}
      style={toastStyle}
      {...props}
    />
  )
}

export { Toaster }
