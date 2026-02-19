import { RNPlugin } from '@remnote/plugin-sdk';
import { SETTING_IDS, STORAGE_KEYS } from './constants';
import { ArticleWithHighlights, SyncResult } from './types';
import { fetchAllHighlights } from './raindrop-api';
import { importArticle } from './rem-creator';

async function getImportedIds(plugin: RNPlugin): Promise<Set<string>> {
  const stored = await plugin.storage.getSynced<Record<string, boolean>>(STORAGE_KEYS.IMPORTED_IDS);
  return new Set(stored ? Object.keys(stored) : []);
}

async function markAsImported(plugin: RNPlugin, ids: string[]): Promise<void> {
  const existing =
    (await plugin.storage.getSynced<Record<string, boolean>>(STORAGE_KEYS.IMPORTED_IDS)) || {};
  for (const id of ids) {
    existing[id] = true;
  }
  await plugin.storage.setSynced(STORAGE_KEYS.IMPORTED_IDS, existing);
}

async function setLastSyncTime(plugin: RNPlugin, time: string): Promise<void> {
  await plugin.storage.setSynced(STORAGE_KEYS.LAST_SYNC_TIME, time);
}

function groupHighlightsByArticle(
  highlights: { _id: string; text: string; title: string; color: string; note: string; created: string; lastUpdate: string; tags: string[]; link: string }[]
): ArticleWithHighlights[] {
  const articleMap = new Map<string, ArticleWithHighlights>();

  for (const h of highlights) {
    const key = h.link;
    if (!articleMap.has(key)) {
      let domain: string;
      try {
        domain = new URL(h.link).hostname;
      } catch {
        domain = h.link;
      }

      articleMap.set(key, {
        sourceUrl: h.link,
        title: h.title || h.link,
        domain,
        highlights: [],
        lastUpdate: h.lastUpdate || h.created,
      });
    }

    articleMap.get(key)!.highlights.push(h);
  }

  // Sort highlights within each article by creation time (oldest first)
  // so they appear in the same order as in the source text.
  for (const article of articleMap.values()) {
    article.highlights.sort(
      (a, b) => new Date(a.created).getTime() - new Date(b.created).getTime()
    );
  }

  return Array.from(articleMap.values());
}

export async function performSync(plugin: RNPlugin): Promise<SyncResult> {
  const token = await plugin.settings.getSetting<string>(SETTING_IDS.API_TOKEN);
  if (!token || !token.trim()) {
    return { imported: 0, errors: ['No API token configured.'] };
  }

  const allHighlights = await fetchAllHighlights(token);
  const importedIds = await getImportedIds(plugin);

  const newHighlights = allHighlights.filter((h) => !importedIds.has(h._id));

  if (newHighlights.length === 0) {
    await setLastSyncTime(plugin, new Date().toISOString());
    return { imported: 0, errors: [] };
  }

  const articles = groupHighlightsByArticle(newHighlights);

  const importedHighlightIds: string[] = [];
  const errors: string[] = [];

  for (const article of articles) {
    try {
      await importArticle(plugin, article);
      importedHighlightIds.push(...article.highlights.map((h) => h._id));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`Failed to import "${article.title}": ${message}`);
    }
  }

  if (importedHighlightIds.length > 0) {
    await markAsImported(plugin, importedHighlightIds);
  }
  await setLastSyncTime(plugin, new Date().toISOString());

  return { imported: importedHighlightIds.length, errors };
}

let pollingIntervalId: ReturnType<typeof setInterval> | null = null;

export function startPolling(plugin: RNPlugin, intervalMinutes: number): void {
  stopPolling();
  if (intervalMinutes <= 0) return;
  const intervalMs = intervalMinutes * 60 * 1000;

  pollingIntervalId = setInterval(() => {
    performSync(plugin).catch((err) => {
      console.error('[Raindrop] Auto-sync error:', err);
    });
  }, intervalMs);
}

export function stopPolling(): void {
  if (pollingIntervalId !== null) {
    clearInterval(pollingIntervalId);
    pollingIntervalId = null;
  }
}
