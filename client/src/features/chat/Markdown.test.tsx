import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Markdown } from '@/features/chat/Markdown';

const renderMarkdown = (content: string) =>
  render(
    <MemoryRouter>
      <Markdown content={content} />
    </MemoryRouter>,
  );

describe('Markdown', () => {
  it('renders the supported inline subset', () => {
    const { container } = renderMarkdown('**bold** and *italic* and `code`');

    expect(container.querySelector('strong')).toHaveTextContent('bold');
    expect(container.querySelector('em')).toHaveTextContent('italic');
    expect(container.querySelector('code')).toHaveTextContent('code');
  });

  it('turns @mentions into profile links', () => {
    renderMarkdown('nice one @mayaokafor');
    expect(screen.getByRole('link', { name: '@mayaokafor' })).toHaveAttribute(
      'href',
      '/u/mayaokafor',
    );
  });

  it('opens external links in a new tab without leaking the referrer', () => {
    renderMarkdown('see https://example.edu/notes');
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
  });

  it('renders bullet lists', () => {
    const { container } = renderMarkdown('- first\n- second');
    expect(container.querySelectorAll('li')).toHaveLength(2);
  });

  /** Chat content is user-authored, so the renderer must never interpret it as markup. */
  it('does not execute embedded HTML', () => {
    const { container } = renderMarkdown('<img src=x onerror="alert(1)"> <b>not bold</b>');

    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
    expect(container.textContent).toContain('<img src=x');
  });
});
