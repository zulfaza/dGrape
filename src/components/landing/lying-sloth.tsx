import { useEffect, useState } from "react"

/**
 * The landing hero's lying sloth, lazing on the dashboard's edge.
 *
 * Six drawn frames come from one sprite sheet
 * (public/brand/mascot/lying-frames/sprite.webp, built by
 * scripts/build-sloth-sprite.py) and are aligned on the head. Like Oyenza's
 * mascot, the sloth holds a pose for a while and then eases into the next:
 * the new frame fades in with a soft spring on top of the old one, which
 * stays opaque underneath, so the head never fades and only the limbs blend.
 * A slow breath and sway keep it alive between poses. Decorative only;
 * reduced motion shows the rest frame still.
 */

const SPRITE = "url(/brand/mascot/lying-frames/sprite.webp)"
const FRAME_COUNT = 6
const FADE_MS = 550

/** Frame order and how long each pose is held: mostly resting. */
const SCHEDULE: ReadonlyArray<{ frame: number; holdMs: number }> = [
  { frame: 0, holdMs: 3600 }, // rest
  { frame: 1, holdMs: 1600 }, // a slow wave
  { frame: 0, holdMs: 2800 }, // back to rest
  { frame: 2, holdMs: 1300 }, // stretch the leg out
  { frame: 3, holdMs: 1200 }, // wiggle the back foot
  { frame: 4, holdMs: 1000 }, // let the leg swing back
  { frame: 5, holdMs: 900 }, // settle
]

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  )
}

/**
 * Steps through SCHEDULE. Returns the shown frame, and the frame it is
 * fading from (only during the FADE_MS crossfade, otherwise null).
 */
function useLazyFrames(): { frame: number; fadingFrom: number | null } {
  const [step, setStep] = useState(0)
  const [fading, setFading] = useState(false)
  const [reduced, setReduced] = useState(false)
  useEffect(() => setReduced(prefersReducedMotion()), [])
  useEffect(() => {
    if (reduced) return
    const current = SCHEDULE[step] ?? SCHEDULE[0]
    const next = window.setTimeout(() => {
      setStep((s) => (s + 1) % SCHEDULE.length)
      setFading(true)
    }, current.holdMs)
    return () => window.clearTimeout(next)
  }, [step, reduced])
  useEffect(() => {
    if (!fading) return
    const done = window.setTimeout(() => setFading(false), FADE_MS)
    return () => window.clearTimeout(done)
  }, [fading, step])
  if (reduced) return { frame: 0, fadingFrom: null }
  const frame = (SCHEDULE[step] ?? SCHEDULE[0]).frame
  const before = SCHEDULE[(step - 1 + SCHEDULE.length) % SCHEDULE.length]
  const from = (before ?? SCHEDULE[0]).frame
  return { frame, fadingFrom: fading && from !== frame ? from : null }
}

export function LyingSloth({ className }: { className?: string }) {
  const { frame, fadingFrom } = useLazyFrames()
  return (
    <div aria-hidden className={className}>
      <div className="dfe-anim dfe-sloth-sway">
        <div className="dfe-anim dfe-sloth-breathe relative aspect-[2/1] w-full">
          {Array.from({ length: FRAME_COUNT }, (_, i) => {
            const shown = i === frame
            const leaving = i === fadingFrom
            return (
              <div
                key={i}
                className="absolute inset-0 origin-[40%_78%] bg-no-repeat"
                style={{
                  backgroundImage: SPRITE,
                  backgroundSize: `${FRAME_COUNT * 100}% 100%`,
                  backgroundPosition: `${(i / (FRAME_COUNT - 1)) * 100}% 0`,
                  // The incoming frame fades in on top while the outgoing one
                  // stays fully opaque under it; when the fade ends, the
                  // outgoing frame hides at once.
                  opacity: shown || leaving ? 1 : 0,
                  zIndex: shown ? 2 : leaving ? 1 : 0,
                  scale: shown ? "1" : "0.985",
                  transition: shown
                    ? `opacity ${FADE_MS}ms ease-in-out, scale ${FADE_MS + 250}ms cubic-bezier(0.34, 1.4, 0.64, 1)`
                    : "none",
                }}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}
