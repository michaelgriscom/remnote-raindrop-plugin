export const SETTING_IDS = {
  API_TOKEN: 'raindrop-api-token',
  IMPORT_LOCATION: 'import-location',
  SYNC_INTERVAL: 'sync-interval-minutes',
  INCLUDE_COLORS: 'include-highlight-colors',
} as const;

export const STORAGE_KEYS = {
  IMPORTED_IDS: 'remnote-raindrop-plugin_imported-highlight-ids',
  HIGHLIGHT_ARTICLE_MAP: 'remnote-raindrop-plugin_highlight-article-map',
  ARTICLE_REM_MAP: 'remnote-raindrop-plugin_article-rem-map',
  LAST_SYNC_TIME: 'remnote-raindrop-plugin_last-sync-time',
  SYNC_STATUS: 'remnote-raindrop-plugin_sync-status',
  SYNC_RESULT: 'remnote-raindrop-plugin_sync-result',
} as const;

export const IMPORT_LOCATIONS = {
  DEDICATED: 'dedicated',
  DAILY: 'daily',
} as const;

export const RAINDROP_ARTICLES_REM_NAME = 'Raindrop Articles';
export const COMPLETED_REM_NAME = 'Raindrop Articles — Completed';
