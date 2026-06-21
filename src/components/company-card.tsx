import { useCallback, useMemo, useState } from "react"
import { useAction, useMutation } from "convex/react"
import {
  Building2,
  GitMerge,
  Loader2,
  MoreHorizontal,
  Sparkles,
  Trash2,
} from "lucide-react"

import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import { Button } from "#/components/ui/button.tsx"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog.tsx"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu.tsx"
import { Label } from "#/components/ui/label.tsx"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select.tsx"
import { toast } from "#/components/ui/toast.tsx"
import { brandGradient } from "#/lib/brand.ts"
import { cn } from "#/lib/utils.ts"

export type CompanyCardData = {
  id: Id<"companies">
  name: string
  hqLocation: string
  size: string
  logo: string
  banner: string
  brandColor: string
  applicationCount: number
}

function isKnown(value: string): boolean {
  const normalized = value.trim().toLocaleLowerCase()
  return normalized.length > 0 && normalized !== "unknown"
}

export function CompanyCard({
  companies,
  company,
}: {
  companies: CompanyCardData[]
  company: CompanyCardData
}) {
  const enrichCompany = useAction(api.companies.enrich)
  const removeCompany = useMutation(api.companies.remove)
  const mergeCompany = useMutation(api.companies.merge)
  const [enriching, setEnriching] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [merging, setMerging] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [mergeOpen, setMergeOpen] = useState(false)
  const [targetCompanyId, setTargetCompanyId] = useState<string>()
  const [error, setError] = useState<string>()

  const location = isKnown(company.hqLocation) ? company.hqLocation : null
  const size = isKnown(company.size) ? company.size : null
  const busy = enriching || deleting || merging
  const mergeTargets = useMemo(
    () => companies.filter((candidate) => candidate.id !== company.id),
    [companies, company.id]
  )
  const bannerFallbackStyle = useMemo(
    () => ({
      backgroundImage: brandGradient(company.name, company.brandColor),
    }),
    [company.name, company.brandColor]
  )

  const handleEnrich = useCallback(async () => {
    setEnriching(true)
    setError(undefined)
    try {
      await enrichCompany({ companyId: company.id })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Enrichment failed")
    } finally {
      setEnriching(false)
    }
  }, [company.id, enrichCompany])

  const handleDelete = useCallback(async () => {
    setDeleting(true)
    setError(undefined)
    try {
      await removeCompany({ companyId: company.id })
      setDeleteOpen(false)
      toast.success("Company deleted")
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Delete failed"
      setError(message)
      toast.error(message)
    } finally {
      setDeleting(false)
    }
  }, [company.id, removeCompany])

  const handleMerge = useCallback(async () => {
    if (!targetCompanyId) return
    setMerging(true)
    setError(undefined)
    try {
      await mergeCompany({ sourceCompanyId: company.id, targetCompanyId })
      setMergeOpen(false)
      setTargetCompanyId(undefined)
      toast.success("Company merged")
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Merge failed"
      setError(message)
      toast.error(message)
    } finally {
      setMerging(false)
    }
  }, [company.id, mergeCompany, targetCompanyId])

  return (
    <>
      <article className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="relative h-28 overflow-hidden bg-muted">
          {company.banner ? (
            <img
              alt=""
              className="h-full w-full object-cover"
              decoding="async"
              loading="lazy"
              src={company.banner}
            />
          ) : (
            <div
              aria-hidden
              className="h-full w-full"
              style={bannerFallbackStyle}
            />
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                aria-label={`Actions for ${company.name}`}
                className="absolute top-2 right-2 size-8 bg-background/80 text-foreground backdrop-blur-sm hover:bg-background"
                disabled={busy}
                size="icon"
                type="button"
                variant="ghost"
              >
                {busy ? (
                  <Loader2 aria-hidden className="size-4 animate-spin" />
                ) : (
                  <MoreHorizontal aria-hidden className="size-4" />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem disabled={busy} onClick={handleEnrich}>
                <Sparkles />
                Enrich company
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={
                  busy ||
                  mergeTargets.length === 0 ||
                  company.applicationCount === 0
                }
                onClick={() => setMergeOpen(true)}
              >
                <GitMerge />
                Merge into
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={busy}
                onClick={() => setDeleteOpen(true)}
                variant="destructive"
              >
                <Trash2 />
                Delete company
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="relative flex items-end justify-between gap-3 px-4 pt-8 pb-4">
          <div
            className={cn(
              "absolute top-0 left-4 size-12 -translate-y-1/2 overflow-hidden rounded-full",
              "border-2 border-border bg-background"
            )}
          >
            {company.logo ? (
              <img
                alt=""
                className="h-full w-full object-cover"
                decoding="async"
                loading="lazy"
                src={company.logo}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-muted text-muted-foreground">
                <Building2 aria-hidden className="size-5" />
              </div>
            )}
          </div>

          <p className="min-w-0 pl-14 text-sm font-medium text-foreground">
            <span className="truncate">{company.name}</span>
            {location ? (
              <>
                <span aria-hidden className="mx-1.5 text-muted-foreground">
                  |
                </span>
                <span className="truncate text-muted-foreground">
                  {location}
                </span>
              </>
            ) : null}
          </p>

          {size ? (
            <span className="shrink-0 text-sm text-muted-foreground">
              {size}
            </span>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-3 px-4 pb-4 text-xs text-muted-foreground">
          <span>
            {company.applicationCount === 1
              ? "1 application"
              : `${company.applicationCount} applications`}
          </span>
        </div>

        {error ? (
          <p className="px-4 pb-3 text-xs text-red-300">{error}</p>
        ) : null}
      </article>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {company.name}?</DialogTitle>
            <DialogDescription>
              This only works when no applications or aliases still reference
              this company.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              disabled={deleting}
              onClick={() => setDeleteOpen(false)}
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={deleting}
              onClick={handleDelete}
              variant="destructive"
            >
              {deleting ? (
                <Loader2 aria-hidden className="size-4 animate-spin" />
              ) : (
                <Trash2 />
              )}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={mergeOpen} onOpenChange={setMergeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Merge {company.name}</DialogTitle>
            <DialogDescription>
              Moves this company&apos;s applications into another company, then
              deletes this company.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor={`merge-target-${company.id}`}>Target company</Label>
            <Select
              disabled={merging}
              onValueChange={setTargetCompanyId}
              value={targetCompanyId}
            >
              <SelectTrigger
                className="w-full"
                id={`merge-target-${company.id}`}
              >
                <SelectValue placeholder="Select company" />
              </SelectTrigger>
              <SelectContent>
                {mergeTargets.map((target) => (
                  <SelectItem key={target.id} value={target.id}>
                    {target.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              disabled={merging}
              onClick={() => setMergeOpen(false)}
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={merging || !targetCompanyId}
              onClick={handleMerge}
            >
              {merging ? (
                <Loader2 aria-hidden className="size-4 animate-spin" />
              ) : (
                <GitMerge />
              )}
              Merge
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
