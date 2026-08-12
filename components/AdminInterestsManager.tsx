"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

const CATEGORIES = [
  { value: "major", label: "Major" },
  { value: "class", label: "Class" },
  { value: "club", label: "Club" },
  { value: "hobby", label: "Hobby" },
  { value: "other", label: "Other" },
] as const;

type Category = (typeof CATEGORIES)[number]["value"];

export default function AdminInterestsManager({ token }: { token: string }) {
  const interests = useQuery(api.interests.list);
  const createInterest = useMutation(api.interests.adminCreate);
  const deleteInterest = useMutation(api.interests.adminDelete);

  const [label, setLabel] = useState("");
  const [category, setCategory] = useState<Category>("major");
  const [submitting, setSubmitting] = useState(false);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim()) return;
    setSubmitting(true);
    try {
      await createInterest({ adminToken: token, label, category });
      setLabel("");
    } finally {
      setSubmitting(false);
    }
  }

  const grouped = (interests ?? []).reduce<Record<string, typeof interests>>((acc, i) => {
    (acc[i.category] ??= []).push(i);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <form onSubmit={handleAdd} className="bg-card border border-border rounded-lg p-4 flex gap-2 items-end">
        <div className="flex-1">
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            New onboarding option
          </label>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Computer Science"
            className="w-full rounded-lg bg-secondary border border-border px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as Category)}
            className="rounded-lg bg-secondary border border-border px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-primary text-white text-sm font-medium px-4 py-2 hover:opacity-90 disabled:opacity-50"
        >
          Add
        </button>
      </form>

      {interests === undefined && <p className="text-sm text-muted-foreground">Loading...</p>}

      {CATEGORIES.map(({ value, label: catLabel }) => {
        const items = grouped[value];
        if (!items || items.length === 0) return null;
        return (
          <div key={value}>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              {catLabel}s
            </h3>
            <div className="flex flex-wrap gap-2">
              {items.map((item) => (
                <span
                  key={item._id}
                  className="flex items-center gap-2 bg-card border border-border rounded-full pl-3 pr-2 py-1 text-sm text-foreground"
                >
                  {item.label}
                  <button
                    onClick={() => deleteInterest({ adminToken: token, interestId: item._id })}
                    className="text-muted-foreground hover:text-red-400 text-xs leading-none"
                    title="Remove"
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          </div>
        );
      })}

      <p className="text-[11px] text-muted-foreground">
        These are the options students pick from during onboarding. Removing one doesn't affect
        students who already selected it, or topics already linked to it.
      </p>
    </div>
  );
}
