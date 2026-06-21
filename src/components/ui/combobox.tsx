import * as React from "react";
import { Check, ChevronsUpDown, Plus, Search, X } from "lucide-react";

import { cn } from "#/lib/utils.ts";
import { Popover, PopoverContent, PopoverTrigger } from "#/components/ui/popover.tsx";

const EMPTY_OPTIONS: string[] = [];

export function MultiCombobox({
  value,
  onChange,
  options = EMPTY_OPTIONS,
  placeholder = "Select...",
  inputPlaceholder = "Search or add...",
  emptyText = "No results.",
  allowCreate = true,
  className,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  options?: string[];
  placeholder?: string;
  inputPlaceholder?: string;
  emptyText?: string;
  allowCreate?: boolean;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  const normalizedQuery = query.trim();
  const lowerQuery = normalizedQuery.toLowerCase();
  const filtered = options.filter((option) => option.toLowerCase().includes(lowerQuery));
  const canCreate =
    allowCreate &&
    normalizedQuery.length > 0 &&
    !value.some((item) => item.toLowerCase() === lowerQuery) &&
    !options.some((option) => option.toLowerCase() === lowerQuery);

  const toggle = (item: string) => {
    if (value.some((candidate) => candidate.toLowerCase() === item.toLowerCase())) {
      onChange(value.filter((candidate) => candidate.toLowerCase() !== item.toLowerCase()));
    } else {
      onChange([...value, item]);
    }
  };

  const create = (item: string) => {
    const trimmed = item.trim();
    if (!trimmed) return;
    if (!value.some((candidate) => candidate.toLowerCase() === trimmed.toLowerCase())) {
      onChange([...value, trimmed]);
    }
    setQuery("");
  };

  const remove = (item: string) => {
    onChange(value.filter((candidate) => candidate !== item));
  };

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      if (canCreate) create(normalizedQuery);
      else if (filtered.length > 0 && filtered[0]) toggle(filtered[0]);
    } else if (event.key === "Backspace" && query.length === 0 && value.length > 0) {
      const lastValue = value[value.length - 1];
      if (lastValue) remove(lastValue);
    }
  };

  return (
    <div className={className}>
      <Popover onOpenChange={setOpen} open={open}>
        <PopoverTrigger asChild>
          <button
            aria-expanded={open}
            className="flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-left text-sm shadow-xs transition-colors hover:bg-accent/40 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            type="button"
          >
            <span className={cn("truncate", value.length === 0 && "text-muted-foreground")}>
              {value.length === 0 ? placeholder : `${value.length} selected`}
            </span>
            <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-(--radix-popover-trigger-width) p-0"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            inputRef.current?.focus();
          }}
        >
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 size-4 shrink-0 opacity-50" />
            <input
              aria-label={inputPlaceholder}
              className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder={inputPlaceholder}
              ref={inputRef}
              value={query}
            />
          </div>
          <div className="max-h-60 overflow-y-auto p-1">
            {filtered.length === 0 && !canCreate ? (
              <p className="py-6 text-center text-sm text-muted-foreground">{emptyText}</p>
            ) : null}
            {filtered.map((option) => {
              const selected = value.some(
                (candidate) => candidate.toLowerCase() === option.toLowerCase(),
              );
              return (
                <button
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                  key={option}
                  onClick={() => toggle(option)}
                  type="button"
                >
                  <Check className={cn("size-4", selected ? "opacity-100" : "opacity-0")} />
                  <span className="flex-1 truncate">{option}</span>
                </button>
              );
            })}
            {canCreate ? (
              <button
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                onClick={() => create(normalizedQuery)}
                type="button"
              >
                <Plus className="size-4" />
                <span className="flex-1 truncate">Add &ldquo;{normalizedQuery}&rdquo;</span>
              </button>
            ) : null}
          </div>
        </PopoverContent>
      </Popover>

      {value.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {value.map((item) => (
            <span
              className="inline-flex items-center gap-1 rounded-sm bg-secondary px-1.5 py-0.5 text-xs text-secondary-foreground"
              key={item}
            >
              {item}
              <button
                aria-label={`Remove ${item}`}
                className="opacity-60 transition-opacity hover:opacity-100"
                onClick={() => remove(item)}
                type="button"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
