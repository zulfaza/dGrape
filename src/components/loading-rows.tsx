import { Skeleton } from "@/components/ui/skeleton"

/**
 * Placeholder rows shaped like the list that is loading. Screen readers
 * hear `label`, such as "Loading files".
 */
export function LoadingRows({
  label,
  rows = 3,
}: {
  label: string
  rows?: number
}) {
  return (
    <div
      role="status"
      aria-label={label}
      className="flex flex-col divide-y rounded-lg border bg-card"
    >
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-4 px-4 py-3.5">
          <Skeleton className="h-4 w-2/5" />
          <Skeleton className="ml-auto h-4 w-16" />
        </div>
      ))}
    </div>
  )
}

/** A page title and a list, for a page whose data is still loading. */
export function LoadingPage({ label }: { label: string }) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 md:px-8">
      <Skeleton className="h-10 w-64" />
      <LoadingRows label={label} rows={4} />
    </div>
  )
}
