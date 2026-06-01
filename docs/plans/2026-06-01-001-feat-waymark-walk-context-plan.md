---
title: "feat: Waymark v1.1 — full walk context (enrichment, dashboard, theme graph, map, places)"
type: feat
status: completed
date: 2026-06-01
origin: docs/brainstorms/2026-06-01-waymark-walk-context-requirements.md
---

# feat: Waymark v1.1 — full walk context

**Target repo:** `pilgrim-obsidian` (this plan was authored from the sibling `pilgrim-viewer` repo; all plan-relative paths are relative to `pilgrim-obsidian` unless prefixed `../pilgrim-viewer/`).

## Summary

Extend the shipped Waymark plugin so each imported walk-note carries the full context the `.pilgrim` already holds — waypoints, full celestial detail, fuller stats (steps, pace), an activity/pause timeline, full weather — with structured values in `waymark-*` frontmatter and meaningful context in the body, transcription still central. On that data layer: a generated Dataview dashboard, waypoint-label wiki-links for the graph view, an interactive per-note Leaflet map (Mapbox tiles via the user's token), and OpenStreetMap/Nominatim-geocoded place backlinks. Delivered in two phases — offline enrichment first, then the token/network-gated map + places. All new content lives inside the existing managed region and obeys the v1 idempotent-merge contract.

---

## Problem Frame

v1 surfaces a walk's transcription, a compact stat summary, weather, moon, and photos — but the `.pilgrim` carries much more that never reaches the note (waypoints, full celestial, pace, activity structure) and that the walker can't currently query, cluster, or map in Obsidian. See origin (`docs/brainstorms/2026-06-01-waymark-walk-context-requirements.md`) for the full problem framing, actors (A1 walker, A2 app, A3 Obsidian/Dataview/Leaflet, A4 Mapbox/OSM), flows (F1 enriched import, F2 turn-on-the-map), and acceptance examples.

---

## Requirements

*(Carried from origin; see it for full text.)*

**Offline enrichment**
- R1. Render pinned waypoints as a "Moments" body list (time, label, icon).
- R2. Render full celestial — structured values to frontmatter, readable summary in the body.
- R3. Expand stats with steps and pace (avg + range); exclude heart rate and burned energy.
- R4. Render an activity/pause timeline.
- R5. Render full weather (condition, temp, humidity, wind).
- R6. Render start/end clock times.
- R7. Omit absent fields/sections; transcription stays the centerpiece.
- R8. Structured context to the typed `waymark-*` frontmatter schema (the celestial hook).

**Discovery layer**
- R9. Generate a starter Dataview dashboard note; created once; degrades gracefully without Dataview.
- R10. Theme-graph wiki-links from waypoint labels; intention stays a frontmatter value.

**Map & places (token/network-gated)**
- R11. Mapbox token setting + place-names opt-in, with in-settings onboarding.
- R12. Interactive Leaflet route map per note when a token is set; degrades to an inert block without the Leaflet plugin.
- R13. Place backlinks via reverse-geocoding when the place-names option is on; cache results; omit gracefully on failure/off.

**Compatibility**
- R14. All enrichment lives in the managed region under the v1 merge contract; a re-import auto-upgrades un-edited notes (no migration).

**Origin actors:** A1 (walker), A2 (Pilgrim app), A3 (Obsidian + Dataview/Leaflet plugins), A4 (Mapbox tiles / OSM geocoding).
**Origin flows:** F1 (enriched import), F2 (turn on the map).
**Origin acceptance examples:** AE1 (absent sections omitted), AE2 (place/map visibility — see supersession below), AE3 (geocode cache avoids repeat OSM/Nominatim calls), AE4 (user-edited notes preserved; un-edited auto-upgrade).

**Planning supersessions (origin → plan), decided during planning:**
- Place geocoding provider changed **Mapbox → OpenStreetMap/Nominatim** (Mapbox's free-tier terms forbid storing geocoded names; OSM/ODbL permits storage with attribution). Mapbox is used for **tiles only**. Origin R13/AE3/A4/Dependencies that say "Mapbox geocoding" are superseded.
- Places are gated by a **separate place-names opt-in**, not the Mapbox token. AE2 is restated: *no token → no map; token + places-off → map only; token + places-on → map + place links*.
- Geocoding is **start-coordinate only** (origin said "start and end") — fewer calls, less home-location exposure.

---

## Scope Boundaries

- No AI/LLM generation or prompt-assembly — faithful rendering of existing data only.
- No heart rate or burned energy.
- Map mechanism is Leaflet-in-note; embedded-viewer pane and static-PNG map remain out (viewer pane a possible future).
- Place names use **OpenStreetMap/Nominatim**, not Mapbox geocoding (Mapbox's terms forbid storing geocoded names on the free tier; OSM/ODbL permits storage with attribution). Mapbox is used for **map tiles only**.
- No Waymark-hosted geocoding or tiles — the user supplies their own Mapbox token; OSM geocoding hits the public Nominatim endpoint under its usage policy.
- Still deferred (origin): auto-sync, multi-adapter engine, daily-note merge, contemplative AI review, advanced re-import conflict UX.
- Outside the product's identity (origin): bidirectional sync, owning the `.pilgrim` spec, becoming a general GPS importer.

### Deferred to Follow-Up Work
- Persisting place backlinks behind a paid Mapbox Permanent Geocoding path (the rejected alternative) — only if OSM proves unworkable.
- A no-Leaflet static map fallback — revisit if the Leaflet dependency is a friction point.

---

## Context & Research

### Relevant Code and Patterns
- `src/render/walk-note.ts` — `renderWalk`/`renderBody`/`renderFrontmatter`; pure, Obsidian-free. Current frontmatter keys: `waymark-id|type|date|start|distance-km|duration-min|app-version|schema|version` (+ conditional `waymark-intention`, `waymark-moon`). Body order: Intention → `## Reflection` → `## On this walk` → written reflection → `## Photos`. New keys/sections slot here; **every section is conditionally pushed (R7 pattern already exists)**.
- `src/parse/types.ts` — `GeoJSONProperties` carries `speeds[]`, `timestamps[]`, `markerType`, `label`, `icon`, `timestamp`; `CelestialContext` (lunarPhase{name,illumination,age,isWaxing}, planetaryPositions, planetaryHour{planet,planetaryDay}, elementBalance{…,dominant?}, seasonalMarker?, zodiacSystem); `WalkStats.steps?`; `Activity`/`Pause`/`Weather`. Waypoints = `route.features` where `geometry.type==='Point' && properties.markerType==='waypoint'` (no pre-filtered array on `Walk`).
- `src/vault/merge.ts` + `writer.ts` — managed region (id-scoped markers), `waymark-block-hash` via cyrb53 over normalized region, `mergeFrontmatter` allowlist (only `waymark-*` keys written; stale ones dropped). New frontmatter keys **must be `waymark-*` prefixed and scalar** (`FrontmatterValue = string|number|boolean` in `src/shared.ts`).
- `src/import/orchestrator.ts` — `importPilgrim` resolves photo bytes async before `writeWalkNotes`; the **async geocode step mirrors this** (resolve place names after `finalWalks`, before the writer). `ImportSettings` gains `mapboxToken?` and a place-names flag.
- `src/settings.ts` + `src/main.ts` — `Setting` builder; `WaymarkSettings`/`DEFAULT_SETTINGS` extended; `loadData/saveData` is the persistence seam (also the geocode-cache home). `importBuffer` threads settings into the orchestrator.
- `tests/support.ts` — `walkFrom()` (real `parsePilgrim` over fixtures; mutate the returned walk), `makeFakeApp()` (scalar-only frontmatter round-trip — keep new keys scalar). Fixture celestial: moon `"Waxing Crescent"`, illumination `0.15`, element dominant `"earth"`, planetary day `"Saturday"`, seasonal `"Spring Equinox"`, steps `7200`, waypoints `"Peaceful"`/`"Grateful"`.

### External References
- **obsidian-leaflet** (javalent/obsidian-leaflet, v6.0.5, maintenance mode): ` ```leaflet ` block; **inline GeoJSON not supported** → reference a sidecar file by `[[wikilink]]` (`geojson:`). Mapbox tiles via `tileServer:` `https://api.mapbox.com/styles/v1/mapbox/outdoors-v12/tiles/{z}/{x}/{y}?access_token=TOKEN`, with `tileSize: 512`, `zoomOffset: -1`, `osmLayer: false`, no `{s}`. `marker:` lines for waypoints. Unrecognized block → inert code fence (graceful). https://github.com/javalent/obsidian-leaflet
- **Dataview** (blacksmithgu, 0.5.64): hyphenated frontmatter keys must use the `row["waymark-distance-km"]` escape-hatch (a bare key parses as subtraction). Detect via `isPluginEnabled(app)` from the `obsidian-dataview` package (or `app.plugins.enabledPlugins`). Unrecognized block → inert text. https://blacksmithgu.github.io/obsidian-dataview/
- **Nominatim reverse-geocoding**: `https://nominatim.openstreetmap.org/reverse?lat=&lon=&format=jsonv2&zoom=10`; **usage policy: ≤1 req/sec, required descriptive `User-Agent`, must cache results, attribute "© OpenStreetMap contributors"**; ODbL permits storing results. Verify the current policy at planning/impl time. https://operations.osmfoundation.org/policies/nominatim/
- **Mapbox terms (verified Oct-2025)**: temporary (free) geocoding forbids storing the result; permanent is paid/card-on-file. → we use Mapbox for **tiles only**; geocoding goes to OSM. Tiles need an **unrestricted public `pk.` token** (URL-restricted tokens 403 from Electron). https://docs.mapbox.com/api/maps/static-tiles/

---

## Key Technical Decisions

- **All enrichment flows through the existing render → merge → writer path**, so it lands inside the managed region and inherits idempotency + preserve-on-edit. A re-import after v1.1 auto-upgrades un-edited notes; no migration. *(R14.)*
- **Flat, scalar `waymark-*` frontmatter** for celestial/stats — no nested objects (FrontmatterValue is scalar; the dashboard and the test fake depend on scalars). **Only set numeric keys when the value is a finite number** (e.g. pace, reflection-words) — never write `NaN`/`undefined`; mirror the existing conditional-key pattern. Exact key names finalized in U2.
- **Waypoints rendered from `route.features`** (Point + `markerType==='waypoint'`); labels become `[[wiki-links]]` (theme graph). The per-feature `timestamp` is **epoch seconds** and is NOT converted by the parser (unlike the LineString `timestamps` array, which is ×1000) → format with `new Date(timestamp * 1000)`, and guard when `timestamp` is absent (render the label without a time rather than "Invalid Date").
- **Pace derived from `distance / activeDuration`** (both reliable and always present in `stats`), converted to min/km — **not** from the raw `speeds[]` array, which the parser never populates, has no fixture data, and carries an unverified unit. If `speeds[]` is present and valid, a range may be added as optional enrichment, excluding ≤0/invalid samples (paused/`-1`).
- **Dataview dashboard generated once** into the walks folder, never overwritten if it exists (create-once, user-owned thereafter); queries use the `row["waymark-…"]` escape-hatch (bare hyphenated keys parse as subtraction). The full-moon query string-matches the existing v1 `waymark-moon` phase-name key. **Always emit** the blocks plus a one-line "install Dataview to render these" hint (blocks degrade to inert text regardless); optional plugin detection is done in `main.ts` against the real `App` and threaded in as a boolean — **not** via the orchestrator's `AppLike` seam (which has no `plugins` surface). Emit a `Notice` pointing to the dashboard on first creation (discoverability).
- **Map = `leaflet` block + per-walk sidecar `.geojson`** via a **new content-carrying write path** — the existing `writeAttachments`/`photoBytes` flow only materializes pre-resolved blobs keyed by token and silently skips refs with no bytes, so the render-generated route GeoJSON needs an inline-`data` attachment variant (or a parallel generated-files map) written with `vault.create`/`process`, deterministic name (`waymark-<walkId>-route.geojson`), overwrite-in-place. **Verify obsidian-leaflet resolves the `geojson: [[…]]` wikilink to the attachments subfolder** (vs. note-relative) before relying on it; emit a `<!-- install obsidian-leaflet to render this map -->` hint above the block. Emitted only when a token is set; orphaned `.geojson` on archive/token-clear is accepted (documented), like photos.
- **The Mapbox token is embedded in plaintext in every note's `leaflet` block** (and in `data.json`) → it replicates via sync/git/Publish, and rotating it rewrites every un-edited note (old token persists in history). Treat the vault-embedded token as effectively public: advise an unrestricted `pk.` token + a Mapbox usage cap + gitignoring `data.json`; flag "does obsidian-leaflet support a plugin-level token to keep it out of notes?" as a deferred verification. Waymark does not validate the token (a bad/restricted token yields a broken in-note render — documented, not caught at save time).
- **Place names via Nominatim**, behind the place-names opt-in. Reverse-geocode the **rounded** start coordinate only (~2 dp; privacy: start ≈ home) at `zoom≈10`; call via Obsidian **`requestUrl`** (avoids Electron CORS) with an **AbortController timeout** (~5 s) so a hung socket fails-soft; throttle ≤1 req/sec; descriptive `User-Agent`; **render `© OpenStreetMap contributors` attribution in-note next to the place link** (ODbL) and in settings + README. Fail-soft on any error/offline/empty — note always written without the link; optionally emit one aggregated `Notice` ("N walks couldn't be geocoded — re-import when online").
- **Geocode cache** keyed on the rounded coordinate (store **only the rounded key**, never raw GPS): in-memory per run + persisted across sessions by threading a cache object through `ImportSettings` that **`main.ts` loads/saves via the Plugin's `loadData`/`saveData`** — the orchestrator's `AppLike` has no persistence handle. `data.json` then holds approximate-location history (replicated by sync) → document this; clear on disable.
- **Async work lives in the orchestrator**, not pure `renderWalk`: geocoding resolves names after `finalWalks`, before `writeWalkNotes`; resolved names + the map flag thread into render via render options.
- **Two independent toggles**: the Mapbox token enables the map; the place-names opt-in enables geocoding.

---

## Open Questions

### Resolved During Planning
- Place-name provider → OpenStreetMap/Nominatim (Mapbox terms forbid storing free-tier geocodes). Mapbox = tiles only.
- Map mechanism → Leaflet block + sidecar GeoJSON (inline GeoJSON unsupported).
- HR/energy → dropped.
- Pace → computed from `distance`/`activeDuration` (not the unverified `speeds[]`); `speeds[]` range is optional enrichment.
- Geocoding → **start coordinate only** (supersedes origin's "start and end").
- Dataview detection → in `main.ts` against the real `App`, threaded as a boolean (not on `AppLike`); blocks always emitted with a hint regardless.
- Geocode cache persistence → threaded through `ImportSettings`, loaded/saved by `main.ts` (orchestrator has no `loadData`/`saveData`).
- Route GeoJSON sidecar → a new content-carrying write path (not the token-keyed `photoBytes` flow).
- Token-in-notes → accepted with documentation/mitigations; treated as effectively public.

### Deferred to Implementation
- [Affects R2, R3] Final `waymark-*` key names/types; pace formatting + which `speeds[]` samples count toward an optional range.
- [Affects R12][Needs research] Exact `leaflet` v6 block fields (zoom/height defaults, waypoint-icon → `marker` mapping with a default fallback), and **whether obsidian-leaflet resolves `geojson: [[…]]` to the attachments subfolder vs. note-relative** (gates the sidecar location).
- [Affects R13][Needs research] Confirm the current Nominatim usage policy (rate, required `User-Agent`, attribution) and the `requestUrl` request/response shape; rounding precision; whether to surface the aggregated geocode-failure `Notice`.
- [Affects R9] Final dashboard queries, note path, and create-once guard.
- [Affects R10] Whether intention contributes any normalized tag (default: no — stays frontmatter).

---

## High-Level Technical Design

> *Directional guidance for review, not implementation specification.*

**Where the new work attaches (data flow):**

```
.pilgrim → parse (vendored) → walk model ─┐
                                          ├─ orchestrator ──────────────► writer (managed region)
   [Phase B] geocode(start coords) ───────┘   places + map-flag threaded     │
   via Nominatim (async, throttled, cached)   into render options            │
                                                                             ▼
                              render/walk-note.ts (pure):
                              frontmatter (waymark-* scalar)  +  body:
                                ## Reflection (transcription — centerpiece)
                                ## Moments (waypoints → [[links]])
                                ## On this walk (+ steps, pace)
                                ## Timeline (activities + pauses)
                                ## Sky (full celestial)
                                ## Weather (full)
                                near [[Place]]            (Phase B, places on)
                                ```leaflet → [[…-route.geojson]]   (Phase B, token set)
```

The Leaflet `.geojson` sidecar is written by the writer (attachment path), like photos. The Dataview dashboard is a separate generated note, not part of any walk's managed region.

---

## Implementation Units

### U1. Render body enrichment — Moments, stats+pace, timeline, weather, times

**Goal:** Surface the offline body context in the walk note.

**Requirements:** R1, R3, R4, R5, R6, R7, R10 (waypoint links)

**Dependencies:** None

**Files:**
- Modify: `src/render/walk-note.ts`
- Test: `tests/render/walk-note.test.ts`

**Approach:**
- `## Moments`: filter `walk.route.features` for `Point` + `markerType==='waypoint'`; render `HH:MM · [[label]]` (icon optional). The per-feature `timestamp` is epoch **seconds** and is NOT converted by the parser → format via `new Date(timestamp * 1000)`; when `timestamp` is absent, render the label without a time (no "Invalid Date"). Labels as wiki-links (theme graph).
- `## On this walk`: add `steps` (if present) and `pace` computed as `distance / activeDuration` → min/km (both fields are always present in `stats`). Optionally add a pace range from LineString `speeds[]` only when present and valid (exclude ≤0/`-1` paused samples); do not depend on `speeds[]` for the primary pace value.
- `## Timeline`: activities (walk/talk/meditate) + pauses, ordered, with relative times.
- `## Weather`: expand to condition, temp, humidity, wind.
- Start/end clock times in the stats or a header line.
- Keep every section conditionally pushed (R7); transcription `## Reflection` stays first.

**Patterns to follow:** existing conditional-push structure in `renderBody`; minutes/format helpers already in the file.

**Test scenarios:**
- `Covers AE1.` Happy: a walk with waypoints/stats/weather renders Moments (with `[[label]]` links), pace (from distance/duration), timeline, full weather; a walk missing each renders none of those sections, no empty headings, transcription present.
- Happy: pace value is the independently-computed min/km from `distance`/`activeDuration` for a known fixture (assert the exact number, not just presence).
- Edge: a waypoint with a known epoch-seconds `timestamp` formats to the expected HH:MM (independently computed — guards the ×1000); a waypoint with `label` but no `timestamp` renders the label with no time, no crash.
- Edge: a walk with no waypoints → no `## Moments`; zero-duration pause / single activity in the timeline; `speeds[]` absent → no pace range, pace still present from distance/duration.

**Verification:** rendered body for fixtures matches expected sections; waypoint labels are wiki-links; no broken/empty sections.

---

### U2. Render frontmatter + celestial Sky section

**Goal:** Put structured context in queryable frontmatter and a readable celestial block in the body.

**Requirements:** R2, R8

**Dependencies:** None (sequential by convention — both U1 and U2 edit `walk-note.ts`; land U1 first for reviewable diffs)

**Files:**
- Modify: `src/render/walk-note.ts`
- Test: `tests/render/walk-note.test.ts`

**Approach:**
- Add flat scalar `waymark-*` keys: steps, pace-avg, moon illumination, element dominant, planetary day, seasonal marker, reflection word count (`waymark-reflection-words`, for the dashboard's "longest reflections"), etc. Keep the existing v1 `waymark-moon` (phase name) key — the dashboard's full-moon query string-matches it. Omit any key whose source is absent, and only set a numeric key when the value is `Number.isFinite` (never write `NaN`).
- `## Sky` body section: moon (name + illumination + waxing), planetary hour/day, element balance + dominant, seasonal marker — readable prose/list.
- Keep all values scalar (FrontmatterValue); no nested objects (also required for the test fake's frontmatter round-trip).

**Patterns to follow:** `renderFrontmatter` conditional-key pattern; `waymark-moon` precedent.

**Test scenarios:**
- Happy: full-celestial walk → frontmatter has `waymark-moon-illumination`, `waymark-element-dominant`, `waymark-planetary-day`, `waymark-seasonal-marker`; `## Sky` present.
- Edge: `walk.celestial` undefined → no celestial keys, no `## Sky`; reflection-words counts transcription words (0 → key omitted or 0 per decision).
- Edge: all new keys are scalar (round-trip through the test fake's `splitFm`/`joinFm`).

**Verification:** frontmatter keys present/typed for the fixture; absent-celestial walk has none; dashboard queries (U3) can read them.

---

### U3. Dataview dashboard note

**Goal:** A generated "walks" dashboard that queries the new frontmatter.

**Requirements:** R9

**Dependencies:** U2

**Files:**
- Create: `src/render/dashboard.ts`, `tests/render/dashboard.test.ts`
- Modify: `src/import/orchestrator.ts` (emit once during import), `src/vault/writer.ts` (or orchestrator) for the create-once write

**Approach:**
- Build a dashboard markdown note with `dataview` blocks using the `row["waymark-…"]` escape-hatch (all walks by distance; full-moon walks via `row["waymark-moon"] = "Full Moon"` string match; longest reflections by `row["waymark-reflection-words"]`).
- Write it once into the walks folder; if it already exists, do not overwrite (user-owned thereafter). Emit a `Notice` pointing to the dashboard on first creation (discoverability).
- **Always emit** the blocks plus a one-line "install Dataview to render these" hint (they degrade to inert text without Dataview). Runtime Dataview detection is optional and, if done, happens in `main.ts` against the real `App` (`app.plugins.enabledPlugins` / the `obsidian-dataview` package's `isPluginEnabled`) and is threaded in as a boolean — do NOT add a `plugins` surface to the orchestrator's `AppLike` seam.

**Patterns to follow:** writer's existence-check (`getAbstractFileByPath`) for create-once; the pure-builder + thin-writer split.

**Test scenarios:**
- Happy: dashboard builder emits the expected `dataview` blocks with `row["waymark-…"]` and the right filters/sorts, plus the install-Dataview hint (always present).
- Edge: dashboard note already exists → not overwritten (create-once); a `Notice` fires only on first creation.

**Verification:** importing produces one dashboard note; re-import doesn't clobber a user-edited dashboard.

---

### U4. Settings — Mapbox token + place-names opt-in + onboarding

**Goal:** The two toggles and their threading into import.

**Requirements:** R11

**Dependencies:** None

**Files:**
- Modify: `src/settings.ts`, `src/main.ts`, `src/import/orchestrator.ts`
- Test: `tests/import/orchestrator.test.ts` (settings threading)

**Approach:**
- `WaymarkSettings` + `DEFAULT_SETTINGS`: add `mapboxToken: string` (`''`) and `lookupPlaceNames: boolean` (`false`, opt-in for privacy). The persisted geocode cache also lives in plugin data (a separate key, loaded/saved by `main.ts`).
- Settings tab: a masked (`inputEl.type='password'`) Mapbox token `Setting` with a `createFragment` help link to get a token, plus a note that the token is written into note files and `data.json` and replicates wherever the vault goes — treat it as public; set a Mapbox usage cap and consider gitignoring `data.json`. Waymark does not validate the token (a bad/restricted token shows as a broken in-note map). A place-name lookup toggle whose `setDesc` states plainly that the **approximate start location of each walk — which may be your home — is sent to the public OpenStreetMap/Nominatim server**, results are cached locally, and place names carry "© OpenStreetMap contributors" attribution.
- `main.ts` threads `{ mapboxToken, lookupPlaceNames, geocodeCache, dataviewEnabled }` into `ImportSettings` via `importBuffer` (loading the cache via `loadData`), and persists the cache via `saveData` after import returns — since the orchestrator's `AppLike` has no persistence handle.

**Patterns to follow:** existing `Setting().addText().onChange(... saveSettings().catch())`; `Object.assign({}, DEFAULT_SETTINGS, await loadData())` (forward-compatible).

**Test scenarios:**
- Happy: settings default to no token / places-off; `importBuffer` passes both through to `importPilgrim` (assert via the orchestrator's received settings).
- Edge: blank token / places-off → downstream map + geocode steps are no-ops.
- Test expectation: settings-tab UI itself is verified manually; logic (defaults, threading) is unit-tested.

**Verification:** toggles persist via `saveData`; orchestrator receives them.

---

### U5. Leaflet map per note (sidecar GeoJSON + block)

**Goal:** An interactive route map in each note when a Mapbox token is set.

**Requirements:** R12

**Dependencies:** U1, U4

**Files:**
- Modify: `src/render/walk-note.ts` (emit the `leaflet` block + record the route-geojson attachment), `src/vault/writer.ts` (write the `.geojson` sidecar)
- Test: `tests/render/walk-note.test.ts`, `tests/vault/writer.test.ts`

**Approach:**
- When a token is provided (via render options), emit a `leaflet` block inside the managed region (`tileServer` Mapbox outdoors-v12 URL with the token, `tileSize: 512`, `zoomOffset: -1`, `osmLayer: false`, `geojson: [[waymark-<walkId>-route.geojson]]`, `marker:` lines for waypoints; default marker when a waypoint icon doesn't map), preceded by a `<!-- install obsidian-leaflet to render this map -->` hint comment.
- The route GeoJSON is render-generated **text**, so it cannot ride the `photoBytes` attachment path (that path only writes pre-resolved blobs keyed by token and silently `continue`s on a ref with no bytes). Add a **content-carrying write**: render emits the serialized FeatureCollection as an inline-`data` attachment (or a parallel `generatedFiles: {path, content}[]` list) that the writer writes with `vault.create`/`process`, deterministic name (`waymark-<walkId>-route.geojson`), overwrite-in-place. **Verify obsidian-leaflet resolves `geojson: [[…]]` to the attachments subfolder** (vs. note-relative) — if note-relative, write the sidecar beside the note or path-qualify the reference.
- No token → no `leaflet` block, no sidecar. The embedded token is a known leak/churn surface (see Key Technical Decisions + Risks). An orphaned `.geojson` on archive / token-clear is accepted (same as orphaned photo attachments), documented in System-Wide Impact.

**Patterns to follow:** the writer's deterministic-name + existence-check discipline — but a NEW content write path, not the token-keyed `photoBytes` lookup; managed-region containment.

**Test scenarios:**
- `Covers AE2.` Happy: token set → note body contains a `leaflet` block referencing `waymark-<id>-route.geojson` AND the `.geojson` file is actually written into the vault (assert the file exists/content, not just a binary count); no token → neither block nor sidecar.
- Edge: re-import overwrites the sidecar in place (no duplicate `.geojson`); waypoints appear as `marker:` lines; the leaflet-absent hint comment is present.
- Edge: walk with an empty/missing route → no map block (graceful).

**Verification:** with a token, a fixture walk yields a `leaflet` block + a `.geojson` sidecar; idempotent on re-import.

---

### U6. Place backlinks via Nominatim

**Goal:** Reverse-geocode start coordinates to a `[[Place]]` link when place lookup is on.

**Requirements:** R13

**Dependencies:** U1, U4

**Files:**
- Create: `src/import/geocode.ts`, `tests/import/geocode.test.ts`
- Modify: `src/import/orchestrator.ts` (async geocode step + cache threading), `src/render/walk-note.ts` (emit `near [[Place]]` + attribution), `src/main.ts` (load/save the persisted cache)

**Approach:**
- A geocode module: given a rounded start coord + a passed-in cache object, return a place name. Reverse-geocode via Nominatim (`format=jsonv2`, `zoom≈10`) using Obsidian's **`requestUrl`** (avoids Electron CORS) with an **AbortController/timeout (~5 s)** so a hung socket fails-soft; descriptive `User-Agent`; throttle ≤1 req/sec; cache keyed on the rounded coord (store **only the rounded key**, never raw GPS). Round before sending (privacy: start ≈ home). Fail-soft on network/401/403/429/timeout/empty → `undefined`.
- Cache is in-memory per run; **cross-session persistence is `main.ts`'s job** (it loads the cache into `ImportSettings` and saves it after import) — the module only reads/mutates the passed-in cache, since the orchestrator has no persistence handle.
- Orchestrator runs geocoding after `finalWalks`, before `writeWalkNotes`, **start coordinate only**, when `lookupPlaceNames` is on; threads the resolved name into render options. Collect a failure count and optionally emit one aggregated `Notice` ("N walks couldn't be geocoded — re-import when online").
- Render emits `near [[Place]]` in the body when a name is present, with a compact `© OpenStreetMap contributors` attribution (ODbL).
- **Execution note:** the cache + fail-soft behavior is the data-/quota-safety surface — unit-test the cache (no repeat lookups) and the fail-soft paths against a mocked fetch before wiring the live call.

**Patterns to follow:** orchestrator's async photo-byte resolution as the model for an async pre-write resolve step.

**Test scenarios:**
- `Covers AE2.` Happy: places-on + a mocked geocoder → `near [[<place>]]` + the OSM attribution in the note; places-off → no lookups, no link.
- `Covers AE3.` Cache (two levels): (a) a populated in-memory cache yields zero fetches; (b) the cache serialized after run 1 and reloaded in a fresh run 2 yields zero fetches — this round-trip is what AE3 ("no repeat calls" across re-imports) actually depends on, not the in-module cache alone.
- Edge/error: geocoder throws / empty / over-quota (429) / timeout → note written with no link (fail-soft), import not blocked; two walks whose start coords round to the same cell → a single lookup, both get the name.

**Verification:** with a mocked Nominatim, place links appear; cache prevents repeat calls; failures never block the import.

---

### U7. README + settings docs

**Goal:** Document the new context, dashboard, map, and the token/places settings.

**Requirements:** R11 (onboarding, doc side)

**Dependencies:** U1–U6

**Files:**
- Modify: `README.md`

**Approach:**
- Document the enriched note (Moments, Sky, Timeline, fuller stats/weather), the Dataview dashboard (and that it needs the Dataview plugin), the Mapbox token + how to get one + that the map needs the obsidian-leaflet plugin, and the place-names opt-in (with the OSM attribution + the privacy note that coordinates are sent to OpenStreetMap).

**Test scenarios:**
- Test expectation: none — docs only.

**Verification:** README accurately describes setup, dependencies, and the privacy/attribution notes.

---

## System-Wide Impact
- **Interaction graph:** All enrichment routes through the existing render → merge → writer path; the new async geocode step sits in the orchestrator beside photo-byte resolution. No change to the merge/skip contract.
- **State/idempotency:** New content changes the managed-region hash → un-edited notes auto-upgrade on re-import; edited notes are preserved (AE4). The geocode cache and the dashboard create-once guard are the new state surfaces.
- **External calls:** Mapbox (tiles, in-note at render time by Leaflet — not by Waymark) and Nominatim (reverse-geocoding, by Waymark during import via `requestUrl` + timeout). Both gated and fail-soft.
- **New seams:** a persistence seam (the geocode cache, loaded/saved by `main.ts` via the Plugin's `loadData`/`saveData`) and a content-carrying attachment write path (for the route `.geojson` sidecar) — both additive to the existing flow.
- **Disable/archive behavior:** clearing the token (or the places toggle) and re-importing re-renders un-edited notes to *remove* the map/place content (expected, but it touches all un-edited notes); `.geojson` sidecars for archived/removed walks are orphaned and left in place (same as orphaned photo attachments).
- **Unchanged invariants:** the v1 safe-edit contract, the `waymark-*` frontmatter allowlist, and the `## Notes` user area are untouched.

---

## Risk Analysis & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Nominatim usage-policy breach (rate, User-Agent, attribution) → IP block | Med | High | Throttle ≤1 req/sec, descriptive User-Agent, mandatory caching, attribution; verify current policy in impl; opt-in only |
| Privacy — start coords ≈ home sent to OSM | Med | Med | Opt-in (default off) + round coords before sending; document clearly |
| First import slow when places on (serial 1/sec geocoding) | High | Low | Cache (re-imports instant); fail-soft; document; consider start-only |
| obsidian-leaflet frozen/maintenance-mode or user lacks it | Med | Low | Pin to v6 block syntax; degrade to inert block; map is opt-in |
| Mapbox token URL-restricted → tiles 403 | Med | Low | Document: use an unrestricted public `pk.` token |
| Frontmatter value must stay scalar (FrontmatterValue + test fake) | Low | Med | Flat scalar keys only; covered by render tests through the fake |
| Re-import re-renders all un-edited notes (+ re-reads cache) | High | Low | Intended (auto-upgrade); cache avoids re-geocoding; documented |
| Mapbox token embedded in every note + data.json → leaks via sync/git/Publish; rotation rewrites all notes and leaves the old token in history | Med | Med | Treat the vault token as public; advise usage cap + gitignore data.json; investigate a plugin-level token to keep it out of notes; document |
| Persisted geocode cache in data.json = approximate-location history, replicated by sync | Low | Med | Store only the rounded coord key (never raw GPS); document; clear on disable |
| Sidecar `.geojson` `[[wikilink]]` may not resolve across folders in obsidian-leaflet | Med | Med | Verify resolution before U5; else write the sidecar beside the note or path-qualify the reference |
| Synchronous geocoding hangs/blocks the import (no timeout) | Med | Med | `requestUrl` + AbortController timeout; throttle + cache; fail-soft; aggregated notice; start-only reduces call count |

---

## Alternative Approaches Considered
- **Mapbox permanent geocoding (paid) for place names** — rejected: paid from request 1 + card-on-file; OSM/Nominatim is free and storable.
- **Static PNG map / embedded viewer pane** — rejected in brainstorm in favor of in-note Leaflet (interactive, lives in the note).
- **Inline GeoJSON in the leaflet block** — not supported by obsidian-leaflet; sidecar `.geojson` file is the only option.
- **One big render unit** — split into body (U1) and frontmatter+celestial (U2) for reviewable commits, though both touch `walk-note.ts`.

---

## Phased Delivery

### Phase A — offline enrichment (no token, no network)
- U1 (body), U2 (frontmatter + celestial), U3 (dashboard). Shippable on its own; delivers the enrichment + celestial hook + dashboard + theme-graph links.

### Phase B — map & places (token / network, opt-in)
- U4 (settings), U5 (Leaflet map), U6 (place backlinks). Then U7 (docs).

---

## Sources & References
- **Origin:** `docs/brainstorms/2026-06-01-waymark-walk-context-requirements.md`
- v1 plan precedent: `docs/plans/2026-05-31-001-feat-waymark-pilgrim-import-plan.md`
- Parser/types source of truth: `../pilgrim-viewer/src/parsers/types.ts`, `pilgrim.ts`
- obsidian-leaflet: https://github.com/javalent/obsidian-leaflet · Dataview: https://blacksmithgu.github.io/obsidian-dataview/ · Nominatim policy: https://operations.osmfoundation.org/policies/nominatim/ · Mapbox tiles: https://docs.mapbox.com/api/maps/static-tiles/
