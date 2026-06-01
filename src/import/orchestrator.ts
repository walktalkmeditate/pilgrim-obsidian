import { applyWalkMods, archivedWalkIds, modsForWalk } from '../parse/apply-mods'
import { parsePilgrim } from '../parse/pilgrim'
import type { Walk } from '../parse/types'
import { buildDashboard, DASHBOARD_FILENAME } from '../render/dashboard'
import { resolvePlaceNames, type Geocoder } from './geocode'
import {
  writeFileIfAbsent,
  writeWalkNotes,
  type AppLike,
  type ImportTally,
  type WriterSettings,
} from '../vault/writer'

export interface ImportSettings {
  walksFolder: string
  waymarkVersion: string
  // Phase B (opt-in): map tiles + place geocoding. Absent/empty = offline behavior.
  mapboxToken?: string
  lookupPlaceNames?: boolean
  // Caller-owned: resolvePlaceNames mutates this in place so entries persist across
  // imports. Required (pass {} when offline) so results are never silently
  // discarded into a throwaway object.
  geocodeCache: Record<string, string>
  // Injectable reverse-geocoder seam (unused unless lookupPlaceNames is on).
  geocode?: Geocoder
}

export interface ImportSummary extends ImportTally {
  totalWalks: number
  archivedSkipped: number
  dashboardCreated: boolean
}

// Full import pipeline: parse the archive, replay each walk's edits, drop
// archived walks, then generate/update notes. Provenance is taken from the
// file's manifest so each note records the schema and app version that produced
// it.
export async function importPilgrim(
  app: AppLike,
  buffer: ArrayBuffer,
  settings: ImportSettings,
): Promise<ImportSummary> {
  // urlFactory is synchronous and Vault.createBinary is not, so the factory only
  // stashes each photo blob against a token; the bytes are resolved after parse
  // and written by the vault layer.
  const blobs = new Map<string, Blob>()
  let counter = 0
  const urlFactory = (blob: Blob): string => {
    const token = `waymark-photo-${counter++}`
    blobs.set(token, blob)
    return token
  }
  const { manifest, walks } = await parsePilgrim(buffer, { urlFactory, urlRevoker: () => {} })

  const photoBytes = new Map<string, ArrayBuffer>()
  for (const [token, blob] of blobs) {
    photoBytes.set(token, await blob.arrayBuffer())
  }

  const archived = archivedWalkIds(manifest)
  const mods = manifest.modifications ?? []
  const finalWalks: Walk[] = []
  let archivedSkipped = 0
  for (const walk of walks) {
    if (archived.has(walk.id)) {
      archivedSkipped++
      continue
    }
    const applied = applyWalkMods(walk, modsForWalk(mods, walk.id))
    if (!applied) {
      archivedSkipped++
      continue
    }
    finalWalks.push(applied)
  }

  const placeNames = await resolvePlaceNames(finalWalks, {
    lookup: settings.lookupPlaceNames === true,
    cache: settings.geocodeCache,
    geocoder: settings.geocode ?? (async () => null),
  })

  const writerSettings: WriterSettings = {
    walksFolder: settings.walksFolder,
    mapboxToken: settings.mapboxToken,
    placeNames,
    provenance: {
      schemaVersion: manifest.schemaVersion,
      appVersion: manifest.appVersion,
      waymarkVersion: settings.waymarkVersion,
    },
  }
  const tally = await writeWalkNotes(app, finalWalks, photoBytes, writerSettings)

  // The dashboard is a convenience; a failure here must not fail an import whose
  // walk notes and geocode cache have already been written.
  let dashboardCreated = false
  try {
    dashboardCreated = await writeFileIfAbsent(
      app,
      `${settings.walksFolder}/${DASHBOARD_FILENAME}`,
      buildDashboard(settings.walksFolder),
    )
  } catch (err) {
    console.error('Waymark: failed to create dashboard note', err)
  }

  return { ...tally, totalWalks: walks.length, archivedSkipped, dashboardCreated }
}

// One-line result message, with distinct wording for the empty, all-archived,
// and partial-skip outcomes so the user knows what happened and why.
export function summaryMessage(s: ImportSummary): string {
  const net = s.created + s.updated
  if (s.totalWalks === 0) return 'Waymark: no walks found in this file.'
  if (net === 0 && s.archivedSkipped === s.totalWalks) {
    return 'Waymark: all walks in this file are archived — nothing imported.'
  }
  const parts = [
    `Waymark imported ${net} walk${net === 1 ? '' : 's'} (${s.created} new, ${s.updated} updated)`,
  ]
  if (s.skippedEdited.length > 0) parts.push(`${s.skippedEdited.length} skipped — edited`)
  if (s.skippedNoMarkers.length > 0) parts.push(`${s.skippedNoMarkers.length} skipped — markers missing`)
  if (s.failed.length > 0) parts.push(`${s.failed.length} failed`)
  if (s.archivedSkipped > 0) parts.push(`${s.archivedSkipped} archived`)
  return parts.join(' · ')
}
