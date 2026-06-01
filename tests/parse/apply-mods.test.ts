import { describe, it, expect } from 'vitest'
import { applyWalkMods, archivedWalkIds, modsForWalk } from '../../src/parse/apply-mods'
import type { Modification, PilgrimManifest } from '../../src/parse/types'
import { walkFrom } from '../support'
import sampleManifest from '../fixtures/sample-manifest.json'
import sampleWalk from '../fixtures/sample-walk.json'

function mod(
  op: Modification['op'],
  walkId: string,
  payload: Modification['payload'],
): Modification {
  return { id: `mod-${op}-${walkId}`, at: 1710000000000, op, walkId, payload }
}

describe('modsForWalk', () => {
  it('returns only the mods scoped to the given walk', () => {
    // #given mods for two different walks
    const mods: Modification[] = [
      mod('edit_intention', 'walk-a', { text: 'A' }),
      mod('edit_intention', 'walk-b', { text: 'B' }),
    ]
    // #when filtered to walk-a #then only walk-a's mod survives
    expect(modsForWalk(mods, 'walk-a')).toHaveLength(1)
    expect(modsForWalk(mods, 'walk-a')[0]!.walkId).toBe('walk-a')
  })
})

describe('applyWalkMods', () => {
  it('returns the walk unchanged when there are no mods', async () => {
    // #given a walk and no mods
    const walk = await walkFrom()
    // #when applied #then the same walk is returned
    expect(applyWalkMods(walk, [])).toBe(walk)
  })

  it('replaces a matching recording transcription', async () => {
    // #given a walk and an edit_transcription mod keyed on the recording's epoch seconds
    const walk = await walkFrom()
    const startSec = Math.floor(walk.voiceRecordings[0]!.startDate.getTime() / 1000)
    // #when applied
    const result = applyWalkMods(walk, [
      mod('edit_transcription', walk.id, { recordingStartDate: startSec, text: 'Edited text' }),
    ])
    // #then the transcription is replaced and the walk is marked user-modified
    expect(result?.voiceRecordings[0]!.transcription).toBe('Edited text')
    expect(result?.isUserModified).toBe(true)
  })

  it('does not match an edit_transcription whose key is in milliseconds', async () => {
    // #given a mod whose recordingStartDate is the recording time in MS (1000x too large)
    const walk = await walkFrom()
    const startMs = walk.voiceRecordings[0]!.startDate.getTime()
    // #when applied
    const result = applyWalkMods(walk, [
      mod('edit_transcription', walk.id, { recordingStartDate: startMs, text: 'Should not apply' }),
    ])
    // #then no recording matches; the original transcription is untouched
    expect(result?.voiceRecordings[0]!.transcription).toBe(
      'The morning light filters through the trees',
    )
  })

  it('returns null for an archived walk', async () => {
    // #given an archive_walk mod
    const walk = await walkFrom()
    // #when applied #then the walk is dropped
    expect(applyWalkMods(walk, [mod('archive_walk', walk.id, {})])).toBeNull()
  })

  it('removes a section on delete_section', async () => {
    // #given a delete_section mod for reflection
    const walk = await walkFrom()
    // #when applied #then the reflection is gone
    const result = applyWalkMods(walk, [mod('delete_section', walk.id, { section: 'reflection' })])
    expect(result?.reflection).toBeUndefined()
  })

  it('keeps two walks isolated — each receives only its own mod', async () => {
    // #given two walks and a mod for each
    const walkA = await walkFrom({ id: 'walk-a' })
    const walkB = await walkFrom({ id: 'walk-b' })
    const recA = Math.floor(walkA.voiceRecordings[0]!.startDate.getTime() / 1000)
    const recB = Math.floor(walkB.voiceRecordings[0]!.startDate.getTime() / 1000)
    const mods: Modification[] = [
      mod('edit_transcription', 'walk-a', { recordingStartDate: recA, text: 'A only' }),
      mod('edit_transcription', 'walk-b', { recordingStartDate: recB, text: 'B only' }),
    ]
    // #when each walk is given only its own scoped mods
    const resA = applyWalkMods(walkA, modsForWalk(mods, 'walk-a'))
    const resB = applyWalkMods(walkB, modsForWalk(mods, 'walk-b'))
    // #then no cross-walk leakage
    expect(resA?.voiceRecordings[0]!.transcription).toBe('A only')
    expect(resB?.voiceRecordings[0]!.transcription).toBe('B only')
  })

  it('replaces the whole walk via replace_walk, normalizing raw JSON dates', async () => {
    // #given a replace_walk mod carrying raw walk JSON (epoch-seconds dates)
    const walk = await walkFrom()
    const replacement = { ...structuredClone(sampleWalk), id: walk.id, intention: 'Replaced intention' }

    // #when applied
    const result = applyWalkMods(walk, [mod('replace_walk', walk.id, { walk: replacement })])

    // #then the replacement wins and its dates are normalized to Date objects
    expect(result?.id).toBe(walk.id)
    expect(result?.intention).toBe('Replaced intention')
    expect(result?.startDate).toBeInstanceOf(Date)
    expect(result?.isUserModified).toBe(true)
  })

  it('keeps the original walk when a replace_walk payload is malformed', async () => {
    // #given a replace_walk mod whose payload is not a walk object
    const walk = await walkFrom()

    // #when applied
    const result = applyWalkMods(walk, [mod('replace_walk', walk.id, { walk: null })])

    // #then the parsed walk is preserved (no crash, no corrupt substitution)
    expect(result?.id).toBe(walk.id)
  })

  it('applies edit_intention', async () => {
    // #given an edit_intention mod
    const walk = await walkFrom()

    // #when applied #then the intention is replaced
    const result = applyWalkMods(walk, [mod('edit_intention', walk.id, { text: 'New intention' })])
    expect(result?.intention).toBe('New intention')
    expect(result?.isUserModified).toBe(true)
  })

  it('applies edit_reflection_text, creating a reflection when absent', async () => {
    // #given a walk with no reflection and an edit_reflection_text mod
    const walk = await walkFrom()
    walk.reflection = undefined

    // #when applied #then a reflection is created with the new text
    const result = applyWalkMods(walk, [
      mod('edit_reflection_text', walk.id, { text: 'New reflection' }),
    ])
    expect(result?.reflection?.text).toBe('New reflection')
  })

  it('deletes a voice recording by epoch-seconds startDate', async () => {
    // #given a delete_voice_recording mod keyed on the recording's epoch seconds
    const walk = await walkFrom()
    const startSec = Math.floor(walk.voiceRecordings[0]!.startDate.getTime() / 1000)

    // #when applied #then the recording is removed
    const result = applyWalkMods(walk, [
      mod('delete_voice_recording', walk.id, { startDate: startSec }),
    ])
    expect(result?.voiceRecordings).toHaveLength(0)
  })
})

describe('archivedWalkIds', () => {
  it('collects ids from manifest.archived[]', () => {
    // #given a manifest with two archived walks
    const manifest = {
      ...sampleManifest,
      archived: [{ id: 'gone-1' }, { id: 'gone-2' }],
    } as unknown as PilgrimManifest
    // #when collected #then both ids are present
    const ids = archivedWalkIds(manifest)
    expect(ids.has('gone-1')).toBe(true)
    expect(ids.has('gone-2')).toBe(true)
    expect(ids.size).toBe(2)
  })

  it('returns an empty set when archived is absent', () => {
    // #given a manifest with no archived field
    // #when collected #then the set is empty
    expect(archivedWalkIds(sampleManifest as unknown as PilgrimManifest).size).toBe(0)
  })
})
