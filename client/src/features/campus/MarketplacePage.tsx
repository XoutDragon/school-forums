import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { PublicUser } from '@campusconnect/shared';
import { cn, formatPrice, relativeTime } from '@/lib/utils';
import {
  Avatar,
  Badge,
  Button,
  Card,
  Code,
  EmptyState,
  Field,
  Input,
  Skeleton,
  Textarea,
} from '@/components/ui';
import { Dialog, Select, validateImage } from '@/components/ui/overlays';
import { FilterChip } from '@/features/courses/CourseListPage';
import { IconClose, IconFlag, IconImage, IconPlus } from '@/components/Icons';
import { ReportDialog } from '@/features/moderation/ReportDialog';
import { api } from '@/lib/convexApi';
import { useM, useQ } from '@/lib/convexHooks';
import { useUpload } from '@/lib/upload';
import { useMe } from '@/hooks/useMe';

interface Listing {
  id: string;
  title: string;
  description: string | null;
  priceCents: number;
  category: string;
  photos: string[];
  status: string;
  createdAt: number;
  seller: PublicUser | null;
  course: { id: string; code: string } | null;
}

const CATEGORIES = ['ALL', 'TEXTBOOK', 'ELECTRONICS', 'FURNITURE', 'TICKETS', 'OTHER'] as const;
const MAX_PHOTOS = 4;

export function MarketplacePage() {
  const [category, setCategory] = useState<string>('ALL');
  const [composing, setComposing] = useState(false);
  const [reporting, setReporting] = useState<Listing | null>(null);
  const navigate = useNavigate();
  const me = useMe();

  const listings = useQ<Listing[]>(api.campus.listings, { category });
  const isLoading = listings === undefined;

  const openDm = useM(api.dms.open);
  const setStatus = useM(api.campus.setListingStatus);

  const messageSeller = async (listing: Listing) => {
    if (!listing.seller) return;
    const conversationId = await openDm({ userIds: [listing.seller.id] });
    navigate(`/dms/${conversationId}`);
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-display-lg text-chalk">Marketplace</h1>
          <p className="mt-1.5 text-[0.9375rem] text-dim">
            Student to student. No payments here — message the seller and sort it out in person.
          </p>
        </div>
        <Button onClick={() => setComposing(true)}>
          <IconPlus className="h-4 w-4" />
          List something
        </Button>
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
            <Skeleton key={i} className="h-56" />
          ))}
        </div>
      ) : !listings?.length ? (
        <EmptyState
          title="Nothing for sale right now"
          body="Textbooks you're finished with are worth more to the person taking the course next term than they are on your shelf."
          action={<Button onClick={() => setComposing(true)}>List the first thing</Button>}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {listings.map((listing) => (
            <Card key={listing.id} className="flex flex-col overflow-hidden p-0">
              {/* Photos are optional (feature 5), so the card has to look finished
                  without one. A listing with no photo gets no empty grey box. */}
              {listing.photos.length > 0 && (
                <PhotoStrip photos={listing.photos} title={listing.title} />
              )}

              <div className="flex flex-1 flex-col p-4">
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
                  {listing.seller ? (
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
                      <span className="truncate text-xs text-dim">
                        {listing.seller.displayName}
                      </span>
                    </Link>
                  ) : (
                    <span className="text-xs text-faint">Deleted account</span>
                  )}
                  <span className="ml-auto shrink-0 font-mono text-[0.5625rem] text-faint">
                    {relativeTime(listing.createdAt)}
                  </span>
                </div>

                {listing.status === 'ACTIVE' && listing.seller && (
                  <div className="mt-2.5">
                    {listing.seller.id === me?.id ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="w-full"
                        onClick={() => void setStatus({ listingId: listing.id, status: 'SOLD' })}
                      >
                        Mark as sold
                      </Button>
                    ) : (
                      <div className="flex gap-1.5">
                        <Button
                          size="sm"
                          className="flex-1"
                          onClick={() => void messageSeller(listing)}
                        >
                          Message seller
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`Report "${listing.title}"`}
                          onClick={() => setReporting(listing)}
                        >
                          <IconFlag className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <ListingComposer open={composing} onClose={() => setComposing(false)} />

      {reporting && (
        <ReportDialog
          open
          onClose={() => setReporting(null)}
          targetType="LISTING"
          targetId={reporting.id}
          context={`${reporting.title} — ${formatPrice(reporting.priceCents)}`}
        />
      )}
    </div>
  );
}

/** First photo large, the rest as a thumbnail row. Clicking swaps them. */
function PhotoStrip({ photos, title }: { photos: string[]; title: string }) {
  const [index, setIndex] = useState(0);

  return (
    <div>
      <img
        src={photos[index]}
        alt={title}
        loading="lazy"
        className="aspect-[4/3] w-full border-b border-edge object-cover"
      />
      {photos.length > 1 && (
        <div className="flex gap-1 border-b border-edge p-1.5">
          {photos.map((photo, i) => (
            <button
              key={photo}
              onClick={() => setIndex(i)}
              aria-label={`Photo ${i + 1}`}
              className={cn(
                'h-10 w-10 overflow-hidden rounded-md border transition',
                i === index ? 'border-accent' : 'border-edge opacity-70 hover:opacity-100',
              )}
            >
              <img src={photo} alt="" loading="lazy" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The listing form.
 *
 * Photos upload as they are picked rather than on submit, so a slow connection
 * blocks the picker and not the whole form — and so a failed upload is visible
 * where it happened rather than as one opaque error at the end.
 */
function ListingComposer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useM(api.campus.createListing);
  const { upload, busy: uploading } = useUpload();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState('TEXTBOOK');
  const [photos, setPhotos] = useState<{ storageId: string; preview: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addPhoto(file: File) {
    const problem = validateImage(file);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);

    const storageId = await upload(file);
    if (!storageId) {
      setError('That photo did not upload. Try again.');
      return;
    }
    setPhotos((previous) => [...previous, { storageId, preview: URL.createObjectURL(file) }]);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const dollars = Number(price.replace(/[^0-9.]/g, '')) || 0;
      await create({
        title: title.trim(),
        description: description.trim() || undefined,
        priceCents: Math.round(dollars * 100),
        category,
        photoStorageIds: photos.map((p) => p.storageId),
      });
      for (const photo of photos) URL.revokeObjectURL(photo.preview);
      setTitle('');
      setDescription('');
      setPrice('');
      setPhotos([]);
      onClose();
    } catch (err) {
      const raw = err instanceof Error ? err.message : '';
      setError(/(?::\s)(.*)/.exec(raw)?.[1] ?? 'Could not post that listing.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="List something"
      description="No payments run through this app. You arrange the handover yourselves."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} disabled={title.trim().length < 3} onClick={submit}>
            Post listing
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="What is it?">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Calculus: Early Transcendentals, 9th ed."
            autoFocus
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Price" hint="Leave at 0 to give it away.">
            <Input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              inputMode="decimal"
              placeholder="45.00"
            />
          </Field>
          <Field label="Category">
            <Select
              value={category}
              onChange={setCategory}
              options={CATEGORIES.filter((c) => c !== 'ALL').map((c) => ({
                value: c,
                label: c.charAt(0) + c.slice(1).toLowerCase(),
              }))}
            />
          </Field>
        </div>

        <Field label="Details" hint="Condition, edition, whether the access code is used.">
          <Textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Barely opened. Some highlighting in chapter 3. Access code already redeemed."
          />
        </Field>

        {/* ── Photos (feature 5). Optional, and the copy says so — a required
               photo field is how a listing that would have sold never gets posted. */}
        <div>
          <p className="text-sm font-medium text-chalk">Photos</p>
          <p className="mt-0.5 text-xs text-dim">
            Optional, and up to {MAX_PHOTOS}. Things with a photo sell noticeably faster.
          </p>

          <div className="mt-2.5 flex flex-wrap gap-2">
            {photos.map((photo, index) => (
              <div
                key={photo.storageId}
                className="group relative h-20 w-20 overflow-hidden rounded-lg border border-edge"
              >
                <img src={photo.preview} alt="" className="h-full w-full object-cover" />
                <button
                  onClick={() => {
                    URL.revokeObjectURL(photo.preview);
                    setPhotos((previous) => previous.filter((_, i) => i !== index));
                  }}
                  aria-label={`Remove photo ${index + 1}`}
                  className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-black/60 text-white opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100"
                >
                  <IconClose className="h-3 w-3" />
                </button>
              </div>
            ))}

            {photos.length < MAX_PHOTOS && (
              <label
                className={cn(
                  'grid h-20 w-20 cursor-pointer place-items-center rounded-lg border border-dashed border-edge text-faint transition hover:border-accent hover:text-accent-lift',
                  uploading && 'pointer-events-none opacity-50',
                )}
              >
                {uploading ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                ) : (
                  <IconImage />
                )}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (file) void addPhoto(file);
                  }}
                />
              </label>
            )}
          </div>
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-lg border border-events/40 bg-events/[0.07] px-3 py-2.5 text-sm text-events"
          >
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}
