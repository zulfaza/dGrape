import { type ChangeEvent, type DragEvent, useCallback, useRef, useState } from "react";
import { useAction } from "convex/react";
import { FileUp, Loader2, TriangleAlert } from "lucide-react";

import { api } from "../../convex/_generated/api";
import { Button } from "#/components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog.tsx";
import { extractPdfText } from "#/lib/pdf.ts";
import { profileFromImported, type UserProfile } from "#/lib/profile.ts";
import { cn } from "#/lib/utils.ts";

const MAX_CV_BYTES = 5 * 1024 * 1024;

export function useCvImport(onImported: (profile: UserProfile) => void) {
  const importFromCv = useAction(api.profile.importFromCv);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string>();
  const [status, setStatus] = useState<string>();

  const importFile = useCallback(
    async (file: File): Promise<boolean> => {
      if (file.type !== "application/pdf") {
        setError("Please upload a PDF file.");
        return false;
      }
      if (file.size > MAX_CV_BYTES) {
        setError("CV file is too large (max 5 MB).");
        return false;
      }

      setImporting(true);
      setError(undefined);
      setStatus("Reading PDF…");
      try {
        const cvText = await extractPdfText(await file.arrayBuffer());
        if (!cvText) {
          throw new Error("No text found in PDF — try a text-based CV instead of a scanned image");
        }
        setStatus("Parsing CV with AI…");
        const imported = await importFromCv({ cvText });
        onImported(profileFromImported(imported));
        setStatus("CV imported. Review the fields below and save.");
        return true;
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "CV import failed");
        setStatus(undefined);
        return false;
      } finally {
        setImporting(false);
      }
    },
    [importFromCv, onImported],
  );

  const clearMessages = useCallback(() => {
    setError(undefined);
    setStatus(undefined);
  }, []);

  return { importing, error, status, importFile, clearMessages };
}

export function CvImportDialog({
  error,
  importing,
  onImport,
  onOpenChange,
  open,
  status,
}: {
  error?: string;
  importing: boolean;
  onImport: (file: File) => Promise<boolean>;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  status?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const processFile = useCallback(
    async (file: File) => {
      const success = await onImport(file);
      if (success) onOpenChange(false);
    },
    [onImport, onOpenChange],
  );

  const handleFileChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (file) void processFile(file);
    },
    [processFile],
  );

  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
  }, []);

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragging(false);
      const file = event.dataTransfer.files[0];
      if (file) void processFile(file);
    },
    [processFile],
  );

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        if (!importing) onOpenChange(nextOpen);
      }}
      open={open}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import from CV</DialogTitle>
          <DialogDescription>
            Upload a PDF resume to fill in your profile automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-100">
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          <p>
            Importing a CV will overwrite all existing profile data. Review the fields and save when
            you are done.
          </p>
        </div>

        <div
          className={cn(
            "flex flex-col items-center gap-3 rounded-lg border border-dashed px-4 py-8 transition-colors",
            dragging ? "border-primary bg-accent/40" : "border-border bg-muted/20",
            importing && "pointer-events-none opacity-60",
          )}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          {importing ? (
            <Loader2 aria-hidden className="size-8 animate-spin text-muted-foreground" />
          ) : (
            <FileUp aria-hidden className="size-8 text-muted-foreground" />
          )}
          <div className="text-center">
            <p className="text-sm font-medium text-foreground">
              {importing ? "Importing CV…" : "Drop your PDF here"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              or choose a file from your computer
            </p>
          </div>
          <input
            accept="application/pdf"
            aria-label="Upload CV PDF"
            className="sr-only"
            disabled={importing}
            onChange={handleFileChange}
            ref={inputRef}
            type="file"
          />
          <Button
            disabled={importing}
            onClick={() => inputRef.current?.click()}
            type="button"
            variant="ghost"
          >
            Choose file
          </Button>
        </div>

        {status ? <p className="text-sm text-muted-foreground">{status}</p> : null}
        {error ? <p className="text-sm text-red-300">{error}</p> : null}
      </DialogContent>
    </Dialog>
  );
}
