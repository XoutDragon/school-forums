import { useState } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Avatar, Badge, Button, Card, EmptyState, Eyebrow, Skeleton } from '@/components/ui';
import { api } from '@/lib/convexApi';
import { useQ, usePublicQ } from '@/lib/convexHooks';

interface Question {
  id: string;
  prompt: string;
  options: { label: string; tags: string[] }[];
}

interface Result {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  logoUrl: string | null;
  isRecruiting: boolean;
  memberCount: number;
  matchedOn: string[];
}

export function ClubQuizPage() {
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [submitted, setSubmitted] = useState(false);

  const questions = usePublicQ<Question[]>(api.clubs.quizQuestions);
  const allTags = Object.values(answers).flat();
  // Results are a query, so they are only fetched once the student has answered.
  const liveResults = useQ<Result[]>(api.clubs.quizResults, submitted ? { tags: allTags } : 'skip');

  if (!questions) return <Skeleton className="h-96 w-full" />;

  const answered = Object.keys(answers).length;

  const results = submitted ? liveResults : null;

  if (results) {
    return (
      <div className="space-y-6">
        <header>
          <Eyebrow>Your results</Eyebrow>
          <h1 className="mt-2 font-display text-display-lg text-chalk">
            {results.length ? 'These five, in order.' : 'Nothing clicked.'}
          </h1>
          <p className="mt-1.5 text-[0.9375rem] text-dim">
            Ranked by how much their actual activity overlaps what you picked.
          </p>
        </header>

        {!results.length ? (
          <EmptyState
            title="No strong matches"
            body="Your answers didn't line up with any club's tags. The full directory is worth a browse — the quiz is a shortcut, not a gate."
            action={
              <Link to="/clubs">
                <Button size="sm">Browse all clubs</Button>
              </Link>
            }
          />
        ) : (
          <ol className="space-y-2.5">
            {results.map((club, i) => (
              <li key={club.id}>
                <Card className="flex items-start gap-4 transition hover:border-clubs/40">
                  {/* Numbering is legitimate here — this is a ranking, and the order
                      carries the information. */}
                  <span className="w-7 shrink-0 font-mono text-display-md leading-none text-clubs/40">
                    {i + 1}
                  </span>
                  <Avatar name={club.name} src={club.logoUrl} seed={club.id} size={44} />
                  <div className="min-w-0 flex-1">
                    <Link
                      to={`/clubs/${club.slug}`}
                      className="font-display text-[1.0625rem] font-semibold tracking-tight text-chalk hover:underline"
                    >
                      {club.name}
                    </Link>
                    <p className="mt-1 text-xs leading-relaxed text-dim line-clamp-2">
                      {club.description}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {club.matchedOn.map((tag) => (
                        <Badge key={tag} tone="clubs">
                          {tag}
                        </Badge>
                      ))}
                      <span className="ml-auto font-mono text-[0.625rem] text-faint">
                        {club.memberCount} members
                      </span>
                    </div>
                  </div>
                </Card>
              </li>
            ))}
          </ol>
        )}

        <Button
          variant="secondary"
          onClick={() => {
            setSubmitted(false);
            setAnswers({});
          }}
        >
          Take it again
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <Eyebrow>Six questions</Eyebrow>
        <h1 className="mt-2 font-display text-display-lg text-chalk">
          What do you actually want out of a term?
        </h1>
        <p className="mt-1.5 text-[0.9375rem] text-dim">
          No wrong answers, and nothing is saved to your profile.
        </p>
      </header>

      <div className="space-y-5">
        {questions.map((question) => (
          <Card key={question.id}>
            <p className="text-sm font-medium text-chalk">{question.prompt}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {question.options.map((option) => {
                const picked = answers[question.id] === option.tags;
                return (
                  <button
                    key={option.label}
                    onClick={() =>
                      setAnswers((a) => ({ ...a, [question.id]: option.tags as string[] }))
                    }
                    className={cn(
                      'rounded-lg border px-3 py-2 text-sm transition',
                      picked
                        ? 'border-clubs bg-clubs/15 text-chalk'
                        : 'border-edge bg-raised text-dim hover:border-faint/60 hover:text-chalk',
                    )}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </Card>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <Button disabled={answered === 0} onClick={() => setSubmitted(true)}>
          {answered < questions.length
            ? `Show results (${answered}/${questions.length} answered)`
            : 'Show my top 5'}
        </Button>
        <Link to="/clubs" className="text-sm text-faint hover:text-dim">
          Skip to the directory
        </Link>
      </div>
    </div>
  );
}
