import { useState } from "react";
import { format } from "date-fns/format";
import { CalendarIcon, X } from "lucide-react";

import { MonthPicker } from "#/components/ui/monthpicker.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "#/components/ui/popover.tsx";
import { formatMonthValue, parseMonthValue } from "#/lib/month.ts";
import { cn } from "#/lib/utils.ts";

type MonthPickerFieldProps = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  minDate?: Date;
  maxDate?: Date;
  clearable?: boolean;
};

export function MonthPickerField({
  id,
  value,
  onChange,
  placeholder = "Pick a month",
  className,
  minDate,
  maxDate,
  clearable = false,
}: MonthPickerFieldProps) {
  const [open, setOpen] = useState(false);
  const selectedMonth = parseMonthValue(value);

  return (
    <div className="flex items-center gap-2">
      <Popover onOpenChange={setOpen} open={open}>
        <PopoverTrigger asChild>
          <Button
            className={cn(
              "w-full justify-start text-left font-normal",
              !value && "text-muted-foreground",
              className,
            )}
            id={id}
            type="button"
            variant="outline"
          >
            <CalendarIcon className="size-4 shrink-0 opacity-60" />
            {selectedMonth ? format(selectedMonth, "MMM yyyy") : placeholder}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0">
          <MonthPicker
            maxDate={maxDate}
            minDate={minDate}
            onMonthSelect={(date) => {
              onChange(formatMonthValue(date));
              setOpen(false);
            }}
            selectedMonth={selectedMonth}
          />
        </PopoverContent>
      </Popover>
      {clearable && value ? (
        <Button
          aria-label="Clear month"
          onClick={() => onChange("")}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <X className="text-muted-foreground" />
        </Button>
      ) : null}
    </div>
  );
}
