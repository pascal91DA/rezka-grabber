# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Android-focused React Native app (bare Expo workflow — `android/` is committed, no managed prebuild). Searches, plays, and downloads movies/series from rezka.ag. No working iOS target. New Architecture is enabled (`newArchEnabled: true`), Hermes engine.

- React Native 0.81.5 · React 19 · Expo SDK 54 · TypeScript (strict)
- Navigation: React Navigation 7 (bottom tabs + native stack)
- Storage: AsyncStorage (history, watched list, blacklist)
- HTTP: axios · HTML parsing: htmlparser2-without-node-native

## Commands

- `npm start` — Metro dev server (`expo start`)
- `npm run android` — `expo run:android`: build debug, install, and run on a connected device/emulator
- `npm test` / `npm run test:watch` / `npm run test:coverage` — Jest (preset `jest-expo`)
- Single test: `npm test -- -t 'partial test name'`
- `npm run proxy` — Node proxy on port 3001 for rezka.ag requests (CORS/redirect handling); only needed for web
- `npm run web:dev` — proxy + web bundler together (web dev only)

Tests live in `src/__tests__/**/*.test.ts`. Build tooling needs JDK 17 and the Android SDK.

## Release APK

Built directly with Gradle (no CI/EAS in regular use):
```
cd android && ./gradlew assembleRelease
```
Output: `android/app/build/outputs/apk/release/app-release.apk`. Release currently uses the debug keystore — swap before any real distribution.

## Gotchas

- **rezka.ag scraping is fragile.** `src/services/rezkaService.ts` and `src/utils/streamParser.ts` parse the site's HTML; site changes silently break search/playback. When something stops working, check the parsers against current page markup before assuming a code bug.
- Clear-text HTTP is enabled (`usesCleartextTraffic: true`) because rezka.ag serves over HTTP.
- No ESLint/Prettier config — match the style of surrounding code.
- Mixed JS/TS: `App.js`/`index.js` are JS with JSDoc; everything under `src/` is strict TypeScript.

## Layout

`src/screens/` (one file per screen) · `src/services/` (rezka, downloads, hls, history, watched, blacklist) · `src/components/` · `src/context/` (TimerContext) · `src/types/` · `src/utils/` (streamParser, vttParser).
