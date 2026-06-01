import { describe, it, expect } from 'vitest'
import { writeWalkNotes, type WriterSettings } from '../../src/vault/writer'
import { makeFakeApp, walkFrom } from '../support'

const SETTINGS: WriterSettings = {
  walksFolder: 'Waymark',
  provenance: { schemaVersion: '1.0', appVersion: '1.0.0', waymarkVersion: '0.1.0' },
}

const MAP_SETTINGS: WriterSettings = { ...SETTINGS, mapboxToken: 'pk.test' }

describe('writeWalkNotes', () => {
  it('creates a note with frontmatter, markers, and the transcription on first import', async () => {
    // #given an empty vault and one walk
    const fake = makeFakeApp()
    const walk = await walkFrom()

    // #when imported
    const tally = await writeWalkNotes(fake.app, [walk], new Map(), SETTINGS)

    // #then exactly one note is created with the expected anatomy
    expect(tally.created).toBe(1)
    expect(fake.mdCount()).toBe(1)
    const content = [...fake.files.values()][0]!
    expect(content).toContain(`waymark-id: ${walk.id}`)
    expect(content).toContain('waymark-block-hash:')
    expect(content).toContain('%% waymark:begin')
    expect(content).toContain('The morning light filters through the trees')
  })

  it('updates in place on re-import — no duplicate note (AE2)', async () => {
    // #given a vault that already imported the walk once
    const fake = makeFakeApp()
    const walk = await walkFrom()
    await writeWalkNotes(fake.app, [walk], new Map(), SETTINGS)

    // #when the same export is imported again
    const tally = await writeWalkNotes(fake.app, [walk], new Map(), SETTINGS)

    // #then it updates the existing note rather than creating a second
    expect(tally.created).toBe(0)
    expect(tally.updated).toBe(1)
    expect(fake.mdCount()).toBe(1)
  })

  it('preserves a user-edited managed region and writes nothing (AE3)', async () => {
    // #given an imported note whose managed region the user has edited
    const fake = makeFakeApp()
    const walk = await walkFrom()
    await writeWalkNotes(fake.app, [walk], new Map(), SETTINGS)
    const path = [...fake.files.keys()].find((p) => p.endsWith('.md'))!
    const edited = fake.files
      .get(path)!
      .replace('The morning light filters through the trees', 'My own edited reflection')
    fake.files.set(path, edited)

    // #when re-imported with updated app content
    const tally = await writeWalkNotes(fake.app, [walk], new Map(), SETTINGS)

    // #then the walk is reported skipped and the note is byte-identical
    expect(tally.skippedEdited).toHaveLength(1)
    expect(tally.updated).toBe(0)
    expect(fake.files.get(path)).toBe(edited)
  })

  it('writes a photo attachment once and reuses it on re-import', async () => {
    // #given a walk carrying one photo and its bytes
    const fake = makeFakeApp()
    const walk = await walkFrom()
    walk.photos = [
      { localIdentifier: 'p1', capturedAt: new Date(1710001000 * 1000), lat: 1, lng: 1, url: 'tok-1' },
    ]
    const photoBytes = new Map<string, ArrayBuffer>([['tok-1', new Uint8Array([1, 2, 3]).buffer]])

    // #when imported twice
    await writeWalkNotes(fake.app, [walk], photoBytes, SETTINGS)
    await writeWalkNotes(fake.app, [walk], photoBytes, SETTINGS)

    // #then the binary is written exactly once (deterministic name, existence-checked)
    expect(fake.binaryCount()).toBe(1)
  })

  it('skips a note whose markers were removed without rewriting it', async () => {
    // #given a note carrying the walk id but no managed markers
    const fake = makeFakeApp()
    const walk = await walkFrom()
    fake.files.set(
      'Waymark/Manual note.md',
      `---\nwaymark-id: ${walk.id}\nwaymark-block-hash: deadbeef\n---\nUser wrote this, no markers.`,
    )

    // #when imported
    const tally = await writeWalkNotes(fake.app, [walk], new Map(), SETTINGS)

    // #then it is reported skipped and left untouched
    expect(tally.skippedNoMarkers).toHaveLength(1)
    expect(fake.files.get('Waymark/Manual note.md')).toContain('User wrote this, no markers.')
  })

  it('isolates a failing walk and still imports the others', async () => {
    // #given one walk that will throw during render and one valid walk
    const fake = makeFakeApp()
    const bad = await walkFrom({ id: 'bad-walk' })
    ;(bad as { startDate: unknown }).startDate = undefined // renderWalk -> isoDate(undefined) throws
    const good = await walkFrom({ id: 'good-walk' })

    // #when imported together (bad first)
    const tally = await writeWalkNotes(fake.app, [bad, good], new Map(), SETTINGS)

    // #then the bad walk is recorded as failed and the good one still lands
    expect(tally.failed).toEqual(['bad-walk'])
    expect(tally.created).toBe(1)
    expect(fake.mdCount()).toBe(1)
  })

  it('writes the route geojson sidecar once and rewrites it on re-import (U5)', async () => {
    // #given a walk and a Mapbox token (which gates the map + its sidecar)
    const fake = makeFakeApp()
    const walk = await walkFrom()
    const sidecar = `Waymark/attachments/waymark-${walk.id}-route.geojson`

    // #when imported
    await writeWalkNotes(fake.app, [walk], new Map(), MAP_SETTINGS)

    // #then a valid GeoJSON sidecar is written into the attachments folder
    expect(fake.files.has(sidecar)).toBe(true)
    expect(JSON.parse(fake.files.get(sidecar)!).type).toBe('FeatureCollection')

    // #and re-import rewrites it in place — exactly one sidecar, no duplicate
    await writeWalkNotes(fake.app, [walk], new Map(), MAP_SETTINGS)
    expect([...fake.files.keys()].filter((p) => p.endsWith('.geojson'))).toHaveLength(1)
  })

  it('writes no sidecar without a Mapbox token (U5)', async () => {
    const fake = makeFakeApp()
    await writeWalkNotes(fake.app, [await walkFrom()], new Map(), SETTINGS)
    expect([...fake.files.keys()].some((p) => p.endsWith('.geojson'))).toBe(false)
  })

  it('writes the note but skips a photo whose bytes are missing', async () => {
    // #given a walk with a photo but no bytes provided for its token
    const fake = makeFakeApp()
    const walk = await walkFrom()
    walk.photos = [
      { localIdentifier: 'p1', capturedAt: new Date(1710001000 * 1000), lat: 1, lng: 1, url: 'missing' },
    ]

    // #when imported with an empty photoBytes map
    const tally = await writeWalkNotes(fake.app, [walk], new Map(), SETTINGS)

    // #then the note is still created, no binary is written, and the embed is present
    expect(tally.created).toBe(1)
    expect(fake.binaryCount()).toBe(0)
    const content = [...fake.files.values()].find((c) => c.includes('waymark-id'))!
    expect(content).toContain('![[waymark-')
  })
})
