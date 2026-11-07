import { Link } from "@tanstack/react-router"
import { ChevronRight, Menu } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"

/**
 * The landing navigation on phones: a menu button that opens a sheet from
 * the bottom, in thumb reach. Section links close the sheet as they jump.
 */
export function MobileNav({
  links,
  signedIn,
}: {
  links: ReadonlyArray<{ href: string; label: string }>
  signedIn: boolean
}) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="sm:hidden"
          aria-label="Open menu"
        >
          <Menu aria-hidden />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="gap-0 px-4 pt-2 pb-6"
      >
        <SheetTitle className="sr-only">Menu</SheetTitle>
        <SheetDescription className="sr-only">
          Jump to a section, or sign in.
        </SheetDescription>
        <nav aria-label="Sections" className="flex flex-col py-2">
          {links.map((link) => (
            <SheetClose key={link.href} asChild>
              <a
                href={link.href}
                className="flex items-center justify-between rounded-md px-3 py-3.5 text-base outline-none hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
              >
                {link.label}
                <ChevronRight aria-hidden className="size-4 text-primary" />
              </a>
            </SheetClose>
          ))}
        </nav>
        <div className="flex flex-col gap-2 border-t pt-4">
          <Button asChild size="lg">
            {signedIn ? (
              <Link to="/dashboard/workspaces">Open workspaces</Link>
            ) : (
              <a href="/sign-in">Sign in</a>
            )}
          </Button>
          <SheetClose asChild>
            <Button variant="ghost" size="lg">
              Close menu
            </Button>
          </SheetClose>
        </div>
      </SheetContent>
    </Sheet>
  )
}
