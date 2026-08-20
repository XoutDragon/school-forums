import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Chat timestamps: relative while it still reads as "just now", absolute after.
 *  Accepts a number as well as a string: Convex stores times as epoch milliseconds,
 *  where the REST API returned ISO strings. */
export type Timestamp = string | number;

export function relativeTime(iso: Timestamp): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const minutes = Math.floor(diff / 60_000);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
}

export function timeOfDay(iso: Timestamp): string {
  return new Date(iso).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' });
}

export function dayStamp(iso: Timestamp): string {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 864e5);
  if (sameDay(date, today)) return 'Today';
  if (sameDay(date, yesterday)) return 'Yesterday';
  return date.toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' });
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function formatPrice(cents: number): string {
  return cents === 0 ? 'Free' : `$${(cents / 100).toFixed(2)}`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? '')
    .join('')
    .toUpperCase();
}

/** Deterministic hue per identity, so a given person keeps the same avatar colour
 *  everywhere without storing one. */
export function hueFor(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return hash % 360;
}

export const YEAR_LABELS: Record<string, string> = {
  FRESHMAN: 'First year',
  SOPHOMORE: 'Second year',
  JUNIOR: 'Third year',
  SENIOR: 'Fourth year',
  GRAD: 'Graduate',
  ALUM: 'Alum',
};
