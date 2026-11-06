import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RNPlugin } from '@remnote/plugin-sdk';
import { IMPORT_LOCATIONS, SETTING_IDS, STORAGE_KEYS } from './constants';
import { RaindropHighlight } from './types';

vi.mock('./raindrop-api', () => ({
  fetchAllHighlights: vi.fn(),
  fetchTrashedRaindropsSince: vi.fn(),
}));
vi.mock('./rem-creator', () => ({
  importArticle: vi.fn(),
  moveArticleToCompleted: vi.fn(),
}));

import { fetchAllHighlights, fetchTrashedRaindropsSince } from './raindrop-api';
import { importArticle, moveArticleToCompleted } from './rem-creator';
import { dedupeHighlights, performSync } from './sync-engine';

const mockedFetchAll = vi.mocked(fetchAllHighlights);
const mockedFetchTrashed = vi.mocked(fetchTrashedRaindropsSince);
const mockedImport = vi.mocked(importArticle);
const mockedMove = vi.mocked(moveArticleToCompleted);

function makeHighlight(overrides: Partial<RaindropHighlight> = {}): RaindropHighlight {
  return {
    _id: 'h1',
    raindropRef: 100,
    text: 'Some text',
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

interface FakePlugin {
  plugin: RNPlugin;
  synced: Record<string, unknown>;
  session: Record<string, unknown>;
}

function makePlugin(
  settings: Record<string, unknown>,
  synced: Record<string, unknown> = {}
): FakePlugin {
  const session: Record<string, unknown> = {};
  const plugin = {
    settings: {
      getSetting: vi.fn(async (id: string) => settings[id]),
    },
    storage: {
      getSynced: vi.fn(async (key: string) => synced[key]),
      setSynced: vi.fn(async (key: string, value: unknown) => {
        synced[key] = value;
      }),
      getSession: vi.fn(async (key: string) => session[key]),
      setSession: vi.fn(async (key: string, value: unknown) => {
        session[key] = value;
      }),
    },
    app: { toast: vi.fn() },
  } as unknown as RNPlugin;
  return { plugin, synced, session };
}

const baseSettings = {
  [SETTING_IDS.API_TOKEN]: 'token',
  [SETTING_IDS.IMPORT_LOCATION]: IMPORT_LOCATIONS.DEDICATED,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockedFetchTrashed.mockResolvedValue([]);
  mockedMove.mockResolvedValue();
  // Default: every highlight of the article imports cleanly.
  mockedImport.mockImplementation(async (_plugin, article) => ({
    articleRemId: `rem-${article.sourceUrl}`,
    importedHighlightIds: article.highlights.map((h) => h._id),
    errors: [],
  }));
});

describe('dedupeHighlights', () => {
  it('keeps the first occurrence of a highlight id', () => {
    const a = makeHighlight({ _id: 'a', text: 'first' });
    const b = makeHighlight({ _id: 'b' });
    const result = dedupeHighlights([a, b, makeHighlight({ _id: 'a', text: 'second' })]);
    expect(result).toEqual([a, b]);
  });
});

describe('performSync', () => {
  it('returns an error without syncing when no token is configured', async () => {
    const { plugin } = makePlugin({ [SETTING_IDS.API_TOKEN]: '  ' });
    const result = await performSync(plugin);
    expect(result.errors).toEqual(['No API token configured.']);
    expect(mockedFetchAll).not.toHaveBeenCalled();
  });

  it('imports new highlights and records the mappings', async () => {
    const { plugin, synced } = makePlugin(baseSettings);
    mockedFetchAll.mockResolvedValue([makeHighlight({ _id: 'h1' }), makeHighlight({ _id: 'h2' })]);

    const result = await performSync(plugin);

    expect(result).toEqual({ imported: 2, archived: 0, errors: [] });
    expect(synced[STORAGE_KEYS.IMPORTED_IDS]).toEqual({ h1: true, h2: true });
    expect(synced[STORAGE_KEYS.RAINDROP_REM_MAP]).toEqual({
      '100': 'rem-https://example.com/article',
    });
    expect(synced[STORAGE_KEYS.ARTICLE_URL_REM_MAP]).toEqual({
      'https://example.com/article': 'rem-https://example.com/article',
    });
    expect(synced[STORAGE_KEYS.LAST_SYNC_TIME]).toEqual(expect.any(String));
    expect(synced[STORAGE_KEYS.SYNC_LOCK]).toBeUndefined();
  });

  it('skips highlights that were already imported', async () => {
    const { plugin } = makePlugin(baseSettings, {
      [STORAGE_KEYS.IMPORTED_IDS]: { h1: true },
    });
    mockedFetchAll.mockResolvedValue([makeHighlight({ _id: 'h1' })]);

    const result = await performSync(plugin);

    expect(result.imported).toBe(0);
    expect(mockedImport).not.toHaveBeenCalled();
  });

  it('does not import the same highlight twice when it appears in both feeds', async () => {
    const { plugin, synced } = makePlugin(baseSettings, {
      [STORAGE_KEYS.LAST_SYNC_TIME]: '2026-01-01T00:00:00Z',
    });
    const h = makeHighlight({ _id: 'h1' });
    mockedFetchAll.mockResolvedValue([h]);
    mockedFetchTrashed.mockResolvedValue([{ raindropId: 100, highlights: [h] }]);

    const result = await performSync(plugin);

    expect(result.imported).toBe(1);
    expect(mockedImport).toHaveBeenCalledTimes(1);
    expect(mockedImport.mock.calls[0][1].highlights).toHaveLength(1);
    expect(synced[STORAGE_KEYS.IMPORTED_IDS]).toEqual({ h1: true });
  });

  it('maps every raindrop that contributed to an article', async () => {
    const { plugin, synced } = makePlugin(baseSettings);
    mockedFetchAll.mockResolvedValue([
      makeHighlight({ _id: 'h1', raindropRef: 100 }),
      makeHighlight({ _id: 'h2', raindropRef: 200 }),
    ]);

    await performSync(plugin);

    expect(synced[STORAGE_KEYS.RAINDROP_REM_MAP]).toEqual({
      '100': 'rem-https://example.com/article',
      '200': 'rem-https://example.com/article',
    });
  });

  it('records the article Rem and only the written highlights when some fail', async () => {
    const { plugin, synced } = makePlugin(baseSettings);
    mockedFetchAll.mockResolvedValue([makeHighlight({ _id: 'h1' }), makeHighlight({ _id: 'h2' })]);
    mockedImport.mockResolvedValue({
      articleRemId: 'rem-1',
      importedHighlightIds: ['h1'],
      errors: ['Failed to import a highlight from "An Article": boom'],
    });

    const result = await performSync(plugin);

    expect(result.imported).toBe(1);
    expect(result.errors).toEqual(['Failed to import a highlight from "An Article": boom']);
    expect(synced[STORAGE_KEYS.IMPORTED_IDS]).toEqual({ h1: true });
    expect(synced[STORAGE_KEYS.ARTICLE_URL_REM_MAP]).toEqual({
      'https://example.com/article': 'rem-1',
    });
  });

  it('reports a failed article without aborting the rest of the sync', async () => {
    const { plugin, synced } = makePlugin(baseSettings);
    mockedFetchAll.mockResolvedValue([
      makeHighlight({ _id: 'h1', link: 'https://a.com', title: 'A' }),
      makeHighlight({ _id: 'h2', link: 'https://b.com', title: 'B' }),
    ]);
    mockedImport.mockImplementation(async (_plugin, article) => {
      if (article.sourceUrl === 'https://a.com') throw new Error('nope');
      return { articleRemId: 'rem-b', importedHighlightIds: ['h2'], errors: [] };
    });

    const result = await performSync(plugin);

    expect(result.imported).toBe(1);
    expect(result.errors).toEqual(['Failed to import "A": nope']);
    expect(synced[STORAGE_KEYS.IMPORTED_IDS]).toEqual({ h2: true });
  });

  it('archives trashed bookmarks and forgets both of their mappings', async () => {
    const { plugin, synced } = makePlugin(baseSettings, {
      [STORAGE_KEYS.LAST_SYNC_TIME]: '2026-01-01T00:00:00Z',
      [STORAGE_KEYS.IMPORTED_IDS]: { h1: true },
      [STORAGE_KEYS.RAINDROP_REM_MAP]: { '100': 'rem-1', '300': 'rem-3' },
      [STORAGE_KEYS.ARTICLE_URL_REM_MAP]: {
        'https://example.com/article': 'rem-1',
        'https://other.com': 'rem-3',
      },
    });
    mockedFetchAll.mockResolvedValue([]);
    mockedFetchTrashed.mockResolvedValue([
      { raindropId: 100, highlights: [makeHighlight({ _id: 'h1' })] },
    ]);

    const result = await performSync(plugin);

    expect(result).toEqual({ imported: 0, archived: 1, errors: [] });
    expect(mockedMove).toHaveBeenCalledWith(plugin, 'rem-1');
    expect(synced[STORAGE_KEYS.RAINDROP_REM_MAP]).toEqual({ '300': 'rem-3' });
    expect(synced[STORAGE_KEYS.ARTICLE_URL_REM_MAP]).toEqual({ 'https://other.com': 'rem-3' });
  });

  it('imports highlights of a bookmark trashed before its first sync, then archives it', async () => {
    const { plugin } = makePlugin(baseSettings, {
      [STORAGE_KEYS.LAST_SYNC_TIME]: '2026-01-01T00:00:00Z',
    });
    mockedFetchAll.mockResolvedValue([]);
    mockedFetchTrashed.mockResolvedValue([
      { raindropId: 100, highlights: [makeHighlight({ _id: 'h1' })] },
    ]);

    const result = await performSync(plugin);

    expect(result.imported).toBe(1);
    expect(result.archived).toBe(1);
    expect(mockedMove).toHaveBeenCalledWith(plugin, 'rem-https://example.com/article');
  });

  it('does not archive in daily mode', async () => {
    const { plugin } = makePlugin(
      { ...baseSettings, [SETTING_IDS.IMPORT_LOCATION]: IMPORT_LOCATIONS.DAILY },
      {
        [STORAGE_KEYS.LAST_SYNC_TIME]: '2026-01-01T00:00:00Z',
        [STORAGE_KEYS.RAINDROP_REM_MAP]: { '100': 'rem-1' },
      }
    );
    mockedFetchAll.mockResolvedValue([]);
    mockedFetchTrashed.mockResolvedValue([{ raindropId: 100, highlights: [] }]);

    const result = await performSync(plugin);

    expect(result.archived).toBe(0);
    expect(mockedMove).not.toHaveBeenCalled();
  });

  it('surfaces archive failures as errors', async () => {
    const { plugin, synced } = makePlugin(baseSettings, {
      [STORAGE_KEYS.LAST_SYNC_TIME]: '2026-01-01T00:00:00Z',
      [STORAGE_KEYS.RAINDROP_REM_MAP]: { '100': 'rem-1' },
    });
    mockedFetchAll.mockResolvedValue([]);
    mockedFetchTrashed.mockResolvedValue([{ raindropId: 100, highlights: [] }]);
    mockedMove.mockRejectedValue(new Error('moved away'));

    const result = await performSync(plugin);

    expect(result.archived).toBe(0);
    expect(result.errors).toEqual(['Failed to archive deleted bookmark 100: moved away']);
    expect(synced[STORAGE_KEYS.RAINDROP_REM_MAP]).toEqual({ '100': 'rem-1' });
  });

  it('still imports highlights when trash detection fails, without advancing last sync', async () => {
    const { plugin, synced } = makePlugin(baseSettings, {
      [STORAGE_KEYS.LAST_SYNC_TIME]: '2026-01-01T00:00:00Z',
    });
    mockedFetchAll.mockResolvedValue([makeHighlight({ _id: 'h1' })]);
    mockedFetchTrashed.mockRejectedValue(new Error('search broke'));

    const result = await performSync(plugin);

    expect(result.imported).toBe(1);
    expect(result.errors).toEqual(['Failed to check for deleted bookmarks: search broke']);
    expect(synced[STORAGE_KEYS.LAST_SYNC_TIME]).toBe('2026-01-01T00:00:00Z');
  });

  it('skips when another sync holds the lock and releases the lock afterwards', async () => {
    const { plugin, session } = makePlugin(baseSettings);
    session[STORAGE_KEYS.SYNC_LOCK] = Date.now();

    const result = await performSync(plugin);
    expect(result.skipped).toBe(true);
    expect(mockedFetchAll).not.toHaveBeenCalled();

    // A stale lock is ignored.
    session[STORAGE_KEYS.SYNC_LOCK] = Date.now() - 11 * 60 * 1000;
    mockedFetchAll.mockResolvedValue([]);
    const second = await performSync(plugin);
    expect(second.skipped).toBeUndefined();
    expect(session[STORAGE_KEYS.SYNC_LOCK]).toBeNull();
  });

  it('releases the lock when the sync throws', async () => {
    const { plugin, session } = makePlugin(baseSettings);
    mockedFetchAll.mockRejectedValue(new Error('network'));

    await expect(performSync(plugin)).rejects.toThrow('network');
    expect(session[STORAGE_KEYS.SYNC_LOCK]).toBeNull();
  });
});
