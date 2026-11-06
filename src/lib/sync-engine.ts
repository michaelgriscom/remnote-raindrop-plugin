import { RNPlugin } from '@remnote/plugin-sdk';
import { SETTING_IDS, STORAGE_KEYS, IMPORT_LOCATIONS } from './constants';
import { RaindropHighlight, SyncResult } from './types';
import { fetchAllHighlights, fetchTrashedRaindropsSince } from './raindrop-api';
import { groupHighlightsByArticle } from './group-highlights';
import { importArticle, moveArticleToCompleted } from './rem-creator';
import { recordSyncOutcome, recordSyncFailure } from './sync-report';

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

async function getArticleUrlRemMap(plugin: RNPlugin): Promise<Record<string, string>> {
  return (
    (await plugin.storage.getSynced<Record<string, string>>(STORAGE_KEYS.ARTICLE_URL_REM_MAP)) || {}
  );
}

async function updateArticleUrlRemMap(
  plugin: RNPlugin,
  entries: Record<string, string>
): Promise<void> {
  const existing = await getArticleUrlRemMap(plugin);
  Object.assign(existing, entries);
  await plugin.storage.setSynced(STORAGE_KEYS.ARTICLE_URL_REM_MAP, existing);
}

async function removeArticleUrlRemEntriesForRems(
  plugin: RNPlugin,
  remIds: string[]
): Promise<void> {
  const existing = await getArticleUrlRemMap(plugin);
  const targets = new Set(remIds);
  for (const [url, remId] of Object.entries(existing)) {
    if (targets.has(remId)) delete existing[url];
  }
  await plugin.storage.setSynced(STORAGE_KEYS.ARTICLE_URL_REM_MAP, existing);
}

async function setLastSyncTime(plugin: RNPlugin, time: string): Promise<void> {
  await plugin.storage.setSynced(STORAGE_KEYS.LAST_SYNC_TIME, time);
}

interface TrashedBookmark {
  raindropId: string;
  /** Unset when the bookmark was trashed before it was ever synced. */
  remId?: string;
  highlights: RaindropHighlight[];
}

async function detectTrashedBookmarks(plugin: RNPlugin, token: string): Promise<TrashedBookmark[]> {
  const lastSync = await plugin.storage.getSynced<string>(STORAGE_KEYS.LAST_SYNC_TIME);
  // On the first sync nothing has been imported yet, so there is nothing to archive.
  if (!lastSync) return [];

  const raindropRemMap = await getRaindropRemMap(plugin);
  const trashedItems = await fetchTrashedRaindropsSince(token, lastSync);

  return trashedItems
    .map(({ raindropId, highlights }) => ({
      raindropId: String(raindropId),
      remId: raindropRemMap[String(raindropId)],
      highlights,
    }))
    .filter((b) => b.remId || b.highlights.length > 0);
}

// Widgets run in separate iframes, so a module-level flag can't guard against
// concurrent syncs across contexts (e.g. sidebar button vs. auto-poll). Use a
// timestamped session-storage lock instead; the TTL recovers from a context
// that died mid-sync without releasing it.
const SYNC_LOCK_TTL_MS = 10 * 60 * 1000;

async function acquireSyncLock(plugin: RNPlugin): Promise<boolean> {
  const lockedAt = await plugin.storage.getSession<number>(STORAGE_KEYS.SYNC_LOCK);
  if (lockedAt && Date.now() - lockedAt < SYNC_LOCK_TTL_MS) return false;
  await plugin.storage.setSession(STORAGE_KEYS.SYNC_LOCK, Date.now());
  return true;
}

async function releaseSyncLock(plugin: RNPlugin): Promise<void> {
  await plugin.storage.setSession(STORAGE_KEYS.SYNC_LOCK, null);
}

export async function performSync(plugin: RNPlugin): Promise<SyncResult> {
  const token = await plugin.settings.getSetting<string>(SETTING_IDS.API_TOKEN);
  if (!token || !token.trim()) {
    return { imported: 0, archived: 0, errors: ['No API token configured.'] };
  }

  if (!(await acquireSyncLock(plugin))) {
    return { imported: 0, archived: 0, errors: [], skipped: true };
  }

  try {
    return await runSync(plugin, token);
  } finally {
    await releaseSyncLock(plugin);
  }
}

/** Drop repeated highlight ids, keeping the first occurrence. */
export function dedupeHighlights(highlights: RaindropHighlight[]): RaindropHighlight[] {
  const seen = new Set<string>();
  return highlights.filter((h) => {
    if (seen.has(h._id)) return false;
    seen.add(h._id);
    return true;
  });
}

async function runSync(plugin: RNPlugin, token: string): Promise<SyncResult> {
  const location = await plugin.settings.getSetting<string>(SETTING_IDS.IMPORT_LOCATION);
  const errors: string[] = [];

  // Detect trashed bookmarks upfront so we can import their highlights before
  // archiving. A failure here shouldn't block importing new highlights; report
  // it and leave the last-sync time alone so the next run re-covers the window.
  let trashedBookmarks: TrashedBookmark[] = [];
  let trashDetectionFailed = false;
  try {
    trashedBookmarks = await detectTrashedBookmarks(plugin, token);
  } catch (err) {
    trashDetectionFailed = true;
    const message = err instanceof Error ? err.message : String(err);
    errors.push(`Failed to check for deleted bookmarks: ${message}`);
  }

  const [allHighlights, importedIds] = await Promise.all([
    fetchAllHighlights(token),
    getImportedIds(plugin),
  ]);

  // A highlight can show up in both feeds (e.g. a bookmark trashed after the
  // highlights feed was cached), so dedupe before importing.
  const trashedHighlights = trashedBookmarks.flatMap((b) => b.highlights);
  const newHighlights = dedupeHighlights([...allHighlights, ...trashedHighlights]).filter(
    (h) => !importedIds.has(h._id)
  );

  // Trashed bookmarks may still need archiving even when there is nothing new
  // to import (e.g. all their highlights were imported in an earlier sync).
  if (newHighlights.length === 0 && trashedBookmarks.length === 0) {
    if (!trashDetectionFailed) await setLastSyncTime(plugin, new Date().toISOString());
    return { imported: 0, archived: 0, errors };
  }

  const articles = groupHighlightsByArticle(newHighlights);
  const articleUrlRemMap = await getArticleUrlRemMap(plugin);

  const importedHighlightIds: string[] = [];
  const newRaindropRemEntries: Record<string, string> = {};
  const newArticleUrlRemEntries: Record<string, string> = {};

  for (const article of articles) {
    try {
      const existingRemId = articleUrlRemMap[article.sourceUrl];
      const result = await importArticle(plugin, article, existingRemId);
      importedHighlightIds.push(...result.importedHighlightIds);
      errors.push(...result.errors);

      // Store raindropRef → remId mappings for trash detection. Several
      // bookmarks (e.g. the same URL saved to two collections) can share an
      // article, and trashing any of them should find the Rem.
      for (const h of article.highlights) {
        newRaindropRemEntries[String(h.raindropRef)] = result.articleRemId;
      }
      newArticleUrlRemEntries[article.sourceUrl] = result.articleRemId;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`Failed to import "${article.title}": ${message}`);
    }
  }

  // Record the article Rems even when some highlights failed, so retries of
  // those highlights land in the same article rather than a duplicate.
  if (Object.keys(newArticleUrlRemEntries).length > 0) {
    if (importedHighlightIds.length > 0) await markAsImported(plugin, importedHighlightIds);
    await updateRaindropRemMap(plugin, newRaindropRemEntries);
    await updateArticleUrlRemMap(plugin, newArticleUrlRemEntries);
  }

  // Archive trashed bookmarks after their highlights have been imported. Only
  // the dedicated location has a Completed section to move them to; in daily
  // mode articles keep their place in whichever day's document they landed in.
  let archived = 0;
  const archivedIds: string[] = [];
  const archivedRemIds: string[] = [];
  if (location === IMPORT_LOCATIONS.DEDICATED) {
    for (const { raindropId, remId } of trashedBookmarks) {
      // A bookmark trashed before it was ever synced gets its Rem created by the
      // import above; pick the id up from this sync's new entries.
      const targetRemId = remId ?? newRaindropRemEntries[raindropId];
      if (!targetRemId) continue;
      try {
        await moveArticleToCompleted(plugin, targetRemId);
        archived++;
        archivedIds.push(raindropId);
        archivedRemIds.push(targetRemId);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push(`Failed to archive deleted bookmark ${raindropId}: ${message}`);
      }
    }
    if (archivedIds.length > 0) {
      await removeRaindropRemEntries(plugin, archivedIds);
      // Forget the URL mapping too: if the bookmark is restored and highlighted
      // again, the new highlights should start a fresh article rather than be
      // appended under Completed.
      await removeArticleUrlRemEntriesForRems(plugin, archivedRemIds);
    }
  }

  if (!trashDetectionFailed) await setLastSyncTime(plugin, new Date().toISOString());

  return { imported: importedHighlightIds.length, archived, errors };
}

let pollingIntervalId: ReturnType<typeof setInterval> | null = null;

export function startPolling(plugin: RNPlugin, intervalMinutes: number): void {
  stopPolling();
  if (intervalMinutes <= 0) return;
  const intervalMs = intervalMinutes * 60 * 1000;

  pollingIntervalId = setInterval(async () => {
    try {
      // The token may have been cleared since polling started; don't nag
      // about it every interval.
      const token = await plugin.settings.getSetting<string>(SETTING_IDS.API_TOKEN);
      if (!token || !token.trim()) return;

      const result = await performSync(plugin);
      if (result.skipped) return;
      await recordSyncOutcome(plugin, result);
      if (result.errors.length > 0) {
        await plugin.app.toast(
          'Raindrop auto-sync completed with errors. Check the Raindrop sidebar tab for details.'
        );
      }
    } catch (err) {
      console.error('[Raindrop] Auto-sync error:', err);
      await recordSyncFailure(plugin, err, 'Auto-sync failed');
      await plugin.app.toast(
        'Raindrop auto-sync failed. Check the Raindrop sidebar tab for details.'
      );
    }
  }, intervalMs);
}

export function stopPolling(): void {
  if (pollingIntervalId !== null) {
    clearInterval(pollingIntervalId);
    pollingIntervalId = null;
  }
}
