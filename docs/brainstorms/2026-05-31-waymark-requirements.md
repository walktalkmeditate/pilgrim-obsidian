---
date: 2026-05-31
topic: waymark-obsidian-plugin
---

# Waymark — Pilgrim for Obsidian

## Summary

Waymark is an Obsidian plugin that turns a Pilgrim `.pilgrim` export into one Markdown note per walk, with the transcribed voice reflection as searchable, linkable body text. v1 is a pure plugin with manual, idempotent import — no app-side changes — and is the first *adapter* of a portable `.pilgrim` → Markdown idea that gets extracted later.

---

## Problem Frame

Pilgrim captures something most apps don't: spoken contemplative thought while walking, transcribed, time-stamped, and place-stamped, alongside an intention, a reflection, a route, photos, and a celestial context. Today that material lives only inside the app and the standalone web viewer (`view.pilgrimapp.org`) — both of which are *view-only*. A walk is something you look back at, not something you can weave into the rest of your thinking.

For the person who both walks with Pilgrim and keeps an Obsidian vault — the PKM / journaling / quantified-self overlap — that's a real loss. Their most reflective material is the one corpus their second brain can't see, search, or link to. There's no path from "I said something that mattered on a walk" to "that thought is now connected to everything else I think about." The pain is mild per walk but compounds: months of reflections that should have become a connected body of thought instead stay locked in a format only one app can open.

A community member, unprompted, suggested integrating Pilgrim with Obsidian. The specifics were theirs to imagine; the direction — *get my walking reflections into the place I keep my thinking* — is the bet.

---

## Actors

- A1. **Pilgrim + Obsidian user** — walks with Pilgrim and keeps an Obsidian vault; exports `.pilgrim` and imports it to make reflections part of their searchable, linkable knowledge.
- A2. **Pilgrim app (iOS / Android)** — produces the `.pilgrim` export and is the upstream owner of the format. Waymark consumes its output; it does not change the app.
- A3. **Obsidian vault & ecosystem** — the host environment that supplies full-text search, wikilinks, backlinks, frontmatter, and (in later vision) Dataview, Leaflet, and daily notes.

---

## Key Flows

- F1. **First import**
  - **Trigger:** A1 runs Waymark's import on a `.pilgrim` file.
  - **Actors:** A1, A3
  - **Steps:** Pick the file → parse it into a walk model → generate one note per walk: transcription as body prose, structured frontmatter, map and photos attached when present → notes land in the vault.
  - **Outcome:** Every walk is a browsable, searchable, wiki-linkable note; the reflection is plain text in the body.
  - **Covered by:** R1, R2, R3, R4, R5

- F2. **Re-import / update**
  - **Trigger:** A1 re-imports an updated export (e.g., a transcription finished processing, or an intention was edited in the app).
  - **Actors:** A1, A3
  - **Steps:** Parse → match walks by stable UUID → update the matching notes in place, preserving the user's own added content → add notes for new walks → leave unchanged walks untouched.
  - **Outcome:** The vault reflects the latest export with no duplicate walks and no lost user edits.
  - **Covered by:** R6, R7, R8
  - **Escape path:** When a note can't be safely matched or reconciled, the exact behavior is deferred to planning (see Outstanding Questions).

- F3. **Re-encounter & link**
  - **Trigger:** A1 searches or browses the vault weeks or months later.
  - **Actors:** A1, A3
  - **Steps:** Full-text search surfaces a phrase from a transcription → A1 wiki-links a phrase to a concept note → backlinks now connect the walk to the rest of their thinking.
  - **Outcome:** A past spoken reflection becomes a connected node in the knowledge graph.
  - **Covered by:** R2, R3

---

## Requirements

**Import & note generation**
- R1. Import a user-selected `.pilgrim` file from within Obsidian and generate one Markdown note per walk into the vault.
- R2. Each walk-note carries the walk's transcribed voice reflection(s) as the note body, rendered as readable prose — searchable and wiki-linkable like any other vault text. This is the load-bearing content of the note.
- R3. Each walk-note has frontmatter describing the walk's structured details (e.g., date, duration, distance, intention, place, weather, moon phase) using a stable, typed, documented schema.
- R4. When a walk has a map and/or geo-located photos, they are embedded in the note; a walk with neither still produces a complete, valid note.
- R5. Notes are self-contained — photos and map are stored as vault attachments referenced by the note — so a single note can be moved or published (e.g., in a digital garden) without broken links.

**Re-import (idempotency)**
- R6. Re-importing an export updates the existing walk-notes in place rather than creating duplicates, keyed on each walk's stable identifier (UUID).
- R7. Re-import must not destroy content the user added to a note (wiki-links, highlights, appended notes). The preservation mechanism is deferred to planning; the non-destruction guarantee is a v1 requirement.
- R8. Each note records provenance: the source `.pilgrim` schema version, the Pilgrim app version, and the Waymark version that generated it.

**Architecture (future-proofing)**
- R9. The parse layer (`.pilgrim` → normalized walk model) is kept separate from the render layer (walk model → Obsidian markdown), so future adapters (other tools) can reuse the parse/model layer without untangling Obsidian-specific code. *(Structural requirement; reason: the future multi-adapter engine.)*

**Distribution**
- R10. Waymark is packaged to be installable as an Obsidian community plugin, with "Pilgrim" present in the searchable plugin id/name so existing app users can find it.

---

## Acceptance Examples

- AE1. **Covers R4.** Given a `.pilgrim` walk that has a transcription but no photos and no map, when imported, then a complete note is created with the transcription body and frontmatter and no broken image references.
- AE2. **Covers R6.** Given a vault that already contains notes from a prior import, when the user re-imports an export where one walk gained a transcription, then that walk's existing note is updated in place and no second note for the same walk is created.
- AE3. **Covers R7.** Given a walk-note the user has edited (added a wiki-link and a paragraph of their own), when the source walk is re-imported with updated app content, then the regenerated walk content reflects the update while the user's link and paragraph remain intact.

---

## Success Criteria

- A Pilgrim+Obsidian user can, in one import, turn their walks into notes whose transcribed reflections they search, re-read, and link — and they come back to do it again (habit), with a single walk-note good enough to share or publish on its own (artifact). *(Framed around habit + shareable artifact, since demand is currently n=1.)*
- Running import repeatedly is safe: it never duplicates walks and never destroys user-added content.
- ce-plan can build v1 without inventing product behavior — note anatomy, frontmatter schema intent, the idempotency rule, and the parse/render separation are all specified here.
- Future-proofing is observable: the Future Vision items (auto-sync, multi-adapter engine, AI review) can be added later without changing v1's note format or its re-import contract.

---

## Scope Boundaries

### Deferred for later

These are recorded so v1's design stays aligned with them (see Key Decisions), not built in v1:

- **Daily-note merge** — drop a walk summary into that day's daily note.
- **Theme graph** — intentions/reflections as linkable, tagged nodes; a graph of what you've worked through over time.
- **Dataview dashboards** — distance YTD, full-moon walks, longest reflections, built on the frontmatter schema.
- **Place backlinks** — auto-link routes so walks cluster (e.g., `[[Camino de Santiago]]`).
- **Interactive in-vault maps** — Leaflet from the route GeoJSON.
- **Auto-sync** — the walk note appears hands-free minutes after a walk ends (needs app-side export changes).
- **Contemplative AI review** — themes and arcs across a season of transcriptions.
- **Celestial hook** — moon-phase / planetary-hour queries (the data is already in the file).
- **Multi-adapter engine** — Logseq, Day One, Readwise, Notion from the same parse/model core.
- **Advanced re-import conflict UX** — beyond the v1 non-destruction guarantee (R7), richer merge/diff handling is later work.

### Outside this product's identity

- **Bidirectional sync** (Obsidian → Pilgrim, e.g., setting a walk's intention from a note) — Waymark consumes exports; it is not a remote control for the app.
- **Defining or owning the `.pilgrim` format spec** — the format lives upstream in the app and viewer. Waymark consumes it and proves it travels; it does not define it.
- **A general-purpose GPS/notes importer** — Waymark is specifically the Pilgrim contemplative-walk adapter, not a generic track importer.

---

## Key Decisions

- **Idempotent, update-in-place re-import keyed on walk UUID** — manual import is run repeatedly and auto-sync later depends on it; this avoids duplicate-note sprawl.
- **Never destroy user-added content on re-import** — the entire value is linking and annotating; clobbering edits would poison the core use case.
- **Transcription is load-bearing; map / photos / dashboards are supporting** — it is the unique, defensible value and the thing the community signal pointed at.
- **Pure plugin + manual import for v1; no app-side changes** — solo-shippable with zero dependency on the iOS/Android repos.
- **Parse/model layer separated from the render layer** — lets the multi-adapter engine extract cheaply instead of being untangled later.
- **Stable, typed, documented frontmatter + per-note provenance** — enables Dataview, AI review, and format migrations down the line.
- **Waymark consumes the format, does not define it** — format ownership stays upstream; the "establish `.pilgrim` as a format" goal is served indirectly by proving the format travels into a real second tool.
- **Name: Waymark ("Waymark — Pilgrim for Obsidian")** — evocative soul-name with "Pilgrim" kept as the searchable directory anchor.

---

## Dependencies / Assumptions

- Depends on the `.pilgrim` format as produced by Pilgrim iOS/Android: a ZIP of `manifest.json` + `walks/*.json` + `photos/*.jpg`, where each walk JSON carries transcription, intention, reflection, route GeoJSON, weather, celestial context, and photos. *(Verified against the reference parser at `../pilgrim-viewer/src/parsers/pilgrim.ts` and `../pilgrim-viewer/src/parsers/types.ts`.)*
- Assumes the target user keeps an Obsidian vault and exports their own `.pilgrim` — the Pilgrim/PKM overlap.
- Transcriptions are optional in the format (`VoiceRecording.transcription?`). Walks without transcriptions still import, but the load-bearing body content will be empty for those walks. *(Verified.)*
- Demand is currently n=1 — one unprompted community suggestion — treated as a hypothesis to validate, not a validated requirement.
- Assumes Obsidian's plugin API permits reading a user-selected file and writing notes + attachments into the vault. *(Unverified — confirm specifics during planning.)*

---

## Outstanding Questions

### Deferred to Planning

- [Affects R7][Technical] Exact mechanism for preserving user edits on re-import — e.g., a managed/generated region vs. whole-file regeneration vs. frontmatter-only update.
- [Affects R3][Needs research] The precise v1 frontmatter schema (which fields, key names, types), drafted against the verified `.pilgrim` walk model.
- [Affects R4][Technical] How (and whether) v1 produces the static map image — rendered ahead of time, bundled, or deferred so v1 ships text + photos first.
- [Affects R2] How multiple voice recordings within a single walk are laid out in the body (chronological sections, timestamps, headings).
- [Affects R1][Needs research] Obsidian plugin API specifics for file selection and attachment writing.

---

## Appendix — Visual aids

**Walk-note anatomy (v1):**

```
┌─ 2026-05-31 — Morning walk ───────────────────────────┐
│ ---                                                    │
│ date: 2026-05-31         distance: 6.2 km              │
│ duration: 1h04m          intention: patience          │
│ place: Kumano Kodo       moon: waning gibbous          │
│ source_schema: 1.x  app: 1.6  waymark: 0.1  (provenance)│
│ ---                                                    │
│                                                        │
│ ![map](attachments/walk-uuid-map.png)                 │
│                                                        │
│ ## Reflection (transcription)        ← load-bearing    │
│ "I kept circling back to the idea that..."  ← linkable │
│                                                        │
│ ![photo](attachments/walk-uuid-1.jpg)                 │
└────────────────────────────────────────────────────────┘
```

**Layering (future-proofing, R9):**

```
.pilgrim ──▶ [ parse → walk model ]  ──▶ [ render: Obsidian ]   ◀ v1
                      │
                      └────────────────▶ [ render: Logseq ]     ◀ future
                                          [ render: Day One ]    ◀ future
                                          [ AI theme review ]    ◀ future
```
