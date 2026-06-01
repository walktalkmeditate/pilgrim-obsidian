import { describe, it, expect, vi } from 'vitest'
import {
  cacheKey,
  nominatimUrl,
  parseNominatim,
  resolvePlaceNames,
  roundCoord,
  startCoordinate,
} from '../../src/import/geocode'
import { walkFrom } from '../support'

const NOOP_SLEEP = async (): Promise<void> => {}

describe('geocode helpers', () => {
  it('rounds coordinates to ~100 m for cache keys and what leaves the machine', () => {
    expect(roundCoord(42.887234)).toBe(42.887)
    expect(cacheKey(42.887234, -8.510812)).toBe('42.887,-8.511')
  })

  it('takes the start of the route (LineString first coordinate, [lng, lat])', async () => {
    expect(startCoordinate(await walkFrom())).toEqual({ lat: 42.8872, lng: -8.5108 })
  })

  it('builds a Nominatim reverse URL', () => {
    const url = nominatimUrl(42.887, -8.511)
    expect(url).toContain('nominatim.openstreetmap.org/reverse')
    expect(url).toContain('lat=42.887')
    expect(url).toContain('lon=-8.511')
  })

  it('prefers name, falls back to display_name, then null', () => {
    expect(parseNominatim({ name: 'Santiago' })).toBe('Santiago')
    expect(parseNominatim({ display_name: 'Praza, Santiago, Spain' })).toBe('Praza')
    expect(parseNominatim({ name: '', display_name: 'Praza, Santiago, Spain' })).toBe('Praza')
    expect(parseNominatim({})).toBeNull()
    expect(parseNominatim('nope')).toBeNull()
  })

  it('falls back to the first Point when the route has no LineString', async () => {
    const walk = await walkFrom()
    walk.route.features = walk.route.features.filter((f) => f.geometry.type !== 'LineString')
    expect(startCoordinate(walk)).toEqual({ lat: 42.886, lng: -8.513 })
  })
})

describe('resolvePlaceNames', () => {
  it('returns nothing and never calls the geocoder when lookup is off', async () => {
    const geocoder = vi.fn()
    const names = await resolvePlaceNames([await walkFrom()], {
      lookup: false,
      cache: {},
      geocoder,
      sleep: NOOP_SLEEP,
    })
    expect(names.size).toBe(0)
    expect(geocoder).not.toHaveBeenCalled()
  })

  it('geocodes a miss with the rounded coordinate, caches it, and returns the name', async () => {
    const walk = await walkFrom()
    const cache: Record<string, string> = {}
    const geocoder = vi.fn(async () => 'Santiago')
    const names = await resolvePlaceNames([walk], {
      lookup: true,
      cache,
      geocoder,
      sleep: NOOP_SLEEP,
    })
    expect(geocoder).toHaveBeenCalledWith(42.887, -8.511)
    expect(names.get(walk.id)).toBe('Santiago')
    expect(cache['42.887,-8.511']).toBe('Santiago')
  })

  it('uses a cached name without hitting the geocoder', async () => {
    const walk = await walkFrom()
    const geocoder = vi.fn()
    const names = await resolvePlaceNames([walk], {
      lookup: true,
      cache: { '42.887,-8.511': 'Cached Place' },
      geocoder,
      sleep: NOOP_SLEEP,
    })
    expect(geocoder).not.toHaveBeenCalled()
    expect(names.get(walk.id)).toBe('Cached Place')
  })

  it('geocodes a shared coordinate once and throttles between network calls', async () => {
    const a = await walkFrom({ id: 'a' })
    const b = await walkFrom({ id: 'b' }) // same default route → same rounded coord as a
    const c = await walkFrom({ id: 'c' })
    const line = c.route.features.find((f) => f.geometry.type === 'LineString')!
    ;(line.geometry.coordinates as number[][])[0] = [10, 20, 0]

    const sleep = vi.fn(async () => {})
    const geocoder = vi.fn(async (lat: number) => `P${lat}`)
    const names = await resolvePlaceNames([a, b, c], {
      lookup: true,
      cache: {},
      geocoder,
      sleep,
      throttleMs: 50,
    })

    expect(geocoder).toHaveBeenCalledTimes(2) // a (miss), b (cache hit), c (miss)
    expect(sleep).toHaveBeenCalledTimes(1) // throttled once, between the two network calls
    expect(names.get('a')).toBe('P42.887')
    expect(names.get('b')).toBe('P42.887') // b actually received a's cached name
    expect(names.get('c')).toBe('P20')
  })

  it('does not cache a null result, so a no-name location is retried on re-import', async () => {
    const walk = await walkFrom()
    const cache: Record<string, string> = {}
    const geocoder = vi.fn(async () => null)

    await resolvePlaceNames([walk], { lookup: true, cache, geocoder, sleep: NOOP_SLEEP })
    await resolvePlaceNames([walk], { lookup: true, cache, geocoder, sleep: NOOP_SLEEP })

    expect(geocoder).toHaveBeenCalledTimes(2) // not short-circuited by a cached null
    expect(Object.keys(cache)).toHaveLength(0)
  })

  it('is fail-soft when the geocoder throws or returns null', async () => {
    const thrower = vi.fn(async () => {
      throw new Error('network down')
    })
    const fromThrow = await resolvePlaceNames([await walkFrom()], {
      lookup: true,
      cache: {},
      geocoder: thrower,
      sleep: NOOP_SLEEP,
    })
    expect(fromThrow.size).toBe(0)

    const nuller = vi.fn(async () => null)
    const fromNull = await resolvePlaceNames([await walkFrom()], {
      lookup: true,
      cache: {},
      geocoder: nuller,
      sleep: NOOP_SLEEP,
    })
    expect(fromNull.size).toBe(0)
  })
})
