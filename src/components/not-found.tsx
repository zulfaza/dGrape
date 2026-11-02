import { Link } from "@tanstack/react-router"
import { ArrowLeft } from "lucide-react"
import { Mascot } from "@/components/mascot"
import { Button } from "@/components/ui/button"

type NotFoundProps = {
  /** Where the primary action sends the user. Defaults to the dashboard. */
  homeHref?: string
  homeLabel?: string
}

export function NotFound({
  homeHref = "/dashboard/workspaces",
  homeLabel = "Back to workspaces",
}: NotFoundProps) {
  return (
    <main className="flex min-h-[60svh] flex-1 items-center justify-center p-6">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <Mascot pose="thinking" size={180} />
        <h1 className="text-2xl font-semibold tracking-tight">
          This page does not exist
        </h1>
        <p className="text-muted-foreground">
          The link may be old, or the page moved. Check the address, or go back
          to a page you know.
        </p>
        <Button asChild>
          <Link to={homeHref}>
            <ArrowLeft aria-hidden />
            {homeLabel}
          </Link>
        </Button>
      </div>
    </main>
  )
}
