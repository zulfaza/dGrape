// Compatibility entry point for existing app callers. Rendering and queuing are
// owned by the shared shadcn Sonner component.
import { toast as sonnerToast } from "sonner"

export { Toaster } from "./sonner"

export const toast = {
  error: (description: string, title?: string) =>
    sonnerToast.error(
      title ?? description,
      title ? { description } : undefined
    ),
  success: (description: string, title?: string) =>
    sonnerToast.success(
      title ?? description,
      title ? { description } : undefined
    ),
  message: (description: string, title?: string) =>
    sonnerToast.message(
      title ?? description,
      title ? { description } : undefined
    ),
}
