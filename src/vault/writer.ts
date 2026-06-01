import type { Walk } from '../parse/types'
import {
  renderWalk,
  type AttachmentRef,
  type GeneratedFile,
  type RenderProvenance,
} from '../render/walk-note'
import { mergeFrontmatter, mergeNote } from './merge'

// Narrow seam over the Obsidian App surface the writer uses. The real App
// satisfies this structurally; tests pass an in-memory fake. Keeps the writer
// free of the Obsidian runtime so its wiring is unit-testable.
export interface TFileLike {
  path: string
  basename: string
}

export interface VaultLike {
  getMarkdownFiles(): TFileLike[]
  read(file: TFileLike): Promise<string>
  create(path: string, data: string): Promise<TFileLike>
  process(file: TFileLike, fn: (data: string) => string): Promise<string>
  createFolder(path: string): Promise<void>
  getAbstractFileByPath(path: string): { path: string } | null
  createBinary(path: string, data: ArrayBuffer): Promise<TFileLike>
}

export interface MetadataLike {
  getFileCache(file: TFileLike): { frontmatter?: Record<string, unknown> } | null
}

export interface FileManagerLike {
  processFrontMatter(file: TFileLike, fn: (fm: Record<string, unknown>) => void): Promise<void>
}

export interface AppLike {
  vault: VaultLike
  metadataCache: MetadataLike
  fileManager: FileManagerLike
}

export interface WriterSettings {
  walksFolder: string
  provenance: RenderProvenance
  mapboxToken?: string
  placeNames?: Map<string, string>
}

export interface ImportTally {
  created: number
  updated: number
  skippedEdited: string[]
  skippedNoMarkers: string[]
  failed: string[]
}

interface IndexedNote {
  file: TFileLike
  storedHash: string | null
}

// Map waymark-id -> existing note via the metadata cache. Rename/move-proof:
// identity travels with the note, not its path.
function buildIndex(app: AppLike): Map<string, IndexedNote> {
  const index = new Map<string, IndexedNote>()
  for (const file of app.vault.getMarkdownFiles()) {
    const fm = app.metadataCache.getFileCache(file)?.frontmatter
    const id = fm?.['waymark-id']
    if (typeof id === 'string') {
      const hash = fm?.['waymark-block-hash']
      index.set(id, { file, storedHash: typeof hash === 'string' ? hash : null })
    }
  }
  return index
}

async function ensureFolder(app: AppLike, folder: string): Promise<void> {
  const parts = folder.split('/').filter((p) => p.length > 0)
  let current = ''
  for (const part of parts) {
    current = current ? `${current}/${part}` : part
    if (app.vault.getAbstractFileByPath(current) == null) {
      await app.vault.createFolder(current)
    }
  }
}

// Write a generated note once; never overwrite an existing file (the user owns it
// after first creation). Returns whether it was created. Used for the dashboard.
export async function writeFileIfAbsent(
  app: AppLike,
  path: string,
  content: string,
): Promise<boolean> {
  if (app.vault.getAbstractFileByPath(path) != null) return false
  const slash = path.lastIndexOf('/')
  if (slash > 0) await ensureFolder(app, path.slice(0, slash))
  await app.vault.create(path, content)
  return true
}

function uniqueNotePath(app: AppLike, folder: string, title: string): string {
  const base = folder ? `${folder}/${title}` : title
  let path = `${base}.md`
  let n = 2
  while (app.vault.getAbstractFileByPath(path) != null) {
    path = `${base} ${n}.md`
    n++
  }
  return path
}

// Route GeoJSON sidecars are text the plugin owns, not photo bytes — they are
// rewritten on every import so the map tracks edits. The wikilink resolves them
// by basename regardless of folder.
async function writeGeneratedFiles(
  app: AppLike,
  files: GeneratedFile[],
  folder: string,
): Promise<void> {
  for (const file of files) {
    const path = `${folder}/${file.fileName}`
    const existing = app.vault.getAbstractFileByPath(path)
    if (existing) {
      await app.vault.process(existing as unknown as TFileLike, () => file.content)
    } else {
      await ensureFolder(app, folder)
      await app.vault.create(path, file.content)
    }
  }
}

// Deterministic, existence-checked filenames make re-import idempotent — no
// " 1.jpg" duplicates that getAvailablePathForAttachment would create on collision.
async function writeAttachments(
  app: AppLike,
  attachments: AttachmentRef[],
  photoBytes: Map<string, ArrayBuffer>,
  folder: string,
): Promise<void> {
  for (const att of attachments) {
    const bytes = photoBytes.get(att.sourceToken)
    if (!bytes) continue
    const path = `${folder}/${att.fileName}`
    if (app.vault.getAbstractFileByPath(path) == null) {
      await ensureFolder(app, folder)
      await app.vault.createBinary(path, bytes)
    }
  }
}

// Generate or update one note per walk, idempotently. Honors the merge
// decision atomically: on a skip, neither body, frontmatter, nor attachments
// are written.
export async function writeWalkNotes(
  app: AppLike,
  walks: Walk[],
  photoBytes: Map<string, ArrayBuffer>,
  settings: WriterSettings,
): Promise<ImportTally> {
  const tally: ImportTally = {
    created: 0,
    updated: 0,
    skippedEdited: [],
    skippedNoMarkers: [],
    failed: [],
  }
  const index = buildIndex(app)
  const attachmentsFolder = `${settings.walksFolder}/attachments`

  for (const walk of walks) {
    // Isolate each walk: a single malformed walk must not abort the whole import
    // or discard the running tally.
    try {
      const rendered = renderWalk(walk, {
        provenance: settings.provenance,
        mapboxToken: settings.mapboxToken,
        placeName: settings.placeNames?.get(walk.id),
      })
      const existing = index.get(walk.id) ?? null
      const existingContent = existing ? await app.vault.read(existing.file) : null
      const merge = mergeNote({
        existingContent,
        storedHash: existing?.storedHash ?? null,
        walkId: walk.id,
        body: rendered.body,
      })

      if (merge.decision === 'skipped-edited') {
        tally.skippedEdited.push(rendered.title)
        continue
      }
      if (merge.decision === 'skipped-no-markers') {
        tally.skippedNoMarkers.push(rendered.title)
        continue
      }

      const content = merge.content
      if (content === null) continue // defensive — create/update always carry content

      await writeAttachments(app, rendered.attachments, photoBytes, attachmentsFolder)
      await writeGeneratedFiles(app, rendered.generatedFiles, attachmentsFolder)

      if (merge.decision === 'created') {
        await ensureFolder(app, settings.walksFolder)
        const path = uniqueNotePath(app, settings.walksFolder, rendered.title)
        const file = await app.vault.create(path, content)
        await app.fileManager.processFrontMatter(file, (fm) =>
          mergeFrontmatter(fm, rendered.frontmatter, merge.newHash),
        )
        tally.created++
      } else if (existing) {
        await app.vault.process(existing.file, () => content)
        await app.fileManager.processFrontMatter(existing.file, (fm) =>
          mergeFrontmatter(fm, rendered.frontmatter, merge.newHash),
        )
        tally.updated++
      }
    } catch (err) {
      console.error(`Waymark: failed to import walk ${walk.id}`, err)
      tally.failed.push(walk.id)
    }
  }

  return tally
}
