export const SETTING_IDS = {
  API_TOKEN: 'raindrop-api-token',
  IMPORT_LOCATION: 'import-location',
  SYNC_INTERVAL: 'sync-interval-minutes',
  INCLUDE_COLORS: 'include-highlight-colors',
} as const;

export const STORAGE_KEYS = {
  IMPORTED_IDS: 'imported-highlight-ids',
  LAST_SYNC_TIME: 'last-sync-time',
  SYNC_STATUS: 'sync-status',
  SYNC_RESULT: 'sync-result',
} as const;

export const IMPORT_LOCATIONS = {
  DEDICATED: 'dedicated',
  DAILY: 'daily',
} as const;

export const RAINDROP_ARTICLES_REM_NAME = 'Raindrop Articles';
