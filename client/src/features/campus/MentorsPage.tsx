import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { PublicUser } from '@campusconnect/shared';
import { Avatar, Badge, Button, Card, EmptyState, Skeleton, Textarea } from '@/components/ui';
import { FilterChip } from '@/features/courses/CourseListPage';
import { api } from '@/lib/convexApi';
import { useM, useQ, usePublicQ } from '@/lib/convexHooks';
import { useMe } from '@/hooks/useMe';

interface Mentor {
  id: string;
  user: PublicUser;
  topics: string[];
  blurb: string;
  capacity: number;
  taken: number;
  hasRoom: boolean;
}

interface Major {
  id: string;
  name: string;
}

export function MentorsPage() {
  const me = useMe();
  const [majorId, setMajorId] = useState<string>(me?.major?.id ?? '');
  const [requesting, setRequesting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const majors = usePublicQ<Major[]>(api.catalog.majors);
  const mentors = useQ<Mentor[]>(api.campus.mentors, majorId ? { majorId } : {});
  const isLoading = mentors === undefined;

  const sendRequest = useM(api.campus.requestMentor);

  const request = async (mentor: Mentor, message: string) => {
    setError(null);
    try {
      await sendRequest({ mentorId: mentor.user.id, message });
      setRequesting(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't send.");
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-display-lg text-chalk">Mentorship</h1>
        <p className="mt-1.5 max-w-2xl text-[0.9375rem] text-dim">
          Upper-year students who opted in to answer the questions nobody puts in a handbook.
          Accepted requests open a DM.
        </p>
      </header>

      <div className="flex flex-wrap gap-1.5">
        <FilterChip active={!majorId} onClick={() => setMajorId('')}>
          All majors
        </FilterChip>
        {majors?.map((major) => (
          <FilterChip
            key={major.id}
            active={majorId === major.id}
            onClick={() => setMajorId(major.id)}
          >
            {major.name}
          </FilterChip>
        ))}
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      ) : !mentors?.length ? (
        <EmptyState
          title="No mentors in this major yet"
          body="If you're in third year or above, you already know things that would have saved you a term. Opting in takes a minute."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {mentors.map((mentor) => (
            <Card key={mentor.id} className="flex flex-col">
              <div className="flex items-start gap-3">
                <Avatar
                  name={mentor.user.displayName}
                  src={mentor.user.avatarUrl}
                  seed={mentor.user.id}
                  size={44}
                  online={mentor.user.isOnline}
                />
                <div className="min-w-0 flex-1">
                  <Link
                    to={`/u/${mentor.user.username}`}
                    className="block truncate font-display text-[0.9375rem] font-semibold tracking-tight text-chalk hover:underline"
                  >
                    {mentor.user.displayName}
                  </Link>
                  {mentor.user.major && (
                    <span className="block truncate text-xs text-dim">
                      {mentor.user.major.name}
                    </span>
                  )}
                </div>
                <span className="shrink-0 font-mono text-[0.625rem] text-faint">
                  {mentor.taken}/{mentor.capacity}
                </span>
              </div>

              <p className="mt-3 flex-1 text-xs leading-relaxed text-dim">{mentor.blurb}</p>

              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {mentor.topics.map((topic) => (
                  <Badge key={topic} tone="accent">
                    {topic}
                  </Badge>
                ))}
              </div>

              <div className="mt-3.5 border-t border-edge pt-3">
                {!mentor.hasRoom ? (
                  <p className="text-xs text-faint">At capacity right now.</p>
                ) : requesting === mentor.id ? (
                  <form
                    className="space-y-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const message = new FormData(e.currentTarget).get('message') as string;
                      void request(mentor, message);
                    }}
                  >
                    <Textarea
                      name="message"
                      rows={3}
                      placeholder="What would you like help with?"
                      maxLength={500}
                    />
                    {error && <p className="text-xs text-events">{error}</p>}
                    <div className="flex gap-2">
                      <Button type="submit" size="sm">
                        Send request
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setRequesting(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </form>
                ) : (
                  <Button size="sm" className="w-full" onClick={() => setRequesting(mentor.id)}>
                    Ask them
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
