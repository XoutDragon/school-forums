import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui';

/**
 * Render-error boundary.
 *
 * Convex surfaces a failed query by throwing during render. Without a boundary
 * that means the whole app unmounts to a blank page — which is what happened for
 * every ordinary case the backend treats as an error: opening a private space,
 * following a link to a deleted channel, a stale id in the URL.
 *
 * React Router's `errorElement` does not help here: this app uses the component
 * router rather than a data router, so route errors are render errors and only a
 * class boundary catches them.
 *
 * The boundary is deliberately placed *inside* the layout shells rather than
 * around them, so a failed page keeps the navigation that lets you leave it.
 */

interface Props {
  children: ReactNode;
  /** Changing this resets the boundary — pass the pathname so navigating away recovers. */
  resetKey?: string;
}

interface State {
  error: Error | null;
}

/** Convex throws "CODE: sentence". The sentence is written for the reader. */
const CODED =
  /^\[?[A-Z_]*\]?.*?(BAD_REQUEST|CONFLICT|UNAUTHORIZED|FORBIDDEN|NOT_FOUND|RATE_LIMITED): (.*?)(?:\n|$)/;

function readable(error: Error): { title: string; body: string; expected: boolean } {
  const match = CODED.exec(error.message);
  if (match) {
    const [, code, sentence] = match;
    const titles: Record<string, string> = {
      FORBIDDEN: 'Not yours to see',
      NOT_FOUND: 'Nothing here',
      UNAUTHORIZED: 'Sign in to continue',
      RATE_LIMITED: 'Slow down a moment',
      BAD_REQUEST: 'That did not work',
      CONFLICT: 'That did not work',
    };
    return { title: titles[code!] ?? 'That did not work', body: sentence!, expected: true };
  }

  if (/Could not find public function/.test(error.message)) {
    return {
      title: 'The backend is not deployed',
      body: 'This page called a Convex function that does not exist on the deployment yet. Run `npx convex dev` and reload.',
      expected: true,
    };
  }

  return {
    title: 'Something broke',
    body: 'This page hit an error it did not expect. The details are in the browser console.',
    expected: false,
  };
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidUpdate(previous: Props) {
    // Navigating away from a broken page should recover without a reload.
    if (this.state.error && previous.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    // Unexpected errors still deserve a stack somewhere a developer will look.
    console.error('Render error', error, info.componentStack);
  }

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const { title, body, expected } = readable(error);

    return (
      <div className="grid min-h-[60vh] place-items-center px-6 py-12">
        <div className="w-full max-w-md text-center">
          <p className="eyebrow">{expected ? 'nothing to show' : 'unexpected error'}</p>
          <h2 className="mt-2 font-display text-display-md text-chalk">{title}</h2>
          <p className="mt-2 text-[0.9375rem] leading-relaxed text-dim">{body}</p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <Button onClick={() => this.setState({ error: null })}>Try again</Button>
            <Link to="/">
              <Button variant="secondary">Back to home</Button>
            </Link>
          </div>

          {!expected && (
            <pre className="mt-6 overflow-x-auto rounded-lg border border-edge bg-panel p-3 text-left font-mono text-[0.6875rem] leading-relaxed text-faint">
              {error.message}
            </pre>
          )}
        </div>
      </div>
    );
  }
}
