import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { BuddyMatchDto, PublicUser } from '@campusconnect/shared';
import { AVAILABILITY_SLOTS, DAY_BLOCKS, WEEKDAYS } from '@campusconnect/shared';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Avatar, Badge, Button, Card, EmptyState, Eyebrow, Skeleton, Tabs } from '@/components/ui';
import { IconSparkle } from '@/components/Icons';

interface Group {
  id: string;
  name: string;
  description: string | null;
  maxSize: number;
  meetingType: string;
  locationHint: string | null;
  status: string;
  course: { id: string; code: string; title: string } | null;
  owner: PublicUser;
  members: PublicUser[];
  memberCount: number;
  myStatus: string | null;
  isOwner: boolean;
  pending: PublicUser[];
  pendingCount: number;
}

interface BuddyProfile {
  isActive: boolean;
  lookingFor: string[];
  availability: boolean[];
  note: string | null;
}

const TABS = [
  { id: 'groups', label: 'Study groups' },
  { id: 'buddies', label: 'Find people' },
  { id: 'availability', label: 'Your week' },
] as const;

export function StudyPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('groups');

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-display-lg text-chalk">Study together</h1>
        <p className="mt-1.5 max-w-2xl text-[0.9375rem] text-dim">
          Groups you can ask to join, and people whose free hours actually line up with yours.
        </p>
      </header>

      <Tabs tabs={[...TABS]} value={tab} onChange={setTab} />

      {tab === 'groups' && <Groups />}
      {tab === 'buddies' && <Buddies />}
      {tab === 'availability' && <AvailabilityEditor />}
    </div>
  );
}

function Groups() {
  const queryClient = useQueryClient();
  const { data: groups, isLoading } = useQuery({
    queryKey: ['study-groups'],
    queryFn: () => api.get<Group[]>('/study/groups'),
  });

  const request = async (groupId: string) => {
    await api.post(`/study/groups/${groupId}/request`);
    void queryClient.invalidateQueries({ queryKey: ['study-groups'] });
  };

  const approve = async (groupId: string, userId: string) => {
    await api.post(`/study/groups/${groupId}/approve/${userId}`);
    void queryClient.invalidateQueries({ queryKey: ['study-groups'] });
  };

  if (isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-44" />
        ))}
      </div>
    );
  }

  if (!groups?.length) {
    return (
      <EmptyState
        title="Be the founder"
        body="Groups that exist get joined. Start one for a course you're taking and people will ask in."
      />
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {groups.map((group) => (
        <Card key={group.id} className="flex flex-col">
          <div className="flex items-start gap-2">
            {group.course && (
              <Link to={`/courses/${encodeURIComponent(group.course.code)}`}>
                <Badge tone="courses">{group.course.code}</Badge>
              </Link>
            )}
            <Badge>{group.meetingType.replace('_', ' ').toLowerCase()}</Badge>
            {group.status === 'FULL' && <Badge tone="events">full</Badge>}
          </div>

          <h3 className="mt-2.5 font-display text-[0.9375rem] font-semibold tracking-tight text-chalk">
            {group.name}
          </h3>
          {group.description && (
            <p className="mt-1.5 flex-1 text-xs leading-relaxed text-dim line-clamp-3">
              {group.description}
            </p>
          )}
          {group.locationHint && (
            <p className="mt-2 font-mono text-[0.625rem] text-faint">{group.locationHint}</p>
          )}

          <div className="mt-3 flex items-center gap-2 border-t border-edge pt-3">
            <div className="flex -space-x-1.5">
              {group.members.slice(0, 5).map((member) => (
                <Avatar
                  key={member.id}
                  name={member.displayName}
                  src={member.avatarUrl}
                  seed={member.id}
                  size={24}
                  className="ring-2 ring-panel"
                />
              ))}
            </div>
            <span className="font-mono text-[0.625rem] text-faint">
              {group.memberCount}/{group.maxSize}
            </span>

            <div className="ml-auto">
              {group.myStatus === 'MEMBER' ? (
                <Badge tone="courses">you're in</Badge>
              ) : group.myStatus === 'REQUESTED' ? (
                <Badge>requested</Badge>
              ) : group.status === 'FULL' ? (
                <span className="text-xs text-faint">No room</span>
              ) : (
                <Button size="sm" onClick={() => void request(group.id)}>
                  Ask to join
                </Button>
              )}
            </div>
          </div>

          {/* §5.6: the owner approves. Requests surface in place rather than in a
              separate inbox nobody would check. */}
          {group.isOwner && group.pending.length > 0 && (
            <div className="mt-3 rounded-lg border border-accent/30 bg-accent/[0.06] p-2.5">
              <p className="mb-2 font-mono text-[0.625rem] uppercase tracking-wider text-accent-lift">
                {group.pending.length} waiting on you
              </p>
              <div className="space-y-1.5">
                {group.pending.map((person) => (
                  <div key={person.id} className="flex items-center gap-2">
                    <Avatar
                      name={person.displayName}
                      src={person.avatarUrl}
                      seed={person.id}
                      size={22}
                    />
                    <Link
                      to={`/u/${person.username}`}
                      className="min-w-0 flex-1 truncate text-xs text-chalk hover:underline"
                    >
                      {person.displayName}
                    </Link>
                    <Button size="sm" onClick={() => void approve(group.id, person.id)}>
                      Let them in
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

function Buddies() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);

  const {
    data: matches,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['buddy-matches'],
    queryFn: () => api.get<BuddyMatchDto[]>('/study/buddy/matches'),
  });

  const act = async (match: BuddyMatchDto, action: 'CONNECT' | 'DISMISS') => {
    setBusyId(match.id);
    const result = await api.post<{ conversationId?: string }>(`/study/buddy/matches/${match.id}`, {
      action,
    });
    setBusyId(null);
    void queryClient.invalidateQueries({ queryKey: ['buddy-matches'] });
    if (action === 'CONNECT' && result.conversationId) navigate(`/dms/${result.conversationId}`);
  };

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  if (!matches?.length) {
    return (
      <EmptyState
        icon={<IconSparkle className="h-6 w-6" />}
        title="No matches yet"
        body="Matching uses your courses, major, year, interests and free hours. Fill in your week and try again."
        action={
          <Button size="sm" onClick={() => void refetch()}>
            Find matches
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-3">
      {matches.map((match) => (
        <Card key={match.id} className="flex flex-wrap items-center gap-4">
          <Avatar
            name={match.user.displayName}
            src={match.user.avatarUrl}
            seed={match.user.id}
            size={48}
            online={match.user.isOnline}
          />
          <div className="min-w-0 flex-1">
            <Link
              to={`/u/${match.user.username}`}
              className="font-display text-[1.0625rem] font-semibold tracking-tight text-chalk hover:underline"
            >
              {match.user.displayName}
            </Link>
            {/* The explanation is the product here — §5.6 requires it, and a match you
                can't justify is just a stranger's photo. */}
            <p className="mt-1 text-sm leading-relaxed text-dim">{match.explanation}</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={busyId === match.id}
              onClick={() => void act(match, 'DISMISS')}
            >
              Not for me
            </Button>
            <Button
              size="sm"
              loading={busyId === match.id}
              onClick={() => void act(match, 'CONNECT')}
            >
              Say hello
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}

/** The 7×5 availability grid (§5.6). Also the visual motif the study feature is built on:
 *  a week you can actually see, rather than a set of dropdowns. */
function AvailabilityEditor() {
  const queryClient = useQueryClient();
  const [grid, setGrid] = useState<boolean[]>(() => Array<boolean>(AVAILABILITY_SLOTS).fill(false));
  const [lookingFor, setLookingFor] = useState<string[]>(['STUDY_PARTNER']);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const { data: profile } = useQuery({
    queryKey: ['buddy-profile'],
    queryFn: () => api.get<BuddyProfile | null>('/study/buddy/profile'),
  });

  useEffect(() => {
    if (profile) {
      setGrid(
        Array.from({ length: AVAILABILITY_SLOTS }, (_, i) => profile.availability[i] ?? false),
      );
      if (profile.lookingFor.length) setLookingFor(profile.lookingFor);
    }
  }, [profile]);

  const toggle = (day: number, block: number) => {
    const index = day * DAY_BLOCKS.length + block;
    setGrid((g) => g.map((v, i) => (i === index ? !v : v)));
    setSaved(false);
  };

  const save = async () => {
    setBusy(true);
    await api.put('/study/buddy/profile', {
      isActive: true,
      lookingFor,
      availability: grid,
    });
    setBusy(false);
    setSaved(true);
    void queryClient.invalidateQueries({ queryKey: ['buddy-matches'] });
  };

  const GOALS = [
    ['STUDY_PARTNER', 'A study partner'],
    ['FRIENDS', 'Friends'],
    ['CLUB_BUDDY', 'Someone to try clubs with'],
    ['GYM_PARTNER', 'A gym partner'],
    ['LANGUAGE_EXCHANGE', 'Language exchange'],
  ] as const;

  const selectedCount = grid.filter(Boolean).length;

  return (
    <div className="space-y-6">
      <section>
        <Eyebrow className="mb-1">When are you free?</Eyebrow>
        <p className="mb-3 text-sm text-dim">
          Tap the blocks you're usually available. Matching counts overlapping slots, so rough is
          fine — {selectedCount} selected.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] border-separate border-spacing-1">
            <thead>
              <tr>
                <th className="w-20" />
                {WEEKDAYS.map((day) => (
                  <th
                    key={day}
                    className="pb-1 font-mono text-[0.5625rem] uppercase tracking-wider text-faint"
                  >
                    {day}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DAY_BLOCKS.map((block, blockIndex) => (
                <tr key={block}>
                  <th className="pr-2 text-right font-mono text-[0.5625rem] uppercase tracking-wider text-faint">
                    {block}
                  </th>
                  {WEEKDAYS.map((day, dayIndex) => {
                    const on = grid[dayIndex * DAY_BLOCKS.length + blockIndex];
                    return (
                      <td key={day}>
                        <button
                          onClick={() => toggle(dayIndex, blockIndex)}
                          aria-label={`${day} ${block}${on ? ' (available)' : ''}`}
                          aria-pressed={on}
                          className={cn(
                            'h-9 w-full rounded-md border transition',
                            on
                              ? 'border-accent bg-accent/25'
                              : 'border-edge bg-raised hover:border-faint/60',
                          )}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <Eyebrow className="mb-2.5">What are you looking for?</Eyebrow>
        <div className="flex flex-wrap gap-1.5">
          {GOALS.map(([value, label]) => {
            const on = lookingFor.includes(value);
            return (
              <button
                key={value}
                onClick={() => {
                  setLookingFor((current) =>
                    on ? current.filter((g) => g !== value) : [...current, value],
                  );
                  setSaved(false);
                }}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-sm transition',
                  on
                    ? 'border-accent bg-accent/15 text-chalk'
                    : 'border-edge bg-panel text-dim hover:border-faint/60 hover:text-chalk',
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      </section>

      <div className="flex items-center gap-3">
        <Button loading={busy} disabled={!lookingFor.length} onClick={() => void save()}>
          Save and find matches
        </Button>
        {saved && <span className="text-sm text-courses">Saved.</span>}
      </div>
    </div>
  );
}
