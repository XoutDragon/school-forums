"use client";

import Link from "next/link";
import { Doc } from "@/convex/_generated/dataModel";

export default function TopicCard({ topic }: { topic: Doc<"topics"> }) {
  const initials = topic.name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

  return (
    <Link
      href={`/topics/${topic._id}`}
      className="block bg-card border border-border rounded-xl p-4 hover:border-primary/60 transition"
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/20 text-primary flex items-center justify-center text-sm font-semibold shrink-0">
          {initials}
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-foreground truncate">{topic.name}</h3>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{topic.description}</p>
          <p className="text-[11px] text-muted-foreground mt-2">{topic.memberCount} members</p>
        </div>
      </div>
    </Link>
  );
}
