# Changelog

## [1.0.0](https://github.com/michaelgriscom/remnote-raindrop-plugin/compare/v0.1.1...v1.0.0) (2026-02-19)


### ⚠ BREAKING CHANGES

* Storage keys are renamed, so previously tracked imported highlight IDs and last sync time will be lost. The first sync after this change will re-import all highlights.

### Bug Fixes

* namespace session storage keys to avoid cross-plugin conflicts ([25cce44](https://github.com/michaelgriscom/remnote-raindrop-plugin/commit/25cce4450e9ef670c0fb7bb57dbd06187bf98094))
* remove unnecessary 5-minute sync interval clamp and document reload requirement ([24ba723](https://github.com/michaelgriscom/remnote-raindrop-plugin/commit/24ba723d341c207a9b7e77356b65ece776c84ee9))
* sort highlights by creation time to preserve source order ([1bebdb9](https://github.com/michaelgriscom/remnote-raindrop-plugin/commit/1bebdb920e900c0061a1d0514f1707a76da91971))
* validate richText before toString in daily section lookup ([29638da](https://github.com/michaelgriscom/remnote-raindrop-plugin/commit/29638da9c9d22290c0c34e7f7bee698b58414207))

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
