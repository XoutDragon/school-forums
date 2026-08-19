import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

/** A deliberately small markdown subset (§5.2: bold/italic/code/links/lists). Rendered by
 *  building React nodes rather than setting innerHTML — user-authored chat is the last
 *  place to hand the browser a string and hope. */

const INLINE = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|https?:\/\/\S+|@[a-z0-9_]{3,24})/g;

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  return text
    .split(INLINE)
    .filter(Boolean)
    .map((token, i) => {
      const key = `${keyPrefix}-${i}`;

      if (token.startsWith('**') && token.endsWith('**') && token.length > 4) {
        return (
          <strong key={key} className="font-semibold text-chalk">
            {token.slice(2, -2)}
          </strong>
        );
      }
      if (token.startsWith('*') && token.endsWith('*') && token.length > 2) {
        return (
          <em key={key} className="italic">
            {token.slice(1, -1)}
          </em>
        );
      }
      if (token.startsWith('`') && token.endsWith('`') && token.length > 2) {
        return (
          <code
            key={key}
            className="rounded border border-edge bg-raised px-1 py-0.5 font-mono text-[0.8125rem]"
          >
            {token.slice(1, -1)}
          </code>
        );
      }
      if (/^https?:\/\//.test(token)) {
        return (
          <a
            key={key}
            href={token}
            target="_blank"
            rel="noreferrer noopener"
            className="text-accent-lift underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
          >
            {token.replace(/^https?:\/\//, '').slice(0, 60)}
          </a>
        );
      }
      if (token.startsWith('@')) {
        return (
          <Link
            key={key}
            to={`/u/${token.slice(1)}`}
            className="rounded bg-accent/15 px-1 py-0.5 font-medium text-accent-lift hover:bg-accent/25"
          >
            {token}
          </Link>
        );
      }
      return <Fragment key={key}>{token}</Fragment>;
    });
}

export function Markdown({ content }: { content: string }) {
  const lines = content.split('\n');
  const blocks: ReactNode[] = [];
  let list: string[] = [];

  const flushList = (key: string) => {
    if (!list.length) return;
    blocks.push(
      <ul key={key} className="my-1 list-disc space-y-0.5 pl-5 marker:text-faint">
        {list.map((item, i) => (
          <li key={i}>{renderInline(item, `${key}-${i}`)}</li>
        ))}
      </ul>,
    );
    list = [];
  };

  lines.forEach((line, i) => {
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      list.push(bullet[1]!);
      return;
    }
    flushList(`list-${i}`);
    if (line.trim()) {
      blocks.push(<p key={`p-${i}`}>{renderInline(line, `p-${i}`)}</p>);
    }
  });
  flushList('list-end');

  return <div className="space-y-1 whitespace-pre-wrap break-words">{blocks}</div>;
}
