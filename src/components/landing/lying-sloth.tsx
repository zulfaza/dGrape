/**
 * The landing hero's lying sloth, animated from six drawn frames in one
 * sprite sheet (public/brand/mascot/lying-frames/sprite.webp, built by
 * scripts/build-sloth-sprite.py). The frames are aligned on the head, so
 * only the hand, leg, and foot move. Decorative only. Reduced motion shows
 * the first frame still (see .dfe-anim in app.css).
 */
export function LyingSloth({ className }: { className?: string }) {
  return (
    <div aria-hidden className={className}>
      <div
        className="dfe-anim dfe-sloth-sprite aspect-[2/1] w-full bg-no-repeat"
        style={{
          backgroundImage: "url(/brand/mascot/lying-frames/sprite.webp)",
          backgroundSize: "600% 100%",
        }}
      />
    </div>
  )
}
