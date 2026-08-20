import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { PublicUser } from '@campusconnect/shared';
import { relativeTime } from '@/lib/utils';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Skeleton,
  Textarea,
} from '@/components/ui';
import { IconMapPin } from '@/components/Icons';
import { api } from '@/lib/convexApi';
import { useM, useQ } from '@/lib/convexHooks';
import { useMe } from '@/hooks/useMe';

interface Item {
  id: string;
  kind: 'LOST' | 'FOUND';
  title: string;
  description: string;
  location: string;
  photoUrl: string | null;
  status: string;
  createdAt: string;
  reporter: PublicUser;
}

export function LostFoundPage() {
  const [posting, setPosting] = useState(false);
  const me = useMe();

  const items = useQ<Item[]>(api.campus.lostFound);
  const isLoading = items === undefined;

  const report = useM(api.campus.reportLostFound);
  const resolveItem = useM(api.campus.resolveLostFound);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-display-lg text-chalk">Lost &amp; found</h1>
          <p className="mt-1.5 text-[0.9375rem] text-dim">
            Post what you lost or what you picked up. Mark it resolved when it finds its way back.
          </p>
        </div>
        <Button onClick={() => setPosting((p) => !p)}>{posting ? 'Cancel' : 'Post an item'}</Button>
      </header>

      {posting && (
        <Card>
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              await report({
                kind: form.get('kind') as 'LOST' | 'FOUND',
                title: String(form.get('title')),
                description: String(form.get('description')),
                location: String(form.get('location')),
              });
              setPosting(false);
            }}
          >
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-chalk">Which is it?</legend>
              <div className="flex gap-2">
                {(['LOST', 'FOUND'] as const).map((kind, i) => (
                  <label
                    key={kind}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border border-edge bg-raised px-3.5 py-2 text-sm text-chalk has-[:checked]:border-accent has-[:checked]:bg-accent/10"
                  >
                    <input
                      type="radio"
                      name="kind"
                      value={kind}
                      defaultChecked={i === 0}
                      className="accent-[rgb(var(--accent))]"
                    />
                    I {kind === 'LOST' ? 'lost something' : 'found something'}
                  </label>
                ))}
              </div>
            </fieldset>

            <Field label="What is it?">
              <Input
                name="title"
                required
                minLength={3}
                placeholder="Blue water bottle with stickers"
              />
            </Field>
            <Field label="Where?" hint="Building or area is enough.">
              <Input name="location" required minLength={2} placeholder="Weldon Library" />
            </Field>
            <Field
              label="Details"
              hint="Enough that the right person recognises it — not so much that anyone could claim it."
            >
              <Textarea name="description" rows={3} required minLength={5} />
            </Field>

            <Button type="submit">Post it</Button>
          </form>
        </Card>
      )}

      {isLoading ? (
        <div className="space-y-2.5">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : !items?.length ? (
        <EmptyState
          title="Nothing reported"
          body="An empty lost and found is the good outcome. If that changes, this is where it goes."
        />
      ) : (
        <div className="space-y-2.5">
          {items.map((item) => (
            <Card key={item.id} className="flex flex-wrap items-start gap-4">
              <Badge tone={item.kind === 'LOST' ? 'events' : 'courses'}>
                {item.kind.toLowerCase()}
              </Badge>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-semibold text-chalk">{item.title}</h2>
                <p className="mt-1 text-xs leading-relaxed text-dim">{item.description}</p>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-faint">
                  <span className="flex items-center gap-1">
                    <IconMapPin className="h-3 w-3" />
                    {item.location}
                  </span>
                  <Link
                    to={`/u/${item.reporter.username}`}
                    className="flex items-center gap-1.5 hover:text-dim"
                  >
                    <Avatar
                      name={item.reporter.displayName}
                      src={item.reporter.avatarUrl}
                      seed={item.reporter.id}
                      size={16}
                    />
                    {item.reporter.displayName}
                  </Link>
                  <span className="font-mono text-[0.625rem]">{relativeTime(item.createdAt)}</span>
                </div>
              </div>

              {item.reporter.id === me?.id && item.status === 'OPEN' && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void resolveItem({ itemId: item.id })}
                >
                  Mark resolved
                </Button>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
