import { cronJobs } from "convex/server"
import { internal } from "./_generated/api"

/**
 * Maintenance jobs only. Recipe schedules use the Cloudflare dispatcher
 * (architecture/decisions/0005-deterministic-recipes-and-durable-scheduling.md).
 */
const crons = cronJobs()

crons.cron("prune run history", "0 3 * * *", internal.runRetention.pruneAll, {
  after: null,
})

crons.interval(
  "sweep expired artifact uploads",
  { hours: 1 },
  internal.artifacts.sweepExpiredUploads
)

export default crons
