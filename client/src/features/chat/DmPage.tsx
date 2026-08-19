import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { PublicUser } from '@campusconnect/shared';
import { SOCKET_EVENTS } from '@campusconnect/shared';
import { api } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { cn, relativeTime, timeOfDay } from '@/lib/utils';
import { useAuth } from '@/stores/auth';
import { Avatar, EmptyState, Skeleton } from '@/components/ui';
import { Markdown } from '@/features/chat/Markdown';
import { IconSend } from '@/components/Icons';

interface Conversation {
  id: string;
  isGroup: boolean;
  title: string;
  members: PublicUser[];
  lastMessage: { excerpt: string; createdAt: string } | null;
  unreadCount: number;
}

interface DirectMessage {
  id: string;
  content: string;
  author: PublicUser;
  createdAt: string;
  deletedAt: string | null;
}

export function DmPage() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const me = useAuth((s) => s.user);
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: conversations, isLoading } = useQuery({
    queryKey: ['dms'],
    queryFn: () => api.get<Conversation[]>('/dms'),
  });

  const { data: messages } = useQuery({
    queryKey: ['dm-messages', conversationId],
    queryFn: () => api.get<DirectMessage[]>(`/dms/${conversationId}/messages`),
    enabled: Boolean(conversationId),
  });

  const active = conversations?.find((c) => c.id === conversationId);

  useEffect(() => {
    const socket = getSocket();
    const onNew = (payload: { conversationId?: string; isDirect?: boolean }) => {
      if (!payload.isDirect) return;
      void queryClient.invalidateQueries({ queryKey: ['dms'] });
      if (payload.conversationId === conversationId) {
        void queryClient.invalidateQueries({ queryKey: ['dm-messages', conversationId] });
      }
    };
    socket.on(SOCKET_EVENTS.messageNew, onNew);
    return () => {
      socket.off(SOCKET_EVENTS.messageNew, onNew);
    };
  }, [conversationId, queryClient]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const send = async () => {
    const content = draft.trim();
    if (!content || !conversationId) return;
    setDraft('');
    await api.post(`/dms/${conversationId}/messages`, { content });
    void queryClient.invalidateQueries({ queryKey: ['dm-messages', conversationId] });
    void queryClient.invalidateQueries({ queryKey: ['dms'] });
  };

  return (
    <div className="flex h-full">
      <aside
        className={cn(
          'w-full shrink-0 flex-col border-r border-edge bg-panel md:flex md:w-72',
          conversationId ? 'hidden md:flex' : 'flex',
        )}
      >
        <header className="border-b border-edge px-4 py-3.5">
          <h1 className="font-display text-[0.9375rem] font-semibold tracking-tight text-chalk">
            Messages
          </h1>
        </header>

        <div className="flex-1 overflow-y-auto p-2">
          {isLoading ? (
            Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="mb-1.5 h-14" />)
          ) : !conversations?.length ? (
            <p className="px-3 py-10 text-center text-sm text-dim">
              No conversations yet. Waving at someone or connecting with a study buddy starts one.
            </p>
          ) : (
            conversations.map((c) => (
              <button
                key={c.id}
                onClick={() => navigate(`/dms/${c.id}`)}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition',
                  c.id === conversationId ? 'bg-raised' : 'hover:bg-raised/60',
                )}
              >
                <Avatar
                  name={c.members[0]?.displayName ?? c.title}
                  src={c.members[0]?.avatarUrl}
                  seed={c.members[0]?.id ?? c.id}
                  size={34}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-medium text-chalk">{c.title}</span>
                    {c.lastMessage && (
                      <span className="shrink-0 font-mono text-[0.5625rem] text-faint">
                        {relativeTime(c.lastMessage.createdAt)}
                      </span>
                    )}
                  </span>
                  <span className="block truncate text-xs text-dim">
                    {c.lastMessage?.excerpt ?? 'No messages yet'}
                  </span>
                </span>
                {c.unreadCount > 0 && (
                  <span className="shrink-0 rounded-full bg-accent px-1.5 font-mono text-[0.5625rem] font-bold text-white">
                    {c.unreadCount}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      </aside>

      <section
        className={cn('min-w-0 flex-1 flex-col', conversationId ? 'flex' : 'hidden md:flex')}
      >
        {!conversationId ? (
          <div className="grid flex-1 place-items-center p-6">
            <EmptyState
              title="Pick a conversation"
              body="Or start one from someone's profile. Waving first is lower pressure than a cold message — and if they wave back, we'll nudge you both."
            />
          </div>
        ) : (
          <>
            <header className="flex items-center gap-2.5 border-b border-edge bg-panel/60 px-4 py-3 backdrop-blur">
              <button
                onClick={() => navigate('/dms')}
                className="text-dim hover:text-chalk md:hidden"
                aria-label="Back to conversations"
              >
                ←
              </button>
              <h2 className="truncate text-sm font-semibold text-chalk">
                {active?.title ?? 'Conversation'}
              </h2>
            </header>

            <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto p-4">
              {messages?.map((m) => {
                const mine = m.author.id === me?.id;
                return (
                  <div key={m.id} className={cn('flex gap-2.5', mine && 'flex-row-reverse')}>
                    {!mine && (
                      <Avatar
                        name={m.author.displayName}
                        src={m.author.avatarUrl}
                        seed={m.author.id}
                        size={28}
                      />
                    )}
                    <div
                      className={cn(
                        'max-w-[75%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed',
                        mine
                          ? 'rounded-br-sm bg-accent text-white'
                          : 'rounded-bl-sm border border-edge bg-panel text-chalk',
                      )}
                    >
                      <Markdown content={m.content} />
                      <span
                        className={cn(
                          'mt-1 block font-mono text-[0.5625rem]',
                          mine ? 'text-white/60' : 'text-faint',
                        )}
                      >
                        {timeOfDay(m.createdAt)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="border-t border-edge bg-panel p-3">
              <div className="flex items-end gap-2 rounded-xl border border-edge bg-raised px-3 py-2 focus-within:border-accent/50">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                  rows={1}
                  placeholder="Write a message"
                  className="max-h-32 flex-1 resize-none bg-transparent py-1 text-[0.9375rem] text-chalk outline-none placeholder:text-faint"
                />
                <button
                  onClick={() => void send()}
                  disabled={!draft.trim()}
                  aria-label="Send message"
                  className="pb-0.5 text-accent transition hover:text-accent-lift disabled:text-faint"
                >
                  <IconSend />
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
