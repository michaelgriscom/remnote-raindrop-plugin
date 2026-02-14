# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

RemNote plugin (React-based) for Raindrop integration. Built on the RemNote Plugin SDK (https://plugins.remnote.com/) with React 17, TypeScript, Webpack 5, and Tailwind CSS 3. This project follows Conventional Commits standards.

## Commands

- **`npm run dev`** — Start dev server on localhost:8080 with hot reload
- **`npm run build`** — Validate plugin, bundle for production, and create PluginZip.zip
- **`npm run check-types`** — Run TypeScript type checking (no emit)

There are no test or lint scripts configured.

## Architecture

### Plugin Entry Point

[src/widgets/index.tsx](src/widgets/index.tsx) is the main plugin registration file. It uses `declareIndexPlugin` from `@remnote/plugin-sdk` with `onActivate`/`onDeactivate` lifecycle hooks to register settings, commands, and widgets.

### Widget System

All `.tsx` files in [src/widgets/](src/widgets/) are auto-discovered by webpack as entry points. Each widget file gets two bundles: a regular version and a `-sandbox` variant for security isolation. Widgets are React components exported via `renderWidget()` from the SDK.

### Key SDK Patterns

- **Settings:** Registered in `onActivate` via `plugin.settings.registerStringSetting()` etc., read in widgets via `plugin.settings.getSetting<T>()`
- **Commands:** Registered via `plugin.app.registerCommand()`
- **Reactive data:** Use `useTracker()` hook for settings/data that should trigger re-renders
- **Plugin access:** Use `usePlugin()` hook in widget components

### Styling

- Tailwind CSS with PostCSS (configured in [tailwind.config.js](tailwind.config.js) and [postcss.config.js](postcss.config.js))
- RemNote native color classes available: `rn-clr-background-*`, `rn-clr-content-*`
- Shadow DOM support via `:host-context` selectors in [src/style.css](src/style.css)

### Plugin Manifest

[public/manifest.json](public/manifest.json) defines plugin metadata, permissions, and capabilities. Currently configured with read-only access to all data and mobile support disabled.

## Code Style

Prettier is configured: spaces (no tabs), single quotes, trailing commas (es5), 100 char print width. See [.prettierrc](.prettierrc).

## Node Version

Node 16.15.1 (specified in [.nvmrc](.nvmrc)).
