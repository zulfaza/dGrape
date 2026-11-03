/**
 * The atlas has four equal cells: body, hand, leg, and rear foot.
 * Separate joints keep the face still while the limbs move. CSS sets the
 * overlap at each joint and keeps the original drawing for reduced motion.
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
        className="dfe-sloth-still h-auto w-full select-none"
      />
      <div className="dfe-sloth-puppet relative hidden aspect-2/1 w-full">
        <span className="dfe-anim dfe-sloth-sprite dfe-sloth-foot" />
        <span className="dfe-sloth-sprite dfe-sloth-body" />
        <span className="dfe-anim dfe-sloth-sprite dfe-sloth-leg" />
        <span className="dfe-anim dfe-sloth-sprite dfe-sloth-hand" />
      </div>
    </div>
  )
}
