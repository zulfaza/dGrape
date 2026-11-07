/**
 * A short message from an error for the person who caused it. Convex wraps
 * server errors as "[CONVEX M(...)] [Request ID: …] Server Error\nUncaught
 * Error: <message>\n    at …"; this keeps only <message>.
 */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- A catch clause gives unknown; this is where it is read.
export function errorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback
  const server = /Uncaught Error: ([^\n]+)/.exec(error.message)
  if (server?.[1]) return server[1]
  return error.message.startsWith("[CONVEX") ? fallback : error.message
}
