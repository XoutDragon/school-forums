"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useSession } from "@/lib/session";
import clsx from "clsx";

const CATEGORY_LABEL: Record<string, string> = {
  major: "Majors",
  class: "Classes",
  club: "Clubs",
  hobby: "Interests",
  other: "Other",
};

const CATEGORY_ORDER = ["major", "class", "club", "hobby", "other"];

export default function OnboardingPage() {
  const router = useRouter();
  const { userId } = useSession();
  const interests = useQuery(api.interests.list);
  const completeOnboarding = useMutation(api.users.completeOnboarding);

  const [selected, setSelected] = useState<Set<Id<"interests">>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  function toggle(id: Id<"interests">) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleContinue() {
    if (!userId) return;
    setSubmitting(true);
    try {
      await completeOnboarding({ userId, interestIds: Array.from(selected) });
      router.push("/discover");
    } finally {
      setSubmitting(false);
    }
  }

  const grouped = (interests ?? []).reduce<Record<string, typeof interests>>(
    (acc, i) => {
      (acc[i.category] ??= []).push(i);
      return acc;
    },
    {},
  );

  return (
    <main className="min-h-screen bg-bg px-4 py-12">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-semibold text-text mb-1">
          What are you into?
        </h1>
        <p className="text-sm text-muted mb-8">
          Pick a few classes, clubs, and interests. We'll use these to recommend
          topics — you can change this anytime.
        </p>

        {interests === undefined && (
          <p className="text-sm text-muted">Loading interests...</p>
        )}

        {Object.entries(grouped)
          .sort(
            ([a], [b]) => CATEGORY_ORDER.indexOf(a) - CATEGORY_ORDER.indexOf(b),
          )
          .map(([category, items]) => (
            <div key={category} className="mb-6">
              <h2 className="text-xs font-medium text-muted uppercase tracking-wide mb-2.5">
                {CATEGORY_LABEL[category] ?? category}
              </h2>
              <div className="flex flex-wrap gap-2">
                {items?.map((item) => {
                  const isSelected = selected.has(item._id);
                  return (
                    <button
                      key={item._id}
                      onClick={() => toggle(item._id)}
                      className={clsx(
                        "px-3.5 py-1.5 rounded-full text-sm border transition",
                        isSelected
                          ? "bg-accent border-accent text-white"
                          : "bg-panel border-border text-text hover:border-accent/60",
                      )}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

        <div className="mt-10 flex items-center justify-between">
          <p className="text-xs text-muted">{selected.size} selected</p>
          <button
            onClick={handleContinue}
            disabled={submitting || selected.size === 0}
            className="rounded-lg bg-accent text-white text-sm font-medium px-5 py-2.5 hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? "Saving..." : "Continue"}
          </button>
        </div>
      </div>
    </main>
  );
}
