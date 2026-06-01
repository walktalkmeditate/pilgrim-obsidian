import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import { importPilgrim, summaryMessage, type ImportSummary } from '../../src/import/orchestrator'
import { makeFakeApp } from '../support'
import sampleWalk from '../fixtures/sample-walk.json'
import sampleManifest from '../fixtures/sample-manifest.json'
import editedManifest from '../fixtures/sample-manifest-edited.json'

const SETTINGS = { walksFolder: 'Waymark', waymarkVersion: '0.1.0', geocodeCache: {} }

// An archive whose manifest carries an edit_transcription mod for the sample
// walk and an archived entry for a second walk that is also present in walks/.
async function buildPilgrim(): Promise<ArrayBuffer> {
  const zip = new JSZip()
  zip.file('manifest.json', JSON.stringify(editedManifest))
  zip.file(`walks/${sampleWalk.id}.json`, JSON.stringify(sampleWalk))
  const archivedWalk = { ...structuredClone(sampleWalk), id: 'archived-walk-id' }
  zip.file('walks/archived-walk-id.json', JSON.stringify(archivedWalk))
  return zip.generateAsync({ type: 'arraybuffer' })
}

describe('importPilgrim', () => {
  it('replays edits, skips archived walks, and writes the rest', async () => {
    // #given an archive with an edited transcription and an archived walk
    const fake = makeFakeApp()

    // #when imported
    const summary = await importPilgrim(fake.app, await buildPilgrim(), SETTINGS)

    // #then only the non-archived walk is written, carrying the edited transcription
    expect(summary.totalWalks).toBe(2)
    expect(summary.created).toBe(1)
    expect(summary.archivedSkipped).toBe(1)
    const content = [...fake.files.values()].find((c) => c.includes(`waymark-id: ${sampleWalk.id}`))!
    expect(content).toContain('Edited in the Pilgrim app')
    expect(content).not.toContain('The morning light filters through the trees')
  })

  it('is idempotent across a second import', async () => {
    // #given a vault that already imported the archive once
    const fake = makeFakeApp()
    await importPilgrim(fake.app, await buildPilgrim(), SETTINGS)

    // #when imported again
    const second = await importPilgrim(fake.app, await buildPilgrim(), SETTINGS)

    // #then the live walk updates in place; no duplicate notes
    expect(second.created).toBe(0)
    expect(second.updated).toBe(1)
    expect(fake.mdCount()).toBe(2) // 1 walk note + 1 dashboard
    expect(second.dashboardCreated).toBe(false) // dashboard not recreated
  })

  it('creates the Dataview dashboard note once', async () => {
    const fake = makeFakeApp()
    const first = await importPilgrim(fake.app, await buildPilgrim(), SETTINGS)
    expect(first.dashboardCreated).toBe(true)
    expect([...fake.files.keys()]).toContain('Waymark/Waymark Dashboard.md')
    const second = await importPilgrim(fake.app, await buildPilgrim(), SETTINGS)
    expect(second.dashboardCreated).toBe(false)
  })

  it('adds a place backlink and fills the geocode cache when lookup is on (U6)', async () => {
    // #given lookup enabled with a fake geocoder and an empty cache
    const fake = makeFakeApp()
    const cache: Record<string, string> = {}
    let calls = 0

    // #when imported
    const summary = await importPilgrim(fake.app, await buildPilgrim(), {
      ...SETTINGS,
      lookupPlaceNames: true,
      geocodeCache: cache,
      geocode: async () => {
        calls++
        return 'Santiago'
      },
    })

    // #then the note carries the backlink + attribution, and the cache is populated
    expect(summary.created).toBe(1)
    const note = [...fake.files.values()].find((c) => c.includes(`waymark-id: ${sampleWalk.id}`))!
    expect(note).toContain('**Near:** [[Santiago]]')
    expect(note).toContain('© OpenStreetMap contributors')
    expect(Object.values(cache)).toContain('Santiago')
    expect(calls).toBe(1)
  })

  it('creates a note for each of multiple non-archived walks', async () => {
    // #given an archive with two distinct walks (and no archived/edits)
    const fake = makeFakeApp()
    const zip = new JSZip()
    zip.file('manifest.json', JSON.stringify(sampleManifest))
    zip.file('walks/walk-one.json', JSON.stringify({ ...structuredClone(sampleWalk), id: 'walk-one' }))
    zip.file('walks/walk-two.json', JSON.stringify({ ...structuredClone(sampleWalk), id: 'walk-two' }))
    const buffer = await zip.generateAsync({ type: 'arraybuffer' })

    // #when imported
    const summary = await importPilgrim(fake.app, buffer, SETTINGS)

    // #then both walks become distinct notes (same-date titles disambiguated)
    expect(summary.created).toBe(2)
    expect(summary.archivedSkipped).toBe(0)
    expect(fake.mdCount()).toBe(3) // 2 walk notes + 1 dashboard
  })
})

describe('summaryMessage', () => {
  const base: ImportSummary = {
    created: 0,
    updated: 0,
    skippedEdited: [],
    skippedNoMarkers: [],
    failed: [],
    totalWalks: 0,
    archivedSkipped: 0,
    dashboardCreated: false,
  }

  it('reports an empty file distinctly', () => {
    expect(summaryMessage({ ...base, totalWalks: 0 })).toContain('no walks found')
  })

  it('reports an all-archived file distinctly', () => {
    expect(summaryMessage({ ...base, totalWalks: 2, archivedSkipped: 2 })).toContain(
      'all walks in this file are archived',
    )
  })

  it('reports a normal import with a skip', () => {
    const msg = summaryMessage({
      ...base,
      totalWalks: 3,
      created: 1,
      updated: 1,
      skippedEdited: ['Walk 2024-03-09'],
    })
    expect(msg).toContain('imported 2 walks (1 new, 1 updated)')
    expect(msg).toContain('1 skipped — edited')
  })

  it('reports markers-missing skips distinctly', () => {
    const msg = summaryMessage({ ...base, totalWalks: 1, updated: 1, skippedNoMarkers: ['Walk X'] })
    expect(msg).toContain('1 skipped — markers missing')
  })

  it('reports failed walks', () => {
    const msg = summaryMessage({ ...base, totalWalks: 2, created: 1, failed: ['walk-x'] })
    expect(msg).toContain('1 failed')
  })

  it('reports archived alongside imported walks', () => {
    const msg = summaryMessage({ ...base, totalWalks: 2, created: 1, archivedSkipped: 1 })
    expect(msg).toContain('1 archived')
  })
})
