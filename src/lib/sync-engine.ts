import { RNPlugin } from '@remnote/plugin-sdk';
import { SETTING_IDS, STORAGE_KEYS, IMPORT_LOCATIONS } from './constants';
import { RaindropHighlight, SyncResult } from './types';
import { fetchAllHighlights, fetchHighlightsForRaindrop, isRaindropTrashed } from './raindrop-api';
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

async function setLastSyncTime(plugin: RNPlugin, time: string): Promise<void> {
  await plugin.storage.setSynced(STORAGE_KEYS.LAST_SYNC_TIME, time);
}

interface TrashedBookmark {
  raindropId: string;
  remId: string;
  highlights: RaindropHighlight[];
}

async function detectTrashedBookmarks(plugin: RNPlugin, token: string): Promise<TrashedBookmark[]> {
  const raindropRemMap = await getRaindropRemMap(plugin);
  const trackedRaindropIds = Object.keys(raindropRemMap);
  if (trackedRaindropIds.length === 0) return [];

  const trashed: TrashedBookmark[] = [];
  for (const raindropId of trackedRaindropIds) {
    if (!(await isRaindropTrashed(token, Number(raindropId)))) continue;
    const highlights = await fetchHighlightsForRaindrop(token, Number(raindropId));
    trashed.push({ raindropId, remId: raindropRemMap[raindropId], highlights });
  }
  return trashed;
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

async function runSync(plugin: RNPlugin, token: string): Promise<SyncResult> {
  const location = await plugin.settings.getSetting<string>(SETTING_IDS.IMPORT_LOCATION);

  // Detect trashed bookmarks upfront so we can import their highlights before archiving
  let trashedBookmarks: TrashedBookmark[] = [];
  if (location === IMPORT_LOCATIONS.DEDICATED) {
    trashedBookmarks = await detectTrashedBookmarks(plugin, token);
  }

  const [allHighlights, importedIds] = await Promise.all([
    fetchAllHighlights(token),
    getImportedIds(plugin),
  ]);

  const trashedHighlights = trashedBookmarks.flatMap((b) => b.highlights);
  const newHighlights = [...allHighlights, ...trashedHighlights].filter(
    (h) => !importedIds.has(h._id)
  );

  const errors: string[] = [];

  if (newHighlights.length === 0) {
    await setLastSyncTime(plugin, new Date().toISOString());
    return { imported: 0, archived: 0, errors: [] };
  }

  const articles = groupHighlightsByArticle(newHighlights);
  const articleUrlRemMap = await getArticleUrlRemMap(plugin);

  const importedHighlightIds: string[] = [];
  const newRaindropRemEntries: Record<string, string> = {};
  const newArticleUrlRemEntries: Record<string, string> = {};

  for (const article of articles) {
    try {
      const existingRemId = articleUrlRemMap[article.sourceUrl];
      const articleRemId = await importArticle(plugin, article, existingRemId);
      importedHighlightIds.push(...article.highlights.map((h) => h._id));

      // Store raindropRef → remId mapping for trash detection
      const raindropRef = article.highlights[0].raindropRef;
      newRaindropRemEntries[String(raindropRef)] = articleRemId;
      newArticleUrlRemEntries[article.sourceUrl] = articleRemId;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`Failed to import "${article.title}": ${message}`);
    }
  }

  if (importedHighlightIds.length > 0) {
    await markAsImported(plugin, importedHighlightIds);
    await updateRaindropRemMap(plugin, newRaindropRemEntries);
    await updateArticleUrlRemMap(plugin, newArticleUrlRemEntries);
  }

  // Archive trashed bookmarks after their highlights have been imported
  let archived = 0;
  const archivedIds: string[] = [];
  for (const { raindropId, remId } of trashedBookmarks) {
    try {
      await moveArticleToCompleted(plugin, remId);
      archived++;
      archivedIds.push(raindropId);
    } catch (err) {
      console.error(`[Raindrop] Failed to archive raindrop ${raindropId}:`, err);
    }
  }
  if (archivedIds.length > 0) {
    await removeRaindropRemEntries(plugin, archivedIds);
  }

  await setLastSyncTime(plugin, new Date().toISOString());

  return { imported: importedHighlightIds.length, archived, errors };
}

let pollingIntervalId: ReturnType<typeof setInterval> | null = null;

export function startPolling(plugin: RNPlugin, intervalMinutes: number): void {
  stopPolling();
  if (intervalMinutes <= 0) return;
  const intervalMs = intervalMinutes * 60 * 1000;

  pollingIntervalId = setInterval(async () => {
    try {
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
