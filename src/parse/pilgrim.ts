import JSZip from 'jszip'
import type {
  Walk,
  WalkPhoto,
  WalkStats,
  Weather,
  Reflection,
  VoiceRecording,
  Activity,
  Pause,
  CelestialContext,
  GeoJSONFeatureCollection,
  PilgrimManifest,
} from './types'

interface Interval {
  start: number
  end: number
}

interface RawActivity {
  type: string
  startDate: number | Date
  endDate: number | Date
}

interface RawVoiceRecording {
  startDate: number | Date
  endDate: number | Date
  duration: number
  transcription?: string
  wordsPerMinute?: number
  isEnhanced?: boolean
}

interface RawPause {
  startDate: number | Date
  endDate: number | Date
  type: string
}

interface RawWalkPhoto {
  localIdentifier: string
  capturedAt: number | Date
  capturedLat: number
  capturedLng: number
  keptAt?: number | Date
  embeddedPhotoFilename?: string | null
  // Base64 data URL injected by the iOS JS bridge (in-app "My
  // Journey" viewer). When present, used as the photo URL directly
  // — skips the embeddedPhotoFilename + ZIP blob URL lookup.
  inlineUrl?: string | null
}

function epochToDate(epoch: number | Date): Date {
  if (epoch instanceof Date) return epoch
  return new Date(epoch * 1000)
}

function convertRouteTimestamps(route: GeoJSONFeatureCollection): GeoJSONFeatureCollection {
  return {
    ...route,
    features: route.features.map((f) => ({
      ...f,
      properties: {
        ...f.properties,
        timestamps: f.properties.timestamps
          ? f.properties.timestamps.map((t) => t * 1000)
          : undefined,
      },
    })),
  }
}

function mergeOverlappingIntervals(intervals: Interval[]): Interval[] {
  if (intervals.length === 0) return []

  const sorted = [...intervals].sort((a, b) => a.start - b.start)
  const merged: Interval[] = [sorted[0]]

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i]
    const last = merged[merged.length - 1]

    if (current.start <= last.end) {
      last.end = Math.max(last.end, current.end)
    } else {
      merged.push(current)
    }
  }

  return merged
}

function subtractIntervals(totalStart: number, totalEnd: number, occupied: Interval[]): Interval[] {
  const gaps: Interval[] = []
  let cursor = totalStart

  for (const interval of occupied) {
    if (interval.start > cursor) {
      gaps.push({ start: cursor, end: interval.start })
    }
    cursor = Math.max(cursor, interval.end)
  }

  if (cursor < totalEnd) {
    gaps.push({ start: cursor, end: totalEnd })
  }

  return gaps
}

export function deriveActivities(
  startDate: Date,
  endDate: Date,
  rawActivities: RawActivity[],
  voiceRecordings: RawVoiceRecording[],
  pauses: RawPause[]
): Activity[] {
  const startMs = startDate.getTime()
  const endMs = endDate.getTime()

  const meditationIntervals: Interval[] = rawActivities
    .filter(a => a.type === 'meditation')
    .map(a => ({
      start: epochToDate(a.startDate).getTime(),
      end: epochToDate(a.endDate).getTime(),
    }))

  const talkIntervals: Interval[] = mergeOverlappingIntervals(
    voiceRecordings.map(vr => ({
      start: epochToDate(vr.startDate).getTime(),
      end: epochToDate(vr.endDate).getTime(),
    }))
  )

  const pauseIntervals: Interval[] = pauses.map(p => ({
    start: epochToDate(p.startDate).getTime(),
    end: epochToDate(p.endDate).getTime(),
  }))

  const talkWithoutMeditation: Interval[] = []
  for (const talk of talkIntervals) {
    let segments: Interval[] = [talk]
    for (const med of meditationIntervals) {
      const next: Interval[] = []
      for (const seg of segments) {
        if (med.start >= seg.end || med.end <= seg.start) {
          next.push(seg)
        } else {
          if (seg.start < med.start) {
            next.push({ start: seg.start, end: med.start })
          }
          if (seg.end > med.end) {
            next.push({ start: med.end, end: seg.end })
          }
        }
      }
      segments = next
    }
    talkWithoutMeditation.push(...segments)
  }

  const allOccupied = mergeOverlappingIntervals([
    ...meditationIntervals,
    ...talkWithoutMeditation,
    ...pauseIntervals,
  ])

  const walkIntervals = subtractIntervals(startMs, endMs, allOccupied)

  const activities: Activity[] = []

  for (const interval of meditationIntervals) {
    activities.push({
      type: 'meditate',
      startDate: new Date(interval.start),
      endDate: new Date(interval.end),
    })
  }

  for (const interval of talkWithoutMeditation) {
    activities.push({
      type: 'talk',
      startDate: new Date(interval.start),
      endDate: new Date(interval.end),
    })
  }

  for (const interval of walkIntervals) {
    activities.push({
      type: 'walk',
      startDate: new Date(interval.start),
      endDate: new Date(interval.end),
    })
  }

  activities.sort((a, b) => a.startDate.getTime() - b.startDate.getTime())

  return activities
}

function parseStats(raw: Record<string, unknown>): WalkStats {
  return {
    distance: raw.distance as number,
    activeDuration: raw.activeDuration as number,
    pauseDuration: raw.pauseDuration as number,
    ascent: raw.ascent as number,
    descent: raw.descent as number,
    steps: raw.steps as number | undefined,
    burnedEnergy: raw.burnedEnergy as number | undefined,
    talkDuration: raw.talkDuration as number,
    meditateDuration: raw.meditateDuration as number,
  }
}

function parseWeather(raw: Record<string, unknown> | undefined): Weather | undefined {
  if (!raw) return undefined
  return {
    temperature: raw.temperature as number,
    condition: raw.condition as string,
    humidity: raw.humidity as number | undefined,
    windSpeed: raw.windSpeed as number | undefined,
  }
}

function parseReflection(
  raw: Record<string, unknown> | undefined
): { reflection?: Reflection; celestial?: CelestialContext } {
  if (!raw) return {}

  const { celestialContext, ...rest } = raw as Record<string, unknown> & { celestialContext?: CelestialContext }

  const reflection: Reflection = {
    style: rest.style as string | undefined,
    text: rest.text as string | undefined,
  }

  const hasContent = reflection.style !== undefined || reflection.text !== undefined
  return {
    reflection: hasContent ? reflection : undefined,
    celestial: celestialContext as CelestialContext | undefined,
  }
}

function parseVoiceRecordings(raw: RawVoiceRecording[]): VoiceRecording[] {
  return raw.map(vr => ({
    startDate: epochToDate(vr.startDate),
    endDate: epochToDate(vr.endDate),
    duration: vr.duration,
    transcription: vr.transcription,
    wordsPerMinute: vr.wordsPerMinute,
    isEnhanced: vr.isEnhanced,
  }))
}

function parsePauses(raw: RawPause[]): Pause[] {
  return raw.map(p => ({
    startDate: epochToDate(p.startDate),
    endDate: epochToDate(p.endDate),
    type: p.type,
  }))
}

// Walk photos are linked to the ZIP's photos/ subdirectory by the raw
// entry's `embeddedPhotoFilename`. Each entry must carry a full shape
// (localIdentifier, capturedAt, capturedLat, capturedLng, filename)
// AND the filename must resolve to a URL in the map — otherwise the
// entry is silently dropped so the downstream map renderer and panel
// grid only ever see complete, well-typed photo records. Defense in
// depth: iOS never writes malformed entries (PilgrimPackageBuilder
// drops them before encoding), but hand-crafted or future-format
// archives could include garbage that would otherwise crash Stage B
// marker creation on `[undefined, undefined]` coordinates.
function parseWalkPhotos(
  raw: unknown,
  photoUrls: Map<string, string>,
): WalkPhoto[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined

  const photos: WalkPhoto[] = []
  for (const rp of raw) {
    if (rp == null || typeof rp !== 'object') continue
    const entry = rp as Partial<RawWalkPhoto>

    // Resolve photo URL from either source:
    //   1. inlineUrl — base64 data URL from the iOS JS bridge
    //      (in-app "My Journey" viewer, no ZIP involved)
    //   2. embeddedPhotoFilename — mapped to a blob URL via the
    //      ZIP's photos/ directory (standalone viewer file drop)
    let url: string | undefined
    if (typeof entry.inlineUrl === 'string' && entry.inlineUrl.length > 0) {
      url = entry.inlineUrl
    } else {
      const filename = entry.embeddedPhotoFilename
      if (typeof filename !== 'string' || filename.length === 0) continue
      url = photoUrls.get(filename)
    }
    if (!url) continue

    if (typeof entry.localIdentifier !== 'string') continue
    if (typeof entry.capturedLat !== 'number' || !Number.isFinite(entry.capturedLat)) continue
    if (entry.capturedLat < -90 || entry.capturedLat > 90) continue
    if (typeof entry.capturedLng !== 'number' || !Number.isFinite(entry.capturedLng)) continue
    if (entry.capturedLng < -180 || entry.capturedLng > 180) continue
    if (typeof entry.capturedAt !== 'number' && !(entry.capturedAt instanceof Date)) continue

    const capturedAt = epochToDate(entry.capturedAt)
    if (Number.isNaN(capturedAt.getTime())) continue

    photos.push({
      localIdentifier: entry.localIdentifier,
      capturedAt,
      lat: entry.capturedLat,
      lng: entry.capturedLng,
      url,
    })
  }

  if (photos.length === 0) return undefined

  photos.sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime())
  return photos
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parsePilgrimWalkJSON(raw: any, photoUrls?: Map<string, string>): Walk {
  const startDate = epochToDate(raw.startDate)
  const endDate = epochToDate(raw.endDate)
  const voiceRecordings = parseVoiceRecordings(raw.voiceRecordings ?? [])
  const pauses = parsePauses(raw.pauses ?? [])
  const rawActivities = (raw.activities ?? []) as RawActivity[]

  const { reflection, celestial } = parseReflection(raw.reflection)

  const activities = deriveActivities(
    startDate,
    endDate,
    rawActivities,
    raw.voiceRecordings ?? [],
    raw.pauses ?? []
  )

  const photos = parseWalkPhotos(raw.photos, photoUrls ?? new Map())

  const walk: Walk = {
    id: raw.id,
    startDate,
    endDate,
    stats: parseStats(raw.stats),
    route: convertRouteTimestamps(raw.route as GeoJSONFeatureCollection),
    voiceRecordings,
    activities,
    pauses,
    source: 'pilgrim',
  }

  if (raw.weather) walk.weather = parseWeather(raw.weather)
  if (raw.intention) walk.intention = raw.intention
  if (reflection) walk.reflection = reflection
  if (celestial) walk.celestial = celestial
  if (raw.favicon) walk.favicon = raw.favicon
  if (photos) walk.photos = photos

  return walk
}

// Stage 5 (v1.3) — Pilgrim archives may include a top-level `photos/`
// subdirectory carrying JPEGs for each walk's pinned reliquary photos.
// The viewer extracts them into per-photo blob URLs and hands a
// filename → URL map to `parsePilgrimWalkJSON`, which attaches matching
// photos to each walk. Archives without `photos/` parse unchanged.
//
// `options.urlFactory` and `options.urlRevoker` are injection seams for
// tests so they don't depend on `URL.createObjectURL`/`revokeObjectURL`
// being available in the test environment (they aren't in plain Node).
// Production callers get the browser defaults. Callers are responsible
// for revoking each `walk.photos[].url` via `URL.revokeObjectURL`
// before discarding the walks — parsePilgrim only cleans up orphans
// (photos/*.jpg not referenced by any walk) and the error path.
export async function parsePilgrim(
  buffer: ArrayBuffer,
  options?: {
    urlFactory?: (blob: Blob) => string
    urlRevoker?: (url: string) => void
  },
): Promise<{ manifest: PilgrimManifest; walks: Walk[]; rawWalks: unknown[] }> {
  const urlFactory = options?.urlFactory ?? ((blob: Blob) => URL.createObjectURL(blob))
  const urlRevoker = options?.urlRevoker ?? ((url: string) => URL.revokeObjectURL(url))

  let zip: JSZip

  try {
    zip = await JSZip.loadAsync(buffer)
  } catch {
    throw new Error('Failed to parse ZIP: invalid .pilgrim file')
  }

  const manifestFile = zip.file('manifest.json')
  if (!manifestFile) {
    throw new Error('Failed to parse .pilgrim file: missing manifest.json')
  }

  const manifestText = await manifestFile.async('text')
  const manifestRaw = JSON.parse(manifestText)
  const manifest: PilgrimManifest = {
    schemaVersion: manifestRaw.schemaVersion,
    exportDate: manifestRaw.exportDate,
    appVersion: manifestRaw.appVersion,
    walkCount: manifestRaw.walkCount,
    preferences: {
      distanceUnit: manifestRaw.preferences.distanceUnit,
      altitudeUnit: manifestRaw.preferences.altitudeUnit,
      speedUnit: manifestRaw.preferences.speedUnit,
      energyUnit: manifestRaw.preferences.energyUnit,
    },
    archived: Array.isArray(manifestRaw.archived) ? manifestRaw.archived : [],
    modifications: Array.isArray(manifestRaw.modifications) ? manifestRaw.modifications : [],
    archivedCount: typeof manifestRaw.archivedCount === 'number'
      ? manifestRaw.archivedCount
      : (Array.isArray(manifestRaw.archived) ? manifestRaw.archived.length : 0),
  }

  const photoUrls = new Map<string, string>()
  const createdUrls: string[] = []
  let committed = false

  try {
    const photoFiles = zip.file(/^photos\/[^/]+\.(jpg|jpeg)$/i)
    for (const file of photoFiles) {
      try {
        const blob = await file.async('blob')
        const filename = file.name.replace(/^photos\//, '')
        const url = urlFactory(blob)
        photoUrls.set(filename, url)
        createdUrls.push(url)
      } catch (err) {
        // A single corrupt photo entry shouldn't fail the whole parse —
        // drop it and keep going so the walks + remaining photos still
        // render.
        console.warn(`[parsePilgrim] Failed to extract ${file.name}:`, err)
      }
    }

    const walkFiles = zip.file(/^walks\/.*\.json$/)
    const walks: Walk[] = []
    const rawWalks: unknown[] = []

    for (const file of walkFiles) {
      const text = await file.async('text')
      const walkRaw = JSON.parse(text)
      rawWalks.push(walkRaw)
      walks.push(parsePilgrimWalkJSON(walkRaw, photoUrls))
    }

    walks.sort((a, b) => a.startDate.getTime() - b.startDate.getTime())

    // Revoke any photo URLs that didn't end up attached to a walk —
    // orphan photos (no walk.photos reference) and photos in zero-walks
    // archives both end up here. Done on the success path before
    // committing so the caller sees a clean state.
    const attachedUrls = new Set<string>()
    for (const walk of walks) {
      if (walk.photos) {
        for (const photo of walk.photos) {
          attachedUrls.add(photo.url)
        }
      }
    }
    for (const url of createdUrls) {
      if (!attachedUrls.has(url)) {
        urlRevoker(url)
      }
    }

    committed = true
    return { manifest, walks, rawWalks }
  } finally {
    // Error path: something threw between extracting photos and
    // committing walks (corrupt walk JSON, parsePilgrimWalkJSON crash,
    // whatever). Revoke everything we minted so the blobs don't leak.
    if (!committed) {
      for (const url of createdUrls) {
        urlRevoker(url)
      }
    }
  }
}
