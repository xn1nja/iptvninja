# Roadmap

Known gaps and agreed-but-not-yet-built work, so none of it has to be
re-derived later. Nothing here is started.

---

## 1. Remote list upload (Smart IPTV / siptv.eu style)

**Status:** designed, not built. Deferred deliberately.

The app shows a device code; the user opens a web portal, enters that code, and
uploads an M3U file or pastes a playlist URL; the app then pulls its playlist
down by code. This is the main way Smart IPTV onboards TVs, and it is the
natural onboarding path for the planned Tizen/webOS client, where typing a long
`get.php?username=…` URL with a remote is miserable.

**Decision taken:** the backend goes on **Cloudflare Workers with KV or D1** —
serverless, always-on, no host to maintain, and the portal page can be served
from the same Worker.

### Shape

Backend (new):

| Method | Path | Caller | Purpose |
| --- | --- | --- | --- |
| `PUT` | `/api/lists/{code}` | portal | store a playlist URL or uploaded M3U text |
| `GET` | `/api/lists/{code}` | app | fetch the stored playlist |

Plus a portal page: enter code → upload file or paste URL → submit.

`/core` (stays platform-agnostic, so the Tizen client reuses it):

- device-code generation and persistence through the existing `Storage`
  interface — no new platform seam needed
- a `remote` source kind that resolves a code to playlist text and then hands
  off to the M3U parser that already exists in `core/src/m3u.ts`

`/mobile`:

- surface the device code prominently
- an "Add source → Remote list" mode alongside the existing three
- a refresh action to re-pull after the portal is updated

Rough size: core + mobile are about a day; the Worker and portal are the real
commitment, because they mean owning uptime.

### Two things to design in, not bolt on

**Playlists carry provider credentials.** A stored
`get.php?username=…&password=…` URL is a credential store. If the KV namespace
leaks, every user's IPTV account leaks with it. siptv.eu has exactly this
exposure. Mitigations to build in from the start: encrypt at rest, keep codes
short-lived, and delete the record once the device has pulled it.

**Guessable codes allow playlist hijacking.** Short permanent codes let anyone
who guesses one overwrite that device's playlist. Needs real entropy and,
ideally, a pairing window that closes after first use.

---

## 2. Smaller known gaps

Carried over from the README's honest-status list:

- **Catch-up / archive.** `tv_archive` is already parsed off Xtream live streams
  and exposed as `channel.hasArchive`; nothing in the UI uses it and there is no
  timeshift playback.
- **Series on plain M3U.** A flat M3U has no season/episode structure, so
  `getSeriesDetail` throws for M3U sources. Series browsing is Xtream-only. This
  is a format limitation, not an omission.
- **No resume position** for movies and episodes; playback always starts at zero.
- **Guide is per channel** — a day-grouped list, not a scrolling multi-channel
  grid.
- **Artwork is unoptimised.** `icon.png`, `splash-icon.png` and `header.png` run
  ~1.2–1.3 MB each; roughly 4 MB of the bundle is images. Worth compressing
  before a store release.
- **Playback is unverified against a real provider.** The Xtream client is
  tested against recorded response shapes, not a live panel.

## 3. Explicitly out of scope for now

- The Tizen / webOS thin client. `/core` is kept clean so it can be built
  without a rewrite, and the boundary is enforced by
  `core/scripts/check-boundary.mjs`.
- Any multi-tenant or white-label admin panel.
