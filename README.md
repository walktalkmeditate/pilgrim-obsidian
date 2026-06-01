# Waymark — Pilgrim for Obsidian

Bring your [Pilgrim](https://pilgrimapp.org) walks into Obsidian. Waymark imports a `.pilgrim` export and turns each walk into a Markdown note whose **transcribed voice reflection is the body** — searchable, wiki-linkable text that becomes part of your vault, not a record locked in another app.

> Status: v1.1. Manual import; an optional interactive map and place backlinks — see [Maps & place names](#maps--place-names-optional).

## What it does

- One Markdown note per walk, created in a folder you choose (default `Waymark/`).
- The note carries:
  - **Frontmatter** — date, distance, duration, pace, steps, intention, reflection word count, and celestial keys (moon phase + illumination, dominant element, planetary day, seasonal marker), plus provenance (the `.pilgrim` schema + Pilgrim app version + Waymark version). All keys are namespaced `waymark-*`, so they never collide with your own properties, and they're Dataview-friendly.
  - **Reflection** — each voice recording's transcription, in order, marked when AI-enhanced.
  - **Moments** — labelled waypoints as `[[wiki-links]]`, each with how far into the walk it was dropped.
  - **On this walk** — distance, duration, pace, ascent/descent, steps, time spoken/meditated, and the UTC time range.
  - **Timeline** — activities and pauses in order, each with how far into the walk it began.
  - **Sky** — moon phase + illumination, planetary hour, dominant element, and seasonal marker (when the export carries celestial data).
  - **Weather** — condition, temperature, humidity, and wind (when present).
  - **Map** — an interactive route map, when you add a Mapbox token (see below).
  - **Photos** — geo-located photos embedded inline (when the export contains them).
- Re-import is **idempotent**: running it again updates the existing notes in place (matched by a stable walk id), never creating duplicates.
- Edits made in the Pilgrim editor (edited transcriptions, archived walks) are replayed on import, so notes reflect your latest changes.

## Install

Until Waymark is in the community-plugin directory, install manually:

1. Download `main.js`, `manifest.json`, and `styles.css` from a [release](../../releases).
2. Copy them into your vault at `.obsidian/plugins/waymark/`.
3. Enable **Waymark** in *Settings → Community plugins*.

## Usage

1. In the Pilgrim app, export a `.pilgrim` file.
2. In Obsidian, run **“Import .pilgrim file…”** from the command palette, or click the footprints ribbon icon.
3. Pick the file. Waymark creates/updates one note per walk and shows a summary.

Set the destination folder in *Settings → Waymark → Walks folder*.

## Dashboard

On first import, Waymark drops a **“Waymark Dashboard”** note in your walks folder with [Dataview](https://github.com/blacksmithgu/obsidian-dataview) tables (all walks, full-moon walks, longest reflections). Install the Dataview community plugin to render them. The dashboard is created once and never overwritten, so you can edit it freely.

## Maps & place names (optional)

Both features are **off by default** and live in *Settings → Waymark*.

### Interactive route map

Each note can embed a route map rendered from the walk's GeoJSON:

1. Install the **[obsidian-leaflet](https://github.com/javalent/obsidian-leaflet)** community plugin — it draws the map.
2. Create a free **Mapbox** token at [account.mapbox.com/access-tokens](https://account.mapbox.com/access-tokens/) and paste it into *Settings → Waymark → Mapbox access token*.

On the next import, walks with a route gain a `## Map` section backed by a `.geojson` sidecar in the attachments folder. **Heads-up:** the token is written into your notes and `data.json`, so it travels with your vault — treat it as public and set a usage cap on it in your Mapbox account.

### Place backlinks

Turn on *Settings → Waymark → Look up place names* and each walk gains a `**Near:** [[Place]]` backlink, so walks from the same area cluster in your graph.

Place names come from **OpenStreetMap's Nominatim** service:

- Only the **approximate start** of each walk is sent, coarsened to ~100 m — for walks that begin at home, that's roughly your neighborhood, not your address.
- Results are **cached locally** so re-imports don't re-query, and lookups are throttled to honor Nominatim's usage policy.
- Each note attributes place names to **© OpenStreetMap contributors**, per the ODbL.

If a lookup fails, the walk simply gets no place name — the import never blocks.

## The safe-edit contract — important

Each note has a **Waymark-managed region** delimited by invisible comment markers:

```
%% waymark:begin id=… | Waymark-managed — edits here are not preserved; write below the end marker %%
…generated reflection, stats, photos…
%% waymark:end %%

## Notes        ← your space — anything here is never touched
```

- **Write your own notes *below* the end marker (the `## Notes` area), or anywhere outside the markers.** That content is yours and survives every re-import.
- If you edit *inside* the managed region, Waymark notices on the next import and **skips that walk rather than overwriting your edit** — it will be listed as “skipped — edited” in the import summary. Your words are never silently lost. (The trade-off: a walk you've hand-edited inside the region won't automatically pick up later app updates; reset the region if you want it regenerated.)
- If the markers get deleted, Waymark skips the note rather than rewriting it.

## Roadmap

- **Daily-note merge** — link or embed each walk into that day's daily note.
- **Theme / intention graph** — connect walks that share an intention or theme.
- A portable `.pilgrim → Markdown` engine so the same import can target other tools (Logseq, Day One, …).

## Development

```bash
npm install
npm run dev        # esbuild watch -> main.js
npm test           # vitest
npm run build      # typecheck + production bundle
```

The `.pilgrim` parser is vendored from the [pilgrim-viewer](https://github.com/momentmaker/pilgrim-viewer) project (the format's source of truth) and kept DOM-free; Waymark adds the Obsidian render and idempotent-write layers on top.

## License

[MIT](LICENSE)
