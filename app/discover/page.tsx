"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useSession } from "@/lib/session";
import TopicCard from "@/components/TopicCard";
import clsx from "clsx";

const TABS = [
  { key: "forYou", label: "For you" },
  { key: "new", label: "New" },
  { key: "popular", label: "Popular" },
] as const;

type Tab = (typeof TABS)[number]["key"];

export default function DiscoverPage() {
  const { userId } = useSession();
  const [tab, setTab] = useState<Tab>("forYou");

  const forYou = useQuery(api.topics.listForYou, userId ? { userId } : "skip");
  const fresh = useQuery(api.topics.listNew);
  const popular = useQuery(api.topics.listPopular);

  const topics = tab === "forYou" ? forYou : tab === "new" ? fresh : popular;

  return (
    <main className="min-h-screen bg-bg">
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-text">Discover topics</h1>
        <Link
          href="/topics/create"
          className="rounded-lg bg-accent text-white text-sm font-medium px-4 py-2 hover:opacity-90"
        >
          + Create topic
        </Link>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-6">
        <div className="flex gap-1 mb-6 bg-panel border border-border rounded-lg p-1 w-fit">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={clsx(
                "px-3.5 py-1.5 rounded-md text-sm font-medium transition",
                tab === t.key ? "bg-accent text-white" : "text-muted hover:text-text"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {topics === undefined && <p className="text-sm text-muted">Loading...</p>}

        {topics?.length === 0 && (
          <div className="text-sm text-muted border border-dashed border-border rounded-xl p-8 text-center">
            {tab === "forYou"
              ? "No topics match your interests yet — try Popular, or create one yourself."
              : "No topics yet. Be the first to create one."}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {topics?.map((topic) => topic && <TopicCard key={topic._id} topic={topic} />)}
        </div>
      </div>
    </main>
  );
}
