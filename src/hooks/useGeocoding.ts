import { useEffect, useState } from 'react'
import type { LocationPoint } from '../types'

export interface GeoSuggestion extends LocationPoint {
  id: string
  detail: string
}

interface NominatimResult {
  place_id: number
  display_name: string
  lat: string
  lon: string
  type: string
}

const cacheKey = 'lounaleidja-geocode-cache-v1'

function readCache(): Record<string, GeoSuggestion[]> {
  try {
    return JSON.parse(localStorage.getItem(cacheKey) ?? '{}') as Record<string, GeoSuggestion[]>
  } catch {
    return {}
  }
}

export function useGeocoding(query: string, enabled: boolean) {
  const [state, setState] = useState<{
    key: string
    suggestions: GeoSuggestion[]
    loading: boolean
    error: string | null
  }>({ key: '', suggestions: [], loading: false, error: null })
  const normalized = query.trim().toLocaleLowerCase('et')
  const active = enabled && normalized.length >= 3

  useEffect(() => {
    if (!active) return

    const cache = readCache()
    if (cache[normalized]) {
      queueMicrotask(() => {
        setState({ key: normalized, suggestions: cache[normalized], loading: false, error: null })
      })
      return
    }

    const controller = new AbortController()
    const timeoutId = window.setTimeout(async () => {
      setState({ key: normalized, suggestions: [], loading: true, error: null })
      try {
        const params = new URLSearchParams({
          q: query.trim(),
          format: 'jsonv2',
          addressdetails: '1',
          countrycodes: 'ee',
          limit: '5',
          'accept-language': 'et',
        })
        const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        })
        if (!response.ok) throw new Error(`Geokodeerimine ebaõnnestus (${response.status})`)
        const data = (await response.json()) as NominatimResult[]
        const mapped = data.map((item) => ({
          id: String(item.place_id),
          label: item.display_name,
          detail: item.type,
          latitude: Number(item.lat),
          longitude: Number(item.lon),
        }))
        setState({ key: normalized, suggestions: mapped, loading: false, error: null })
        const nextCache = { ...cache, [normalized]: mapped }
        const trimmedCache = Object.fromEntries(Object.entries(nextCache).slice(-40))
        localStorage.setItem(cacheKey, JSON.stringify(trimmedCache))
      } catch (caught) {
        if ((caught as Error).name !== 'AbortError') {
          setState({
            key: normalized,
            suggestions: [],
            loading: false,
            error: 'Asukohasoovitusi ei saanud laadida. Proovi hetke pärast uuesti.',
          })
        }
      }
    }, 1100)

    return () => {
      window.clearTimeout(timeoutId)
      controller.abort()
    }
  }, [active, normalized, query])

  if (!active || state.key !== normalized) {
    return { suggestions: [], loading: false, error: null }
  }
  return { suggestions: state.suggestions, loading: state.loading, error: state.error }
}
