import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { format } from "date-fns";
import { Merge, Trash2 } from "lucide-react";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Button } from "#/components/ui/button.tsx";
import { Skeleton } from "#/components/ui/skeleton.tsx";
import {
  APPLICATION_STATUSES,
  toApplicationStatus,
  type ApplicationStatus,
} from "#/lib/applications.ts";
import { cn } from "#/lib/utils.ts";
import { Checkbox } from "./ui/checkbox";
import { Label } from "./ui/label";
import { useSidebar } from "./ui/sidebar";

type Application = FunctionReturnType<typeof api.applications.list>[number];

export function ApplicationsTable({
  applications,
  loading,
  visibleApplications,
}: {
  applications: Application[];
  loading: boolean;
  visibleApplications: Application[];
}) {
  const { isMobile, state: sidebarState } = useSidebar();
  const mergeApplications = useMutation(api.applications.merge);
  const updateStatus = useMutation(api.applications.updateStatus);
  const removeApplications = useMutation(api.applications.removeMany);
  const [selectedIds, setSelectedIds] = useState<Set<Id<"applications">>>(() => new Set());
  const [targetId, setTargetId] = useState<Id<"applications">>();
  const [status, setStatus] = useState<ApplicationStatus>("Applied");
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const applicationIds = new Set(applications.map((application) => application.id));
    setSelectedIds((current) => {
      const next = new Set(
        [...current].filter((applicationId) => applicationIds.has(applicationId)),
      );
      return next.size === current.size ? current : next;
    });
    setTargetId((current) => (current && applicationIds.has(current) ? current : undefined));
  }, [applications]);

  const handleSelectionChange = useCallback(
    (applicationId: Id<"applications">, checked: boolean) => {
      setSelectedIds((current) => {
        const next = new Set(current);
        if (checked) {
          next.add(applicationId);
        } else {
          next.delete(applicationId);
        }
        setTargetId((currentTarget) => {
          if (checked && !currentTarget) return applicationId;
          if (currentTarget !== applicationId || checked) return currentTarget;
          return next.values().next().value;
        });
        return next;
      });
    },
    [],
  );
  const handleTargetChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      setTargetId(applications.find((application) => application.id === event.target.value)?.id);
    },
    [applications],
  );
  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setTargetId(undefined);
  }, []);
  const handleMerge = useCallback(async () => {
    if (!targetId || selectedIds.size < 2) return;
    const target = applications.find((application) => application.id === targetId);
    if (
      !target ||
      !window.confirm(
        `Merge ${selectedIds.size - 1} applications into ${target.position} at ${target.company}?`,
      )
    ) {
      return;
    }
    setSubmitting(true);
    setError(undefined);
    try {
      await mergeApplications({
        targetApplicationId: targetId,
        sourceApplicationIds: [...selectedIds].filter(
          (applicationId) => applicationId !== targetId,
        ),
      });
      clearSelection();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Merge failed");
    } finally {
      setSubmitting(false);
    }
  }, [applications, clearSelection, mergeApplications, selectedIds, targetId]);
  const handleStatusChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    setStatus(toApplicationStatus(event.target.value));
  }, []);
  const handleUpdateStatus = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setSubmitting(true);
    setError(undefined);
    try {
      await updateStatus({ applicationIds: [...selectedIds], status });
      clearSelection();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Status update failed");
    } finally {
      setSubmitting(false);
    }
  }, [clearSelection, selectedIds, status, updateStatus]);
  const handleDelete = useCallback(async () => {
    if (
      selectedIds.size === 0 ||
      !window.confirm(`Delete ${selectedIds.size} selected applications? This cannot be undone.`)
    ) {
      return;
    }
    setSubmitting(true);
    setError(undefined);
    try {
      await removeApplications({ applicationIds: [...selectedIds] });
      clearSelection();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Delete failed");
    } finally {
      setSubmitting(false);
    }
  }, [clearSelection, removeApplications, selectedIds]);

  const selectedApplications = applications.filter((application) =>
    selectedIds.has(application.id),
  );
  const selectedVisibleCount = visibleApplications.filter((application) =>
    selectedIds.has(application.id),
  ).length;

  const handleSelectAllChange = useCallback(
    (checked: boolean | "indeterminate") => {
      const visibleIds = visibleApplications.map((app) => app.id);
      const visibleIdSet = new Set(visibleIds);
      if (checked === true) {
        const next = new Set([...selectedIds, ...visibleIds]);
        setSelectedIds(next);
        setTargetId((current) => current ?? visibleIds[0]);
      } else {
        const next = new Set(selectedIds);
        for (const id of visibleIdSet) {
          next.delete(id);
        }
        setSelectedIds(next);
        setTargetId((current) => {
          if (current && visibleIdSet.has(current)) {
            return next.values().next().value;
          }
          return current;
        });
      }
    },
    [selectedIds, visibleApplications],
  );

  return (
    <div className="grid gap-3">
      {selectedIds.size > 0 ? (
        <div
          className={cn(
            "fixed right-0 bottom-10 z-50 mx-auto flex max-h-[calc(100vh-3rem)] w-[calc(100%-2rem)] max-w-5xl flex-col gap-3 overflow-y-auto rounded-lg border border-border bg-background p-3 shadow-sm",
            isMobile || sidebarState === "collapsed" ? "left-0" : "left-(--sidebar-width)",
          )}
        >
          <span className="text-sm text-muted-foreground">{selectedIds.size} selected</span>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <Label
              className="flex min-w-0 flex-1 items-center gap-2 text-sm"
              htmlFor="merge-target"
            >
              <span className="shrink-0 text-muted-foreground">Keep</span>
              <select
                className="h-9 min-w-0 max-w-md flex-1 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                id="merge-target"
                onChange={handleTargetChange}
                value={targetId}
              >
                {selectedApplications.map((application) => (
                  <option key={application.id} value={application.id}>
                    {application.position} at {application.company}
                  </option>
                ))}
              </select>
            </Label>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                disabled={submitting || selectedIds.size < 2}
                onClick={handleMerge}
                type="button"
              >
                <Merge />
                Merge
              </Button>
              <select
                aria-label="New status"
                className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                onChange={handleStatusChange}
                value={status}
              >
                {APPLICATION_STATUSES.map((applicationStatus) => (
                  <option key={applicationStatus}>{applicationStatus}</option>
                ))}
              </select>
              <Button
                disabled={submitting}
                onClick={handleUpdateStatus}
                type="button"
                variant="outline"
              >
                Update status
              </Button>
              <Button
                disabled={submitting}
                onClick={handleDelete}
                type="button"
                variant="destructive"
              >
                <Trash2 />
                Delete
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      <div className="overflow-hidden rounded-lg border border-border">
        <div className="overflow-x-auto">
          <table className="w-full min-w-3xl text-left text-sm">
            <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="w-12 px-4 py-3 font-medium">
                  <Checkbox
                    aria-label="Select all visible applications"
                    checked={
                      !loading &&
                      visibleApplications.length > 0 &&
                      selectedVisibleCount === visibleApplications.length
                        ? true
                        : selectedVisibleCount > 0
                          ? "indeterminate"
                          : false
                    }
                    disabled={loading || visibleApplications.length === 0}
                    onCheckedChange={handleSelectAllChange}
                  />
                </th>
                <th className="px-4 py-3 font-medium">Position</th>
                <th className="px-4 py-3 font-medium">Company</th>
                <th className="px-4 py-3 font-medium">Preparation</th>
                <th className="px-4 py-3 font-medium">Hiring</th>
                <th className="px-4 py-3 font-medium">Fit</th>
                <th className="px-4 py-3 font-medium">Applied on</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading
                ? Array.from({ length: 5 }, (_, index) => (
                    <tr className="bg-background" key={index}>
                      <td className="px-4 py-4">
                        <Skeleton className="size-4" />
                      </td>
                      <td className="px-4 py-4">
                        <Skeleton className="h-4 w-56 max-w-full" />
                      </td>
                      <td className="px-4 py-4">
                        <Skeleton className="h-4 w-36 max-w-full" />
                      </td>
                      <td className="px-4 py-4">
                        <Skeleton className="h-5 w-20" />
                      </td>
                      <td className="px-4 py-4">
                        <Skeleton className="h-5 w-16" />
                      </td>
                      <td className="px-4 py-4">
                        <Skeleton className="h-5 w-20" />
                      </td>
                      <td className="px-4 py-4">
                        <Skeleton className="h-4 w-24" />
                      </td>
                    </tr>
                  ))
                : null}
              {visibleApplications.map((application) => (
                <tr
                  className="bg-background transition-colors hover:bg-muted/30"
                  key={application.id}
                >
                  <td className="px-4 py-4">
                    <Checkbox
                      aria-label={`Select ${application.position} at ${application.company}`}
                      checked={selectedIds.has(application.id)}
                      onCheckedChange={(checked) =>
                        handleSelectionChange(application.id, checked === true)
                      }
                    />
                  </td>
                  <td className="px-4 py-4 font-medium text-foreground">
                    <Link
                      className="text-foreground underline-offset-4 hover:underline"
                      params={{ applicationId: application.id }}
                      to="/dashboard/applications/$applicationId"
                    >
                      {application.position}
                    </Link>
                  </td>
                  <td className="px-4 py-4 text-muted-foreground">{application.company}</td>
                  <td className="px-4 py-4">
                    <WorkflowBadge kind="preparation" value={application.preparationStatus} />
                  </td>
                  <td className="px-4 py-4">
                    <WorkflowBadge kind="hiring" value={application.hiringStatus} />
                  </td>
                  <td className="px-4 py-4">
                    {application.fitBand ? (
                      <FitBadge
                        band={application.fitBand}
                        eligibility={application.eligibility}
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">Not assessed</span>
                    )}
                  </td>
                  <td className="px-4 py-4 text-muted-foreground">
                    {formatOptionalDate(application.appliedOn)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && visibleApplications.length === 0 ? (
          <p className="border-t border-border px-4 py-8 text-center text-sm text-muted-foreground">
            No applications match this filter.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function formatOptionalDate(value: number | undefined): string {
  return value === undefined ? "Not set" : format(value, "MMM d, yyyy");
}

function WorkflowBadge({
  kind,
  value,
}: {
  kind: "preparation" | "hiring";
  value: string;
}) {
  const terminal = value === "offer" || value === "ready";
  const negative = value === "rejected" || value === "withdrawn" || value === "archived";
  const className = terminal
    ? "border-emerald-700/80 bg-emerald-950/60 text-emerald-200"
    : negative
      ? "border-red-800/80 bg-red-950/60 text-red-200"
      : kind === "preparation"
        ? "border-sky-700/80 bg-sky-950/60 text-sky-200"
        : "border-zinc-600 bg-zinc-800 text-zinc-200";
  return (
    <span className={`inline-flex border px-2 py-0.5 text-xs font-medium capitalize ${className}`}>
      {value.replaceAll("_", " ")}
    </span>
  );
}

function FitBadge({ band, eligibility }: { band: string; eligibility: string | undefined }) {
  const value = eligibility === "ineligible" ? "ineligible" : `${band} fit`;
  const className =
    band === "high" && eligibility !== "ineligible"
      ? "border-emerald-700/80 bg-emerald-950/60 text-emerald-200"
      : band === "medium" && eligibility !== "ineligible"
        ? "border-amber-700/80 bg-amber-950/60 text-amber-200"
        : "border-red-800/80 bg-red-950/60 text-red-200";
  return (
    <span className={`inline-flex border px-2 py-0.5 text-xs font-medium capitalize ${className}`}>
      {value}
    </span>
  );
}
