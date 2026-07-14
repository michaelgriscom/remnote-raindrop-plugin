import { RaindropHighlight, HighlightsResponse } from './types';

const BASE_URL = 'https://api.raindrop.io/rest/v1';

async function request<T>(
  token: string,
  path: string,
  params?: Record<string, string>
): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  // Raindrop's API caches GET responses per URL server-side (x-api-cache),
  // and sync requests repeat the same URL, so bust the cache with a nonce or
  // results go stale — e.g. trash searches missing recently deleted bookmarks.
  url.searchParams.set('_', String(Date.now()));

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (response.status === 401) {
    throw new Error('Invalid Raindrop.io API token. Please check your settings.');
  }
  if (response.status === 429) {
    throw new Error('Raindrop.io rate limit exceeded. Please wait and try again.');
  }
  if (!response.ok) {
    throw new Error(`Raindrop.io API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

export async function validateToken(token: string): Promise<boolean> {
  try {
    await request(token, '/user');
    return true;
  } catch {
    return false;
  }
}

const PAGE_SIZE = 50;

export async function fetchAllHighlights(token: string): Promise<RaindropHighlight[]> {
  const allHighlights: RaindropHighlight[] = [];
  let page = 0;

  while (true) {
    const response = await request<HighlightsResponse>(token, '/highlights', {
      page: String(page),
      perpage: String(PAGE_SIZE),
    });

    if (!response.result || response.items.length === 0) {
      break;
    }

    allHighlights.push(...response.items);

    if (response.items.length < PAGE_SIZE) {
      break;
    }

    page++;
  }

  return allHighlights;
}

const TRASH_COLLECTION_ID = -99;

interface EmbeddedHighlight {
  _id: string;
  text: string;
  note?: string;
  color?: string;
  created: string;
  lastUpdate?: string;
}

interface RaindropItem {
  _id: number;
  link: string;
  title: string;
  tags?: string[];
  highlights?: EmbeddedHighlight[];
}

interface RaindropsResponse {
  result: boolean;
  items: RaindropItem[];
}

export interface TrashedRaindrop {
  raindropId: number;
  highlights: RaindropHighlight[];
}

// The lastUpdate search operator only has day granularity, so back the cutoff
// up a full day; the imported-ids set dedupes anything seen twice.
export function trashSearchCutoff(sinceIso: string): string {
  const cutoff = new Date(new Date(sinceIso).getTime() - 24 * 60 * 60 * 1000);
  return cutoff.toISOString().slice(0, 10);
}

// A raindrop's embedded highlights lack the article fields that the
// /highlights feed includes, so fold them in from the parent item.
export function itemToHighlights(item: RaindropItem): RaindropHighlight[] {
  return (item.highlights ?? []).map((h) => ({
    _id: h._id,
    raindropRef: item._id,
    text: h.text,
    title: item.title,
    color: h.color ?? '',
    note: h.note ?? '',
    created: h.created,
    lastUpdate: h.lastUpdate ?? h.created,
    tags: item.tags ?? [],
    link: item.link,
  }));
}

/**
 * Fetch bookmarks moved to (or modified in) the trash since `sinceIso`.
 * Trashing bumps a bookmark's lastUpdate, so one bounded search on the trash
 * collection finds recent deletions — including bookmarks that were trashed
 * before they were ever synced — without checking tracked bookmarks
 * individually.
 */
export async function fetchTrashedRaindropsSince(
  token: string,
  sinceIso: string
): Promise<TrashedRaindrop[]> {
  const search = `lastUpdate:>${trashSearchCutoff(sinceIso)}`;
  const trashed: TrashedRaindrop[] = [];
  let page = 0;

  while (true) {
    const response = await request<RaindropsResponse>(token, `/raindrops/${TRASH_COLLECTION_ID}`, {
      page: String(page),
      perpage: String(PAGE_SIZE),
      search,
    });

    if (!response.result || response.items.length === 0) {
      break;
    }

    for (const item of response.items) {
      trashed.push({ raindropId: item._id, highlights: itemToHighlights(item) });
    }

    if (response.items.length < PAGE_SIZE) {
      break;
    }

    page++;
  }

  return trashed;
}
