export type VerificationStatus = 'verified' | 'unverified'

export interface LunchOffer {
  restaurantId: string
  restaurantName: string
  address: string
  latitude: number
  longitude: number
  offerName: string
  description: string | null
  price: number
  currency: 'EUR'
  offerDate: string
  lunchStartTime: string | null
  lunchEndTime: string | null
  sourceName: string
  sourceUrl: string
  fetchedAt: string
  verificationStatus: VerificationStatus
}

export interface SourceStatus {
  id: string
  name: string
  url: string
  status: 'active' | 'permission-required' | 'unavailable'
  message: string
  lastSuccessAt: string | null
}

export interface OffersBundle {
  generatedAt: string
  timezone: 'Europe/Tallinn'
  offers: LunchOffer[]
  sources: SourceStatus[]
  errors: Array<{ sourceId: string; message: string }>
}

export interface LocationPoint {
  label: string
  latitude: number
  longitude: number
}

export type SortMode = 'distance' | 'price' | 'name'

export interface FilterOptions {
  query: string
  minPrice: number
  maxPrice: number
  confirmedOnly: boolean
  favoriteIds: Set<string>
  favoritesOnly: boolean
  location: LocationPoint | null
  radiusKm: number
  sort: SortMode
  today: string
}

export interface RestaurantResult {
  restaurantId: string
  restaurantName: string
  address: string
  latitude: number
  longitude: number
  distanceKm: number | null
  offers: LunchOffer[]
  sourceUrl: string
  sourceName: string
  fetchedAt: string
  verificationStatus: VerificationStatus
}
