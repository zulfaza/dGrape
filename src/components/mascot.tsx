import { cn } from "@/lib/utils"

/**
 * The DFE sloth, one transparent image per pose in public/brand/mascot.
 * It is decorative: nearby text must carry the meaning (see DESIGN.md).
 */
export type MascotPose = "wave" | "laptop" | "chart" | "celebrate" | "thinking"

export function Mascot({
  pose,
  size = 96,
  className,
}: {
  pose: MascotPose
  size?: number
  className?: string
}) {
  return (
    <img
      src={`/brand/mascot/${pose}.png`}
      width={size}
      height={size}
      alt=""
      aria-hidden
      draggable={false}
      className={cn("shrink-0 select-none", className)}
    />
  )
}
