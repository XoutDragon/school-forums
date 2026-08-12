"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Doc, Id } from "@/convex/_generated/dataModel";
import clsx from "clsx";

export default function ChannelSidebar({
  topic,
  channels,
  selectedChannelId,
  onSelect,
  userId,
  canManage,
}: {
  topic: Doc<"topics">;
  channels: Doc<"channels">[];
  selectedChannelId: Id<"channels"> | null;
  onSelect: (id: Id<"channels">) => void;
  userId: Id<"users">;
  canManage: boolean;
}) {
  const createChannel = useMutation(api.channels.create);
  const [showForm, setShowForm] = useState<"text" | "voice" | null>(null);
  const [name, setName] = useState("");

  const textChannels = channels.filter((c) => c.type === "text");
  const voiceChannels = channels.filter((c) => c.type === "voice");

  async function handleCreate(type: "text" | "voice") {
    if (!name.trim()) return;
    const id = await createChannel({ topicId: topic._id, userId, name, type });
    setName("");
    setShowForm(null);
    onSelect(id);
  }

  return (
    <aside className="w-56 shrink-0 bg-card border-r border-border flex flex-col">
      <div className="px-4 py-4 border-b border-border">
        <h2 className="text-sm font-semibold text-foreground truncate">{topic.name}</h2>
        <p className="text-[11px] text-muted-foreground mt-0.5">{topic.memberCount} members</p>
      </div>

      <div className="flex-1 overflow-y-auto py-3 px-2">
        <SectionLabel
          label="Text channels"
          onAdd={canManage ? () => setShowForm(showForm === "text" ? null : "text") : undefined}
        />
        {textChannels.map((c) => (
          <ChannelRow key={c._id} channel={c} active={c._id === selectedChannelId} onSelect={onSelect} />
        ))}
        {showForm === "text" && (
          <NewChannelInput name={name} setName={setName} onSubmit={() => handleCreate("text")} prefix="#" />
        )}

        <SectionLabel
          label="Voice channels"
          onAdd={canManage ? () => setShowForm(showForm === "voice" ? null : "voice") : undefined}
        />
        {voiceChannels.map((c) => (
          <ChannelRow key={c._id} channel={c} active={c._id === selectedChannelId} onSelect={onSelect} />
        ))}
        {showForm === "voice" && (
          <NewChannelInput name={name} setName={setName} onSubmit={() => handleCreate("voice")} prefix="🔊" />
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
        <button onClick={onAdd} className="text-muted-foreground hover:text-foreground text-sm leading-none">
          +
        </button>
      )}
    </div>
  );
}

function ChannelRow({
  channel,
  active,
  onSelect,
}: {
  channel: Doc<"channels">;
  active: boolean;
  onSelect: (id: Id<"channels">) => void;
}) {
  return (
    <button
      onClick={() => onSelect(channel._id)}
      className={clsx(
        "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-left",
        active ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
      )}
    >
      <span className="opacity-70">{channel.type === "text" ? "#" : "🔊"}</span>
      <span className="truncate">{channel.name}</span>
    </button>
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
        className="flex-1 bg-secondary border border-border rounded px-2 py-1 text-xs text-foreground outline-none focus:border-primary"
      />
      <button onClick={onSubmit} className="text-xs text-primary">
        Add
      </button>
    </div>
  );
}
