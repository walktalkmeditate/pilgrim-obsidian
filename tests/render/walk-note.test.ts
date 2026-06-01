import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import { parsePilgrim } from '../../src/parse/pilgrim'
import { renderWalk, type RenderOptions } from '../../src/render/walk-note'
import type { VoiceRecording, Walk, WalkPhoto } from '../../src/parse/types'
import sampleWalk from '../fixtures/sample-walk.json'
import sampleManifest from '../fixtures/sample-manifest.json'

const OPTS: RenderOptions = {
  provenance: { schemaVersion: '1.0', appVersion: '1.0.0', waymarkVersion: '0.1.0' },
}

async function walkFrom(overrides: Record<string, unknown> = {}): Promise<Walk> {
  const raw = { ...structuredClone(sampleWalk), ...overrides } as Record<string, unknown>
  const zip = new JSZip()
  zip.file('manifest.json', JSON.stringify(sampleManifest))
  zip.file(`walks/${(raw as { id: string }).id}.json`, JSON.stringify(raw))
  const { walks } = await parsePilgrim(await zip.generateAsync({ type: 'arraybuffer' }), {
    urlFactory: () => 'x',
    urlRevoker: () => {},
  })
  return walks[0]!
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
    expect(rendered.frontmatter['date']).toBe('2024-03-09')
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
    expect(body).not.toContain('**Weather:**')
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

  it('emits filename-based embeds and attachment refs for photos', async () => {
    // #given a walk carrying two photos
    const walk = await walkFrom()
    const photo = (token: string): WalkPhoto => ({
      localIdentifier: token,
      capturedAt: new Date(1710001000 * 1000),
      lat: 42.88,
      lng: -8.51,
      url: token,
    })
    walk.photos = [photo('tok-1'), photo('tok-2')]

    // #when rendered
    const rendered = renderWalk(walk, OPTS)

    // #then deterministic filenames are embedded and mapped back to their source tokens
    expect(rendered.attachments).toEqual([
      { sourceToken: 'tok-1', fileName: `waymark-${walk.id}-1.jpg` },
      { sourceToken: 'tok-2', fileName: `waymark-${walk.id}-2.jpg` },
    ])
    expect(rendered.body).toContain(`![[waymark-${walk.id}-1.jpg]]`)
    expect(rendered.body).toContain(`![[waymark-${walk.id}-2.jpg]]`)
  })
})
