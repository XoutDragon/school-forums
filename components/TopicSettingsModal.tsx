"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Doc, Id } from "@/convex/_generated/dataModel";
import clsx from "clsx";
import { Crown, Hash, Shield, ShieldOff, Trash2, UserMinus, Volume2, X } from "lucide-react";
import { RoleIcon, ROLE_LABEL, TopicRole, UserAvatar } from "@/components/UserBadge";

type Tab = "overview" | "channels" | "members" | "danger";

// Discord's "Server Settings" equivalent. Owners get everything; moderators
// get the channels tab plus member removal, matching the server-side rules
// in convex/permissions.ts.
export default function TopicSettingsModal({
  topic,
  channels,
  userId,
  role,
  onClose,
  onDeleted,
}: {
  topic: Doc<"topics">;
  channels: Doc<"channels">[];
  userId: Id<"users">;
  role: TopicRole;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const isOwner = role === "owner";
  const [tab, setTab] = useState<Tab>(isOwner ? "overview" : "channels");

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const tabs: { key: Tab; label: string; ownerOnly?: boolean }[] = [
    { key: "overview", label: "Overview", ownerOnly: true },
    { key: "channels", label: "Channels" },
    { key: "members", label: "Members" },
    { key: "danger", label: "Delete topic", ownerOnly: true },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Topic settings"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl max-h-[85vh] flex flex-col rounded-xl bg-card border border-border shadow-2xl overflow-hidden"
      >
        <header className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="text-sm font-semibold text-foreground">{topic.name}</h2>
            <p className="text-[11px] text-muted-foreground">
              You're the {ROLE_LABEL[role].toLowerCase()} of this topic
            </p>
          </div>
          <button onClick={onClose} aria-label="Close settings" className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="flex min-h-0 flex-1">
          <nav className="w-40 shrink-0 border-r border-border p-2 space-y-0.5">
            {tabs
              .filter((t) => isOwner || !t.ownerOnly)
              .map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={clsx(
                    "w-full rounded-md px-2 py-1.5 text-left text-xs",
                    tab === t.key
                      ? "bg-secondary text-foreground"
                      : t.key === "danger"
                        ? "text-red-400/80 hover:bg-red-500/10"
                        : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                  )}
                >
                  {t.label}
                </button>
              ))}
          </nav>

          <div className="flex-1 overflow-y-auto p-5">
            {tab === "overview" && <OverviewTab topic={topic} userId={userId} />}
            {tab === "channels" && <ChannelsTab topic={topic} channels={channels} userId={userId} />}
            {tab === "members" && <MembersTab topic={topic} userId={userId} role={role} />}
            {tab === "danger" && <DangerTab topic={topic} userId={userId} onDeleted={onDeleted} />}
          </div>
        </div>
      </div>
    </div>
  );
}

function useAsyncAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>, successMessage?: string) {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      await action();
      if (successMessage) setDone(successMessage);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't go through.");
    } finally {
      setBusy(false);
    }
  }

  return { busy, error, done, run };
}

function OverviewTab({ topic, userId }: { topic: Doc<"topics">; userId: Id<"users"> }) {
  const interests = useQuery(api.interests.list, {});
  const updateSettings = useMutation(api.topics.updateSettings);
  const { busy, error, done, run } = useAsyncAction();

  const [name, setName] = useState(topic.name);
  const [description, setDescription] = useState(topic.description);
  const [interestId, setInterestId] = useState<string>(topic.interestId ?? "");

  return (
    <div className="space-y-4 max-w-lg">
      <Field label="Topic name">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-lg bg-secondary border border-border px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
        />
      </Field>

      <Field label="Description" hint="Shown on the forum feed and in Discover.">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="w-full rounded-lg bg-secondary border border-border px-3 py-2 text-sm text-foreground outline-none focus:border-primary resize-none"
        />
      </Field>

      <Field label="Related interest" hint="Drives who this topic gets recommended to.">
        <select
          value={interestId}
          onChange={(e) => setInterestId(e.target.value)}
          className="w-full rounded-lg bg-secondary border border-border px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
        >
          <option value="">None</option>
          {interests?.map((interest) => (
            <option key={interest._id} value={interest._id}>
              {interest.label}
            </option>
          ))}
        </select>
      </Field>

      {error && <p className="text-xs text-red-400">{error}</p>}
      {done && <p className="text-xs text-green-400">{done}</p>}

      <button
        disabled={busy || !name.trim()}
        onClick={() =>
          run(
            () =>
              updateSettings({
                topicId: topic._id,
                actorId: userId,
                name,
                description,
                interestId: interestId ? (interestId as Id<"interests">) : undefined,
              }),
            "Saved.",
          )
        }
        className="rounded-lg bg-primary text-white text-xs font-medium px-3 py-2 hover:opacity-90 disabled:opacity-50"
      >
        {busy ? "Saving..." : "Save changes"}
      </button>
    </div>
  );
}

function ChannelsTab({
  topic,
  channels,
  userId,
}: {
  topic: Doc<"topics">;
  channels: Doc<"channels">[];
  userId: Id<"users">;
}) {
  const createChannel = useMutation(api.channels.create);
  const renameChannel = useMutation(api.channels.rename);
  const removeChannel = useMutation(api.channels.remove);
  const { busy, error, run } = useAsyncAction();

  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<"text" | "voice">("text");

  return (
    <div className="space-y-4 max-w-lg">
      <div className="space-y-1.5">
        {channels.map((channel) => (
          <div key={channel._id} className="flex items-center gap-2">
            {channel.type === "text" ? (
              <Hash className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            ) : (
              <Volume2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            )}
            <input
              defaultValue={channel.name}
              onBlur={(e) => {
                if (e.target.value.trim() && e.target.value !== channel.name) {
                  run(() => renameChannel({ channelId: channel._id, userId, name: e.target.value }));
                }
              }}
              className="flex-1 min-w-0 rounded-lg bg-secondary border border-border px-2 py-1.5 text-xs text-foreground outline-none focus:border-primary"
            />
            <button
              aria-label={`Delete ${channel.name}`}
              onClick={() => {
                const ok = window.confirm(
                  `Delete "${channel.name}"? Its chat history is deleted too.`,
                );
                if (ok) run(() => removeChannel({ channelId: channel._id, userId }));
              }}
              className="text-muted-foreground hover:text-red-400"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        {channels.length === 0 && (
          <p className="text-xs text-muted-foreground">No channels yet.</p>
        )}
      </div>

      <div className="border-t border-border pt-4 space-y-2">
        <h3 className="text-xs font-medium text-foreground">Add a channel</h3>
        <div className="flex items-center gap-2">
          <select
            value={newType}
            onChange={(e) => setNewType(e.target.value as "text" | "voice")}
            className="rounded-lg bg-secondary border border-border px-2 py-1.5 text-xs text-foreground outline-none focus:border-primary"
          >
            <option value="text">Text</option>
            <option value="voice">Voice</option>
          </select>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="new-channel"
            className="flex-1 min-w-0 rounded-lg bg-secondary border border-border px-2 py-1.5 text-xs text-foreground outline-none focus:border-primary"
          />
          <button
            disabled={busy || !newName.trim()}
            onClick={() =>
              run(async () => {
                await createChannel({ topicId: topic._id, userId, name: newName, type: newType });
                setNewName("");
              })
            }
            className="rounded-lg bg-primary text-white text-xs font-medium px-3 py-1.5 hover:opacity-90 disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

function MembersTab({
  topic,
  userId,
  role,
}: {
  topic: Doc<"topics">;
  userId: Id<"users">;
  role: TopicRole;
}) {
  const members = useQuery(api.topics.listMembers, { topicId: topic._id });
  const setRole = useMutation(api.topics.setRole);
  const removeMember = useMutation(api.topics.removeMember);
  const transferOwnership = useMutation(api.topics.transferOwnership);
  const { error, run } = useAsyncAction();

  const isOwner = role === "owner";
  const [query, setQuery] = useState("");

  const filtered = members?.filter((m) =>
    `${m.name} ${m.email}`.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <div className="space-y-3">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search members"
        className="w-full max-w-xs rounded-lg bg-secondary border border-border px-3 py-2 text-xs text-foreground outline-none focus:border-primary"
      />
      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="divide-y divide-border">
        {filtered === undefined && <p className="text-xs text-muted-foreground">Loading members...</p>}
        {filtered?.length === 0 && <p className="text-xs text-muted-foreground">No matching members.</p>}
        {filtered?.map((member) => {
          const isSelf = member._id === userId;
          const actionable =
            !isSelf &&
            member.role !== "owner" &&
            (isOwner || (role === "moderator" && member.role === "member"));

          return (
            <div key={member._id} className="flex items-center gap-3 py-2.5">
              <UserAvatar name={member.name} color={member.avatarColor} />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1 text-xs text-foreground">
                  <span className="truncate">{member.name}</span>
                  <RoleIcon role={member.role} />
                  {isSelf && <span className="text-[10px] text-muted-foreground">(you)</span>}
                </p>
                <p className="text-[11px] text-muted-foreground truncate">{member.email}</p>
              </div>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground shrink-0">
                {ROLE_LABEL[member.role]}
              </span>

              <div className="flex items-center gap-1 shrink-0">
                {actionable && isOwner && member.role === "member" && (
                  <IconAction
                    label="Make moderator"
                    onClick={() =>
                      run(() => setRole({ topicId: topic._id, actorId: userId, userId: member._id, role: "moderator" }))
                    }
                  >
                    <Shield className="w-3.5 h-3.5" />
                  </IconAction>
                )}
                {actionable && isOwner && member.role === "moderator" && (
                  <IconAction
                    label="Remove moderator"
                    onClick={() =>
                      run(() => setRole({ topicId: topic._id, actorId: userId, userId: member._id, role: "member" }))
                    }
                  >
                    <ShieldOff className="w-3.5 h-3.5" />
                  </IconAction>
                )}
                {actionable && isOwner && (
                  <IconAction
                    label="Transfer ownership"
                    onClick={() => {
                      const ok = window.confirm(
                        `Make ${member.name} the owner? You'll be demoted to moderator and can't undo this yourself.`,
                      );
                      if (ok)
                        run(() =>
                          transferOwnership({ topicId: topic._id, actorId: userId, newOwnerId: member._id }),
                        );
                    }}
                  >
                    <Crown className="w-3.5 h-3.5" />
                  </IconAction>
                )}
                {actionable && (
                  <IconAction
                    label="Remove from topic"
                    danger
                    onClick={() => {
                      if (window.confirm(`Remove ${member.name} from this topic?`))
                        run(() => removeMember({ topicId: topic._id, actorId: userId, userId: member._id }));
                    }}
                  >
                    <UserMinus className="w-3.5 h-3.5" />
                  </IconAction>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DangerTab({
  topic,
  userId,
  onDeleted,
}: {
  topic: Doc<"topics">;
  userId: Id<"users">;
  onDeleted: () => void;
}) {
  const removeTopic = useMutation(api.topics.remove);
  const { busy, error, run } = useAsyncAction();
  const [confirmName, setConfirmName] = useState("");

  return (
    <div className="max-w-lg space-y-3">
      <h3 className="text-sm font-semibold text-foreground">Delete this topic</h3>
      <p className="text-xs text-muted-foreground">
        This removes every channel, thread, reply and membership in{" "}
        <span className="text-foreground">{topic.name}</span>. It can't be undone. Type the topic
        name to confirm.
      </p>
      <input
        value={confirmName}
        onChange={(e) => setConfirmName(e.target.value)}
        placeholder={topic.name}
        className="w-full rounded-lg bg-secondary border border-border px-3 py-2 text-sm text-foreground outline-none focus:border-destructive"
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
      <button
        disabled={busy || confirmName.trim() !== topic.name}
        onClick={() =>
          run(async () => {
            await removeTopic({ topicId: topic._id, actorId: userId });
            onDeleted();
          })
        }
        className="rounded-lg bg-destructive/20 border border-destructive/40 text-red-300 text-xs font-medium px-3 py-2 hover:bg-destructive/30 disabled:opacity-50"
      >
        {busy ? "Deleting..." : "Delete topic permanently"}
      </button>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-xs font-medium text-foreground">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  );
}

function IconAction({
  label,
  onClick,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      title={label}
      aria-label={label}
      onClick={onClick}
      className={clsx(
        "rounded-md border border-border p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary",
        danger && "hover:text-red-400 hover:border-red-400/40",
      )}
    >
      {children}
    </button>
  );
}
