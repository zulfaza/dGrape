import { Mascot } from "@/components/mascot"
import { cn } from "@/lib/utils"

/** The two atlas cells keep the body still and let the arm turn at its root. */
export function WavingSloth({
  active,
  className,
}: {
  active: boolean
  className?: string
}) {
  return (
    <div aria-hidden className={className}>
      <Mascot pose="wave" className="dfe-sloth-still h-auto w-full" />
      <div className="dfe-sloth-puppet relative hidden aspect-square w-full">
        <span className="dfe-sloth-sprite dfe-wave-sprite dfe-wave-body" />
        <span
          className={cn(
            "dfe-anim dfe-sloth-sprite dfe-wave-sprite dfe-wave-arm",
            !active && "dfe-paused"
          )}
        />
      </div>
    </div>
  )
}
