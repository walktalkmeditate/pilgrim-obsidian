import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import { parsePilgrim } from '../../src/parse/pilgrim'
import sampleWalk from '../fixtures/sample-walk.json'
import sampleManifest from '../fixtures/sample-manifest.json'

const stubFactory = (): string => 'stub://url'
const stubRevoker = (): void => {}

async function makePilgrim(opts: {
  manifest?: unknown
  walks?: Record<string, unknown>[]
  omitManifest?: boolean
}): Promise<ArrayBuffer> {
  const zip = new JSZip()
  if (!opts.omitManifest) {
    zip.file('manifest.json', JSON.stringify(opts.manifest ?? sampleManifest))
  }
  const walks = opts.walks ?? [sampleWalk as Record<string, unknown>]
  for (const walk of walks) {
    zip.file(`walks/${(walk as { id: string }).id}.json`, JSON.stringify(walk))
  }
  return zip.generateAsync({ type: 'arraybuffer' })
}

function parse(buffer: ArrayBuffer) {
  return parsePilgrim(buffer, { urlFactory: stubFactory, urlRevoker: stubRevoker })
}

describe('parsePilgrim', () => {
  it('parses a walk with transcription, epoch-seconds dates, and reflection', async () => {
    // #given a .pilgrim archive carrying one full walk
    const buffer = await makePilgrim({})

    // #when parsed
    const { walks, manifest } = await parse(buffer)

    // #then the walk fields map through, dates convert seconds -> Date
    expect(walks).toHaveLength(1)
    const walk = walks[0]!
    expect(walk.id).toBe(sampleWalk.id)
    expect(walk.startDate.getTime()).toBe(sampleWalk.startDate * 1000)
    expect(walk.stats.distance).toBeCloseTo(5432.1)
    expect(walk.intention).toBe('Walk with gratitude today')
    expect(walk.reflection?.text).toBe('Morning dew glistens...')
    expect(walk.voiceRecordings[0]!.transcription).toBe(
      'The morning light filters through the trees',
    )
    expect(manifest.appVersion).toBe('1.0.0')
  })

  it('hoists celestialContext out of reflection onto the walk', async () => {
    // #given a walk whose reflection carries celestialContext
    const buffer = await makePilgrim({})

    // #when parsed
    const { walks } = await parse(buffer)

    // #then celestial is lifted to the top-level walk field
    expect(walks[0]!.celestial?.lunarPhase.name).toBe('Waxing Crescent')
  })

  it('parses cleanly when there is no photos/ directory', async () => {
    // #given a .pilgrim with no photos/ entries
    const buffer = await makePilgrim({})

    // #when parsed
    const { walks } = await parse(buffer)

    // #then photos is absent, not an error
    expect(walks[0]!.photos).toBeUndefined()
  })

  it('handles a voice recording with no transcription', async () => {
    // #given a recording missing its transcription
    const walk = structuredClone(sampleWalk) as Record<string, any>
    walk.id = 'no-transcription-walk'
    delete walk.voiceRecordings[0].transcription

    // #when parsed
    const { walks } = await parse(await makePilgrim({ walks: [walk] }))

    // #then the recording survives with an undefined transcription
    expect(walks[0]!.voiceRecordings[0]!.transcription).toBeUndefined()
  })

  it('preserves every voice recording on a multi-recording walk', async () => {
    // #given a walk with two recordings
    const walk = structuredClone(sampleWalk) as Record<string, any>
    walk.id = 'multi-rec-walk'
    walk.voiceRecordings = [
      { startDate: 1710002000, endDate: 1710002100, duration: 100, transcription: 'second' },
      { startDate: 1710001000, endDate: 1710001100, duration: 100, transcription: 'first' },
    ]

    // #when parsed
    const { walks } = await parse(await makePilgrim({ walks: [walk] }))

    // #then both recordings are present (render layer owns ordering)
    expect(walks[0]!.voiceRecordings).toHaveLength(2)
  })

  it('returns zero walks when walks/ is empty', async () => {
    // #given an archive with a manifest but no walk files
    const buffer = await makePilgrim({ walks: [] })

    // #when parsed
    const { walks } = await parse(buffer)

    // #then no walks, no error
    expect(walks).toHaveLength(0)
  })

  it('throws when manifest.json is missing', async () => {
    // #given an archive with no manifest.json
    const buffer = await makePilgrim({ omitManifest: true })

    // #when parsed #then it rejects, naming the missing manifest
    await expect(parse(buffer)).rejects.toThrow(/manifest\.json/)
  })
})
