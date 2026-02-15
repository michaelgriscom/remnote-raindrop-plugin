# Raindrop.io Highlights

A RemNote plugin that imports highlighted passages from your Raindrop.io bookmarks.

## Features

- Automatically polls Raindrop.io for new highlights
- Imports articles with their highlighted passages into RemNote
- Supports importing into a dedicated "Raindrop Highlights" document or the Daily Document
- Deduplicates to avoid re-importing the same highlights
- (optionally) Preserves highlight colors and user notes

## Setup

1. Install the plugin in RemNote
2. Go to [Raindrop.io Integrations](https://app.raindrop.io/settings/integrations)
3. Create a new app and copy the **Test token**
4. Paste the token into the plugin's "Raindrop.io API Token" setting
5. Click "Sync Now" in the sidebar widget or wait for automatic sync

## Settings

- **API Token**: Your Raindrop.io test token
- **Import Location**: Choose between a dedicated Rem or the Daily Document
- **Sync Interval**: How often to auto-sync (default: 30 minutes, minimum: 5). Set to 0 to disable.
- **Include Highlight Notes**: Import user notes attached to highlights
- **Include Highlight Colors**: Preserve highlight colors from Raindrop when importing
