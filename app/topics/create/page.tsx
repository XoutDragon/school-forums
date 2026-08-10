"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useSession } from "@/lib/session";

export default function CreateTopicPage() {
  const router = useRouter();
  const { userId } = useSession();
  const interests = useQuery(api.interests.list);
  const createTopic = useMutation(api.topics.create);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [interestId, setInterestId] = useState<Id<"interests"> | "">("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) return;
    setSubmitting(true);
    try {
      const topicId = await createTopic({
        name,
        description,
        interestId: interestId || undefined,
        createdBy: userId,
      });
      router.push(`/topics/${topicId}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-bg px-4 py-12">
      <div className="max-w-lg mx-auto">
        <h1 className="text-xl font-semibold text-text mb-1">Create a topic</h1>
        <p className="text-sm text-muted mb-6">
          This creates a #general text channel and a voice channel automatically. You'll be the
          owner and can manage roles, permissions, and channels.
        </p>

        <form onSubmit={handleSubmit} className="bg-panel border border-border rounded-xl p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Topic name</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Robotics Club"
              className="w-full rounded-lg bg-panel2 border border-border px-3 py-2 text-sm text-text outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Description</label>
            <textarea
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What's this topic about?"
              rows={3}
              className="w-full rounded-lg bg-panel2 border border-border px-3 py-2 text-sm text-text outline-none focus:border-accent resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">
              Related interest (helps others find it)
            </label>
            <select
              value={interestId}
              onChange={(e) => setInterestId(e.target.value as Id<"interests"> | "")}
              className="w-full rounded-lg bg-panel2 border border-border px-3 py-2 text-sm text-text outline-none focus:border-accent"
            >
              <option value="">None</option>
              {interests?.map((i) => (
                <option key={i._id} value={i._id}>
                  {i.label}
                </option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-accent text-white text-sm font-medium py-2.5 hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? "Creating..." : "Create topic"}
          </button>
        </form>
      </div>
    </main>
  );
}
