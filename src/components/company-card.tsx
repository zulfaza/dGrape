import { useCallback, useMemo, useState } from "react";
import { useAction } from "convex/react";
import { Building2, Ellipsis, Loader2, Sparkles } from "lucide-react";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Button } from "#/components/ui/button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu.tsx";
import { brandGradient } from "#/lib/brand.ts";
import { cn } from "#/lib/utils.ts";

export type CompanyCardData = {
  id: Id<"companies">;
  name: string;
  hqLocation: string;
  size: string;
  logo: string;
  banner: string;
  brandColor: string;
};

function isKnown(value: string): boolean {
  const normalized = value.trim().toLocaleLowerCase();
  return normalized.length > 0 && normalized !== "unknown";
}

export function CompanyCard({ company }: { company: CompanyCardData }) {
  const enrichCompany = useAction(api.companies.enrich);
  const [enriching, setEnriching] = useState(false);
  const [error, setError] = useState<string>();

  const location = isKnown(company.hqLocation) ? company.hqLocation : null;
  const size = isKnown(company.size) ? company.size : null;
  const bannerFallbackStyle = useMemo(
    () => ({ backgroundImage: brandGradient(company.name, company.brandColor) }),
    [company.name, company.brandColor],
  );

  const handleEnrich = useCallback(async () => {
    setEnriching(true);
    setError(undefined);
    try {
      await enrichCompany({ companyId: company.id });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Enrichment failed");
    } finally {
      setEnriching(false);
    }
  }, [company.id, enrichCompany]);

  return (
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
          <div aria-hidden className="h-full w-full" style={bannerFallbackStyle} />
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={`Actions for ${company.name}`}
              className="absolute top-2 right-2 size-8 bg-background/80 text-foreground backdrop-blur-sm hover:bg-background"
              disabled={enriching}
              size="icon"
              type="button"
              variant="ghost"
            >
              {enriching ? (
                <Loader2 aria-hidden className="size-4 animate-spin" />
              ) : (
                <Ellipsis aria-hidden className="size-4" />
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem disabled={enriching} onClick={handleEnrich}>
              <Sparkles />
              Enrich company
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="relative flex items-end justify-between gap-3 px-4 pt-8 pb-4">
        <div
          className={cn(
            "absolute top-0 left-4 size-12 -translate-y-1/2 overflow-hidden rounded-full",
            "border-2 border-border bg-background",
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
              <span className="truncate text-muted-foreground">{location}</span>
            </>
          ) : null}
        </p>

        {size ? <span className="shrink-0 text-sm text-muted-foreground">{size}</span> : null}
      </div>

      {error ? <p className="px-4 pb-3 text-xs text-red-300">{error}</p> : null}
    </article>
  );
}
