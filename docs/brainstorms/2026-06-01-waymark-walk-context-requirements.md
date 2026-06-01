---
date: 2026-06-01
topic: waymark-walk-context
---

# Waymark v1.1 — Full Walk Context

## Summary

Enrich each imported walk-note with the context the `.pilgrim` already carries but v1 drops — pinned waypoints, full celestial detail, fuller stats, an activity/pause timeline, full weather — plus a Dataview starter dashboard, theme-graph links, and an interactive per-note map. Structured values go to frontmatter (queryable); meaningful context goes in the body; the transcription stays the centerpiece. The map and place backlinks are opt-in online features powered by the user's own Mapbox token; everything else is fully offline.

---

## Problem Frame

v1 turns a walk into a note whose body is the transcribed reflection, with a compact summary (distance, duration, weather, moon) and photos. But a `.pilgrim` walk holds far more that never reaches the page: the **waypoints** the walker pinned mid-route ("Peaceful", "Grateful"), the full **celestial** snapshot, the **activity/pause** structure of the walk, pace, steps, and full weather. That context is what makes a walk *recallable* months later and *connectable* across walks — and right now it's stranded in the file (or only visible inside the Pilgrim app). The walker who imports into Obsidian wants the note to be a complete record of the walk, not a summary of it — and wants those details to power the things Obsidian is good at: querying, graph-clustering, and seeing the route.

This builds directly on v1's data layer (see origin: `docs/brainstorms/2026-05-31-waymark-requirements.md`); it does not change the import or the merge contract.

---

## Actors

- A1. **Pilgrim + Obsidian walker** — imports `.pilgrim` files; wants the full walk context in their notes and to query/cluster/map it.
- A2. **Pilgrim app** — produces the `.pilgrim`; upstream owner of the data and format. Unchanged by this work.
- A3. **Obsidian ecosystem** — host; the **Dataview** and **obsidian-leaflet** community plugins are optional enhancers (dashboard, map) that degrade gracefully when absent.
- A4. **Mapbox** — external service the *user* authenticates to with their own token, used only for map tiles and reverse-geocoding. No Waymark-hosted service sits between the user and Mapbox.

---

## Key Flows

- F1. **Enriched import (offline)**
  - **Trigger:** A1 imports (or re-imports) a `.pilgrim`.
  - **Steps:** parse → for each walk, render the enriched note (waypoints, celestial, stats+pace, timeline, weather) with structured values in frontmatter and meaningful context in the body → write idempotently into the managed region.
  - **Outcome:** each walk-note is a complete record; structured context is Dataview-queryable.
  - **Covered by:** R1–R8, R14

- F2. **Turn on the map (online)**
  - **Trigger:** A1 opens Waymark settings, follows the in-app guidance to create a free Mapbox token, and pastes it.
  - **Steps:** subsequent imports embed a Leaflet route map per note and reverse-geocode start/end into place links.
  - **Outcome:** notes show an interactive route map and cluster by place; with no token, neither appears and notes stay complete + offline.
  - **Covered by:** R11, R12, R13

---

## Requirements

**Context enrichment (offline)**
- R1. Render pinned **waypoints** (label, time of day, icon) as a "Moments" list in the note body.
- R2. Render the **full celestial** context — moon phase / illumination / age / waxing, planetary positions, planetary hour + day, element balance + dominant, seasonal marker, zodiac system — with the structured/numeric values in frontmatter and a readable summary in the body.
- R3. Expand the **stats** summary to add **steps** and **pace** (average + range, derived from the route's speed samples). Do **not** surface heart rate or burned energy.
- R4. Render an **activity** (walk/talk/meditate) and **pause** **timeline** in the body.
- R5. Render **full weather** — condition, temperature, humidity, wind.
- R6. Render **start/end clock times**.
- R7. Omit any field or section absent from a given walk (no empty keys or dangling headings). The transcription remains the centerpiece — context sections sit below it.
- R8. Put structured/numeric context into the stable, typed `waymark-*` frontmatter schema so it is Dataview-queryable (this is the "celestial hook": e.g. query full-moon walks).

**Discovery layer (offline)**
- R9. Generate a starter **Dataview dashboard** note (e.g. distance YTD, full-moon walks, longest reflections). Created once; never overwritten if the user has edited it; degrades to a friendly instruction when Dataview isn't installed.
- R10. Emit **theme-graph links**: waypoint labels become wiki-links so the graph view clusters recurring moments. Intention stays a frontmatter value (free-text, not a tidy tag).

**Map & places (online, token-gated)**
- R11. Add a **Mapbox token** setting with in-settings guidance on obtaining a free token (link + brief steps).
- R12. When a token is set, embed an **interactive Leaflet route map** in each note (a `leaflet` code block + the route GeoJSON, Mapbox tiles). Requires the community obsidian-leaflet plugin; renders as a plain code block if it's absent. With no token, no map block is emitted.
- R13. When a token is set, reverse-geocode the route's start (and end) coordinates to place names via Mapbox and emit **place wiki-links** so walks cluster by place. Cache geocode results to avoid repeat calls. With no token, omit place names (waypoint labels remain the offline stand-in).

**Compatibility**
- R14. All generated enrichment lives inside the existing managed region and obeys v1's idempotent-merge + preserve-on-edit contract. A re-import after v1.1 auto-upgrades any walk-note the user hasn't hand-edited — no migration step.

---

## Acceptance Examples

- AE1. **Covers R7.** Given a walk with no waypoints, no celestial data, and no weather, when imported, then those sections are omitted entirely, the note is still complete, and the transcription is present.
- AE2. **Covers R12, R13.** Given no Mapbox token is set, when a walk is imported, then the note contains no map block and no place links; given a token is set, then the note contains a Leaflet map block and place wiki-links.
- AE3. **Covers R13.** Given a token is set and a set of walks already imported, when the same walks are re-imported, then cached geocoding results are reused and no repeat Mapbox calls are made for unchanged coordinates.
- AE4. **Covers R14.** Given a walk-note the user edited inside the managed region, when v1.1 re-imports, then that note is preserved (skipped), while un-edited notes receive the richer content.

---

## Success Criteria

- A single re-import turns existing notes into a complete record of each walk (moments, sky, stats, timeline) with no manual re-work, and the transcription stays the focal point.
- The structured frontmatter makes "show my full-moon walks" and a walks dashboard work via Dataview.
- With a Mapbox token, each note shows an interactive route map and clusters by place; without one, notes are still complete and fully offline.
- ce-plan can build it without inventing behavior: field→frontmatter/body placement intent, the offline/online phase split, the plugin/token dependencies, and the managed-region contract are all specified here.

---

## Scope Boundaries

- **No AI/LLM generation or prompt-assembly** (the iOS prompt text) — faithful rendering of existing data only.
- **No heart rate or burned energy** — not produced/wanted (heart rate is also dropped by the parser).
- **Map mechanism is Leaflet-in-note** — the embedded-viewer pane and static-PNG map are set aside (the viewer pane remains a possible future direction).
- **No Waymark-hosted geocoding or tiles** — the user supplies their own Mapbox token; Waymark never proxies a service.
- **Geocoded place names require a token** — without one there are no place names (by design), only waypoint labels.
- Still deferred (from origin): auto-sync, multi-adapter engine, daily-note merge, contemplative AI review, advanced re-import conflict UX.
- Outside the product's identity (unchanged): bidirectional sync, owning the `.pilgrim` spec, becoming a general-purpose GPS importer.

---

## Key Decisions

- **Rich but curated** — structured/numeric context → frontmatter, meaningful context → body, raw sample arrays and niche fields skipped; transcription stays the centerpiece.
- **Two-phase delivery** — the offline set (enrichment, celestial hook, Dataview dashboard, theme-graph links) ships token-free; maps + place backlinks are the token-gated online phase.
- **Local-first core, opt-in online enrichment** — the map and places need the user's own Mapbox token (and, for the map, the Leaflet plugin); with neither, notes are complete and offline. No Waymark service, no lock-in.
- **Drop heart rate and burned energy.**
- **Waypoint labels → wiki-links** (clean graph nodes); **intention stays frontmatter** (free-text, not a tag) — so the "theme graph" is calibrated to waypoints, not intentions.
- **Geocode results are cached** and token-gated; absence is graceful, never an error.
- **Enrichment lives in the managed region** → re-import auto-upgrades un-edited notes; no migration.
- **Optional-plugin posture** — the map degrades to a code block without obsidian-leaflet; the dashboard degrades to instructions without Dataview.

---

## Dependencies / Assumptions

- The needed context is in the parsed walk model or raw walk JSON: waypoints (route `Point` features with label/icon/timestamp), `CelestialContext`, `stats.steps`, route speed samples (pace), `activities`, `pauses`, `weather`. *(Verified against `../pilgrim-viewer/src/parsers/types.ts` and `pilgrim.ts`.)*
- Heart rate exists in the raw walk JSON but is dropped by the parser and is not wanted; burned energy is optional and often absent. *(Verified.)*
- The Mapbox token is the user's own (free tier), used for both Leaflet tiles and reverse-geocoding; network is required only for those two features.
- The community **obsidian-leaflet** plugin is available and current — confirm during planning. *(Unverified.)*
- The **Dataview** plugin is commonly installed; the dashboard degrades gracefully when it isn't.
- Reverse-geocoding has rate limits / cost on the user's token, so caching is required, not optional.

---

## Outstanding Questions

### Deferred to Planning

- [Affects R2, R3, R8][Needs research] The exact `waymark-*` frontmatter keys for the celestial and stats additions (names, types).
- [Affects R10] Theme-graph encoding — wiki-links vs tags for waypoint labels, and whether to normalize labels.
- [Affects R12][Needs research] Leaflet block format and how the route GeoJSON is supplied (inline vs a sidecar file), and whether waypoints render as map markers. Confirm obsidian-leaflet is current.
- [Affects R13][Needs research] Mapbox geocoding endpoint, cache location/format, start-only vs start+end, and place-name granularity.
- [Affects R9] The dashboard's exact queries, note location, and create-once behavior.
- [Affects R12] Whether to omit the map block entirely vs. emit a friendly placeholder when no token / no Leaflet plugin.

---

## Appendix — Enriched note anatomy (v1.1)

```
---  (frontmatter: waymark-id, dates, distance-km, steps, pace-avg,
      moon, moon-illumination, element-dominant, planetary-day,
      seasonal-marker, …  ← structured + Dataview-queryable)
%% waymark:begin id=<uuid> … %%
> **Intention** — …

## Reflection            ← transcription(s)  (the centerpiece)

## Moments               ← waypoints: "09:10 · [[Peaceful]]", "09:36 · [[Grateful]]"
## On this walk          ← distance, duration, ascent/descent, pace, steps, talk, meditate
## Timeline              ← walk ↔ talk ↔ meditate segments + pauses
## Sky                   ← moon, planetary hour, element balance, seasonal marker
## Weather               ← condition, temp, humidity, wind
near [[Riverside Park]]  ← place backlinks  (token only)
```leaflet                ← interactive route map  (token + Leaflet plugin only)
…route…
```
%% waymark:end id=<uuid> %%

## Notes                 ← user's space, never touched
```
```
