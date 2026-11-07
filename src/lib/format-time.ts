const dateTime = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
})

/** A time in the reader's zone and locale, such as "Nov 4, 2026, 3:03 PM". */
export function formatDateTime(at: number): string {
  return dateTime.format(at)
}
