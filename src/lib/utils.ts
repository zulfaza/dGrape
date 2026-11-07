import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

/**
 * tailwind-merge with the custom theme values from
 * src/styles/component-theme.css. Without them, cn() reads `text-caption` as
 * a text color and drops it next to `text-muted-foreground`, and it keeps
 * `transition-width` next to `transition-all`. Keep this list in sync with
 * that file.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["caption"],
      shadow: ["sidebar-outline", "sidebar-outline-hover"],
    },
    classGroups: {
      transition: [
        {
          transition: [
            "color-shadow",
            "width",
            "inset-width",
            "margin-opacity",
            "size-padding",
          ],
        },
      ],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
