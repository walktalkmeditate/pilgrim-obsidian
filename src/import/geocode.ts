import type { Walk } from '../parse/types'

export interface Geocoder {
  (lat: number, lng: number): Promise<string | null>
}

export interface ResolveOptions {
  lookup: boolean
  cache: Record<string, string>
  geocoder: Geocoder
  throttleMs?: number
  sleep?: (ms: number) => Promise<void>
}

// ~100 m precision: enough to name a neighborhood, coarse enough that the cache
// key — and what leaves the machine on a miss — is never a precise home coordinate.
export function roundCoord(n: number): number {
  return Math.round(n * 1000) / 1000
}

export function cacheKey(lat: number, lng: number): string {
  return `${roundCoord(lat)},${roundCoord(lng)}`
}

// Geocode the START of the walk only, never the full route. GeoJSON coordinates
// are [lng, lat].
export function startCoordinate(walk: Walk): { lat: number; lng: number } | null {
  const line = walk.route.features.find((f) => f.geometry.type === 'LineString')
  const first = (line?.geometry.coordinates as number[][] | undefined)?.[0]
  if (first && typeof first[0] === 'number' && typeof first[1] === 'number') {
    return { lat: first[1], lng: first[0] }
  }
  const point = walk.route.features.find((f) => f.geometry.type === 'Point')
  const pc = point?.geometry.coordinates as number[] | undefined
  if (pc && typeof pc[0] === 'number' && typeof pc[1] === 'number') {
    return { lat: pc[1], lng: pc[0] }
  }
  return null
}

export function nominatimUrl(lat: number, lng: number): string {
  const params = new URLSearchParams({
    format: 'jsonv2',
    lat: String(lat),
    lon: String(lng),
    zoom: '14',
    addressdetails: '0',
  })
  return `https://nominatim.openstreetmap.org/reverse?${params.toString()}`
}

// Prefer the specific `name`, fall back to the leading segment of display_name.
// Returns null when the response carries nothing usable.
export function parseNominatim(json: unknown): string | null {
  if (!json || typeof json !== 'object') return null
  const obj = json as Record<string, unknown>
  if (typeof obj.name === 'string' && obj.name.trim().length > 0) return obj.name.trim()
  if (typeof obj.display_name === 'string' && obj.display_name.trim().length > 0) {
    return obj.display_name.split(',')[0]!.trim()
  }
  return null
}

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

// Resolve one place name per walk from its start coordinate. Cache hits are free;
// misses are throttled to respect Nominatim's ≤1 req/sec policy and are coarsened
// to ~100 m before they leave the machine. Fail-soft: any error or empty result
// yields no name for that walk and never aborts the import.
export async function resolvePlaceNames(
  walks: Walk[],
  opts: ResolveOptions,
): Promise<Map<string, string>> {
  const names = new Map<string, string>()
  if (!opts.lookup) return names

  const sleep = opts.sleep ?? defaultSleep
  const throttleMs = opts.throttleMs ?? 1100
  let networkCalls = 0

  for (const walk of walks) {
    const coord = startCoordinate(walk)
    if (!coord) continue

    const key = cacheKey(coord.lat, coord.lng)
    const cached = opts.cache[key]
    if (typeof cached === 'string') {
      if (cached.length > 0) names.set(walk.id, cached)
      continue
    }

    if (networkCalls > 0) await sleep(throttleMs)
    networkCalls++
    try {
      const name = await opts.geocoder(roundCoord(coord.lat), roundCoord(coord.lng))
      if (name) {
        opts.cache[key] = name
        names.set(walk.id, name)
      }
    } catch {
      // fail-soft: leave this walk without a place name
    }
  }
  return names
}
