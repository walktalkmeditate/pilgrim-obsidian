import type { DeletableSection, Modification, PilgrimManifest, Walk } from './types'

// Scope a manifest's modifications to a single walk. This filter is
// load-bearing: applyWalkMods archives the walk if ANY passed mod is
// archive_walk, so handing the whole manifest array to every walk would let
// one walk's edits or archival corrupt the others.
export function modsForWalk(mods: Modification[], walkId: string): Modification[] {
  return mods.filter((m) => m.walkId === walkId)
}

// Ids of walks the user archived. On a saved .pilgrim these walks are already
// absent from walks/, so this is the authoritative archived signal for import.
export function archivedWalkIds(manifest: PilgrimManifest): Set<string> {
  return new Set((manifest.archived ?? []).map((a) => a.id))
}

function epochSeconds(d: Date): number {
  return Math.floor(d.getTime() / 1000)
}

function collectDeleteKeys(mods: Modification[], op: Modification['op']): Set<number | string> {
  const keys = new Set<number | string>()
  for (const m of mods) {
    if (m.op !== op) continue
    if (op === 'delete_photo') {
      keys.add((m.payload as { localIdentifier: string }).localIdentifier)
    } else {
      keys.add((m.payload as { startDate: number }).startDate)
    }
  }
  return keys
}

// Replay one walk's staged modifications against the parsed walk.
//
// Mirrors pilgrim-viewer's applyMods for the content ops Waymark renders, with
// two deliberate v1 differences: stats are NOT recomputed (Waymark preserves
// the exported stats and never trims routes), and route-trim / waypoint ops are
// ignored (v1 renders no map). Returns null when the walk is archived, telling
// the caller to skip it.
//
// `mods` MUST already be scoped to this walk via modsForWalk.
export function applyWalkMods(walk: Walk, mods: Modification[]): Walk | null {
  if (mods.length === 0) return walk
  if (mods.some((m) => m.op === 'archive_walk')) return null

  const replace = mods.find((m) => m.op === 'replace_walk')
  if (replace) {
    return { ...(replace.payload as { walk: Walk }).walk, isUserModified: true }
  }

  let next: Walk = { ...walk }
  let changed = false

  for (const m of mods) {
    if (m.op === 'edit_intention') {
      next = { ...next, intention: (m.payload as { text: string }).text }
      changed = true
    } else if (m.op === 'edit_reflection_text') {
      const reflection = next.reflection ? { ...next.reflection } : {}
      reflection.text = (m.payload as { text: string }).text
      next = { ...next, reflection }
      changed = true
    }
  }

  const sectionDeletes = new Set<DeletableSection>()
  for (const m of mods) {
    if (m.op === 'delete_section') {
      sectionDeletes.add((m.payload as { section: DeletableSection }).section)
    }
  }
  if (sectionDeletes.size > 0) {
    if (sectionDeletes.has('intention')) next = { ...next, intention: undefined }
    if (sectionDeletes.has('reflection')) next = { ...next, reflection: undefined }
    if (sectionDeletes.has('weather')) next = { ...next, weather: undefined }
    if (sectionDeletes.has('celestial')) next = { ...next, celestial: undefined }
    changed = true
  }

  const photoDeletes = collectDeleteKeys(mods, 'delete_photo')
  if (photoDeletes.size > 0 && next.photos) {
    const remaining = next.photos.filter((p) => !photoDeletes.has(p.localIdentifier))
    next = { ...next, photos: remaining.length > 0 ? remaining : undefined }
    changed = true
  }

  const recDeletes = collectDeleteKeys(mods, 'delete_voice_recording')
  if (recDeletes.size > 0) {
    next = {
      ...next,
      voiceRecordings: next.voiceRecordings.filter(
        (r) => !recDeletes.has(epochSeconds(r.startDate)),
      ),
    }
    changed = true
  }

  for (const m of mods) {
    if (m.op !== 'edit_transcription') continue
    const p = m.payload as { recordingStartDate: number; text: string }
    next = {
      ...next,
      voiceRecordings: next.voiceRecordings.map((r) =>
        epochSeconds(r.startDate) === p.recordingStartDate ? { ...r, transcription: p.text } : r,
      ),
    }
    changed = true
  }

  return changed ? { ...next, isUserModified: true } : next
}
