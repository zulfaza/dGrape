import { v, type Infer } from "convex/values"

export const recipeTimingValidator = v.union(
  v.object({ kind: v.literal("once"), at: v.number() }),
  v.object({ kind: v.literal("cron"), expression: v.string() })
)
export type RecipeTiming = Infer<typeof recipeTimingValidator>
const MINUTE = 60_000
const SEARCH_MINUTES = 366 * 24 * 60 * 8

/** Five numeric UTC fields: lists, ranges and steps. No local-time extensions. */
function parseField(text: string, min: number, max: number): Set<number> {
  const values = new Set<number>()
  for (const part of text.split(",")) {
    if (!/^(\*|\d+(-\d+)?)(\/\d+)?$/.test(part))
      throw new Error("Invalid UTC cron field")
    const [range, stepText] = part.split("/")
    const step = stepText === undefined ? 1 : Number(stepText)
    if (step < 1 || step > max - min + 1)
      throw new Error("Invalid UTC cron step")
    const [startText, endText] = range.split("-")
    const start = range === "*" ? min : Number(startText)
    const end =
      range === "*"
        ? max
        : endText === undefined
          ? stepText
            ? max
            : start
          : Number(endText)
    if (start < min || end > max || start > end)
      throw new Error("Invalid UTC cron range")
    for (let n = start; n <= end; n += step) values.add(n)
  }
  return values
}
function cron(expression: string) {
  const parts = expression.trim().split(/\s+/)
  if (parts.length !== 5 || expression.length > 100)
    throw new Error("Use five UTC cron fields")
  const [minute, hour, day, month, weekday] = parts
  return {
    minute: parseField(minute, 0, 59),
    hour: parseField(hour, 0, 23),
    day: parseField(day, 1, 31),
    month: parseField(month, 1, 12),
    weekday: parseField(weekday, 0, 6),
    dayWildcard: day.startsWith("*"),
    weekdayWildcard: weekday.startsWith("*"),
  }
}
export function validateTiming(timing: RecipeTiming) {
  if (timing.kind === "cron") cron(timing.expression)
  else if (
    !Number.isSafeInteger(timing.at) ||
    timing.at < 0 ||
    timing.at > 8_640_000_000_000_000
  )
    throw new Error("Invalid one-off UTC timestamp")
}
/** Search in one direction without replaying every missed occurrence. */
function occurrence(
  expression: string,
  from: number,
  direction: 1 | -1
): number {
  const fields = cron(expression)
  let time = Math.floor(from / MINUTE) * MINUTE
  for (let i = 0; i < SEARCH_MINUTES; i++, time += direction * MINUTE) {
    const date = new Date(time)
    const day = fields.day.has(date.getUTCDate())
    const weekday = fields.weekday.has(date.getUTCDay())
    const calendarDay =
      fields.dayWildcard || fields.weekdayWildcard
        ? day && weekday
        : day || weekday
    if (
      fields.minute.has(date.getUTCMinutes()) &&
      fields.hour.has(date.getUTCHours()) &&
      fields.month.has(date.getUTCMonth() + 1) &&
      calendarDay
    )
      return time
  }
  throw new Error("Cron has no occurrence within eight years")
}
export function nextOccurrence(
  timing: RecipeTiming,
  after: number
): number | null {
  validateTiming(timing)
  if (timing.kind === "once") return timing.at > after ? timing.at : null
  return occurrence(
    timing.expression,
    Math.floor(after / MINUTE) * MINUTE + MINUTE,
    1
  )
}
export function latestDue(
  timing: RecipeTiming,
  dueAt: number,
  now: number
): number | null {
  validateTiming(timing)
  if (dueAt > now) return null
  if (timing.kind === "once") return timing.at <= now ? timing.at : null
  const latest = occurrence(timing.expression, now, -1)
  return latest >= dueAt ? latest : null
}
/** Safe Workflow instance ID, independent of delivery attempts. */
export function occurrenceId(scheduleId: string, at: number): string {
  if (
    !/^[a-zA-Z0-9_-]{1,64}$/.test(scheduleId) ||
    !Number.isSafeInteger(at) ||
    at < 0
  )
    throw new Error("Invalid occurrence identity")
  return `schedule-${scheduleId}-${at}`
}
