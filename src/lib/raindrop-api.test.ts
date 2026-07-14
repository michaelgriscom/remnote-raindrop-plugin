import { describe, expect, it } from 'vitest';
import { itemToHighlights, trashSearchCutoff } from './raindrop-api';

describe('trashSearchCutoff', () => {
  it('returns the date one day before the given time', () => {
    expect(trashSearchCutoff('2026-07-14T16:30:00.000Z')).toBe('2026-07-13');
  });

  it('crosses month boundaries', () => {
    expect(trashSearchCutoff('2026-08-01T00:10:00.000Z')).toBe('2026-07-31');
  });
});

describe('itemToHighlights', () => {
  const item = {
    _id: 1790629607,
    link: 'https://example.com/article',
    title: 'An Article',
    tags: ['tag1'],
    highlights: [
      {
        _id: 'h1',
        text: 'Highlighted text',
        note: 'a note',
        color: 'yellow',
        created: '2026-07-14T16:28:56.852Z',
        lastUpdate: '2026-07-14T16:29:00.000Z',
      },
    ],
  };

  it('folds article fields from the item into each highlight', () => {
    expect(itemToHighlights(item)).toEqual([
      {
        _id: 'h1',
        raindropRef: 1790629607,
        text: 'Highlighted text',
        title: 'An Article',
        color: 'yellow',
        note: 'a note',
        created: '2026-07-14T16:28:56.852Z',
        lastUpdate: '2026-07-14T16:29:00.000Z',
        tags: ['tag1'],
        link: 'https://example.com/article',
      },
    ]);
  });

  it('defaults optional highlight fields', () => {
    const minimal = {
      _id: 2,
      link: 'https://example.com/other',
      title: 'Other',
      highlights: [{ _id: 'h2', text: 'text', created: '2026-07-14T00:00:00Z' }],
    };
    const [h] = itemToHighlights(minimal);
    expect(h.color).toBe('');
    expect(h.note).toBe('');
    expect(h.tags).toEqual([]);
    expect(h.lastUpdate).toBe('2026-07-14T00:00:00Z');
  });

  it('returns an empty list for items without highlights', () => {
    expect(itemToHighlights({ _id: 3, link: 'https://x.com', title: 'X' })).toEqual([]);
  });
});
