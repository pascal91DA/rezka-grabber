# Rezka Grabber

A React Native app for searching and watching movies/series from rezka.ag directly on your device.

## Features

- Search movies and series by title
- Multiple dubbing/translation options
- Season and episode selection for series
- Built-in video player with fullscreen support
- Auto-play: automatically advances to the next episode
- Next episode pre-loading for seamless playback
- Watch history and "Continue watching" shortcut

## Requirements

- Node.js 18+
- Android Studio (for Android) or Xcode on macOS (for iOS)

## Setup

```bash
npm install
```

## Running

```bash
# Android
npm run android

# iOS (macOS only)
npm run ios

# Expo Go (scan QR with the Expo Go app)
npm start
```

## How to Use

### 1. Search
Type a movie or series title in the search bar and press **Search**. Results appear as cards with poster, title, and year.

### 2. Continue Watching
If you have a watch history, a **Continue Watching** banner appears at the top of the search screen. Tap it to resume from the last watched episode.

### 3. Player Screen
Tap any search result to open the player. Before playback starts:

| Step | What to do |
|------|-----------|
| **Translation** | Pick a dubbing/subtitle track from the horizontal list |
| **Season** | Select a season (series only) |
| **Episode** | Select an episode (series only) |
| **Load** | Tap **Load video** — the app fetches and plays the stream |

- The player retries automatically up to 5 times if a stream URL fails.
- A quality badge (e.g. `1080p`) is shown in the top-right corner of the video.

### 4. Auto-play
Toggle **Auto-play** at the bottom of the player screen. When enabled, the next episode starts automatically when the current one ends. The title of the upcoming episode is shown below the toggle.

### 5. Watch History
Every successfully loaded video is saved to history. The 10 most recent titles appear on the search screen below the search bar.

## Project Structure

```
src/
├── components/
│   └── MovieCard.tsx          # Search result card
├── screens/
│   ├── SearchScreen.tsx        # Search + history
│   └── PlayerScreen.tsx        # Video player + selectors
├── services/
│   ├── rezkaService.ts         # HTML parsing & stream URL extraction
│   └── historyService.ts       # AsyncStorage watch history
├── types/
│   ├── Movie.ts
│   ├── Stream.ts
│   └── navigation.ts
└── utils/
    └── streamParser.ts         # Stream URL decoding
```

## Tech Stack

| Package | Purpose |
|---------|---------|
| React Native 0.81 | Cross-platform mobile framework |
| Expo 54 | Build toolchain & native modules |
| react-native-video | Video playback |
| axios | HTTP requests |
| htmlparser2-without-node-native | HTML parsing |
| AsyncStorage | Local watch history |

## Notes

The app parses HTML from rezka.ag. If the site changes its structure, update the parsing logic in `src/services/rezkaService.ts`.
