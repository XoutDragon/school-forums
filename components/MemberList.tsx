"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Crown, MoreVertical, Shield, ShieldOff, UserMinus } from "lucide-react";
import ActionMenu, { MenuItem, MenuSeparator } from "@/components/ActionMenu";
import { RoleIcon, TopicRole, UserAvatar } from "@/components/UserBadge";
import { timeAgo } from "@/lib/format";

export type Member = FunctionReturnType<typeof api.topics.listMembers>[number];

// Discord's right-hand member list: grouped by role, with a per-member menu
// that the owner (and, for plain members, moderators) can act from.
export default function MemberList({
  topicId,
  viewerId,
  viewerRole,
}: {
  topicId: Id<"topics">;
  viewerId: Id<"users">;
  viewerRole: TopicRole | null;
}) {
  const members = useQuery(api.topics.listMembers, { topicId });
  const [error, setError] = useState<string | null>(null);

  const groups: { label: string; role: TopicRole }[] = [
    { label: "Owner", role: "owner" },
    { label: "Moderators", role: "moderator" },
    { label: "Members", role: "member" },
  ];

  return (
    <aside className="w-56 shrink-0 bg-card border-l border-border hidden lg:flex flex-col">
      <div className="px-4 py-3.5 border-b border-border">
        <h2 className="text-xs font-semibold text-foreground uppercase tracking-wide">Members</h2>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          {members === undefined ? "Loading..." : `${members.length} joined`}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-3">
        {error && (
          <p className="mb-2 px-2 text-[11px] text-red-400" role="alert">
            {error}
          </p>
        )}
        {groups.map(({ label, role }) => {
          const inGroup = members?.filter((m) => m.role === role) ?? [];
          if (inGroup.length === 0) return null;
          return (
            <section key={role} className="mb-3">
              <h3 className="px-2 mb-1 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                {label} — {inGroup.length}
              </h3>
              {inGroup.map((member) => (
                <MemberRow
                  key={member._id}
                  member={member}
                  topicId={topicId}
                  viewerId={viewerId}
                  viewerRole={viewerRole}
                  onError={setError}
                />
              ))}
            </section>
          );
        })}
      </div>
    </aside>
  );
}

function MemberRow({
  member,
  topicId,
  viewerId,
  viewerRole,
  onError,
}: {
  member: Member;
  topicId: Id<"topics">;
  viewerId: Id<"users">;
  viewerRole: TopicRole | null;
  onError: (message: string | null) => void;
}) {
  const setRole = useMutation(api.topics.setRole);
  const removeMember = useMutation(api.topics.removeMember);
  const transferOwnership = useMutation(api.topics.transferOwnership);

  const isSelf = member._id === viewerId;
  const isOwnerViewer = viewerRole === "owner";
  // Owners can act on anyone but themselves; moderators only on plain members.
  const canActOnMember =
    !isSelf &&
    member.role !== "owner" &&
    (isOwnerViewer || (viewerRole === "moderator" && member.role === "member"));

  async function run(action: () => Promise<unknown>) {
    onError(null);
    try {
      await action();
    } catch (e) {
      onError(e instanceof Error ? e.message : "That action didn't go through.");
    }
  }

  return (
    <div className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-secondary/60">
      <UserAvatar name={member.name} color={member.avatarColor} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1 text-xs text-foreground truncate">
          <span className="truncate">{member.name}</span>
          <RoleIcon role={member.role} />
          {isSelf && <span className="text-[10px] text-muted-foreground">(you)</span>}
        </p>
        <p className="text-[10px] text-muted-foreground truncate">
          {member.isAlumni ? "Alumni" : "Student"} · joined {timeAgo(member.joinedAt)}
        </p>
      </div>

      {canActOnMember && (
        <ActionMenu
          className="opacity-0 group-hover:opacity-100 focus-within:opacity-100"
          label={`Manage ${member.name}`}
          trigger={<MoreVertical className="w-3.5 h-3.5" />}
        >
          {(close) => (
            <>
              {isOwnerViewer && member.role === "member" && (
                <MenuItem
                  icon={<Shield className="w-3.5 h-3.5" />}
                  onClick={() => {
                    close();
                    run(() => setRole({ topicId, actorId: viewerId, userId: member._id, role: "moderator" }));
                  }}
                >
                  Make moderator
                </MenuItem>
              )}
              {isOwnerViewer && member.role === "moderator" && (
                <MenuItem
                  icon={<ShieldOff className="w-3.5 h-3.5" />}
                  onClick={() => {
                    close();
                    run(() => setRole({ topicId, actorId: viewerId, userId: member._id, role: "member" }));
                  }}
                >
                  Remove moderator
                </MenuItem>
              )}
              {isOwnerViewer && (
                <MenuItem
                  icon={<Crown className="w-3.5 h-3.5" />}
                  onClick={() => {
                    close();
                    const ok = window.confirm(
                      `Make ${member.name} the owner of this topic? You'll be demoted to moderator and can't undo this yourself.`,
                    );
                    if (ok) {
                      run(() => transferOwnership({ topicId, actorId: viewerId, newOwnerId: member._id }));
                    }
                  }}
                >
                  Transfer ownership
                </MenuItem>
              )}
              <MenuSeparator />
              <MenuItem
                danger
                icon={<UserMinus className="w-3.5 h-3.5" />}
                onClick={() => {
                  close();
                  const ok = window.confirm(`Remove ${member.name} from this topic?`);
                  if (ok) {
                    run(() => removeMember({ topicId, actorId: viewerId, userId: member._id }));
                  }
                }}
              >
                Remove from topic
              </MenuItem>
            </>
          )}
        </ActionMenu>
      )}
    </div>
  );
}
