import { RNPlugin } from '@remnote/plugin-sdk';
import { SETTING_IDS, STORAGE_KEYS, IMPORT_LOCATIONS } from './constants';
import { ArticleWithHighlights, SyncResult } from './types';
import { fetchAllHighlights } from './raindrop-api';
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

async function removeImportedIds(plugin: RNPlugin, ids: string[]): Promise<void> {
  const existing =
    (await plugin.storage.getSynced<Record<string, boolean>>(STORAGE_KEYS.IMPORTED_IDS)) || {};
  for (const id of ids) {
    delete existing[id];
  }
  await plugin.storage.setSynced(STORAGE_KEYS.IMPORTED_IDS, existing);
}

async function getHighlightArticleMap(plugin: RNPlugin): Promise<Record<string, string>> {
  return (
    (await plugin.storage.getSynced<Record<string, string>>(STORAGE_KEYS.HIGHLIGHT_ARTICLE_MAP)) ||
    {}
  );
}

async function updateHighlightArticleMap(
  plugin: RNPlugin,
  entries: Record<string, string>
): Promise<void> {
  const existing = await getHighlightArticleMap(plugin);
  Object.assign(existing, entries);
  await plugin.storage.setSynced(STORAGE_KEYS.HIGHLIGHT_ARTICLE_MAP, existing);
}

async function removeHighlightArticleEntries(plugin: RNPlugin, ids: string[]): Promise<void> {
  const existing = await getHighlightArticleMap(plugin);
  for (const id of ids) {
    delete existing[id];
  }
  await plugin.storage.setSynced(STORAGE_KEYS.HIGHLIGHT_ARTICLE_MAP, existing);
}

async function getArticleRemMap(plugin: RNPlugin): Promise<Record<string, string>> {
  return (
    (await plugin.storage.getSynced<Record<string, string>>(STORAGE_KEYS.ARTICLE_REM_MAP)) || {}
  );
}

async function updateArticleRemMap(
  plugin: RNPlugin,
  entries: Record<string, string>
): Promise<void> {
  const existing = await getArticleRemMap(plugin);
  Object.assign(existing, entries);
  await plugin.storage.setSynced(STORAGE_KEYS.ARTICLE_REM_MAP, existing);
}

async function removeArticleRemEntries(plugin: RNPlugin, urls: string[]): Promise<void> {
  const existing = await getArticleRemMap(plugin);
  for (const url of urls) {
    delete existing[url];
  }
  await plugin.storage.setSynced(STORAGE_KEYS.ARTICLE_REM_MAP, existing);
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

async function archiveDeletedArticles(
  plugin: RNPlugin,
  currentHighlightIds: Set<string>,
  importedIds: Set<string>
): Promise<number> {
  const deletedIds = [...importedIds].filter((id) => !currentHighlightIds.has(id));
  if (deletedIds.length === 0) return 0;

  const highlightArticleMap = await getHighlightArticleMap(plugin);
  const articleRemMap = await getArticleRemMap(plugin);

  // Group deleted highlight IDs by article URL
  const deletedByArticle = new Map<string, string[]>();
  for (const id of deletedIds) {
    const articleUrl = highlightArticleMap[id];
    if (!articleUrl) continue;
    if (!deletedByArticle.has(articleUrl)) {
      deletedByArticle.set(articleUrl, []);
    }
    deletedByArticle.get(articleUrl)!.push(id);
  }

  // Check which articles have ALL their highlights deleted
  const articlesToArchive: string[] = [];
  for (const [articleUrl, deletedHighlightIds] of deletedByArticle) {
    // Count how many imported highlights still exist for this article
    const allArticleHighlightIds = Object.entries(highlightArticleMap)
      .filter(([, url]) => url === articleUrl)
      .map(([id]) => id);

    const remainingIds = allArticleHighlightIds.filter((id) => !deletedHighlightIds.includes(id));
    if (remainingIds.length === 0) {
      articlesToArchive.push(articleUrl);
    }
  }

  let archivedCount = 0;
  const allDeletedHighlightIds: string[] = [];
  for (const articleUrl of articlesToArchive) {
    const remId = articleRemMap[articleUrl];
    if (!remId) continue;

    try {
      await moveArticleToCompleted(plugin, remId);
      archivedCount++;
    } catch (err) {
      console.error(`[Raindrop] Failed to archive "${articleUrl}":`, err);
      continue;
    }

    // Collect all highlight IDs for this article for cleanup
    const articleHighlightIds = Object.entries(highlightArticleMap)
      .filter(([, url]) => url === articleUrl)
      .map(([id]) => id);
    allDeletedHighlightIds.push(...articleHighlightIds);
  }

  // Clean up storage for archived articles
  if (allDeletedHighlightIds.length > 0) {
    await removeImportedIds(plugin, allDeletedHighlightIds);
    await removeHighlightArticleEntries(plugin, allDeletedHighlightIds);
  }
  if (articlesToArchive.length > 0) {
    await removeArticleRemEntries(plugin, articlesToArchive);
  }

  return archivedCount;
}

export async function performSync(plugin: RNPlugin): Promise<SyncResult> {
  const token = await plugin.settings.getSetting<string>(SETTING_IDS.API_TOKEN);
  if (!token || !token.trim()) {
    return { imported: 0, archived: 0, errors: ['No API token configured.'] };
  }

  const allHighlights = await fetchAllHighlights(token);
  const importedIds = await getImportedIds(plugin);
  const location = await plugin.settings.getSetting<string>(SETTING_IDS.IMPORT_LOCATION);

  // Detect and archive deleted bookmarks (dedicated mode only)
  let archived = 0;
  if (location === IMPORT_LOCATIONS.DEDICATED && importedIds.size > 0) {
    const currentHighlightIds = new Set(allHighlights.map((h) => h._id));
    archived = await archiveDeletedArticles(plugin, currentHighlightIds, importedIds);
  }

  const newHighlights = allHighlights.filter((h) => !importedIds.has(h._id));

  if (newHighlights.length === 0) {
    await setLastSyncTime(plugin, new Date().toISOString());
    return { imported: 0, archived, errors: [] };
  }

  const articles = groupHighlightsByArticle(newHighlights);

  const importedHighlightIds: string[] = [];
  const errors: string[] = [];
  const newHighlightArticleEntries: Record<string, string> = {};
  const newArticleRemEntries: Record<string, string> = {};

  for (const article of articles) {
    try {
      const articleRemId = await importArticle(plugin, article);
      importedHighlightIds.push(...article.highlights.map((h) => h._id));

      // Store mappings for future deletion detection
      for (const h of article.highlights) {
        newHighlightArticleEntries[h._id] = article.sourceUrl;
      }
      newArticleRemEntries[article.sourceUrl] = articleRemId;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`Failed to import "${article.title}": ${message}`);
    }
  }

  if (importedHighlightIds.length > 0) {
    await markAsImported(plugin, importedHighlightIds);
    await updateHighlightArticleMap(plugin, newHighlightArticleEntries);
    await updateArticleRemMap(plugin, newArticleRemEntries);
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
