import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import { parsePilgrim } from '../../src/parse/pilgrim'
import {
  writeWalkNotes,
  type AppLike,
  type FileManagerLike,
  type MetadataLike,
  type VaultLike,
  type WriterSettings,
} from '../../src/vault/writer'
import type { Walk } from '../../src/parse/types'
import sampleWalk from '../fixtures/sample-walk.json'
import sampleManifest from '../fixtures/sample-manifest.json'

const SETTINGS: WriterSettings = {
  walksFolder: 'Waymark',
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

function basename(path: string): string {
  return (path.split('/').pop() ?? '').replace(/\.md$/, '')
}

// Minimal scalar frontmatter round-trip — enough for the writer's waymark-* keys.
function splitFm(content: string): { fm: Record<string, unknown>; body: string } {
  if (!content.startsWith('---\n')) return { fm: {}, body: content }
  const end = content.indexOf('\n---', 4)
  if (end === -1) return { fm: {}, body: content }
  const block = content.slice(4, end)
  let body = content.slice(end + 4)
  if (body.startsWith('\n')) body = body.slice(1)
  const fm: Record<string, unknown> = {}
  for (const line of block.split('\n')) {
    const idx = line.indexOf(':')
    if (idx === -1) continue
    const key = line.slice(0, idx).trim()
    const raw = line.slice(idx + 1).trim()
    if (raw === 'true') fm[key] = true
    else if (raw === 'false') fm[key] = false
    else if (raw !== '' && !Number.isNaN(Number(raw))) fm[key] = Number(raw)
    else fm[key] = raw.replace(/^"(.*)"$/, '$1')
  }
  return { fm, body }
}

function joinFm(fm: Record<string, unknown>, body: string): string {
  const lines = Object.entries(fm).map(([k, v]) => `${k}: ${v}`)
  return `---\n${lines.join('\n')}\n---\n${body}`
}

interface Fake {
  app: AppLike
  files: Map<string, string>
  binaryCount: () => number
  mdCount: () => number
}

function makeFakeApp(): Fake {
  const files = new Map<string, string>()
  const binaries = new Set<string>()
  const folders = new Set<string>()
  let binaryCount = 0
  const exists = (p: string): boolean => files.has(p) || binaries.has(p) || folders.has(p)

  const vault: VaultLike = {
    getMarkdownFiles: () =>
      [...files.keys()].filter((p) => p.endsWith('.md')).map((p) => ({ path: p, basename: basename(p) })),
    read: async (f) => files.get(f.path) ?? '',
    create: async (path, data) => {
      files.set(path, data)
      return { path, basename: basename(path) }
    },
    process: async (f, fn) => {
      const next = fn(files.get(f.path) ?? '')
      files.set(f.path, next)
      return next
    },
    createFolder: async (path) => {
      folders.add(path)
    },
    getAbstractFileByPath: (path) => (exists(path) ? { path } : null),
    createBinary: async (path) => {
      binaries.add(path)
      binaryCount++
      return { path, basename: basename(path) }
    },
  }
  const metadataCache: MetadataLike = {
    getFileCache: (f) => ({ frontmatter: splitFm(files.get(f.path) ?? '').fm }),
  }
  const fileManager: FileManagerLike = {
    processFrontMatter: async (f, fn) => {
      const { fm, body } = splitFm(files.get(f.path) ?? '')
      fn(fm)
      files.set(f.path, joinFm(fm, body))
    },
  }
  return {
    app: { vault, metadataCache, fileManager },
    files,
    binaryCount: () => binaryCount,
    mdCount: () => [...files.keys()].filter((p) => p.endsWith('.md')).length,
  }
}

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
})
