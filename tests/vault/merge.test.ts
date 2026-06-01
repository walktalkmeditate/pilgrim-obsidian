import { describe, it, expect } from 'vitest'
import { mergeNote, mergeFrontmatter } from '../../src/vault/merge'

function created(walkId: string, body: string) {
  return mergeNote({ existingContent: null, storedHash: null, walkId, body })
}

describe('mergeNote — create', () => {
  it('wraps the body in markers and seeds a Notes area on a new note', () => {
    // #given no existing note
    // #when merged
    const result = created('w1', 'first body')

    // #then a managed block is produced with a seeded user area and a hash
    expect(result.decision).toBe('created')
    expect(result.content).toContain('%% waymark:begin id=w1')
    expect(result.content).toContain('%% waymark:end id=w1 %%')
    expect(result.content).toContain('first body')
    expect(result.content).toContain('## Notes')
    expect(result.newHash.length).toBeGreaterThan(0)
  })
})

describe('mergeNote — update (AE2)', () => {
  it('replaces only the managed region when the stored hash matches', () => {
    // #given a previously created note whose region is untouched
    const first = created('w1', 'first body')

    // #when re-merged with new body and the matching stored hash
    const updated = mergeNote({
      existingContent: first.content!,
      storedHash: first.newHash,
      walkId: 'w1',
      body: 'second body',
    })

    // #then the region is regenerated in place (no duplicate block), Notes preserved
    expect(updated.decision).toBe('updated')
    expect(updated.content).toContain('second body')
    expect(updated.content).not.toContain('first body')
    expect(updated.content).toContain('## Notes')
    expect((updated.content!.match(/waymark:begin/g) ?? []).length).toBe(1)
  })

  it('preserves user content added below the end marker', () => {
    // #given a created note with a user paragraph appended below ## Notes
    const first = created('w1', 'first body')
    const withNote = first.content! + '\nA reflection I added myself.'

    // #when re-merged with updated app content
    const updated = mergeNote({
      existingContent: withNote,
      storedHash: first.newHash,
      walkId: 'w1',
      body: 'second body',
    })

    // #then the user's paragraph survives and the region still updates
    expect(updated.decision).toBe('updated')
    expect(updated.content).toContain('A reflection I added myself.')
    expect(updated.content).toContain('second body')
  })
})

describe('mergeNote — preserve (AE3)', () => {
  it('skips and writes nothing when the user edited inside the managed region', () => {
    // #given a created note whose managed region the user has since edited
    const first = created('w1', 'first body')
    const userEdited = first.content!.replace('first body', 'first body — my own edit')

    // #when re-merged with the OLD stored hash (region now diverges)
    const result = mergeNote({
      existingContent: userEdited,
      storedHash: first.newHash,
      walkId: 'w1',
      body: 'app updated body',
    })

    // #then it preserves the note untouched — no write
    expect(result.decision).toBe('skipped-edited')
    expect(result.content).toBeNull()
  })

  it('treats whitespace/newline reformatting as unchanged, not a user edit', () => {
    // #given a created note whose region gained trailing whitespace (Obsidian reformat)
    const first = created('w1', 'first body')
    const reformatted = first.content!.replace('first body', 'first body   ')

    // #when re-merged with the same body
    const result = mergeNote({
      existingContent: reformatted,
      storedHash: first.newHash,
      walkId: 'w1',
      body: 'first body',
    })

    // #then normalization keeps the hash matching, so it safely regenerates
    expect(result.decision).toBe('updated')
  })
})

describe('mergeNote — markers missing', () => {
  it('skips and warns when the managed markers are gone but the id remains', () => {
    // #given a note carrying the walk id but no managed-region markers
    const noMarkers = '---\nwaymark-id: w1\n---\nSome content, markers deleted.'

    // #when re-merged
    const result = mergeNote({
      existingContent: noMarkers,
      storedHash: 'somehash',
      walkId: 'w1',
      body: 'new body',
    })

    // #then it never rewrites the file
    expect(result.decision).toBe('skipped-no-markers')
    expect(result.content).toBeNull()
  })

  it('skips when a begin marker has no matching end marker', () => {
    // #given a truncated managed block (begin without end)
    const truncated = '%% waymark:begin id=w1 | edit below %%\nsome body, no end'

    // #when re-merged
    const result = mergeNote({
      existingContent: truncated,
      storedHash: 'h',
      walkId: 'w1',
      body: 'x',
    })

    // #then skip rather than whole-file rewrite
    expect(result.decision).toBe('skipped-no-markers')
    expect(result.content).toBeNull()
  })
})

describe('mergeFrontmatter', () => {
  it('writes waymark keys + hash, preserves user keys, drops stale waymark keys', () => {
    // #given existing frontmatter with user keys and a stale waymark key
    const fm: Record<string, unknown> = {
      title: 'My walk',
      tags: ['journal'],
      'waymark-id': 'w1',
      'waymark-stale': 'old value',
    }

    // #when merged with the current owned key set
    mergeFrontmatter(fm, { 'waymark-id': 'w1', 'waymark-distance-km': 5.4 }, 'HASH123')

    // #then user keys survive, owned keys + hash are set, stale waymark key is removed
    expect(fm.title).toBe('My walk')
    expect(fm.tags).toEqual(['journal'])
    expect(fm['waymark-distance-km']).toBe(5.4)
    expect(fm['waymark-block-hash']).toBe('HASH123')
    expect(fm['waymark-stale']).toBeUndefined()
  })
})

describe('mergeNote — marker robustness', () => {
  it('does not mistake a bare end-marker inside the body for the terminator', () => {
    // #given a transcription that literally contains the bare end marker
    const body = 'I wrote %% waymark:end %% in my notes today'
    const first = created('w1', body)

    // #then the region is terminated by the id-scoped marker, not the bare one
    expect(first.content).toContain('%% waymark:end id=w1 %%')

    // #when re-imported with the same body, the region is located correctly
    const result = mergeNote({
      existingContent: first.content!,
      storedHash: first.newHash,
      walkId: 'w1',
      body,
    })

    // #then it updates rather than locking the note as edited
    expect(result.decision).toBe('updated')
  })

  it('treats CRLF line endings as unchanged (Windows vaults)', () => {
    // #given a created note whose region was rewritten with CRLF endings
    const first = created('w1', 'first body')
    const crlf = first.content!.replace(/\n/g, '\r\n')

    // #when re-merged with the same body
    const result = mergeNote({
      existingContent: crlf,
      storedHash: first.newHash,
      walkId: 'w1',
      body: 'first body',
    })

    // #then normalization keeps the hash matching — not a false "edited"
    expect(result.decision).toBe('updated')
  })

  it('preserves a note that has markers but no stored hash', () => {
    // #given a note with a valid managed region but no recorded hash
    const first = created('w1', 'first body')

    // #when re-merged with storedHash null (e.g. the user deleted the key)
    const result = mergeNote({
      existingContent: first.content!,
      storedHash: null,
      walkId: 'w1',
      body: 'new body',
    })

    // #then it preserves rather than overwrites
    expect(result.decision).toBe('skipped-edited')
    expect(result.content).toBeNull()
  })
})
