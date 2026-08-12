"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Doc, Id } from "@/convex/_generated/dataModel";
import clsx from "clsx";
import {
  ChevronDown,
  Hash,
  LogOut,
  MessageSquareText,
  Pencil,
  Plus,
  Settings,
  Trash2,
  UserPlus,
  Users,
  Volume2,
} from "lucide-react";
import ActionMenu, { MenuItem, MenuSeparator } from "@/components/ActionMenu";
import { TopicRole } from "@/components/UserBadge";
import { compactNumber } from "@/lib/format";

export type Selection =
  | { kind: "forum" }
  | { kind: "channel"; channelId: Id<"channels"> };

export default function ChannelSidebar({
  topic,
  channels,
  selection,
  onSelect,
  userId,
  role,
  onOpenSettings,
  onLeave,
}: {
  topic: Doc<"topics">;
  channels: Doc<"channels">[];
  selection: Selection;
  onSelect: (selection: Selection) => void;
  userId: Id<"users">;
  role: TopicRole | null;
  onOpenSettings: () => void;
  onLeave: () => void;
}) {
  const createChannel = useMutation(api.channels.create);
  const renameChannel = useMutation(api.channels.rename);
  const removeChannel = useMutation(api.channels.remove);

  const [showForm, setShowForm] = useState<"text" | "voice" | null>(null);
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState<Id<"channels"> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isOwner = role === "owner";
  const canManage = role === "owner" || role === "moderator";

  const textChannels = channels.filter((c) => c.type === "text");
  const voiceChannels = channels.filter((c) => c.type === "voice");

  async function handleCreate(type: "text" | "voice") {
    if (!name.trim()) return;
    try {
      const id = await createChannel({ topicId: topic._id, userId, name, type });
      setName("");
      setShowForm(null);
      onSelect({ kind: "channel", channelId: id });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create that channel.");
    }
  }

  async function handleRename(channelId: Id<"channels">, next: string) {
    setRenaming(null);
    if (!next.trim()) return;
    try {
      await renameChannel({ channelId, userId, name: next });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't rename that channel.");
    }
  }

  async function handleDelete(channel: Doc<"channels">) {
    const ok = window.confirm(
      `Delete "${channel.name}"? Every thread and reply in it is deleted too. This can't be undone.`,
    );
    if (!ok) return;
    try {
      await removeChannel({ channelId: channel._id, userId });
      if (selection.kind === "channel" && selection.channelId === channel._id) {
        onSelect({ kind: "forum" });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't delete that channel.");
    }
  }

  return (
    <aside className="w-60 shrink-0 bg-card border-r border-border flex flex-col">
      {/* Server header — doubles as the management menu, like Discord's. */}
      <div className="border-b border-border">
        <ActionMenu
          align="left"
          label="Topic menu"
          className="w-full"
          trigger={
            <span className="w-full flex items-center justify-between gap-2 px-4 py-3.5 hover:bg-secondary/60">
              <span className="min-w-0 text-left">
                <span className="block text-sm font-semibold text-foreground truncate">
                  {topic.name}
                </span>
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground mt-0.5">
                  <Users className="w-3 h-3" />
                  {compactNumber(topic.memberCount)} members
                </span>
              </span>
              <ChevronDown className="w-4 h-4 shrink-0" />
            </span>
          }
        >
          {(close) => (
            <>
              <MenuItem
                icon={<UserPlus className="w-3.5 h-3.5" />}
                onClick={() => {
                  navigator.clipboard?.writeText(window.location.href);
                  close();
                }}
              >
                Copy invite link
              </MenuItem>
              {canManage && (
                <MenuItem
                  icon={<Settings className="w-3.5 h-3.5" />}
                  onClick={() => {
                    onOpenSettings();
                    close();
                  }}
                >
                  {isOwner ? "Topic settings" : "Manage channels"}
                </MenuItem>
              )}
              {!isOwner && role && (
                <>
                  <MenuSeparator />
                  <MenuItem
                    danger
                    icon={<LogOut className="w-3.5 h-3.5" />}
                    onClick={() => {
                      close();
                      onLeave();
                    }}
                  >
                    Leave topic
                  </MenuItem>
                </>
              )}
            </>
          )}
        </ActionMenu>
      </div>

      <div className="flex-1 overflow-y-auto py-3 px-2">
        {/* Reddit-style forum feed, pinned above the channel groups. */}
        <button
          onClick={() => onSelect({ kind: "forum" })}
          className={clsx(
            "w-full flex items-center gap-2 px-2 py-2 rounded-md text-sm text-left mb-1",
            selection.kind === "forum"
              ? "bg-primary/15 text-foreground"
              : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
          )}
        >
          <MessageSquareText className="w-4 h-4 shrink-0 opacity-80" />
          <span className="truncate font-medium">Forum</span>
          <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground">
            All posts
          </span>
        </button>
        <p className="px-2 pb-2 text-[10px] leading-snug text-muted-foreground/80">
          Every thread in this topic, ranked like a subreddit.
        </p>

        <SectionLabel
          label="Text channels"
          onAdd={canManage ? () => setShowForm(showForm === "text" ? null : "text") : undefined}
        />
        {textChannels.map((c) => (
          <ChannelRow
            key={c._id}
            channel={c}
            active={selection.kind === "channel" && selection.channelId === c._id}
            onSelect={() => onSelect({ kind: "channel", channelId: c._id })}
            canManage={canManage}
            renaming={renaming === c._id}
            onStartRename={() => setRenaming(c._id)}
            onRename={(next) => handleRename(c._id, next)}
            onDelete={() => handleDelete(c)}
          />
        ))}
        {showForm === "text" && (
          <NewChannelInput name={name} setName={setName} onSubmit={() => handleCreate("text")} prefix="#" />
        )}

        <SectionLabel
          label="Voice channels"
          onAdd={canManage ? () => setShowForm(showForm === "voice" ? null : "voice") : undefined}
        />
        {voiceChannels.map((c) => (
          <ChannelRow
            key={c._id}
            channel={c}
            active={selection.kind === "channel" && selection.channelId === c._id}
            onSelect={() => onSelect({ kind: "channel", channelId: c._id })}
            canManage={canManage}
            renaming={renaming === c._id}
            onStartRename={() => setRenaming(c._id)}
            onRename={(next) => handleRename(c._id, next)}
            onDelete={() => handleDelete(c)}
          />
        ))}
        {showForm === "voice" && (
          <NewChannelInput name={name} setName={setName} onSubmit={() => handleCreate("voice")} prefix="🔊" />
        )}

        {error && (
          <p className="mt-3 px-2 text-[11px] text-red-400" role="alert">
            {error}
          </p>
        )}
      </div>
    </aside>
  );
}

function SectionLabel({ label, onAdd }: { label: string; onAdd?: () => void }) {
  return (
    <div className="flex items-center justify-between px-2 mt-3 mb-1">
      <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
      {onAdd && (
        <button
          onClick={onAdd}
          aria-label={`Add ${label.toLowerCase()}`}
          className="text-muted-foreground hover:text-foreground"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

function ChannelRow({
  channel,
  active,
  onSelect,
  canManage,
  renaming,
  onStartRename,
  onRename,
  onDelete,
}: {
  channel: Doc<"channels">;
  active: boolean;
  onSelect: () => void;
  canManage: boolean;
  renaming: boolean;
  onStartRename: () => void;
  onRename: (next: string) => void;
  onDelete: () => void;
}) {
  const Icon = channel.type === "text" ? Hash : Volume2;

  if (renaming) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1">
        <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <input
          autoFocus
          defaultValue={channel.name}
          onBlur={(e) => onRename(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onRename((e.target as HTMLInputElement).value);
            if (e.key === "Escape") onRename(channel.name);
          }}
          className="flex-1 min-w-0 bg-secondary border border-border rounded px-2 py-1 text-xs text-foreground outline-none focus:border-primary"
        />
      </div>
    );
  }

  return (
    <div
      className={clsx(
        "group flex items-center gap-1 rounded-md pr-1",
        active ? "bg-secondary" : "hover:bg-secondary/60",
      )}
    >
      <button
        onClick={onSelect}
        className={clsx(
          "flex-1 min-w-0 flex items-center gap-2 px-2 py-1.5 text-sm text-left",
          active ? "text-foreground" : "text-muted-foreground group-hover:text-foreground",
        )}
      >
        <Icon className="w-3.5 h-3.5 shrink-0 opacity-70" />
        <span className="truncate">{channel.name}</span>
      </button>
      {canManage && (
        <div className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 flex items-center gap-1">
          <button
            onClick={onStartRename}
            aria-label={`Rename ${channel.name}`}
            className="text-muted-foreground hover:text-foreground"
          >
            <Pencil className="w-3 h-3" />
          </button>
          <button
            onClick={onDelete}
            aria-label={`Delete ${channel.name}`}
            className="text-muted-foreground hover:text-red-400"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
}

function NewChannelInput({
  name,
  setName,
  onSubmit,
  prefix,
}: {
  name: string;
  setName: (v: string) => void;
  onSubmit: () => void;
  prefix: string;
}) {
  return (
    <div className="flex items-center gap-1.5 px-2 py-1">
      <span className="text-muted-foreground text-sm">{prefix}</span>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onSubmit()}
        placeholder="new-channel"
        className="flex-1 min-w-0 bg-secondary border border-border rounded px-2 py-1 text-xs text-foreground outline-none focus:border-primary"
      />
      <button onClick={onSubmit} className="text-xs text-primary">
        Add
      </button>
    </div>
  );
}
