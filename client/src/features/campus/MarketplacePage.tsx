import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { PublicUser } from '@campusconnect/shared';
import { api, qs } from '@/lib/api';
import { formatPrice, relativeTime } from '@/lib/utils';
import { useAuth } from '@/stores/auth';
import { Avatar, Badge, Button, Card, Code, EmptyState, Skeleton } from '@/components/ui';
import { FilterChip } from '@/features/courses/CourseListPage';

interface Listing {
  id: string;
  title: string;
  description: string | null;
  priceCents: number;
  category: string;
  photos: string[];
  status: string;
  createdAt: string;
  seller: PublicUser;
  course: { id: string; code: string } | null;
}

const CATEGORIES = ['ALL', 'TEXTBOOK', 'ELECTRONICS', 'FURNITURE', 'TICKETS', 'OTHER'] as const;

export function MarketplacePage() {
  const [category, setCategory] = useState<string>('ALL');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const me = useAuth((s) => s.user);

  const { data: listings, isLoading } = useQuery({
    queryKey: ['listings', category],
    queryFn: () => api.get<Listing[]>(`/campus/listings${qs({ category })}`),
  });

  const messageSeller = async (listing: Listing) => {
    const { conversationId } = await api.post<{ conversationId: string }>(
      `/campus/listings/${listing.id}/message`,
    );
    navigate(`/dms/${conversationId}`);
  };

  const markSold = async (listing: Listing) => {
    await api.post(`/campus/listings/${listing.id}/status`, { status: 'SOLD' });
    void queryClient.invalidateQueries({ queryKey: ['listings', category] });
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-display-lg text-chalk">Marketplace</h1>
        <p className="mt-1.5 text-[0.9375rem] text-dim">
          Student to student. No payments here — message the seller and sort it out in person.
        </p>
      </header>

      <div className="flex flex-wrap gap-1.5">
        {CATEGORIES.map((c) => (
          <FilterChip key={c} active={category === c} onClick={() => setCategory(c)}>
            {c === 'ALL' ? 'Everything' : c.toLowerCase()}
          </FilterChip>
        ))}
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      ) : !listings?.length ? (
        <EmptyState
          title="Nothing for sale right now"
          body="Textbooks you're finished with are worth more to the person taking the course next term than they are on your shelf."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {listings.map((listing) => (
            <Card key={listing.id} className="flex flex-col">
              <div className="flex items-start justify-between gap-2">
                <span className="font-display text-display-md leading-none text-chalk">
                  {formatPrice(listing.priceCents)}
                </span>
                <div className="flex flex-col items-end gap-1">
                  <Badge>{listing.category.toLowerCase()}</Badge>
                  {listing.status === 'SOLD' && <Badge tone="events">sold</Badge>}
                </div>
              </div>

              <h2 className="mt-2.5 text-sm font-semibold leading-snug text-chalk">
                {listing.title}
              </h2>
              {listing.description && (
                <p className="mt-1.5 flex-1 text-xs leading-relaxed text-dim line-clamp-3">
                  {listing.description}
                </p>
              )}

              {listing.course && (
                <Link
                  to={`/courses/${encodeURIComponent(listing.course.code)}`}
                  className="mt-2.5 self-start"
                >
                  <Code className="hover:border-courses/50 hover:text-courses">
                    {listing.course.code}
                  </Code>
                </Link>
              )}

              <div className="mt-3 flex items-center gap-2 border-t border-edge pt-3">
                <Link
                  to={`/u/${listing.seller.username}`}
                  className="flex min-w-0 items-center gap-1.5"
                >
                  <Avatar
                    name={listing.seller.displayName}
                    src={listing.seller.avatarUrl}
                    seed={listing.seller.id}
                    size={20}
                  />
                  <span className="truncate text-xs text-dim">{listing.seller.displayName}</span>
                </Link>
                <span className="ml-auto shrink-0 font-mono text-[0.5625rem] text-faint">
                  {relativeTime(listing.createdAt)}
                </span>
              </div>

              {listing.status === 'ACTIVE' && (
                <div className="mt-2.5">
                  {listing.seller.id === me?.id ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="w-full"
                      onClick={() => void markSold(listing)}
                    >
                      Mark as sold
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      className="w-full"
                      onClick={() => void messageSeller(listing)}
                    >
                      Message seller
                    </Button>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
