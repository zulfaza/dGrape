import { type ChangeEvent, type FormEvent, useCallback, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAction, useMutation } from "convex/react";
import { Plus, Sparkles } from "lucide-react";

import { api } from "../../convex/_generated/api";
import { Button } from "#/components/ui/button.tsx";
import { Input } from "#/components/ui/input.tsx";
import { Label } from "#/components/ui/label.tsx";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "#/components/ui/sheet.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";
import {
  APPLICATION_STATUSES,
  toApplicationStatus,
  type ApplicationStatus,
} from "#/lib/applications.ts";

type FormValues = {
  companyName: string;
  companyWebsite: string;
  sourceUrl: string;
  rawJobText: string;
  jobDescription: string;
  position: string;
  status: ApplicationStatus;
  appliedOn: string;
};

const emptyValues = (): FormValues => {
  return {
    companyName: "",
    companyWebsite: "",
    sourceUrl: "",
    rawJobText: "",
    jobDescription: "",
    position: "",
    status: "Saved",
    appliedOn: "",
  };
};

export function ApplicationCreateSheet() {
  const navigate = useNavigate();
  const previewFromUrl = useAction(api.applications.previewFromUrl);
  const createApplication = useMutation(api.applications.create);
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<FormValues>(() => emptyValues());
  const [error, setError] = useState<string>();
  const [previewing, setPreviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const busy = previewing || submitting;

  const sourceUrl = values.sourceUrl.trim();
  const rawText = values.rawJobText.trim();
  const canPreview = (sourceUrl.length > 0 || rawText.length > 0) && !busy;
  const createArgs = useMemo(
    () => ({
      companyName: values.companyName,
      position: values.position,
      status: values.status,
      ...(toOptionalTimestamp(values.appliedOn) === undefined
        ? {}
        : { appliedOn: toOptionalTimestamp(values.appliedOn) }),
      ...(values.companyWebsite.trim() ? { companyWebsite: values.companyWebsite.trim() } : {}),
      ...(sourceUrl ? { sourceUrl } : {}),
      ...(values.jobDescription.trim() ? { jobDescription: values.jobDescription.trim() } : {}),
    }),
    [sourceUrl, values],
  );

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (busy) return;
      setOpen(nextOpen);
      setError(undefined);
      if (!nextOpen) setValues(emptyValues());
    },
    [busy],
  );
  const updateField = useCallback(
    (field: keyof FormValues) =>
      (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const value =
          field === "status" ? toApplicationStatus(event.target.value) : event.target.value;
        setValues((current) => ({ ...current, [field]: value }));
      },
    [],
  );
  const handlePreview = useCallback(async () => {
    if (!sourceUrl && !rawText) return;
    setPreviewing(true);
    setError(undefined);
    try {
      const preview = await previewFromUrl({
        ...(sourceUrl ? { sourceUrl } : {}),
        ...(rawText ? { rawText } : {}),
      });
      setValues((current) => ({
        ...current,
        companyName: preview.companyName || current.companyName,
        companyWebsite: preview.companyWebsite || current.companyWebsite,
        sourceUrl: preview.sourceUrl || current.sourceUrl,
        jobDescription: preview.jobDescription || current.jobDescription,
        position: preview.position || current.position,
        status: preview.status,
        appliedOn: preview.appliedOn,
      }));
    } catch (cause) {
      setError(toErrorMessage(cause));
    } finally {
      setPreviewing(false);
    }
  }, [previewFromUrl, rawText, sourceUrl]);
  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setSubmitting(true);
      setError(undefined);
      try {
        const applicationId = await createApplication(createArgs);
        setOpen(false);
        setValues(emptyValues());
        await navigate({
          params: { applicationId },
          to: "/dashboard/applications/$applicationId",
        });
      } catch (cause) {
        setError(toErrorMessage(cause));
      } finally {
        setSubmitting(false);
      }
    },
    [createApplication, createArgs, navigate],
  );

  return (
    <Sheet onOpenChange={handleOpenChange} open={open}>
      <SheetTrigger asChild>
        <Button type="button">
          <Plus />
          Capture role
        </Button>
      </SheetTrigger>
      <SheetContent className="overflow-y-auto sm:max-w-xl">
        <form className="flex min-h-full flex-col" onSubmit={handleSubmit}>
          <SheetHeader>
            <SheetTitle>Capture role</SheetTitle>
            <SheetDescription>
              Add one role from a URL or posting text. Repeated captures attach a new source
              observation to the existing role.
            </SheetDescription>
          </SheetHeader>

          <div className="grid gap-5 px-4">
            <section className="rounded-lg border border-border p-4">
              <div className="grid gap-2">
                <Label htmlFor="job-url">Job URL</Label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    id="job-url"
                    onChange={updateField("sourceUrl")}
                    placeholder="https://company.com/jobs/frontend-engineer"
                    type="url"
                    value={values.sourceUrl}
                  />
                  <Button
                    disabled={!canPreview}
                    onClick={handlePreview}
                    type="button"
                    variant="outline"
                  >
                    <Sparkles />
                    {previewing ? "Reading..." : "Preview"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Paste a job URL, posting text, or both, then preview to parse them into the form
                  below.
                </p>
              </div>
              <div className="mt-4 grid gap-2">
                <Label htmlFor="raw-job-text">Job posting text</Label>
                <Textarea
                  className="min-h-40"
                  id="raw-job-text"
                  onChange={updateField("rawJobText")}
                  placeholder="Paste the full job posting — title, company, responsibilities, requirements, and any other details for the agent to parse."
                  value={values.rawJobText}
                />
              </div>
            </section>

            <section className="grid gap-4 rounded-lg border border-border p-4">
              <div className="grid gap-2">
                <Label htmlFor="application-company">Company</Label>
                <Input
                  id="application-company"
                  onChange={updateField("companyName")}
                  required
                  value={values.companyName}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="company-website">Company website</Label>
                <Input
                  id="company-website"
                  onChange={updateField("companyWebsite")}
                  placeholder="https://company.com"
                  type="url"
                  value={values.companyWebsite}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="application-position">Position</Label>
                <Input
                  id="application-position"
                  onChange={updateField("position")}
                  required
                  value={values.position}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="job-description">Job description</Label>
                <Textarea
                  className="min-h-40"
                  id="job-description"
                  onChange={updateField("jobDescription")}
                  placeholder="Filled by preview from the URL or posting text, or enter manually."
                  value={values.jobDescription}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="application-status">Status</Label>
                  <select
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    id="application-status"
                    onChange={updateField("status")}
                    value={values.status}
                  >
                    {APPLICATION_STATUSES.map((status) => (
                      <option key={status}>{status}</option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="application-applied-on">Applied on</Label>
                  <Input
                    id="application-applied-on"
                    onChange={updateField("appliedOn")}
                    type="date"
                    value={values.appliedOn}
                  />
                </div>
              </div>
            </section>

            {error ? <p className="text-sm text-red-300">{error}</p> : null}
          </div>

          <SheetFooter>
            <Button disabled={busy} type="submit">
              {submitting ? "Saving..." : "Save to inbox"}
            </Button>
            <Button
              disabled={busy}
              onClick={() => handleOpenChange(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function toOptionalTimestamp(value: string): number | undefined {
  return value ? new Date(`${value}T00:00:00`).getTime() : undefined;
}

function toErrorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : "Request failed";
}
