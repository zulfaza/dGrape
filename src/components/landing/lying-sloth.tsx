/**
 * The landing hero's lying sloth: one still drawing (public/brand/mascot/
 * lying.png) resting on the dashboard's edge. It settles once on load (see
 * HeroShowcase) and then only breathes slowly. Decorative only; reduced
 * motion keeps it still.
 */
export function LyingSloth({ className }: { className?: string }) {
  return (
    <div aria-hidden className={className}>
      <img
        src="/brand/mascot/lying.png"
        alt=""
        width={768}
        height={384}
        draggable={false}
        className="dfe-anim dfe-sloth-breathe h-auto w-full select-none"
      />
    </div>
  )
}
