import { useCallback } from "react";
import { ChevronDown } from "lucide-react";

import { Button } from "#/components/ui/button.tsx";
import { Checkbox } from "#/components/ui/checkbox.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "#/components/ui/popover.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "#/components/ui/tooltip.tsx";
import { APPLICATION_STATUSES, type ApplicationStatus } from "#/lib/applications.ts";

function getStatusFilterDisplay(selectedStatuses: Set<ApplicationStatus>): {
  label: string;
  otherStatuses: ApplicationStatus[];
} {
  if (selectedStatuses.size === 0) {
    return { label: "No statuses", otherStatuses: [] };
  }
  if (selectedStatuses.size === APPLICATION_STATUSES.length) {
    return { label: "All statuses", otherStatuses: [] };
  }

  const selected = APPLICATION_STATUSES.filter((status) => selectedStatuses.has(status));
  if (selected.length === 1) {
    return { label: selected[0], otherStatuses: [] };
  }

  return {
    label: `${selected[0]} +${selected.length - 1}`,
    otherStatuses: selected.slice(1),
  };
}

export function ApplicationStatusFilter({
  selectedStatuses,
  onSelectedStatusesChange,
}: {
  selectedStatuses: Set<ApplicationStatus>;
  onSelectedStatusesChange: (statuses: Set<ApplicationStatus>) => void;
}) {
  const allSelected = selectedStatuses.size === APPLICATION_STATUSES.length;
  const someSelected = selectedStatuses.size > 0 && !allSelected;

  const handleSelectAllToggle = useCallback(
    (checked: boolean) => {
      onSelectedStatusesChange(
        checked ? new Set(APPLICATION_STATUSES) : new Set<ApplicationStatus>(),
      );
    },
    [onSelectedStatusesChange],
  );
  const handleStatusToggle = useCallback(
    (status: ApplicationStatus, checked: boolean) => {
      const next = new Set(selectedStatuses);
      if (checked) {
        next.add(status);
      } else {
        next.delete(status);
      }
      onSelectedStatusesChange(next);
    },
    [onSelectedStatusesChange, selectedStatuses],
  );

  const { label, otherStatuses } = getStatusFilterDisplay(selectedStatuses);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button className="h-9 gap-2 font-normal" type="button" variant="outline">
          <span className="text-muted-foreground">Status</span>
          {otherStatuses.length > 0 ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="max-w-48 truncate">{label}</span>
              </TooltipTrigger>
              <TooltipContent>{otherStatuses.join(", ")}</TooltipContent>
            </Tooltip>
          ) : (
            <span className="max-w-48 truncate">{label}</span>
          )}
          <ChevronDown className="size-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-48 p-2">
        <div className="flex flex-col gap-1">
          <label
            className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium hover:bg-muted/50"
            htmlFor="status-filter-all"
          >
            <Checkbox
              checked={allSelected ? true : someSelected ? "indeterminate" : false}
              id="status-filter-all"
              onCheckedChange={(checked) => handleSelectAllToggle(checked === true)}
            />
            Select all
          </label>
          <div className="my-1 border-t border-border" />
          {APPLICATION_STATUSES.map((status) => (
            <label
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50"
              htmlFor={`status-filter-${status}`}
              key={status}
            >
              <Checkbox
                checked={selectedStatuses.has(status)}
                id={`status-filter-${status}`}
                onCheckedChange={(checked) => handleStatusToggle(status, checked === true)}
              />
              {status}
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
