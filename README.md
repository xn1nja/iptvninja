# IPTV Ninja

An IPTV viewer/player for phones and tablets, in the spirit of IPTV Smarters Pro
or Smart IPTV.

**It ships with no channels of its own.** There is no bundled content, no
directory of providers and no backend. You supply your own Xtream Codes account
or M3U playlist, exactly as you would with any other generic media player.

---

## Layout

```
iptv-ninja/                npm workspaces root
├── core/                  plain TypeScript — no React, no React Native, no Expo
│   ├── src/
│   │   ├── types.ts       Channel, Category, Source, EpgEntry, …
│   │   ├── xtream.ts      Xtream Codes player_api.php client
│   │   ├── m3u.ts         M3U/M3U8 parser (#EXTINF attributes)
│   │   ├── xmltv.ts       XMLTV guide parser
│   │   ├── epg.ts         now/next, guide windowing, channel↔guide matching
│   │   ├── catalog.ts     one interface over both source kinds
│   │   ├── storage.ts     the storage abstraction (interface + in-memory impl)
│   │   ├── sources.ts     saved accounts/playlists
│   │   ├── favourites.ts  per-source favourites
│   │   └── search.ts      ranked channel search
│   └── test/              43 unit tests (node:test)
└── mobile/                the Expo app
    └── src/
        ├── theme/branding.ts   ← the ONLY place with a name, colour or logo
        ├── platform/           AsyncStorage + file picking (platform glue)
        ├── state/              React context over core
        ├── components/         Focusable, ChannelRow, shared UI
        ├── navigation/         React Navigation stack + tabs
        └── screens/            Browse, ChannelList, Search, Favourites,
                                Playlists, AddSource, Guide, SeriesDetail, Player
```

### Why the split

A Samsung Tizen / LG webOS client is planned later. Tizen apps are HTML5/JS, not
React Native, so they cannot reuse a single line of `/mobile` — but they can
reuse all of `/core` unchanged.

That boundary is enforced, not just documented: `npm test` runs
`core/scripts/check-boundary.mjs`, which fails the build if anything under
`/core` imports `react`, `react-native`, `expo`, `@react-navigation/*` or
AsyncStorage. Platform code plugs in through exactly one seam — the `Storage`
interface in `core/src/storage.ts` (`get` / `set` / `remove` by key). Mobile
implements it with AsyncStorage in `mobile/src/platform/storage.ts`; a TV build
implements it with `localStorage` or the Tizen key/value store and changes
nothing else.

---

## Running it

Requires Node 20+. Works on Linux, macOS and Windows.

```bash
npm install          # installs both workspaces — run from the repo root
npm start            # → npx expo start in /mobile
```

**Run every command from the repo root.** This is an npm workspaces monorepo:

- `npm install` at the root is what creates the symlink `/mobile` uses to
  resolve `@iptv-ninja/core`. Installing inside `/mobile` alone will not.
- `npm start` at the root forwards to `/mobile`. Do **not** run `npx expo start`
  at the root — Expo would treat the root as the app, find no `App.tsx`, fail
  with `Unable to resolve "../../App"`, and leave a stray `tsconfig.json`
  behind. If that happens, delete the generated root `tsconfig.json` and
  `.expo/`, then use `npm start`.

If you would rather drive Expo directly, `cd mobile` first:

```bash
cd mobile
npx expo start
```

Other useful commands, all from the repo root:

```bash
npm run typecheck    # tsc --noEmit across /core and /mobile
npm test             # core boundary check + 43 unit tests
npm run build:core   # emit core/dist (for a future non-bundled consumer)
npm run android      # expo start --android
```

### Do you need a custom dev client?

**Probably, for real use.** `npx expo start` with Expo Go is fine for poking at
the UI, and it is worth trying first because it costs nothing. But two things
only take effect in a development build:

- **Cleartext HTTP.** Many Xtream panels are `http://host:8080`, not HTTPS.
  `app.json` sets `android.usesCleartextTraffic` and iOS
  `NSAppTransportSecurity.NSAllowsArbitraryLoads` for this; both are native
  manifest settings that Expo Go cannot apply. If your panel is HTTPS, Expo Go
  may be all you need.
- **The `expo-video` plugin options** — background playback and
  picture-in-picture.

How you get a development build depends on what you are developing on:

| You are on | Target | Command |
| --- | --- | --- |
| Windows / Linux / macOS | Android | `npx expo run:android` |
| macOS | iOS | `npx expo run:ios` |
| Windows / Linux | iOS | `eas build -p ios --profile development` |

`expo run:*` builds locally: it runs prebuild to generate the native project,
then compiles it. iOS compilation needs Xcode, so it is macOS-only — there is no
way around that from Windows.

### Building for iOS without a Mac

`eas.json` in `/mobile` is already configured. From the repo root:

```bash
npm install -g eas-cli
cd mobile
eas login                                     # free Expo account
eas build -p ios --profile development
```

EAS compiles in the cloud and gives you a QR code / install link for the
resulting dev client. Then back on your machine:

```bash
npm start        # scan the QR with the dev client, not Expo Go
```

**This needs a paid Apple Developer Program membership ($99/year).** iOS requires
code signing for any build that runs on a physical device, including development
builds; EAS will walk you through generating the certificates, but it cannot
create the account for you. There is no free path to an iOS build on a real
device. Android has no such requirement.

Profiles in `eas.json`:

- `development` — dev client for a physical device, internal distribution
- `development-simulator` — iOS simulator build (needs a Mac to run it)
- `preview` — standalone internal build; Android comes out as an installable APK
- `production` — store build

### Plugging in your own account

Open the app → **Playlists** tab → **Add playlist or account**. Three ways in:

**Xtream Codes** — the three things your provider gave you:

| Field | Example |
| --- | --- |
| Server URL | `http://example.com:8080` |
| Username | `yourusername` |
| Password | `yourpassword` |

The scheme is added if you leave it off, and a trailing `/player_api.php` is
stripped if you paste the full API URL. On save the app authenticates
immediately, so a wrong password or an expired line fails right there with a
specific message rather than an empty channel list.

**M3U URL** — paste the playlist link, e.g.
`http://example.com:8080/get.php?username=…&password=…&type=m3u_plus&output=m3u8`.
Optionally add an XMLTV URL; if you leave it blank the `url-tvg` attribute from
the playlist header is used when present.

**Paste / file** — pick an `.m3u`/`.m3u8` file off the device, or paste the
playlist text directly. Nothing is fetched over the network in this mode.

Multiple sources can be saved; tap one on the Playlists tab to switch. Deleting
a source deletes its favourites too and never touches your provider account.

---

## What works, and what doesn't

### Working end to end

- **Xtream Codes client** — authentication with distinct errors for bad
  credentials / expired / banned / unreachable / not-an-Xtream-panel; live, VOD
  and series categories and streams; `get_series_info` flattened into ordered
  seasons and episodes; `get_short_epg` with base64 title/description decoding;
  `xmltv.php` for the full guide; stream URLs built for live (`.m3u8`), VOD and
  episodes.
- **M3U parsing** — `tvg-id`, `tvg-name`, `tvg-logo`, `group-title`, `tvg-chno`,
  plus the stream URL. Handles double-quoted, single-quoted and bare attributes,
  CRLF, BOMs, `#EXTGRP`, `#EXTVLCOPT`/`#KODIPROP`, duplicate `tvg-id`s and bare
  URLs with no `#EXTINF`. Channels are grouped into categories by `group-title`,
  and live/movie/series is inferred from the stream path.
- **Multiple sources** — add, switch, delete; the active one is remembered.
- **Browse** — Live / Movies / Series tabs, shown only when the source actually
  has them; categories → channel list with logo and name.
- **Global search** across every channel, movie and series in the active source,
  ranked, accent- and case-insensitive, matching on category name too.
- **Favourites** — star toggle in the channel list and on the player, scoped per
  source, with a dedicated tab. The whole channel is stored, so favourites
  render and play before the catalogue finishes loading.
- **EPG** — now/next inline in channel lists and on the player overlay with a
  progress bar; a day-grouped guide screen per channel. XMLTV is preferred and
  falls back to `get_short_epg` per channel on Xtream. Channels match the guide
  by `tvg-id`, falling back to a normalised `<display-name>` match.
- **Player** — `expo-video`, HLS live streams, play/pause, fullscreen, back,
  jump-to-live, overlay with channel logo/name and the current programme,
  auto-hiding after 4 seconds.
- **Errors** — every failure in core carries a stable code, and the UI renders a
  specific message rather than "something went wrong".

### Verified

- `npm run typecheck` — clean across both workspaces.
- `npm test` — 43/43 passing, plus the core boundary check.
- `npx expo export` — bundles for both Android (918 modules) and iOS (924),
  so Metro really does resolve `@iptv-ninja/core` from source across the
  workspace.
- `npx expo start` — dev server serves a working bundle.
- `npx expo-doctor` — 19/21. The two failures are network fetches (Expo's config
  schema and the React Native Directory) blocked in the sandbox this was built
  in, not project problems.
- `npm install` / `npm run typecheck` / `npm test` on Windows (Node 20).

**Not verified: playback against a real provider.** There is no IPTV account and
no device or emulator in the build environment, so no stream has actually been
played. The Xtream client is tested against recorded response shapes, not a live
panel. This is the one thing worth checking first on your own account.

### Stubbed, thin, or deliberately left out

- **Series on plain M3U playlists** — a flat M3U has no season/episode structure,
  so `getSeriesDetail` throws for M3U sources. Series browsing is Xtream-only.
- **Catch-up / archive** — `tv_archive` is parsed off Xtream live streams and
  exposed as `channel.hasArchive`, but nothing in the UI uses it yet and there is
  no timeshift playback.
- **Guide view is per channel**, a day-grouped list rather than a scrolling
  multi-channel grid.
- **No resume position** for movies and episodes; playback always starts at zero.
- **No "recently watched"**, no parental controls, no multi-screen/PiP UI, no
  external-player handoff.
- **Xtream VOD/series metadata** is minimal — cover, plot, genre, rating. No
  TMDB enrichment, trailers or cast pages.
- **Channel logos** are loaded straight from the provider's URLs via
  `expo-image`. Providers with broken logo hosts will show the placeholder.
- **Artwork is unoptimised.** `icon.png`, `splash-icon.png` and `header.png` are
  ~1.2–1.3 MB each, so about 4 MB of the bundle is images. Fine to ship, worth
  compressing before a store release.
- **No tests in `/mobile`** — core carries the logic and the tests; the mobile
  layer is UI and platform glue.
- **Not built, by design:** the Tizen/webOS client, any backend, and any
  multi-tenant or white-label admin panel.
- **Remote list upload** (Smart IPTV / siptv.eu style device-code portal) is
  designed but deliberately deferred — see [docs/ROADMAP.md](docs/ROADMAP.md).

---

## White-labelling

`mobile/src/theme/branding.ts` is the single source of truth for every
user-visible string, colour, radius, spacing step, type size and image in
`/mobile`. Nothing else hardcodes a product name or a hex value — re-skinning for
a client means editing that one file, swapping `mobile/assets/`, and changing
`name` / `slug` / bundle identifier in `app.json`.

### Where the artwork is used

| Slot | Asset | Notes |
| --- | --- | --- |
| App icon (iOS + Android legacy) | `icon.png` | Full lockup. No alpha channel, which iOS requires |
| Android adaptive foreground | `android-adaptive-foreground.png` | Generated from `icon-mark.png`, padded into the 66% safe zone |
| Android adaptive background | `android-icon-background.png` | Blue gradient |
| Native splash | `splash-icon.png` | `resizeMode: cover`; the art is 853×1844, near-identical to 9:19.5 |
| Web favicon | `favicon-32x32.png` | |
| In-app launch screen | `branding.assets.splash` | Same art as the native splash, so the handoff is seamless |
| Tab headers | `branding.assets.logoMark` | Mark plus screen label |
| First-run empty states, Add-playlist screen | `branding.assets.banner` | `header.png`, the wide banner with the tagline |

**Android adaptive icons are masked to a circle**, and only the centre ~66% is
guaranteed visible. The full lockup loses its wordmark to that mask, so the
adaptive foreground uses the mark alone rather than `icon.png`. Regenerate it
from a new `icon-mark.png` if you re-skin.

**Do not `require()` an asset whose filename ends in `@1x`/`@2x`.** React Native
reserves that suffix for pixel-density variants, so `Wordmark@1x.png` and
`AppIcon@2x.png` fail to resolve. Rename them first if you want to use them.

Current identifiers:

- App name: **IPTV Ninja**, slug `iptv-ninja`
- Android package and iOS bundle id: `mk.ninja.iptvninja`

## Remote / d-pad navigation

TV support is not built, but nothing blocks it. Every interactive element goes
through `mobile/src/components/Focusable.tsx` — a plain tap target that also
tracks `onFocus`/`onBlur` and draws a focus ring. There are no swipe-only or
long-press-only gestures anywhere in the app, and no control that can only be
reached by dragging. Adding d-pad navigation later means teaching that one
component about `hasTVPreferredFocus` and `nextFocus*`, not rewriting screens.
