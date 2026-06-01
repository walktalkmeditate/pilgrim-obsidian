import JSZip from 'jszip'
import { parsePilgrim } from '../src/parse/pilgrim'
import type { Walk } from '../src/parse/types'
import type { AppLike, FileManagerLike, MetadataLike, VaultLike } from '../src/vault/writer'
import sampleWalk from './fixtures/sample-walk.json'
import sampleManifest from './fixtures/sample-manifest.json'

export async function walkFrom(overrides: Record<string, unknown> = {}): Promise<Walk> {
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

export function basename(path: string): string {
  return (path.split('/').pop() ?? '').replace(/\.md$/, '')
}

// Minimal scalar frontmatter round-trip — enough for the writer's waymark-* keys.
export function splitFm(content: string): { fm: Record<string, unknown>; body: string } {
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

export function joinFm(fm: Record<string, unknown>, body: string): string {
  const lines = Object.entries(fm).map(([k, v]) => `${k}: ${v}`)
  return `---\n${lines.join('\n')}\n---\n${body}`
}

export interface Fake {
  app: AppLike
  files: Map<string, string>
  binaryCount: () => number
  mdCount: () => number
}

// In-memory vault standing in for the Obsidian App surface the writer uses.
export function makeFakeApp(): Fake {
  const files = new Map<string, string>()
  const binaries = new Set<string>()
  const folders = new Set<string>()
  let binaryCount = 0
  const exists = (p: string): boolean => files.has(p) || binaries.has(p) || folders.has(p)

  const vault: VaultLike = {
    getMarkdownFiles: () =>
      [...files.keys()]
        .filter((p) => p.endsWith('.md'))
        .map((p) => ({ path: p, basename: basename(p) })),
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
