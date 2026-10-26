import { describe, expect, it } from 'vitest'
import type { FilterOptions, LunchOffer } from '../types'
import { formatDistance, groupFilterAndSort, haversineKm } from './offers'

const baseOffer: LunchOffer = {
  restaurantId: 'one',
  restaurantName: 'Üks Resto',
  address: 'Pärnu mnt 1, Tallinn',
  latitude: 59.437,
  longitude: 24.7536,
  offerName: 'Päevaroog',
  description: null,
  price: 7.5,
  currency: 'EUR',
  offerDate: '2026-10-26',
  lunchStartTime: '11:00',
  lunchEndTime: '15:00',
  sourceName: 'Ametlik leht',
  sourceUrl: 'https://example.com',
  fetchedAt: '2026-10-26T07:00:00.000Z',
  verificationStatus: 'verified',
}

const filters: FilterOptions = {
  query: '',
  minPrice: 0,
  maxPrice: 20,
  confirmedOnly: true,
  favoriteIds: new Set(),
  favoritesOnly: false,
  location: null,
  radiusKm: 3,
  sort: 'distance',
  today: '2026-10-26',
}

describe('haversineKm', () => {
  it('arvutab Tallinna ja Tartu vahemaa realistlikult', () => {
    const distance = haversineKm(
      { latitude: 59.437, longitude: 24.7536 },
      { latitude: 58.3776, longitude: 26.729 },
    )
    expect(distance).toBeGreaterThan(160)
    expect(distance).toBeLessThan(170)
  })
})

describe('groupFilterAndSort', () => {
  it('eemaldab eilsed pakkumised', () => {
    const yesterday = { ...baseOffer, offerDate: '2026-10-25' }
    expect(groupFilterAndSort([baseOffer, yesterday], filters)[0].offers).toHaveLength(1)
  })

  it('rakendab raadiust ja hinnavahemikku', () => {
    const nearbyFilters = {
      ...filters,
      location: { label: 'Tallinn', latitude: 59.437, longitude: 24.7536 },
      radiusKm: 1,
      minPrice: 7,
      maxPrice: 8,
    }
    expect(groupFilterAndSort([baseOffer], nearbyFilters)).toHaveLength(1)
    expect(groupFilterAndSort([{ ...baseOffer, price: 9 }], nearbyFilters)).toHaveLength(0)
  })
})

describe('formatDistance', () => {
  it('kuvab lühikese vahemaa meetrites', () => {
    expect(formatDistance(0.75)).toBe('750 m')
  })
})
