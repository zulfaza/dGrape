import { type FormEvent, useCallback, useState } from "react";
import { useMutation } from "convex/react";
import { format } from "date-fns";
import { Plus } from "lucide-react";

import { api } from "../../convex/_generated/api";
import { Button } from "#/components/ui/button.tsx";
import { Input } from "#/components/ui/input.tsx";
import { Label } from "#/components/ui/label.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";
import {
  APPLICATION_STATUSES,
  toApplicationStatus,
  type ApplicationStatus,
} from "#/lib/applications.ts";

type ActivityFormValues = {
  type: ApplicationStatus;
  date: string;
  note: string;
};

type ApplicationEvent = {
  _id: string;
  type: ApplicationStatus;
  date: number;
  note: string;
  sourceEmailId: string;
};

function emptyActivityValues(): ActivityFormValues {
  return {
    type: "Applied",
    date: new Date().toISOString().slice(0, 10),
    note: "",
  };
}

export function ApplicationActivitySection({
  applicationId,
  events,
}: {
  applicationId: string;
  events: ApplicationEvent[];
}) {
  const addEvent = useMutation(api.applications.addEvent);
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<ActivityFormValues>(() => emptyActivityValues());
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  const handleOpen = useCallback(() => {
    setValues(emptyActivityValues());
    setError(undefined);
    setOpen(true);
  }, []);
  const handleCancel = useCallback(() => {
    setOpen(false);
    setError(undefined);
  }, []);
  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setSubmitting(true);
      setError(undefined);
      try {
        const date = toActivityTimestamp(values.date);
        if (date === undefined) throw new Error("Date is required");
        await addEvent({
          applicationId,
          type: values.type,
          date,
          ...(values.note.trim() ? { note: values.note.trim() } : {}),
        });
        setOpen(false);
      } catch (cause) {
        setError(toErrorMessage(cause));
      } finally {
        setSubmitting(false);
      }
    },
    [addEvent, applicationId, values],
  );

  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h2 className="text-sm font-medium text-foreground">Activity</h2>
        {!open ? (
          <Button onClick={handleOpen} size="sm" type="button" variant="outline">
            <Plus />
            Add activity
          </Button>
        ) : null}
      </div>

      {open ? (
        <form className="border-b border-border p-4" onSubmit={handleSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="activity-type">Type</Label>
              <select
                className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                id="activity-type"
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    type: toApplicationStatus(event.target.value),
                  }))
                }
                value={values.type}
              >
                {APPLICATION_STATUSES.map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="activity-date">Date</Label>
              <Input
                id="activity-date"
                onChange={(event) =>
                  setValues((current) => ({ ...current, date: event.target.value }))
                }
                required
                type="date"
                value={values.date}
              />
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="activity-note">Note</Label>
              <Textarea
                id="activity-note"
                onChange={(event) =>
                  setValues((current) => ({ ...current, note: event.target.value }))
                }
                placeholder="Optional details — interview round, recruiter name, next steps, etc."
                value={values.note}
              />
            </div>
          </div>
          {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
          <div className="mt-4 flex gap-2">
            <Button disabled={submitting} size="sm" type="submit">
              {submitting ? "Saving..." : "Save activity"}
            </Button>
            <Button
              disabled={submitting}
              onClick={handleCancel}
              size="sm"
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      {events.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">
          No activity yet. Add a manual entry to track progress.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {events.map((event) => (
            <li
              className="flex flex-col gap-1 px-4 py-3.5 sm:flex-row sm:items-start sm:justify-between"
              key={event._id}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-foreground">{event.type}</p>
                  {event.sourceEmailId.startsWith("manual:") ? (
                    <span className="text-xs text-muted-foreground">Manual</span>
                  ) : null}
                </div>
                {event.note ? (
                  <p className="mt-1 text-sm text-muted-foreground">{event.note}</p>
                ) : null}
              </div>
              <time className="shrink-0 text-xs text-muted-foreground sm:pt-0.5">
                {format(event.date, "MMM d, yyyy")}
              </time>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function toActivityTimestamp(value: string): number | undefined {
  if (!value) return undefined;
  const timestamp = new Date(`${value}T00:00:00`).getTime();
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function toErrorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : "Request failed";
}
