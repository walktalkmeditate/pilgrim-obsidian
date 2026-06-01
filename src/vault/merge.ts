import type { FrontmatterValue } from '../render/walk-note'

export type MergeDecision = 'created' | 'updated' | 'skipped-edited' | 'skipped-no-markers'

export interface MergeInput {
  // Full current note content, or null when the note does not exist yet.
  existingContent: string | null
  // The waymark-block-hash recorded in the note's frontmatter last time Waymark
  // wrote it, or null when there is none to compare against.
  storedHash: string | null
  walkId: string
  // The rendered managed-region inner content (no markers).
  body: string
}

export interface MergeResult {
  decision: MergeDecision
  // Full content to write via Vault.process, or null when nothing should be
  // written (both skip decisions). The frontmatter channel is written
  // separately by the caller and is likewise skipped when content is null.
  content: string | null
  // Hash to store in frontmatter for create/update; the preserved hash on skip.
  newHash: string
}

const END_MARKER = '%% waymark:end %%'

function beginMarker(walkId: string): string {
  return `%% waymark:begin id=${walkId} | Waymark-managed — edits here are not preserved; write below the end marker %%`
}

// Normalize before hashing so benign reformatting by Obsidian (trailing
// whitespace, CRLF, leading/trailing blank lines) does not read as a user edit.
function normalizeForHash(s: string): string {
  return s
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+$/, ''))
    .join('\n')
    .trim()
}

// cyrb53 — a fast, well-distributed non-cryptographic hash. Used only to detect
// whether the managed region changed since Waymark last wrote it.
function cyrb53(str: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507)
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507)
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  const hash = 4294967296 * (2097151 & h2) + (h1 >>> 0)
  return hash.toString(16)
}

function hashRegion(regionInner: string): string {
  return cyrb53(normalizeForHash(regionInner))
}

function skip(decision: MergeDecision, storedHash: string | null, fallback: string): MergeResult {
  return { decision, content: null, newHash: storedHash ?? fallback }
}

export function mergeNote(input: MergeInput): MergeResult {
  const { existingContent, storedHash, walkId, body } = input
  const regionInner = `\n${body.trim()}\n`

  if (existingContent === null) {
    const block = `${beginMarker(walkId)}${regionInner}${END_MARKER}`
    return { decision: 'created', content: `${block}\n\n## Notes\n`, newHash: hashRegion(regionInner) }
  }

  const beginToken = `%% waymark:begin id=${walkId}`
  const beginIdx = existingContent.indexOf(beginToken)
  if (beginIdx === -1) return skip('skipped-no-markers', storedHash, '')

  // The begin marker is a single line; its closing '%%' bounds the region start.
  const beginClose = existingContent.indexOf('%%', beginIdx + beginToken.length)
  if (beginClose === -1) return skip('skipped-no-markers', storedHash, '')

  const regionStart = beginClose + 2
  const endIdx = existingContent.indexOf(END_MARKER, regionStart)
  if (endIdx === -1) return skip('skipped-no-markers', storedHash, '')

  const currentRegion = existingContent.slice(regionStart, endIdx)
  const currentHash = hashRegion(currentRegion)

  // No stored hash to verify against, or the region diverged from what Waymark
  // last wrote: the user edited it. Preserve — never overwrite a reflection.
  if (storedHash === null || currentHash !== storedHash) {
    return skip('skipped-edited', storedHash, currentHash)
  }

  const before = existingContent.slice(0, regionStart)
  const after = existingContent.slice(endIdx)
  return {
    decision: 'updated',
    content: `${before}${regionInner}${after}`,
    newHash: hashRegion(regionInner),
  }
}

// Merge Waymark's owned frontmatter keys into an existing frontmatter object
// (the mutable object Obsidian's processFrontMatter hands the caller). Only
// waymark-* keys are written or removed; every user key is left untouched.
export function mergeFrontmatter(
  fm: Record<string, unknown>,
  owned: Record<string, FrontmatterValue>,
  blockHash: string,
): void {
  const ownedKeys = new Set<string>(Object.keys(owned))
  ownedKeys.add('waymark-block-hash')

  for (const key of Object.keys(fm)) {
    if (key.startsWith('waymark-') && !ownedKeys.has(key)) {
      delete fm[key]
    }
  }
  for (const [key, value] of Object.entries(owned)) {
    fm[key] = value
  }
  fm['waymark-block-hash'] = blockHash
}
