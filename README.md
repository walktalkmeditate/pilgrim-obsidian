# Waymark — Pilgrim for Obsidian

Bring your [Pilgrim](https://pilgrimapp.org) walks into Obsidian. Waymark imports a `.pilgrim` export and turns each walk into a Markdown note whose **transcribed voice reflection is the body** — searchable, wiki-linkable text that becomes part of your vault, not a record locked in another app.

> Status: v1 (early). Manual import, no map yet — see [Roadmap](#roadmap).

## What it does

- One Markdown note per walk, created in a folder you choose (default `Waymark/`).
- The note carries:
  - **Frontmatter** — date, distance, duration, intention, moon phase, and provenance (the `.pilgrim` schema + Pilgrim app version + Waymark version). All keys are namespaced `waymark-*`, so they never collide with your own properties, and they're Dataview-friendly.
  - **Reflection** — each voice recording's transcription, in order, marked when AI-enhanced.
  - **On this walk** — a distance / ascent / duration / spoken / meditated summary, plus weather and moon when present.
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

- **v1.1 — map / viewer pane.** Embed the open-source [Pilgrim viewer](https://view.pilgrimapp.org) in a pane to see the route map, photos, and stats together (the `.pilgrim` file carries route GeoJSON but no rendered map, so v1 ships no map).
- Daily-note merge, an intention/theme graph, Dataview dashboards, and place backlinks.
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
