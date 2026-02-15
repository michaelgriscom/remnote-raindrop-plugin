import {
  usePlugin,
  renderWidget,
  useTrackerPlugin,
  useSyncedStorageState,
  useSessionStorageState,
} from '@remnote/plugin-sdk';
import { SETTING_IDS, STORAGE_KEYS } from '../lib/constants';
import { validateToken } from '../lib/raindrop-api';
import { performSync, startPolling } from '../lib/sync-engine';

function formatLastSync(isoString: string | null): string {
  if (!isoString) return 'Never';
  return new Date(isoString).toLocaleString();
}

const RaindropWidget = () => {
  const plugin = usePlugin();

  const token = useTrackerPlugin(
    async (reactivePlugin) => reactivePlugin.settings.getSetting<string>(SETTING_IDS.API_TOKEN),
    []
  );
  const hasToken = !!token && token.trim().length > 0;

  const [lastSyncTime] = useSyncedStorageState<string | null>(STORAGE_KEYS.LAST_SYNC_TIME, null);
  const [syncStatus, setSyncStatus] = useSessionStorageState<string>(
    STORAGE_KEYS.SYNC_STATUS,
    'idle'
  );
  const [syncResult, setSyncResult] = useSessionStorageState<string>(
    STORAGE_KEYS.SYNC_RESULT,
    ''
  );

  const handleManualSync = async () => {
    setSyncStatus('syncing');
    setSyncResult('');
    try {
      const result = await performSync(plugin);
      if (result.errors.length > 0) {
        setSyncResult(
          `Imported ${result.imported} highlights. ${result.errors.length} error(s): ${result.errors[0]}`
        );
      } else {
        setSyncResult(`Imported ${result.imported} new highlight(s).`);
      }
      setSyncStatus('idle');

      // Restart polling after manual sync with current interval
      const interval = await plugin.settings.getSetting<number>(SETTING_IDS.SYNC_INTERVAL);
      if (interval && interval > 0) {
        startPolling(plugin, interval);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setSyncResult(`Sync failed: ${message}`);
      setSyncStatus('error');
    }
  };

  const handleValidateToken = async () => {
    if (!token) return;
    const valid = await validateToken(token);
    if (valid) {
      plugin.app.toast('Raindrop.io token is valid!');
    } else {
      plugin.app.toast('Invalid token. Please check your Raindrop.io API token in settings.');
    }
  };

  return (
    <div className="p-3 m-2 rounded-lg rn-clr-background-light-positive">
      <h1 className="text-lg font-bold mb-3">Raindrop.io Highlights</h1>

      <div className="mb-3">
        <div className="text-sm mb-1">
          <span className="font-medium">Status: </span>
          {hasToken ? (
            <span className="rn-clr-content-positive">Token configured</span>
          ) : (
            <span className="rn-clr-content-negative">
              No token set. Configure in plugin settings.
            </span>
          )}
        </div>
        {hasToken && (
          <button
            className="text-xs underline cursor-pointer mt-1"
            onClick={handleValidateToken}
          >
            Validate Token
          </button>
        )}
      </div>

      <div className="text-sm mb-3">
        <span className="font-medium">Last sync: </span>
        {formatLastSync(lastSyncTime)}
      </div>

      {syncResult && (
        <div className="text-xs mb-3 p-2 rounded rn-clr-background-light-warning">{syncResult}</div>
      )}

      <button
        className="w-full py-2 px-4 rounded text-sm font-medium cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          backgroundColor: hasToken && syncStatus !== 'syncing' ? '#4299e1' : '#a0aec0',
          color: 'white',
        }}
        onClick={handleManualSync}
        disabled={!hasToken || syncStatus === 'syncing'}
      >
        {syncStatus === 'syncing' ? 'Syncing...' : 'Sync Now'}
      </button>
    </div>
  );
};

renderWidget(RaindropWidget);
