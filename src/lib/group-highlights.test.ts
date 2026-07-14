import { describe, expect, it } from 'vitest';
import { groupHighlightsByArticle } from './group-highlights';
import { RaindropHighlight } from './types';

function makeHighlight(overrides: Partial<RaindropHighlight> = {}): RaindropHighlight {
  return {
    _id: 'h1',
    raindropRef: 100,
    text: 'Some highlighted text',
    title: 'An Article',
    color: 'yellow',
    note: '',
    created: '2026-01-01T00:00:00Z',
    lastUpdate: '2026-01-02T00:00:00Z',
    tags: [],
    link: 'https://example.com/article',
    ...overrides,
  };
}

describe('groupHighlightsByArticle', () => {
  it('groups highlights sharing a link into one article', () => {
    const articles = groupHighlightsByArticle([
      makeHighlight({ _id: 'h1' }),
      makeHighlight({ _id: 'h2' }),
      makeHighlight({ _id: 'h3', link: 'https://other.com/post', title: 'Other' }),
    ]);

    expect(articles).toHaveLength(2);
    const first = articles.find((a) => a.sourceUrl === 'https://example.com/article')!;
    expect(first.highlights.map((h) => h._id)).toEqual(['h1', 'h2']);
    expect(first.title).toBe('An Article');
    expect(first.domain).toBe('example.com');
  });

  it('sorts highlights within an article by creation time, oldest first', () => {
    const articles = groupHighlightsByArticle([
      makeHighlight({ _id: 'newer', created: '2026-02-01T00:00:00Z' }),
      makeHighlight({ _id: 'older', created: '2026-01-01T00:00:00Z' }),
    ]);

    expect(articles[0].highlights.map((h) => h._id)).toEqual(['older', 'newer']);
  });

  it('falls back to the link when the title is empty', () => {
    const articles = groupHighlightsByArticle([makeHighlight({ title: '' })]);
    expect(articles[0].title).toBe('https://example.com/article');
  });

  it('falls back to the raw link as domain when the URL is unparsable', () => {
    const articles = groupHighlightsByArticle([makeHighlight({ link: 'not a url' })]);
    expect(articles[0].domain).toBe('not a url');
  });

  it('returns an empty list for no highlights', () => {
    expect(groupHighlightsByArticle([])).toEqual([]);
  });
});
