# Changelog

## [1.0.0](https://github.com/michaelgriscom/remnote-raindrop-plugin/compare/v0.1.1...v1.0.0) (2026-07-14)


### ⚠ BREAKING CHANGES

* Storage keys are renamed, so previously tracked imported highlight IDs and last sync time will be lost. The first sync after this change will re-import all highlights.

### Features

* detect trashed bookmarks with a single trash search query ([66ae99c](https://github.com/michaelgriscom/remnote-raindrop-plugin/commit/66ae99cbd81fd2472af8f52312d9ee2d684bc398))
* move deleted bookmarks to completed section ([0f0c42e](https://github.com/michaelgriscom/remnote-raindrop-plugin/commit/0f0c42e75ef1b7b8efee637b066ddea96e7f049e)), closes [#8](https://github.com/michaelgriscom/remnote-raindrop-plugin/issues/8)
* show sync errors in right sidebar ([#12](https://github.com/michaelgriscom/remnote-raindrop-plugin/issues/12)) ([4f944a9](https://github.com/michaelgriscom/remnote-raindrop-plugin/commit/4f944a94876318016ec81eb2d9fb9293d2dc403d))


### Bug Fixes

* append new highlights to existing article Rem instead of duplicating ([#11](https://github.com/michaelgriscom/remnote-raindrop-plugin/issues/11)) ([3877be4](https://github.com/michaelgriscom/remnote-raindrop-plugin/commit/3877be46108efa2c232e9816f41c267c32cef482))
* bust Raindrop's server-side response cache and import trashed highlights in daily mode ([1744f60](https://github.com/michaelgriscom/remnote-raindrop-plugin/commit/1744f60d25ee89c2919d0121406c5bc813ccaa45))
* import highlights from trashed bookmarks before archiving ([9fb1aac](https://github.com/michaelgriscom/remnote-raindrop-plugin/commit/9fb1aac9ddcab709beb8ac52b4eb8b1c3269ca68))
* namespace session storage keys to avoid cross-plugin conflicts ([25cce44](https://github.com/michaelgriscom/remnote-raindrop-plugin/commit/25cce4450e9ef670c0fb7bb57dbd06187bf98094))
* prepend new articles and nest completed section inside parent ([0da62ad](https://github.com/michaelgriscom/remnote-raindrop-plugin/commit/0da62ade5dac77380200faaab38d53ecf5e2884d))
* prevent overlapping syncs, duplicate pollers, and stale sidebar errors ([02f9dd3](https://github.com/michaelgriscom/remnote-raindrop-plugin/commit/02f9dd3e8ad5ea4dfd7e796201e0bf59e8d6847b))
* remove unnecessary 5-minute sync interval clamp and document reload requirement ([24ba723](https://github.com/michaelgriscom/remnote-raindrop-plugin/commit/24ba723d341c207a9b7e77356b65ece776c84ee9))
* sort highlights by creation time to preserve source order ([1bebdb9](https://github.com/michaelgriscom/remnote-raindrop-plugin/commit/1bebdb920e900c0061a1d0514f1707a76da91971))
* validate richText before toString in daily section lookup ([29638da](https://github.com/michaelgriscom/remnote-raindrop-plugin/commit/29638da9c9d22290c0c34e7f7bee698b58414207))


### Performance Improvements

* check individual bookmarks instead of fetching entire trash ([39de424](https://github.com/michaelgriscom/remnote-raindrop-plugin/commit/39de42473a4ca9e8311a3a2c41fe4510f8c3961a))

## [0.1.1](https://github.com/michaelgriscom/remnote-raindrop-plugin/compare/v0.1.0...v0.1.1) (2026-02-15)


### Bug Fixes

* add logo for widget tab ([3c2cc2e](https://github.com/michaelgriscom/remnote-raindrop-plugin/commit/3c2cc2eabca4866a54c50145122cf11a10cf2fbe))

## [0.1.0](https://github.com/michaelgriscom/remnote-raindrop-plugin/compare/v0.0.1...v0.1.0) (2026-02-15)


### Features

* implement Raindrop.io highlights import ([e5bf681](https://github.com/michaelgriscom/remnote-raindrop-plugin/commit/e5bf681c0300236e39876c528e115dd93581ffe5))


### Bug Fixes

* change default location to daily ([f88442d](https://github.com/michaelgriscom/remnote-raindrop-plugin/commit/f88442d6ee11fb176ac783c6a553500cf422edb0))
* enable on mobile ([31f8898](https://github.com/michaelgriscom/remnote-raindrop-plugin/commit/31f88986c45b18901e5267aa0afd0b064b2e5d38))
* import upstream fixes ([e48e442](https://github.com/michaelgriscom/remnote-raindrop-plugin/commit/e48e4423d4fe7f8ae610ab2f8ea21b56320ec986))
* sidebar widget visibility, sync interval, and settings polish ([e0a0325](https://github.com/michaelgriscom/remnote-raindrop-plugin/commit/e0a032586a9c5df56bfdff4e74c495f1f6d1bf2c))
