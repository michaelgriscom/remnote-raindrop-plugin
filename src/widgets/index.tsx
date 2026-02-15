import { declareIndexPlugin, ReactRNPlugin, WidgetLocation } from '@remnote/plugin-sdk';
import '../style.css';
import '../App.css';
import { SETTING_IDS, IMPORT_LOCATIONS } from '../lib/constants';
import { performSync, startPolling, stopPolling } from '../lib/sync-engine';

async function onActivate(plugin: ReactRNPlugin) {
  await plugin.settings.registerStringSetting({
    id: SETTING_IDS.API_TOKEN,
    title: 'Raindrop.io API Token',
    description:
      'Go to app.raindrop.io/settings/integrations, create an app, and copy the Test token.',
    defaultValue: '',
  });

  await plugin.settings.registerDropdownSetting({
    id: SETTING_IDS.IMPORT_LOCATION,
    title: 'Import Location',
    description: 'Where to import highlighted articles.',
    defaultValue: IMPORT_LOCATIONS.DEDICATED,
    options: [
      {
        key: IMPORT_LOCATIONS.DEDICATED,
        label: 'Raindrop Highlights Rem',
        value: IMPORT_LOCATIONS.DEDICATED,
      },
      {
        key: IMPORT_LOCATIONS.DAILY,
        label: 'Daily Document',
        value: IMPORT_LOCATIONS.DAILY,
      },
    ],
  });

  await plugin.settings.registerNumberSetting({
    id: SETTING_IDS.SYNC_INTERVAL,
    title: 'Sync Interval (minutes)',
    description: 'How often to automatically sync highlights. Minimum 5 minutes.',
    defaultValue: 30,
  });

  await plugin.settings.registerBooleanSetting({
    id: SETTING_IDS.INCLUDE_NOTES,
    title: 'Include Highlight Notes',
    description: 'Import user notes attached to highlights as child Rem.',
    defaultValue: true,
  });

  await plugin.settings.registerBooleanSetting({
    id: SETTING_IDS.INCLUDE_COLORS,
    title: 'Include Highlight Colors',
    description: 'Map Raindrop highlight colors to RemNote highlight colors.',
    defaultValue: true,
  });

  await plugin.app.registerCommand({
    id: 'sync-raindrop',
    name: 'Sync Raindrop Highlights',
    description: 'Manually sync highlights from Raindrop.io',
    action: async () => {
      const token = await plugin.settings.getSetting<string>(SETTING_IDS.API_TOKEN);
      if (!token || !token.trim()) {
        await plugin.app.toast('Please configure your Raindrop.io API token in settings.');
        return;
      }

      await plugin.app.toast('Syncing Raindrop highlights...');
      try {
        const result = await performSync(plugin);
        if (result.errors.length > 0) {
          await plugin.app.toast(
            `Imported ${result.imported} highlights with ${result.errors.length} error(s).`
          );
        } else {
          await plugin.app.toast(`Imported ${result.imported} new highlights.`);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await plugin.app.toast(`Sync failed: ${message}`);
      }
    },
  });

  await plugin.app.registerWidget('raindrop_widget', WidgetLocation.RightSidebar, {
    dimensions: { height: 'auto', width: '100%' },
  });

  // Start auto-polling if a token is configured
  const token = await plugin.settings.getSetting<string>(SETTING_IDS.API_TOKEN);
  if (token && token.trim()) {
    const interval = await plugin.settings.getSetting<number>(SETTING_IDS.SYNC_INTERVAL);
    startPolling(plugin, interval || 30);
  }
}

async function onDeactivate(_: ReactRNPlugin) {
  stopPolling();
}

declareIndexPlugin(onActivate, onDeactivate);
