import { RaindropHighlight, HighlightsResponse } from './types';

const BASE_URL = 'https://api.raindrop.io/rest/v1';

async function request<T>(token: string, path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }

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

export async function fetchAllHighlights(token: string): Promise<RaindropHighlight[]> {
  const allHighlights: RaindropHighlight[] = [];
  let page = 0;

  while (true) {
    const response = await request<HighlightsResponse>(token, '/highlights', {
      page: String(page),
      perpage: '50',
    });

    if (!response.result || response.items.length === 0) {
      break;
    }

    allHighlights.push(...response.items);

    if (response.items.length < 50) {
      break;
    }

    page++;
  }

  return allHighlights;
}
