import { Building2, Ellipsis, Pencil, Trash2 } from "lucide-react";

import type { Doc } from "../../convex/_generated/dataModel";
import { Button } from "#/components/ui/button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu.tsx";
import { STATUS_STYLES, type ApplicationStatus } from "#/lib/applications.ts";
import { cn } from "#/lib/utils.ts";

export function ApplicationDetailHeader({
  company,
  disabled,
  onDelete,
  onEdit,
  position,
  status,
}: {
  company: Doc<"companies"> | null;
  disabled: boolean;
  onDelete: () => void;
  onEdit: () => void;
  position: string;
  status: ApplicationStatus;
}) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-3">
        <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
          <CompanyAvatar company={company} />
          <span>{company?.name ?? "Unknown company"}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{position}</h1>
          <span
            className={cn(
              "inline-flex rounded-md border px-2 py-0.5 text-xs font-medium",
              STATUS_STYLES[status],
            )}
          >
            {status}
          </span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <Button disabled={disabled} onClick={onEdit} size="sm" type="button" variant="outline">
          <Pencil />
          Edit
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label="More actions"
              disabled={disabled}
              size="icon"
              type="button"
              variant="outline"
            >
              <Ellipsis />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={onDelete}
            >
              <Trash2 />
              Delete application
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

function CompanyAvatar({ company }: { company: Doc<"companies"> | null }) {
  if (!company?.logo) {
    return (
      <div className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground">
        <Building2 aria-hidden className="size-3.5" />
      </div>
    );
  }

  return (
    <img
      alt=""
      className="size-7 shrink-0 rounded-md border border-border object-cover"
      decoding="async"
      loading="lazy"
      src={company.logo}
    />
  );
}
