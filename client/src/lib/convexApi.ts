/**
 * Single re-export of the generated Convex API.
 *
 * `convex/_generated/` is produced by `npx convex dev` and is gitignored, so it does
 * not exist in a fresh clone until that command has been run once. Importing it
 * through here means one path to fix rather than thirty.
 */
export { api } from '../../../convex/_generated/api';
export type { Id, Doc } from '../../../convex/_generated/dataModel';
