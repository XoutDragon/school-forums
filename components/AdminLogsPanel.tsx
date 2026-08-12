"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

const TYPE_COLOR: Record<string, string> = {
  topic_created: "text-green-400",
  topic_deleted: "text-red-400",
  channel_created: "text-green-400",
  channel_deleted: "text-red-400",
  member_joined: "text-muted-foreground",
  member_left: "text-muted-foreground",
  member_removed: "text-red-400",
  role_changed: "text-yellow-400",
  interest_created: "text-green-400",
  interest_deleted: "text-red-400",
};

export default function AdminLogsPanel({ token }: { token: string }) {
  const logs = useQuery(api.admin.listLogs, { token });

  return (
    <div className="bg-card border border-border rounded-lg divide-y divide-border">
      {logs === undefined && <p className="text-sm text-muted-foreground px-4 py-3">Loading logs...</p>}
      {logs?.length === 0 && <p className="text-sm text-muted-foreground px-4 py-3">No activity yet.</p>}
      {logs?.map((log) => (
        <div key={log._id} className="px-4 py-2.5 flex items-start justify-between gap-4">
          <p className="text-sm text-foreground">
            <span className={`text-[10px] font-medium uppercase mr-2 ${TYPE_COLOR[log.type] ?? "text-muted-foreground"}`}>
              {log.type.replace(/_/g, " ")}
            </span>
            {log.message}
          </p>
          <span className="text-[11px] text-muted-foreground shrink-0">
            {new Date(log.createdAt).toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}
