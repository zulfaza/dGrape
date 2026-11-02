import type { ReactNode } from "react"

/** Page title, one-line purpose, and the page's main action. */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-3xl leading-10 font-semibold tracking-tight">
          {title}
        </h1>
        {description && (
          <p className="mt-1 text-base text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
    </header>
  )
}
