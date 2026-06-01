import type { VoiceRecording, Walk } from '../parse/types'
import type { FrontmatterValue } from '../shared'

export interface RenderProvenance {
  schemaVersion: string
  appVersion: string
  waymarkVersion: string
}

export interface RenderOptions {
  provenance: RenderProvenance
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
  if (walk.celestial?.lunarPhase?.name) fm['waymark-moon'] = walk.celestial.lunarPhase.name
  return fm
}

function renderBody(walk: Walk): { body: string; attachments: AttachmentRef[] } {
  const lines: string[] = []
  const attachments: AttachmentRef[] = []

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

  lines.push('## On this walk', '')
  lines.push(`- **Distance:** ${km(walk.stats.distance)} km`)
  lines.push(`- **Duration:** ${minutes(walk.stats.activeDuration)} min`)
  if (walk.stats.ascent || walk.stats.descent) {
    lines.push(
      `- **Ascent:** ${Math.round(walk.stats.ascent)} m · **Descent:** ${Math.round(walk.stats.descent)} m`,
    )
  }
  if (walk.stats.talkDuration > 0) {
    lines.push(`- **Spoken:** ${minutes(walk.stats.talkDuration)} min`)
  }
  if (walk.stats.meditateDuration > 0) {
    lines.push(`- **Meditated:** ${minutes(walk.stats.meditateDuration)} min`)
  }
  if (walk.weather) {
    lines.push(
      `- **Weather:** ${walk.weather.condition.replace(/_/g, ' ')}, ${walk.weather.temperature}°C`,
    )
  }
  if (walk.celestial?.lunarPhase?.name) {
    lines.push(`- **Moon:** ${walk.celestial.lunarPhase.name}`)
  }
  lines.push('')

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

  return { body: lines.join('\n').trimEnd() + '\n', attachments }
}

// Render a walk into the content Waymark owns inside a note: the frontmatter
// keys, the managed-region body (markers are added by the merge engine, U5),
// and the attachment manifest. Pure and Obsidian-free.
export function renderWalk(walk: Walk, opts: RenderOptions): RenderedWalk {
  const { body, attachments } = renderBody(walk)
  return {
    walkId: walk.id,
    title: `Walk ${isoDate(walk.startDate)}`,
    frontmatter: renderFrontmatter(walk, opts),
    body,
    attachments,
  }
}
