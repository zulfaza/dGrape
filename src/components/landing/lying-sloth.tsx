/**
 * The lying sloth as stacked full-canvas layers (public/brand/mascot/lying),
 * so its hand, leg, and foot can swing around their joints. The layers come
 * from lying.png; see architecture/design/assets/mascot-library.md.
 * Decorative only. Reduced motion keeps it still (see .dfe-anim in app.css).
 */
const LAYERS: ReadonlyArray<string> = ["body", "leg", "foot", "hand"]

export function LyingSloth({ className }: { className?: string }) {
  return (
    <div aria-hidden className={className}>
      <div className="relative aspect-[2/1] w-full">
        {LAYERS.map((layer) => (
          <img
            key={layer}
            src={`/brand/mascot/lying/${layer}.png`}
            alt=""
            width={768}
            height={384}
            draggable={false}
            className={`dfe-anim dfe-sloth-${layer} absolute inset-0 h-full w-full select-none`}
          />
        ))}
      </div>
    </div>
  )
}
