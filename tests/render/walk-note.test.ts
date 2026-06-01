import { describe, it, expect } from 'vitest'
import { renderWalk, type RenderOptions } from '../../src/render/walk-note'
import type { VoiceRecording, WalkPhoto } from '../../src/parse/types'
import { walkFrom } from '../support'

const OPTS: RenderOptions = {
  provenance: { schemaVersion: '1.0', appVersion: '1.0.0', waymarkVersion: '0.1.0' },
}

function recording(startSec: number, transcription: string, isEnhanced = false): VoiceRecording {
  return {
    startDate: new Date(startSec * 1000),
    endDate: new Date((startSec + 60) * 1000),
    duration: 60,
    transcription,
    isEnhanced,
  }
}

describe('renderWalk', () => {
  it('renders a complete note from a walk with a transcription and no photos (AE1)', async () => {
    // #given a parsed walk with a transcription, no photos, no map
    const walk = await walkFrom()
    expect(walk.photos).toBeUndefined()

    // #when rendered
    const rendered = renderWalk(walk, OPTS)

    // #then the note is complete: transcription in body, stats present, no broken image refs
    expect(rendered.body).toContain('## Reflection')
    expect(rendered.body).toContain('The morning light filters through the trees')
    expect(rendered.body).toContain('## On this walk')
    expect(rendered.body).toContain('**Distance:** 5.43 km')
    expect(rendered.body).not.toContain('![[')
    expect(rendered.attachments).toHaveLength(0)
    expect(rendered.frontmatter['waymark-id']).toBe(walk.id)
    expect(rendered.frontmatter['waymark-distance-km']).toBe(5.43)
    expect(rendered.frontmatter['waymark-date']).toBe('2024-03-09')
  })

  it('orders recordings by start time regardless of input order', async () => {
    // #given two recordings supplied out of order
    const walk = await walkFrom()
    walk.voiceRecordings = [recording(1710002000, 'LATER one'), recording(1710001000, 'EARLIER one')]

    // #when rendered
    const { body } = renderWalk(walk, OPTS)

    // #then the earlier recording appears first
    expect(body.indexOf('EARLIER one')).toBeLessThan(body.indexOf('LATER one'))
  })

  it('marks an enhanced recording', async () => {
    // #given an AI-enhanced recording
    const walk = await walkFrom()
    walk.voiceRecordings = [recording(1710001000, 'enhanced text', true)]

    // #when rendered #then the heading carries the enhanced marker
    expect(renderWalk(walk, OPTS).body).toContain('· enhanced')
  })

  it('omits intention, weather, and written reflection when absent', async () => {
    // #given a walk stripped of optional fields
    const walk = await walkFrom()
    walk.intention = undefined
    walk.weather = undefined
    walk.reflection = undefined

    // #when rendered
    const { body } = renderWalk(walk, OPTS)

    // #then no empty sections or stray labels
    expect(body).not.toContain('**Intention**')
    expect(body).not.toContain('## Weather')
    expect(body).not.toContain('## Haiku')
    // core sections still present
    expect(body).toContain('## Reflection')
    expect(body).toContain('## On this walk')
  })

  it('produces a valid note for a walk with no recordings', async () => {
    // #given a walk with no voice recordings
    const walk = await walkFrom()
    walk.voiceRecordings = []

    // #when rendered #then a placeholder stands in and the note is still complete
    const { body } = renderWalk(walk, OPTS)
    expect(body).toContain('_No voice recordings for this walk._')
    expect(body).toContain('## On this walk')
  })

  it('emits id-based embeds and attachment refs for photos', async () => {
    // #given a walk carrying two photos with stable identifiers
    const walk = await walkFrom()
    const photo = (id: string): WalkPhoto => ({
      localIdentifier: id,
      capturedAt: new Date(1710001000 * 1000),
      lat: 42.88,
      lng: -8.51,
      url: id,
    })
    walk.photos = [photo('alpha'), photo('gamma')]

    // #when rendered
    const rendered = renderWalk(walk, OPTS)

    // #then filenames derive from the photo identity (not array position)
    expect(rendered.attachments).toEqual([
      { sourceToken: 'alpha', fileName: `waymark-${walk.id}-alpha.jpg` },
      { sourceToken: 'gamma', fileName: `waymark-${walk.id}-gamma.jpg` },
    ])
    expect(rendered.body).toContain(`![[waymark-${walk.id}-alpha.jpg]]`)
    expect(rendered.body).toContain(`![[waymark-${walk.id}-gamma.jpg]]`)
  })

  it('keeps a photo filename stable when an earlier photo is removed', async () => {
    // #given a walk and a helper for photos
    const walk = await walkFrom()
    const photo = (id: string): WalkPhoto => ({
      localIdentifier: id,
      capturedAt: new Date(1710001000 * 1000),
      lat: 1,
      lng: 1,
      url: id,
    })

    // #when gamma is rendered among three photos, then again after beta is removed
    walk.photos = [photo('alpha'), photo('beta'), photo('gamma')]
    const before = renderWalk(walk, OPTS).attachments.find((a) => a.sourceToken === 'gamma')!.fileName
    walk.photos = [photo('alpha'), photo('gamma')]
    const after = renderWalk(walk, OPTS).attachments.find((a) => a.sourceToken === 'gamma')!.fileName

    // #then gamma's attachment filename is unchanged (no index re-mapping)
    expect(after).toBe(before)
  })

  it('uses a generic heading for a styleless written reflection', async () => {
    // #given a reflection with text but no style
    const walk = await walkFrom()
    walk.reflection = { text: 'A plain written reflection' }

    // #when rendered #then it falls back to the generic heading
    expect(renderWalk(walk, OPTS).body).toContain('## Written reflection')
  })

  it('renders waypoints as linked Moments with minutes-in (U1)', async () => {
    // #given the fixture's two labelled waypoints (Peaceful @+12min, Grateful @+36min)
    const { body } = renderWalk(await walkFrom(), OPTS)
    expect(body).toContain('## Moments')
    expect(body).toContain('12 min in · [[Peaceful]]')
    expect(body).toContain('[[Grateful]]')
  })

  it('renders pace from distance/duration, steps, and a UTC time range (U1)', async () => {
    // #given the fixture (5.4321 km / 3600 s active, 7200 steps, 16:00–17:00 UTC)
    const { body } = renderWalk(await walkFrom(), OPTS)
    expect(body).toContain('**Pace:** 11 min/km')
    expect(body).toContain('**Steps:** 7200')
    expect(body).toContain('**Time:** 16:00–17:00 UTC')
  })

  it('renders a timeline and full weather (U1)', async () => {
    const { body } = renderWalk(await walkFrom(), OPTS)
    expect(body).toContain('## Timeline')
    expect(body).toContain('meditate')
    expect(body).toContain('pause')
    expect(body).toContain('## Weather')
    expect(body).toContain('partly cloudy, 18.5°C')
    expect(body).toContain('Humidity: 65%')
    expect(body).toContain('Wind: 3.2 m/s')
  })

  it('guards a waypoint with no timestamp and omits Moments when there are none (U1)', async () => {
    // #given waypoints stripped of their timestamps
    const walk = await walkFrom()
    for (const f of walk.route.features) {
      if (f.properties.markerType === 'waypoint') {
        delete (f.properties as { timestamp?: number }).timestamp
      }
    }
    const withWp = renderWalk(walk, OPTS).body
    expect(withWp).toContain('[[Peaceful]]')
    expect(withWp).not.toContain('Invalid Date')

    // #and a walk with no waypoint features → no Moments section
    const walk2 = await walkFrom()
    walk2.route = { type: 'FeatureCollection', features: [] }
    expect(renderWalk(walk2, OPTS).body).not.toContain('## Moments')
  })

  it('emits structured celestial + stats frontmatter (U2)', async () => {
    const { frontmatter } = renderWalk(await walkFrom(), OPTS)
    expect(frontmatter['waymark-steps']).toBe(7200)
    expect(frontmatter['waymark-pace-min-km']).toBe(11)
    expect(frontmatter['waymark-moon']).toBe('Waxing Crescent')
    expect(frontmatter['waymark-moon-illumination']).toBe(0.15)
    expect(frontmatter['waymark-element-dominant']).toBe('earth')
    expect(frontmatter['waymark-planetary-day']).toBe('Saturday')
    expect(frontmatter['waymark-seasonal-marker']).toBe('Spring Equinox')
    expect(frontmatter['waymark-reflection-words']).toBe(7)
  })

  it('renders a Sky section and relocates Moon out of On this walk (U2)', async () => {
    const { body } = renderWalk(await walkFrom(), OPTS)
    expect(body).toContain('## Sky')
    expect(body).toContain('**Moon:** Waxing Crescent (15% lit, waxing)')
    expect(body).toContain('**Dominant element:** earth')
    const onThisWalk = body.slice(body.indexOf('## On this walk'), body.indexOf('## Timeline'))
    expect(onThisWalk).not.toContain('Moon')
  })

  it('omits celestial frontmatter + Sky when celestial is absent (U2)', async () => {
    const walk = await walkFrom()
    walk.celestial = undefined
    const { body, frontmatter } = renderWalk(walk, OPTS)
    expect(body).not.toContain('## Sky')
    expect(frontmatter['waymark-moon']).toBeUndefined()
    expect(frontmatter['waymark-element-dominant']).toBeUndefined()
  })

  it('emits a Leaflet block + valid route geojson sidecar when a token is set (U5)', async () => {
    // #given the fixture (a LineString route + two labelled waypoints) and a token
    const walk = await walkFrom()
    const rendered = renderWalk(walk, { ...OPTS, mapboxToken: 'pk.test' })

    // #then the body carries a Mapbox-backed leaflet block referencing a sidecar
    expect(rendered.body).toContain('## Map')
    expect(rendered.body).toContain('```leaflet')
    expect(rendered.body).toContain('access_token=pk.test')
    expect(rendered.body).toContain('tileSize: 512')
    expect(rendered.body).toContain(`geojson: [[waymark-${walk.id}-route.geojson]]`)
    expect(rendered.body).toMatch(/marker: default, [-\d.]+, [-\d.]+, , Peaceful/)

    // #and the sidecar is emitted once as valid GeoJSON
    expect(rendered.generatedFiles).toHaveLength(1)
    expect(rendered.generatedFiles[0]!.fileName).toBe(`waymark-${walk.id}-route.geojson`)
    expect(JSON.parse(rendered.generatedFiles[0]!.content).type).toBe('FeatureCollection')
  })

  it('emits no map or sidecar without a token (U5)', async () => {
    const rendered = renderWalk(await walkFrom(), OPTS)
    expect(rendered.body).not.toContain('```leaflet')
    expect(rendered.body).not.toContain('## Map')
    expect(rendered.generatedFiles).toHaveLength(0)
  })

  it('emits no map when the route has no coordinates, even with a token (U5)', async () => {
    const walk = await walkFrom()
    walk.route = { type: 'FeatureCollection', features: [] }
    const rendered = renderWalk(walk, { ...OPTS, mapboxToken: 'pk.test' })
    expect(rendered.body).not.toContain('```leaflet')
    expect(rendered.generatedFiles).toHaveLength(0)
  })
})
