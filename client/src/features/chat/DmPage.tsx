import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { cn, relativeTime, timeOfDay } from '@/lib/utils';
import { api } from '@/lib/convexApi';
import { useM, useQ } from '@/lib/convexHooks';
import { useMe } from '@/hooks/useMe';
import { Avatar, EmptyState, Input, Skeleton } from '@/components/ui';
import { Markdown } from '@/features/chat/Markdown';
import { FileUpload, FileUploadButton, type Attachment } from '@/features/chat/FileUpload';
import { IconSend } from '@/components/Icons';

interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

interface Conversation {
  id: string;
  isGroup: boolean;
  title: string;
  members: PublicUser[];
  lastMessage: { excerpt: string; createdAt: number } | null;
  unreadCount: number;
}

interface DirectMessage {
  id: string;
  content: string;
  author: PublicUser | null;
  createdAt: number;
  deletedAt: number | null;
  attachments?: Attachment[];
}

interface SearchResult {
  kind: 'person';
  id: string;
  title: string;
  subtitle: string;
  badge: string | null;
}

export function DmPage() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const me = useMe();
  const [draft, setDraft] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const conversations = useQ<Conversation[]>(api.dms.list);
  const messages = useQ<DirectMessage[]>(
    api.dms.messages,
    conversationId ? { conversationId } : 'skip',
  );
  const searchResults = useQ<Record<string, SearchResult[]>>(
    api.search.search,
    searchQuery.trim() ? { q: searchQuery, scope: 'people', limit: 10 } : 'skip',
  );

  const sendMessage = useM(api.dms.send);
  const markRead = useM(api.dms.markRead);
  const openDm = useM(api.dms.open);

  const active = conversations?.find((c) => c.id === conversationId);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  useEffect(() => {
    if (conversationId) void markRead({ conversationId });
  }, [conversationId, messages, markRead]);

  const send = async () => {
    const content = draft.trim();
    if (!content && !attachments.length) return;
    if (!conversationId) return;
    setDraft('');
    setAttachments([]);
    await sendMessage({
      conversationId,
      content,
      attachments: attachments.length ? attachments : undefined,
    });
  };

  const startDm = async (userId: string) => {
    const convId = await openDm({ userIds: [userId] });
    navigate(`/dms/${convId}`);
    setSearchQuery('');
    setIsSearching(false);
  };

  return (
    <div className="flex h-full">
      <aside
        className={cn(
          'w-full shrink-0 flex-col border-r border-edge bg-panel md:flex md:w-72',
          conversationId && !isSearching ? 'hidden md:flex' : 'flex',
        )}
      >
        <header className="border-b border-edge px-4 py-3.5">
          <h1 className="font-display text-[0.9375rem] font-semibold tracking-tight text-chalk">
            Messages
          </h1>
        </header>

        <div className="border-b border-edge px-3 py-2">
          <Input
            placeholder="Search people..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setIsSearching(!!e.target.value.trim());
            }}
            className="text-sm"
          />
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {isSearching ? (
            <>
              {searchResults === undefined ? (
                Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="mb-1.5 h-14" />)
              ) : !searchResults.people?.length ? (
                <p className="px-3 py-10 text-center text-sm text-dim">
                  No students found. Try a different name or username.
                </p>
              ) : (
                <div className="space-y-1">
                  {searchResults.people.map((person) => (
                    <button
                      key={person.id}
                      onClick={() => void startDm(person.id)}
                      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition hover:bg-raised/60"
                    >
                      <Avatar name={person.title} src={null} seed={person.id} size={34} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-chalk">
                          {person.title}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-xs text-dim">{person.subtitle}</span>
                          {person.badge && (
                            <span className="shrink-0 rounded-full bg-accent/20 px-1.5 font-mono text-[0.5625rem] font-semibold text-accent-lift">
                              {person.badge}
                            </span>
                          )}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              {conversations === undefined ? (
                Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="mb-1.5 h-14" />)
              ) : !conversations.length ? (
                <p className="px-3 py-10 text-center text-sm text-dim">
                  No conversations yet. Waving at someone or connecting with a study buddy starts
                  one.
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
            </>
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
                const mine = m.author?.id === me?.id;
                return (
                  <div key={m.id} className={cn('flex gap-2.5', mine && 'flex-row-reverse')}>
                    {!mine && m.author && (
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
                      {m.content && <Markdown content={m.content} />}
                      {m.attachments?.map((att) => (
                        <div key={`${att.url}`} className="mt-2">
                          {att.mimeType.startsWith('image/') ? (
                            <img src={att.url} alt={att.name} className="max-w-full rounded-lg" />
                          ) : (
                            <a
                              href={att.url}
                              download={att.name}
                              className="inline-block text-sm underline"
                            >
                              {att.name}
                            </a>
                          )}
                        </div>
                      ))}
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

            <div className="border-t border-edge bg-panel p-3 space-y-2">
              <div className="flex items-center gap-2 rounded-xl bg-raised px-3 py-2">
                <FileUploadButton
                  attachments={attachments}
                  onAttachmentsChange={setAttachments}
                  disabled={false}
                />
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
                  style={{ border: 'none', outline: 'none', boxShadow: 'none' }}
                  className="max-h-32 flex-1 resize-none bg-transparent py-1 text-[0.9375rem] text-chalk outline-none focus:outline-none focus-visible:outline-none ring-0 focus:ring-0 border-0 placeholder:text-faint"
                />
                <button
                  onClick={() => void send()}
                  disabled={!draft.trim() && !attachments.length}
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
