import type { RNPlugin } from '@remnote/plugin-sdk';
import { STORAGE_KEYS } from './constants';
import { SyncResult } from './types';

export function formatSyncSummary(result: SyncResult): string {
  const parts: string[] = [];
  if (result.imported > 0) parts.push(`imported ${result.imported} highlight(s)`);
  if (result.archived > 0) parts.push(`archived ${result.archived} article(s)`);

  if (parts.length === 0) {
    return result.errors.length > 0
      ? 'Sync completed with errors.'
      : 'No new highlights to import.';
  }

  const summary = parts.join(', ') + '.';
  return summary.charAt(0).toUpperCase() + summary.slice(1);
}

/**
 * Persist the outcome of a sync to session storage so the sidebar widget
 * reflects it, and return the human-readable summary for toasts.
 */
export async function recordSyncOutcome(plugin: RNPlugin, result: SyncResult): Promise<string> {
  const summary = formatSyncSummary(result);

  if (result.errors.length > 0) {
    await plugin.storage.setSession(STORAGE_KEYS.SYNC_STATUS, 'error');
    await plugin.storage.setSession(
      STORAGE_KEYS.SYNC_RESULT,
      `${summary} ${result.errors.length} error(s): ${result.errors[0]}`
    );
  } else {
    await plugin.storage.setSession(STORAGE_KEYS.SYNC_STATUS, 'idle');
    await plugin.storage.setSession(STORAGE_KEYS.SYNC_RESULT, summary);
  }

  return summary;
}

export async function recordSyncFailure(
  plugin: RNPlugin,
  err: unknown,
  prefix = 'Sync failed'
): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  await plugin.storage.setSession(STORAGE_KEYS.SYNC_STATUS, 'error');
  await plugin.storage.setSession(STORAGE_KEYS.SYNC_RESULT, `${prefix}: ${message}`);
}
