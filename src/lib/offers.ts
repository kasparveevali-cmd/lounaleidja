import type { FilterOptions, LunchOffer, RestaurantResult } from '../types'

const earthRadiusKm = 6371

export function haversineKm(
  first: { latitude: number; longitude: number },
  second: { latitude: number; longitude: number },
): number {
  const toRadians = (value: number) => (value * Math.PI) / 180
  const latitudeDelta = toRadians(second.latitude - first.latitude)
  const longitudeDelta = toRadians(second.longitude - first.longitude)
  const latitudeA = toRadians(first.latitude)
  const latitudeB = toRadians(second.latitude)
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(longitudeDelta / 2) ** 2
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function formatDistance(distanceKm: number | null): string {
  if (distanceKm === null) return 'Kaugus teadmata'
  if (distanceKm < 1) return `${Math.round(distanceKm * 1000)} m`
  return `${distanceKm.toLocaleString('et-EE', { maximumFractionDigits: 1 })} km`
}

export function todayInTallinn(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Tallinn',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

export function groupFilterAndSort(
  offers: LunchOffer[],
  options: FilterOptions,
): RestaurantResult[] {
  const normalizedQuery = options.query.trim().toLocaleLowerCase('et')
  const matchingOffers = offers.filter((offer) => {
    if (offer.offerDate !== options.today) return false
    if (options.confirmedOnly && offer.verificationStatus !== 'verified') return false
    if (offer.price < options.minPrice || offer.price > options.maxPrice) return false
    if (options.favoritesOnly && !options.favoriteIds.has(offer.restaurantId)) return false
    if (
      normalizedQuery &&
      !`${offer.restaurantName} ${offer.offerName} ${offer.description ?? ''}`
        .toLocaleLowerCase('et')
        .includes(normalizedQuery)
    ) {
      return false
    }
    if (options.location) {
      const distance = haversineKm(options.location, offer)
      if (distance > options.radiusKm) return false
    }
    return true
  })

  const grouped = new Map<string, RestaurantResult>()
  for (const offer of matchingOffers) {
    const current = grouped.get(offer.restaurantId)
    if (current) {
      current.offers.push(offer)
      continue
    }
    const distanceKm = options.location ? haversineKm(options.location, offer) : null
    grouped.set(offer.restaurantId, {
      restaurantId: offer.restaurantId,
      restaurantName: offer.restaurantName,
      address: offer.address,
      latitude: offer.latitude,
      longitude: offer.longitude,
      distanceKm,
      offers: [offer],
      sourceUrl: offer.sourceUrl,
      sourceName: offer.sourceName,
      fetchedAt: offer.fetchedAt,
      verificationStatus: offer.verificationStatus,
    })
  }

  return [...grouped.values()].sort((a, b) => {
    if (options.sort === 'name') return a.restaurantName.localeCompare(b.restaurantName, 'et')
    if (options.sort === 'price') {
      return Math.min(...a.offers.map((offer) => offer.price)) - Math.min(...b.offers.map((offer) => offer.price))
    }
    return (a.distanceKm ?? Number.POSITIVE_INFINITY) - (b.distanceKm ?? Number.POSITIVE_INFINITY)
  })
}
