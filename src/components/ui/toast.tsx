import * as React from "react";
import { Toast as ToastPrimitive } from "radix-ui";
import { X } from "lucide-react";

import { cn } from "#/lib/utils.ts";

type ToastVariant = "default" | "error" | "success";

type ToastItem = {
  id: number;
  title?: string;
  description: string;
  variant: ToastVariant;
};

let counter = 0;
let listeners: Array<(item: ToastItem) => void> = [];

function emit(item: Omit<ToastItem, "id">) {
  const full: ToastItem = { ...item, id: ++counter };
  for (const listener of listeners) listener(full);
}

export const toast = {
  error: (description: string, title?: string) => emit({ description, title, variant: "error" }),
  success: (description: string, title?: string) =>
    emit({ description, title, variant: "success" }),
  message: (description: string, title?: string) =>
    emit({ description, title, variant: "default" }),
};

const variantClasses: Record<ToastVariant, string> = {
  default: "border-border bg-background text-foreground",
  error: "border-destructive/40 bg-destructive/10 text-foreground",
  success: "border-emerald-500/40 bg-emerald-500/10 text-foreground",
};

export function Toaster() {
  const [items, setItems] = React.useState<ToastItem[]>([]);

  React.useEffect(() => {
    const listener = (item: ToastItem) => setItems((current) => [...current, item]);
    listeners.push(listener);
    return () => {
      listeners = listeners.filter((candidate) => candidate !== listener);
    };
  }, []);

  return (
    <ToastPrimitive.Provider swipeDirection="right">
      {items.map((item) => (
        <ToastPrimitive.Root
          className={cn(
            "group pointer-events-auto relative flex w-full items-start justify-between gap-3 rounded-md border p-4 shadow-lg data-[state=closed]:animate-out data-[state=closed]:fade-out-80 data-[state=open]:animate-in data-[state=open]:slide-in-from-right-full data-[swipe=end]:animate-out data-[swipe=move]:translate-x-(--radix-toast-swipe-move-x) data-[swipe=cancel]:translate-x-0",
            variantClasses[item.variant],
          )}
          duration={5000}
          key={item.id}
          onOpenChange={(open) => {
            if (!open)
              setItems((current) => current.filter((candidate) => candidate.id !== item.id));
          }}
        >
          <div className="grid gap-1">
            {item.title ? (
              <ToastPrimitive.Title className="text-sm font-medium">
                {item.title}
              </ToastPrimitive.Title>
            ) : null}
            <ToastPrimitive.Description className="text-sm leading-5 opacity-90">
              {item.description}
            </ToastPrimitive.Description>
          </div>
          <ToastPrimitive.Close
            aria-label="Dismiss"
            className="shrink-0 rounded-xs opacity-60 transition-opacity hover:opacity-100"
          >
            <X className="size-4" />
          </ToastPrimitive.Close>
        </ToastPrimitive.Root>
      ))}
      <ToastPrimitive.Viewport className="fixed right-0 bottom-0 z-[100] flex max-h-screen w-full flex-col gap-2 p-4 sm:max-w-sm" />
    </ToastPrimitive.Provider>
  );
}
