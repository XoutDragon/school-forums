import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { ClubDto } from '@campusconnect/shared';
import { Avatar, Badge, Button, Card, EmptyState, Input, Skeleton } from '@/components/ui';
import { FilterChip } from '@/features/courses/CourseListPage';
import { IconSparkle } from '@/components/Icons';
import { api } from '@/lib/convexApi';
import { useM, useQ } from '@/lib/convexHooks';

const CATEGORIES = [
  'ALL',
  'ACADEMIC',
  'CULTURAL',
  'SPORTS',
  'ARTS',
  'VOLUNTEER',
  'PROFESSIONAL',
  'GAMING',
  'RELIGIOUS',
  'OTHER',
] as const;

export function ClubDirectoryPage() {
  const [category, setCategory] = useState<string>('ALL');
  const [recruiting, setRecruiting] = useState(false);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'members' | 'newest'>('members');

  const clubs = useQ<ClubDto[]>(api.clubs.list, { category, recruiting, search, sort });
  const isLoading = clubs === undefined;

  const setMembership = useM(api.clubs.setMembership);
  const join = async (club: ClubDto, role: 'MEMBER' | 'FOLLOWER') => {
    await setMembership({ clubId: club.id, role });
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-display-lg text-chalk">Clubs</h1>
          <p className="mt-1.5 text-[0.9375rem] text-dim">
            {clubs?.length ?? 0} on campus. Following gets you announcements without committing to
            anything.
          </p>
        </div>
        <Link to="/clubs/quiz">
          <Button variant="secondary">
            <IconSparkle className="h-4 w-4" />
            Take the quiz
          </Button>
        </Link>
      </header>

      <div className="space-y-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search clubs"
        />
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((c) => (
            <FilterChip key={c} active={category === c} onClick={() => setCategory(c)}>
              {c === 'ALL' ? 'All' : c.toLowerCase()}
            </FilterChip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-dim">
            <input
              type="checkbox"
              checked={recruiting}
              onChange={(e) => setRecruiting(e.target.checked)}
              className="accent-[rgb(var(--clubs))]"
            />
            Recruiting now
          </label>
          <div className="flex items-center gap-1">
            {(['members', 'newest'] as const).map((option) => (
              <button
                key={option}
                onClick={() => setSort(option)}
                className={
                  sort === option
                    ? 'rounded-md bg-clubs/15 px-2.5 py-1 text-xs font-medium text-clubs'
                    : 'rounded-md px-2.5 py-1 text-xs font-medium text-dim hover:bg-raised'
                }
              >
                {option === 'members' ? 'Most members' : 'Newest'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      ) : !clubs?.length ? (
        <EmptyState
          title="No clubs match those filters"
          body="Clear a filter, or take the quiz — it ranks clubs by what you actually want out of a term."
          action={
            <Link to="/clubs/quiz">
              <Button size="sm">Take the quiz</Button>
            </Link>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {clubs.map((club) => (
            <Card key={club.id} className="flex flex-col transition hover:border-clubs/40">
              <div className="flex items-start gap-3">
                <Avatar name={club.name} src={club.logoUrl} seed={club.id} size={40} />
                <div className="min-w-0 flex-1">
                  <Link
                    to={`/clubs/${club.slug}`}
                    className="block truncate font-display text-[0.9375rem] font-semibold tracking-tight text-chalk hover:underline"
                  >
                    {club.name}
                  </Link>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <Badge tone="clubs">{club.category.toLowerCase()}</Badge>
                    {club.isRecruiting && <Badge tone="courses">recruiting</Badge>}
                  </div>
                </div>
              </div>

              <p className="mt-3 flex-1 text-xs leading-relaxed text-dim line-clamp-3">
                {club.description}
              </p>

              <div className="mt-3.5 flex items-center gap-2 border-t border-edge pt-3">
                <span className="font-mono text-[0.625rem] text-faint">
                  {club.memberCount} members
                </span>
                <div className="ml-auto flex gap-1.5">
                  {club.myRole ? (
                    <Badge>{club.myRole.toLowerCase()}</Badge>
                  ) : (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => void join(club, 'FOLLOWER')}>
                        Follow
                      </Button>
                      <Button size="sm" onClick={() => void join(club, 'MEMBER')}>
                        Join
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
