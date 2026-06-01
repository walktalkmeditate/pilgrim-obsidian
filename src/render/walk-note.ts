import type { VoiceRecording, Walk } from '../parse/types'
import type { FrontmatterValue } from '../shared'

export interface RenderProvenance {
  schemaVersion: string
  appVersion: string
  waymarkVersion: string
}

export interface RenderOptions {
  provenance: RenderProvenance
  // When set, emit an interactive Leaflet map per note using Mapbox tiles.
  mapboxToken?: string
  // Resolved place name for the walk's start (set by the geocode step, U6).
  placeName?: string
}

// A render-generated file to write into the vault (the route GeoJSON sidecar).
// Distinct from photo AttachmentRefs, whose bytes come from the parsed archive.
export interface GeneratedFile {
  fileName: string
  content: string
}

// A photo to materialize in the vault. `sourceToken` is the value the parse
// layer's urlFactory returned for this photo's blob (U6 maps it back to bytes);
// `fileName` is the deterministic name the body embeds via ![[fileName]].
export interface AttachmentRef {
  sourceToken: string
  fileName: string
}

export interface RenderedWalk {
  walkId: string
  title: string
  frontmatter: Record<string, FrontmatterValue>
  body: string
  attachments: AttachmentRef[]
  generatedFiles: GeneratedFile[]
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function km(meters: number): string {
  return (meters / 1000).toFixed(2)
}

function minutes(seconds: number): number {
  return Math.round(seconds / 60)
}

// Minutes from walk start — timezone-independent, so headings are stable across
// machines and test runs (clock-time formatting would depend on the local TZ).
function minutesInto(start: Date, t: Date): number {
  return Math.max(0, Math.round((t.getTime() - start.getTime()) / 60000))
}

function recordingHeading(walkStart: Date, rec: VoiceRecording): string {
  const enhanced = rec.isEnhanced ? ' · enhanced' : ''
  return `### ${minutesInto(walkStart, rec.startDate)} min in${enhanced}`
}

// Clock time in UTC — the .pilgrim carries no timezone, so UTC is the only
// deterministic rendering (labelled as such in the note).
function clockUTC(d: Date): string {
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

// Average pace in min/km from the reliable distance + active-duration stats
// (the raw route speeds[] array is unpopulated and its unit is unverified).
function paceMinPerKm(distanceMeters: number, activeSeconds: number): number | null {
  if (distanceMeters <= 0 || activeSeconds <= 0) return null
  return Math.round(((activeSeconds / 60) / (distanceMeters / 1000)) * 10) / 10
}

interface Waypoint {
  label: string
  timestamp?: number
  lat?: number
  lng?: number
}

// Pinned waypoints are Point features tagged markerType 'waypoint'. Only
// labelled ones become [[links]]. The per-feature timestamp is epoch SECONDS
// (the parser does not ×1000 it, unlike the LineString timestamps array).
// Point coordinates are [lng, lat].
function waypointsOf(walk: Walk): Waypoint[] {
  return walk.route.features
    .filter(
      (f) =>
        f.geometry.type === 'Point' &&
        f.properties.markerType === 'waypoint' &&
        typeof f.properties.label === 'string' &&
        (f.properties.label as string).length > 0,
    )
    .map((f) => {
      const c = f.geometry.coordinates as number[]
      return {
        label: f.properties.label as string,
        timestamp: f.properties.timestamp,
        lng: typeof c[0] === 'number' ? c[0] : undefined,
        lat: typeof c[1] === 'number' ? c[1] : undefined,
      }
    })
}

// Map center for the Leaflet block: the average of the route LineString's
// coordinates, falling back to the first Point feature. null when the route
// carries no usable coordinates (no map is emitted).
function routeCenter(walk: Walk): { lat: number; lng: number } | null {
  const line = walk.route.features.find((f) => f.geometry.type === 'LineString')
  const coords = (line?.geometry.coordinates as number[][] | undefined) ?? []
  if (coords.length > 0) {
    const lng = coords.reduce((s, c) => s + (c[0] ?? 0), 0) / coords.length
    const lat = coords.reduce((s, c) => s + (c[1] ?? 0), 0) / coords.length
    return { lat, lng }
  }
  const point = walk.route.features.find((f) => f.geometry.type === 'Point')
  const pc = point?.geometry.coordinates as number[] | undefined
  if (pc && typeof pc[0] === 'number' && typeof pc[1] === 'number') {
    return { lat: pc[1], lng: pc[0] }
  }
  return null
}

function reflectionWordCount(walk: Walk): number {
  return walk.voiceRecordings.reduce((sum, r) => {
    const t = r.transcription?.trim()
    return sum + (t && t.length > 0 ? t.split(/\s+/).length : 0)
  }, 0)
}

function renderFrontmatter(walk: Walk, opts: RenderOptions): Record<string, FrontmatterValue> {
  const fm: Record<string, FrontmatterValue> = {
    'waymark-id': walk.id,
    'waymark-type': 'walk',
    'waymark-date': isoDate(walk.startDate),
    'waymark-start': walk.startDate.toISOString(),
    'waymark-distance-km': Number(km(walk.stats.distance)),
    'waymark-duration-min': minutes(walk.stats.activeDuration),
    'waymark-app-version': opts.provenance.appVersion,
    'waymark-schema': opts.provenance.schemaVersion,
    'waymark-version': opts.provenance.waymarkVersion,
  }
  if (walk.intention) fm['waymark-intention'] = walk.intention

  if (typeof walk.stats.steps === 'number' && walk.stats.steps > 0) {
    fm['waymark-steps'] = walk.stats.steps
  }
  const pace = paceMinPerKm(walk.stats.distance, walk.stats.activeDuration)
  if (pace !== null) fm['waymark-pace-min-km'] = pace
  const words = reflectionWordCount(walk)
  if (words > 0) fm['waymark-reflection-words'] = words

  const c = walk.celestial
  if (c?.lunarPhase?.name) fm['waymark-moon'] = c.lunarPhase.name
  if (c && Number.isFinite(c.lunarPhase?.illumination)) {
    fm['waymark-moon-illumination'] = Math.round(c.lunarPhase.illumination * 100) / 100
  }
  if (c?.elementBalance?.dominant) fm['waymark-element-dominant'] = c.elementBalance.dominant
  if (c?.planetaryHour?.planetaryDay) fm['waymark-planetary-day'] = c.planetaryHour.planetaryDay
  if (c?.seasonalMarker) fm['waymark-seasonal-marker'] = c.seasonalMarker

  return fm
}

function renderBody(
  walk: Walk,
  opts: RenderOptions,
): { body: string; attachments: AttachmentRef[]; generatedFiles: GeneratedFile[] } {
  const lines: string[] = []
  const attachments: AttachmentRef[] = []
  const generatedFiles: GeneratedFile[] = []

  if (walk.intention) {
    lines.push(`> **Intention** — ${walk.intention}`, '')
  }

  lines.push('## Reflection', '')
  const recordings = [...walk.voiceRecordings].sort(
    (a, b) => a.startDate.getTime() - b.startDate.getTime(),
  )
  if (recordings.length === 0) {
    lines.push('_No voice recordings for this walk._', '')
  } else {
    for (const rec of recordings) {
      lines.push(recordingHeading(walk.startDate, rec))
      const text = rec.transcription?.trim()
      lines.push(text && text.length > 0 ? text : '_(no transcription)_', '')
    }
  }

  const waypoints = waypointsOf(walk)
  if (waypoints.length > 0) {
    lines.push('## Moments', '')
    for (const wp of waypoints) {
      const at =
        typeof wp.timestamp === 'number'
          ? `${minutesInto(walk.startDate, new Date(wp.timestamp * 1000))} min in · `
          : ''
      lines.push(`- ${at}[[${wp.label}]]`)
    }
    lines.push('')
  }

  lines.push('## On this walk', '')
  lines.push(`- **Distance:** ${km(walk.stats.distance)} km`)
  lines.push(`- **Duration:** ${minutes(walk.stats.activeDuration)} min`)
  const pace = paceMinPerKm(walk.stats.distance, walk.stats.activeDuration)
  if (pace !== null) lines.push(`- **Pace:** ${pace} min/km`)
  if (walk.stats.ascent || walk.stats.descent) {
    lines.push(
      `- **Ascent:** ${Math.round(walk.stats.ascent)} m · **Descent:** ${Math.round(walk.stats.descent)} m`,
    )
  }
  if (typeof walk.stats.steps === 'number' && walk.stats.steps > 0) {
    lines.push(`- **Steps:** ${walk.stats.steps}`)
  }
  if (walk.stats.talkDuration > 0) {
    lines.push(`- **Spoken:** ${minutes(walk.stats.talkDuration)} min`)
  }
  if (walk.stats.meditateDuration > 0) {
    lines.push(`- **Meditated:** ${minutes(walk.stats.meditateDuration)} min`)
  }
  lines.push(`- **Time:** ${clockUTC(walk.startDate)}–${clockUTC(walk.endDate)} UTC`)
  if (opts.placeName) lines.push(`- **Near:** [[${opts.placeName}]]`)
  lines.push('')

  const timeline = [
    ...walk.activities.map((a) => ({ start: a.startDate, end: a.endDate, kind: a.type as string })),
    ...walk.pauses.map((p) => ({ start: p.startDate, end: p.endDate, kind: 'pause' })),
  ].sort((a, b) => a.start.getTime() - b.start.getTime())
  if (timeline.length > 0) {
    lines.push('## Timeline', '')
    for (const seg of timeline) {
      const mins = Math.max(1, Math.round((seg.end.getTime() - seg.start.getTime()) / 60000))
      lines.push(`- ${minutesInto(walk.startDate, seg.start)} min in · ${seg.kind} (${mins} min)`)
    }
    lines.push('')
  }

  const sky = walk.celestial
  if (sky) {
    lines.push('## Sky', '')
    if (sky.lunarPhase?.name) {
      const lit = Number.isFinite(sky.lunarPhase.illumination)
        ? ` (${Math.round(sky.lunarPhase.illumination * 100)}% lit${sky.lunarPhase.isWaxing ? ', waxing' : ''})`
        : ''
      lines.push(`- **Moon:** ${sky.lunarPhase.name}${lit}`)
    }
    if (sky.planetaryHour?.planet || sky.planetaryHour?.planetaryDay) {
      const day = sky.planetaryHour.planetaryDay ? ` (${sky.planetaryHour.planetaryDay})` : ''
      lines.push(`- **Planetary hour:** ${sky.planetaryHour.planet ?? ''}${day}`.trim())
    }
    if (sky.elementBalance?.dominant) lines.push(`- **Dominant element:** ${sky.elementBalance.dominant}`)
    if (sky.seasonalMarker) lines.push(`- **Season:** ${sky.seasonalMarker}`)
    lines.push('')
  }

  if (walk.weather) {
    lines.push('## Weather', '')
    lines.push(`- ${walk.weather.condition.replace(/_/g, ' ')}, ${walk.weather.temperature}°C`)
    if (typeof walk.weather.humidity === 'number') {
      lines.push(`- Humidity: ${Math.round(walk.weather.humidity * 100)}%`)
    }
    if (typeof walk.weather.windSpeed === 'number') {
      lines.push(`- Wind: ${walk.weather.windSpeed} m/s`)
    }
    lines.push('')
  }

  const reflectionText = walk.reflection?.text?.trim()
  if (reflectionText && reflectionText.length > 0) {
    const style = walk.reflection?.style?.trim()
    const heading = style
      ? `## ${style.charAt(0).toUpperCase()}${style.slice(1)}`
      : '## Written reflection'
    lines.push(heading, '')
    for (const line of reflectionText.split('\n')) {
      lines.push(`> ${line}`)
    }
    lines.push('')
  }

  if (walk.photos && walk.photos.length > 0) {
    lines.push('## Photos', '')
    for (const photo of walk.photos) {
      // Name attachments by the photo's stable identity, not array position, so
      // deleting or reordering a photo never re-maps a later one onto an
      // existing file (which the existence check would then leave stale).
      const safeId = photo.localIdentifier.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '')
      const fileName = `waymark-${walk.id}-${safeId}.jpg`
      attachments.push({ sourceToken: photo.url, fileName })
      lines.push(`![[${fileName}]]`)
    }
    lines.push('')
  }

  if (opts.mapboxToken) {
    const center = routeCenter(walk)
    if (center) {
      const geojsonName = `waymark-${walk.id}-route.geojson`
      generatedFiles.push({ fileName: geojsonName, content: JSON.stringify(walk.route) })
      lines.push('## Map', '')
      lines.push('%% Install the obsidian-leaflet plugin to render this map. %%')
      lines.push('```leaflet')
      lines.push(`id: waymark-${walk.id}`)
      lines.push(`lat: ${center.lat}`)
      lines.push(`long: ${center.lng}`)
      lines.push('height: 400px')
      lines.push('defaultZoom: 14')
      lines.push('osmLayer: false')
      lines.push(
        `tileServer: https://api.mapbox.com/styles/v1/mapbox/outdoors-v12/tiles/{z}/{x}/{y}?access_token=${opts.mapboxToken}`,
      )
      lines.push('tileSize: 512')
      lines.push('zoomOffset: -1')
      lines.push(`geojson: [[${geojsonName}]]`)
      for (const wp of waypoints) {
        if (typeof wp.lat === 'number' && typeof wp.lng === 'number') {
          lines.push(`marker: default, ${wp.lat}, ${wp.lng}, , ${wp.label}`)
        }
      }
      lines.push('```', '')
    }
  }

  if (opts.placeName) {
    lines.push('*Place name © OpenStreetMap contributors*', '')
  }

  return { body: lines.join('\n').trimEnd() + '\n', attachments, generatedFiles }
}

// Render a walk into the content Waymark owns inside a note: the frontmatter
// keys, the managed-region body (markers are added by the merge engine, U5),
// and the attachment manifest. Pure and Obsidian-free.
export function renderWalk(walk: Walk, opts: RenderOptions): RenderedWalk {
  const { body, attachments, generatedFiles } = renderBody(walk, opts)
  return {
    walkId: walk.id,
    title: `Walk ${isoDate(walk.startDate)}`,
    frontmatter: renderFrontmatter(walk, opts),
    body,
    attachments,
    generatedFiles,
  }
}
