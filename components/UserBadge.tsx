"use client";

import clsx from "clsx";
import { Crown, Shield } from "lucide-react";
import { initials } from "@/lib/format";

export type TopicRole = "owner" | "moderator" | "member";

// The user's stored avatarColor is a plain hex string, so the circle is
// rendered with an inline style rather than a Tailwind class.
export function UserAvatar({
  name,
  color,
  size = "md",
  className,
}: {
  name: string;
  color: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const dims = { sm: "w-6 h-6 text-[10px]", md: "w-8 h-8 text-xs", lg: "w-10 h-10 text-sm" }[size];
  return (
    <span
      style={{ backgroundColor: color }}
      className={clsx(
        "shrink-0 rounded-full flex items-center justify-center font-semibold text-white/95",
        dims,
        className,
      )}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

// Crown for the owner, shield for moderators — nothing for plain members,
// same visual language as Discord's member list.
export function RoleIcon({ role, className }: { role: TopicRole; className?: string }) {
  if (role === "owner")
    return <Crown className={clsx("w-3.5 h-3.5 text-yellow-400", className)} aria-label="Owner" />;
  if (role === "moderator")
    return <Shield className={clsx("w-3.5 h-3.5 text-primary", className)} aria-label="Moderator" />;
  return null;
}

export const ROLE_LABEL: Record<TopicRole, string> = {
  owner: "Owner",
  moderator: "Moderator",
  member: "Member",
};
