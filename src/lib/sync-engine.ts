import { RNPlugin } from '@remnote/plugin-sdk';
import { SETTING_IDS, STORAGE_KEYS, IMPORT_LOCATIONS } from './constants';
import { ArticleWithHighlights, SyncResult } from './types';
import { fetchAllHighlights, fetchTrashedRaindropIds } from './raindrop-api';
import { importArticle, moveArticleToCompleted } from './rem-creator';

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

async function getRaindropRemMap(plugin: RNPlugin): Promise<Record<string, string>> {
  return (
    (await plugin.storage.getSynced<Record<string, string>>(STORAGE_KEYS.RAINDROP_REM_MAP)) || {}
  );
}

async function updateRaindropRemMap(
  plugin: RNPlugin,
  entries: Record<string, string>
): Promise<void> {
  const existing = await getRaindropRemMap(plugin);
  Object.assign(existing, entries);
  await plugin.storage.setSynced(STORAGE_KEYS.RAINDROP_REM_MAP, existing);
}

async function removeRaindropRemEntries(plugin: RNPlugin, ids: string[]): Promise<void> {
  const existing = await getRaindropRemMap(plugin);
  for (const id of ids) {
    delete existing[id];
  }
  await plugin.storage.setSynced(STORAGE_KEYS.RAINDROP_REM_MAP, existing);
}

async function setLastSyncTime(plugin: RNPlugin, time: string): Promise<void> {
  await plugin.storage.setSynced(STORAGE_KEYS.LAST_SYNC_TIME, time);
}

function groupHighlightsByArticle(
  highlights: { _id: string; raindropRef: number; text: string; title: string; color: string; note: string; created: string; lastUpdate: string; tags: string[]; link: string }[]
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

async function archiveTrashedBookmarks(
  plugin: RNPlugin,
  token: string
): Promise<number> {
  const raindropRemMap = await getRaindropRemMap(plugin);
  const trackedRaindropIds = Object.keys(raindropRemMap);
  if (trackedRaindropIds.length === 0) return 0;

  const trashedIds = await fetchTrashedRaindropIds(token);
  if (trashedIds.size === 0) return 0;

  const toArchive = trackedRaindropIds.filter((id) => trashedIds.has(Number(id)));
  if (toArchive.length === 0) return 0;

  let archivedCount = 0;
  const archivedIds: string[] = [];
  for (const raindropId of toArchive) {
    const remId = raindropRemMap[raindropId];
    try {
      await moveArticleToCompleted(plugin, remId);
      archivedCount++;
      archivedIds.push(raindropId);
    } catch (err) {
      console.error(`[Raindrop] Failed to archive raindrop ${raindropId}:`, err);
    }
  }

  if (archivedIds.length > 0) {
    await removeRaindropRemEntries(plugin, archivedIds);
  }

  return archivedCount;
}

export async function performSync(plugin: RNPlugin): Promise<SyncResult> {
  const token = await plugin.settings.getSetting<string>(SETTING_IDS.API_TOKEN);
  if (!token || !token.trim()) {
    return { imported: 0, archived: 0, errors: ['No API token configured.'] };
  }

  const location = await plugin.settings.getSetting<string>(SETTING_IDS.IMPORT_LOCATION);

  // Detect and archive trashed bookmarks (dedicated mode only)
  let archived = 0;
  if (location === IMPORT_LOCATIONS.DEDICATED) {
    archived = await archiveTrashedBookmarks(plugin, token);
  }

  const allHighlights = await fetchAllHighlights(token);
  const importedIds = await getImportedIds(plugin);

  const newHighlights = allHighlights.filter((h) => !importedIds.has(h._id));

  if (newHighlights.length === 0) {
    await setLastSyncTime(plugin, new Date().toISOString());
    return { imported: 0, archived, errors: [] };
  }

  const articles = groupHighlightsByArticle(newHighlights);

  const importedHighlightIds: string[] = [];
  const errors: string[] = [];
  const newRaindropRemEntries: Record<string, string> = {};

  for (const article of articles) {
    try {
      const articleRemId = await importArticle(plugin, article);
      importedHighlightIds.push(...article.highlights.map((h) => h._id));

      // Store raindropRef → remId mapping for trash detection
      const raindropRef = article.highlights[0].raindropRef;
      newRaindropRemEntries[String(raindropRef)] = articleRemId;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`Failed to import "${article.title}": ${message}`);
    }
  }

  if (importedHighlightIds.length > 0) {
    await markAsImported(plugin, importedHighlightIds);
    await updateRaindropRemMap(plugin, newRaindropRemEntries);
  }
  await setLastSyncTime(plugin, new Date().toISOString());

  return { imported: importedHighlightIds.length, archived, errors };
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
