// Small presentation helpers shared by the topic UI.

const UNITS: [limit: number, seconds: number, label: string][] = [
  [60, 1, "s"],
  [3600, 60, "m"],
  [86400, 3600, "h"],
  [2592000, 86400, "d"],
  [31536000, 2592000, "mo"],
  [Infinity, 31536000, "y"],
];

// "3h ago" / "just now" — reddit-style compact relative time.
export function timeAgo(timestamp: number, now = Date.now()) {
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (seconds < 5) return "just now";
  for (const [limit, per, label] of UNITS) {
    if (seconds < limit) return `${Math.floor(seconds / per)}${label} ago`;
  }
  return "a while ago";
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

// 1200 → "1.2k", so long member lists / vote counts stay one line.
export function compactNumber(n: number) {
  if (Math.abs(n) < 1000) return String(n);
  return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
}
