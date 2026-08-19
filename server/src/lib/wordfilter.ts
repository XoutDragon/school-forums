import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

interface FilterConfig {
  /** Hard-blocked server-side. Posting is refused. */
  blocked: string[];
  /** Soft-flagged. The client offers a "rephrase?" prompt; the post still goes through. */
  flagged: string[];
}

let config: FilterConfig = { blocked: [], flagged: [] };
try {
  config = JSON.parse(readFileSync(join(here, 'wordfilter.json'), 'utf8')) as FilterConfig;
} catch {
  // A missing config means no filtering, not a crash — the app still has to boot.
}

const toPattern = (words: string[]) =>
  words.length ? new RegExp(`\\b(${words.map(escapeRe).join('|')})\\b`, 'i') : null;

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const blockedPattern = toPattern(config.blocked);
const flaggedPattern = toPattern(config.flagged);

export function isHardBlocked(content: string): boolean {
  return blockedPattern?.test(content) ?? false;
}

export function isSoftFlagged(content: string): boolean {
  return flaggedPattern?.test(content) ?? false;
}

/** Exposed so the client can run the same soft check before a send (§5.10). */
export const softFilterWords = config.flagged;
