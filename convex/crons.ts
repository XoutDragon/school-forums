import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Rejected and abandoned image uploads leave bytes in file storage that no
// message or post references. A mutation that throws can't clean up after
// itself (the rollback undoes the storage delete), so the sweep runs here.
crons.interval(
  "sweep orphaned uploads",
  { hours: 1 },
  internal.files.sweepOrphanedUploads,
  {}, // no overrides: use the default grace period
);

export default crons;
