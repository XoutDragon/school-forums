"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

export default function AdminTopicsManager({ token }: { token: string }) {
  const topics = useQuery(api.admin.listTopicsOverview, { token });
  const [expanded, setExpanded] = useState<Id<"topics"> | null>(null);

  return (
    <div className="space-y-2">
      {topics === undefined && <p className="text-sm text-muted">Loading topics...</p>}
      {topics?.length === 0 && <p className="text-sm text-muted">No topics created yet.</p>}

      {topics?.map((topic) => (
        <div key={topic._id} className="bg-panel border border-border rounded-lg overflow-hidden">
          <button
            onClick={() => setExpanded(expanded === topic._id ? null : topic._id)}
            className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-panel2/40"
          >
            <div>
              <p className="text-sm font-medium text-text">{topic.name}</p>
              <p className="text-xs text-muted mt-0.5">
                {topic.memberCount} members · {topic.channelCount} channels · created by{" "}
                {topic.creatorName}
              </p>
            </div>
            <span className="text-muted text-xs">{expanded === topic._id ? "Hide" : "Manage"}</span>
          </button>

          {expanded === topic._id && <TopicMembersPanel topicId={topic._id} token={token} />}
        </div>
      ))}
    </div>
  );
}

function TopicMembersPanel({ topicId, token }: { topicId: Id<"topics">; token: string }) {
  const members = useQuery(api.topics.listMembers, { topicId });
  const changeRole = useMutation(api.topics.adminChangeRole);
  const removeMember = useMutation(api.topics.adminRemoveMember);
  const deleteTopic = useMutation(api.topics.adminDeleteTopic);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  async function handleDeleteTopic() {
    await deleteTopic({ adminToken: token, topicId });
  }

  return (
    <div className="border-t border-border px-4 py-3 bg-panel2/30 space-y-2">
      {members === undefined && <p className="text-xs text-muted">Loading members...</p>}

      {members?.map(
        (m) =>
          m && (
            <div key={m._id} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold text-white shrink-0"
                  style={{ backgroundColor: m.avatarColor }}
                >
                  {m.name?.[0]?.toUpperCase()}
                </span>
                <span className="text-text truncate">{m.name}</span>
                <span className="text-[11px] text-muted">{m.email}</span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <select
                  value={m.role}
                  onChange={(e) =>
                    changeRole({
                      adminToken: token,
                      topicId,
                      userId: m._id,
                      role: e.target.value as "owner" | "moderator" | "member",
                    })
                  }
                  className="bg-panel2 border border-border rounded px-2 py-1 text-xs text-text outline-none focus:border-accent"
                >
                  <option value="owner">Owner</option>
                  <option value="moderator">Moderator</option>
                  <option value="member">Member</option>
                </select>
                <button
                  onClick={() => removeMember({ adminToken: token, topicId, userId: m._id })}
                  className="text-xs text-red-400 hover:text-red-300"
                >
                  Remove
                </button>
              </div>
            </div>
          )
      )}

      <div className="pt-2 border-t border-border mt-2">
        {!confirmingDelete ? (
          <button
            onClick={() => setConfirmingDelete(true)}
            className="text-xs text-red-400 hover:text-red-300"
          >
            Delete this topic entirely
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted">
              This deletes the topic, its channels, threads, and memberships. Sure?
            </span>
            <button onClick={handleDeleteTopic} className="text-xs text-red-400 font-medium">
              Yes, delete
            </button>
            <button onClick={() => setConfirmingDelete(false)} className="text-xs text-muted">
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
