import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { CourseDto } from '@campusconnect/shared';
import { api, qs } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Card, Code, EmptyState, Input, Skeleton } from '@/components/ui';

interface Major {
  id: string;
  name: string;
  faculty: string;
}

export function CourseListPage() {
  const [search, setSearch] = useState('');
  const [majorId, setMajorId] = useState('');

  const { data: majors } = useQuery({
    queryKey: ['majors'],
    queryFn: () => api.get<Major[]>('/catalog/majors'),
  });

  const { data: courses, isLoading } = useQuery({
    queryKey: ['courses', search, majorId],
    queryFn: () => api.get<CourseDto[]>(`/courses${qs({ q: search, majorId })}`),
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-display-lg text-chalk">Courses</h1>
        <p className="mt-1.5 text-[0.9375rem] text-dim">
          Reviews, notes and questions, kept by course code so they survive the term that made them.
        </p>
      </header>

      <div className="space-y-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by code or title — try CS 22"
        />
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
      </div>

      {isLoading ? (
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 9 }, (_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : !courses?.length ? (
        <EmptyState
          title="No courses match that"
          body="Try a shorter query — course codes are indexed by prefix, so “CS 2” works."
        />
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((course) => (
            <Link key={course.id} to={`/courses/${encodeURIComponent(course.code)}`}>
              <Card className="h-full transition hover:border-courses/45">
                <div className="flex items-center justify-between">
                  <Code className="border-courses/30 text-courses">{course.code}</Code>
                  {course.avgRating && (
                    <span className="font-mono text-xs text-dim">
                      {course.avgRating.toFixed(1)}
                      <span className="text-faint">/5</span>
                    </span>
                  )}
                </div>
                <h2 className="mt-2.5 text-sm font-semibold leading-snug text-chalk">
                  {course.title}
                </h2>
                <div className="mt-2.5 flex items-center gap-2">
                  {course.major && (
                    <span className="truncate text-xs text-dim">{course.major.name}</span>
                  )}
                  <span className="ml-auto shrink-0 font-mono text-[0.625rem] text-faint">
                    {course.reviewCount} {course.reviewCount === 1 ? 'review' : 'reviews'}
                  </span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1.5 text-xs font-medium transition',
        active
          ? 'border-accent bg-accent/15 text-chalk'
          : 'border-edge bg-panel text-dim hover:border-faint/60 hover:text-chalk',
      )}
    >
      {children}
    </button>
  );
}
