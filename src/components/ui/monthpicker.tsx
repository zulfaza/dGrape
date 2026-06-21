import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { buttonVariants } from "#/components/ui/button.tsx";
import { cn } from "#/lib/utils.ts";

type Month = {
  number: number;
  name: string;
};

const MONTHS: Month[][] = [
  [
    { number: 0, name: "Jan" },
    { number: 1, name: "Feb" },
    { number: 2, name: "Mar" },
    { number: 3, name: "Apr" },
  ],
  [
    { number: 4, name: "May" },
    { number: 5, name: "Jun" },
    { number: 6, name: "Jul" },
    { number: 7, name: "Aug" },
  ],
  [
    { number: 8, name: "Sep" },
    { number: 9, name: "Oct" },
    { number: 10, name: "Nov" },
    { number: 11, name: "Dec" },
  ],
];

type MonthCalProps = {
  selectedMonth?: Date;
  onMonthSelect?: (date: Date) => void;
  onYearForward?: () => void;
  onYearBackward?: () => void;
  callbacks?: {
    yearLabel?: (year: number) => string;
    monthLabel?: (month: Month) => string;
  };
  variant?: {
    calendar?: {
      main?: ButtonVariant;
      selected?: ButtonVariant;
    };
    chevrons?: ButtonVariant;
  };
  minDate?: Date;
  maxDate?: Date;
  disabledDates?: Date[];
};

type ButtonVariant =
  | "default"
  | "outline"
  | "ghost"
  | "link"
  | "destructive"
  | "secondary"
  | null
  | undefined;

function MonthPicker({
  onMonthSelect,
  selectedMonth,
  minDate,
  maxDate,
  disabledDates,
  callbacks,
  onYearBackward,
  onYearForward,
  variant,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & MonthCalProps) {
  return (
    <div className={cn("w-[280px] min-w-[200px] p-3", className)} {...props}>
      <div className="flex flex-col space-y-4 sm:flex-row sm:space-y-0 sm:space-x-4">
        <div className="w-full space-y-4">
          <MonthCal
            onMonthSelect={onMonthSelect}
            callbacks={callbacks}
            selectedMonth={selectedMonth}
            onYearBackward={onYearBackward}
            onYearForward={onYearForward}
            variant={variant}
            minDate={minDate}
            maxDate={maxDate}
            disabledDates={disabledDates}
          />
        </div>
      </div>
    </div>
  );
}

function MonthCal({
  selectedMonth,
  onMonthSelect,
  callbacks,
  variant,
  minDate,
  maxDate,
  disabledDates,
  onYearBackward,
  onYearForward,
}: MonthCalProps) {
  const [year, setYear] = React.useState<number>(
    selectedMonth?.getFullYear() ?? new Date().getFullYear(),
  );
  const [month, setMonth] = React.useState<number>(
    selectedMonth?.getMonth() ?? new Date().getMonth(),
  );
  const [menuYear, setMenuYear] = React.useState<number>(year);

  const effectiveMinDate = minDate && maxDate && minDate > maxDate ? maxDate : minDate;

  const disabledDatesMapped = disabledDates?.map((date) => ({
    year: date.getFullYear(),
    month: date.getMonth(),
  }));

  return (
    <>
      <div className="relative flex items-center justify-center pt-1">
        <div className="text-sm font-medium">
          {callbacks?.yearLabel ? callbacks.yearLabel(menuYear) : menuYear}
        </div>
        <div className="absolute left-1 flex items-center space-x-1">
          <button
            type="button"
            onClick={() => {
              setMenuYear(menuYear - 1);
              onYearBackward?.();
            }}
            className={cn(
              buttonVariants({ variant: variant?.chevrons ?? "outline" }),
              "inline-flex h-7 w-7 items-center justify-center p-0",
            )}
          >
            <ChevronLeft className="h-4 w-4 opacity-50" />
          </button>
        </div>
        <div className="absolute right-1 flex items-center space-x-1">
          <button
            type="button"
            onClick={() => {
              setMenuYear(menuYear + 1);
              onYearForward?.();
            }}
            className={cn(
              buttonVariants({ variant: variant?.chevrons ?? "outline" }),
              "inline-flex h-7 w-7 items-center justify-center p-0",
            )}
          >
            <ChevronRight className="h-4 w-4 opacity-50" />
          </button>
        </div>
      </div>
      <table className="w-full border-collapse space-y-1">
        <tbody>
          {MONTHS.map((monthRow) => (
            <tr
              className="mt-2 flex w-full"
              key={monthRow[0]?.name ?? monthRow.map((m) => m.name).join("-")}
            >
              {monthRow.map((monthOption) => (
                <td
                  className="relative h-10 w-1/4 p-0 text-center text-sm focus-within:relative focus-within:z-20 [&:has([aria-selected].day-outside)]:bg-accent/50 [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md"
                  key={monthOption.number}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setMonth(monthOption.number);
                      setYear(menuYear);
                      onMonthSelect?.(new Date(menuYear, monthOption.number));
                    }}
                    disabled={
                      (maxDate
                        ? menuYear > maxDate.getFullYear() ||
                          (menuYear === maxDate.getFullYear() &&
                            monthOption.number > maxDate.getMonth())
                        : false) ||
                      (effectiveMinDate
                        ? menuYear < effectiveMinDate.getFullYear() ||
                          (menuYear === effectiveMinDate.getFullYear() &&
                            monthOption.number < effectiveMinDate.getMonth())
                        : false) ||
                      (disabledDatesMapped
                        ? disabledDatesMapped.some(
                            (disabledDate) =>
                              disabledDate.year === menuYear &&
                              disabledDate.month === monthOption.number,
                          )
                        : false)
                    }
                    className={cn(
                      buttonVariants({
                        variant:
                          month === monthOption.number && menuYear === year
                            ? (variant?.calendar?.selected ?? "default")
                            : (variant?.calendar?.main ?? "ghost"),
                      }),
                      "h-full w-full p-0 font-normal aria-selected:opacity-100",
                    )}
                  >
                    {callbacks?.monthLabel ? callbacks.monthLabel(monthOption) : monthOption.name}
                  </button>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

MonthPicker.displayName = "MonthPicker";

export { MonthPicker };
