import type { LunchOffer, OffersBundle, SourceStatus } from '../types'

const maximumJsonLength = 5 * 1024 * 1024
const maximumOffers = 5_000

type AggregatorProvider = 'paevapraad' | 'paevapakkumised'

interface ProviderDetails {
  id: AggregatorProvider
  name: string
  url: string
}

const providersByHost: Record<string, ProviderDetails> = {
  'paevapraad.ee': {
    id: 'paevapraad',
    name: 'Päevapraad.ee',
    url: 'https://www.paevapraad.ee/',
  },
  'www.paevapraad.ee': {
    id: 'paevapraad',
    name: 'Päevapraad.ee',
    url: 'https://www.paevapraad.ee/',
  },
  'xn--pevapakkumised-5hb.ee': {
    id: 'paevapakkumised',
    name: 'Päevapakkumised.ee',
    url: 'https://www.xn--pevapakkumised-5hb.ee/',
  },
  'www.xn--pevapakkumised-5hb.ee': {
    id: 'paevapakkumised',
    name: 'Päevapakkumised.ee',
    url: 'https://www.xn--pevapakkumised-5hb.ee/',
  },
}

export interface AggregatorFeed {
  schemaVersion: 1
  generatedAt: string
  timezone: 'Europe/Tallinn'
  offers: LunchOffer[]
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} peab olema objekt`)
  }
  return value as Record<string, unknown>
}

function string(value: unknown, label: string, maximumLength = 500): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} peab olema mittetühi tekst`)
  }
  const result = value.replace(/[\u200b-\u200d\ufeff]/g, '').replace(/\s+/g, ' ').trim()
  if (result.length > maximumLength) throw new Error(`${label} on liiga pikk`)
  return result
}

function nullableString(value: unknown, label: string, maximumLength = 1_000): string | null {
  if (value === null || value === undefined) return null
  return string(value, label, maximumLength)
}

function timestamp(value: unknown, label: string): string {
  const result = string(value, label, 100)
  const parsed = new Date(result)
  if (!Number.isFinite(parsed.getTime())) throw new Error(`${label} ei ole ajatempel`)
  return parsed.toISOString()
}

function date(value: unknown, label: string): string {
  const result = string(value, label, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result)) throw new Error(`${label} peab olema YYYY-MM-DD kujul`)
  const parsed = new Date(`${result}T00:00:00.000Z`)
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== result) {
    throw new Error(`${label} ei ole kehtiv kuupäev`)
  }
  return result
}

function time(value: unknown, label: string): string | null {
  if (value === null || value === undefined) return null
  const result = string(value, label, 5)
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(result)) {
    throw new Error(`${label} peab olema HH:MM kujul`)
  }
  return result
}

function coordinate(value: unknown, label: string, minimum: number, maximum: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${label} ei ole Eesti piires`)
  }
  return value
}

function source(value: unknown, label: string): { url: string; provider: ProviderDetails } {
  let url: URL
  try {
    url = new URL(string(value, label, 2_000))
  } catch {
    throw new Error(`${label} ei ole korrektne URL`)
  }
  const provider = providersByHost[url.hostname]
  if (url.protocol !== 'https:' || !provider) {
    throw new Error(`${label} peab viitama Päevapraad.ee või Päevapakkumised.ee HTTPS-lehele`)
  }
  return { url: url.toString(), provider }
}

function slug(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('et')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120)
}

function restaurantMatchKey(value: string): string {
  const normalized = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('et')
    .replace(/&/g, ' ja ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
  const withoutGenericWords = normalized
    .split(' ')
    .filter((part) => !['restoran', 'resto', 'kohvik', 'bistroo', 'bistro', 'cafe'].includes(part))
    .join(' ')
  return withoutGenericWords || normalized
}

function restaurantId(restaurantName: string, address: string): string {
  const name = slug(restaurantMatchKey(restaurantName))
  const location = slug(address)
  if (!name || !location) throw new Error('Restorani nimi ja aadress ei anna stabiilset tunnust')
  return `personal-${name}-${location}`.slice(0, 240)
}

function parseOffer(value: unknown, index: number, expectedDate: string): LunchOffer | null {
  const label = `offers[${index}]`
  const offer = object(value, label)
  const offerDate = date(offer.offerDate, `${label}.offerDate`)
  if (offerDate !== expectedDate) return null
  const { url: sourceUrl, provider } = source(offer.sourceUrl, `${label}.sourceUrl`)

  if (offer.currency !== 'EUR') throw new Error(`${label}.currency peab olema EUR`)
  if (typeof offer.price !== 'number' || !Number.isFinite(offer.price) || offer.price < 0 || offer.price > 1_000) {
    throw new Error(`${label}.price peab olema mittenegatiivne EUR hind`)
  }
  if (offer.verificationStatus !== 'verified' && offer.verificationStatus !== 'unverified') {
    throw new Error(`${label}.verificationStatus on vigane`)
  }

  string(offer.restaurantId, `${label}.restaurantId`, 200)
  const restaurantName = string(offer.restaurantName, `${label}.restaurantName`, 200)
  const address = string(offer.address, `${label}.address`, 300)

  return {
    restaurantId: restaurantId(restaurantName, address),
    restaurantName,
    address,
    latitude: coordinate(offer.latitude, `${label}.latitude`, 57, 60),
    longitude: coordinate(offer.longitude, `${label}.longitude`, 21, 29),
    offerName: string(offer.offerName, `${label}.offerName`, 500),
    description: nullableString(offer.description, `${label}.description`),
    price: offer.price,
    currency: 'EUR',
    offerDate,
    lunchStartTime: time(offer.lunchStartTime, `${label}.lunchStartTime`),
    lunchEndTime: time(offer.lunchEndTime, `${label}.lunchEndTime`),
    sourceName: provider.name,
    sourceUrl,
    fetchedAt: timestamp(offer.fetchedAt, `${label}.fetchedAt`),
    verificationStatus: offer.verificationStatus,
  }
}

function normalizeForKey(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('et')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function duplicateKey(offer: LunchOffer): string {
  return [
    restaurantMatchKey(offer.restaurantName),
    normalizeForKey(offer.address),
    normalizeForKey(offer.offerName),
    offer.price.toFixed(2),
  ].join('|')
}

function restaurantLocationKey(offer: LunchOffer): string {
  return [restaurantMatchKey(offer.restaurantName), normalizeForKey(offer.address)].join('|')
}

export function parseAggregatorFeed(value: unknown, expectedDate: string): AggregatorFeed {
  const feed = object(value, 'Koondvoog')
  if (feed.schemaVersion !== 1) throw new Error('Koondvoo schemaVersion peab olema 1')
  if (feed.timezone !== 'Europe/Tallinn') throw new Error('Koondvoo ajavöönd peab olema Europe/Tallinn')
  const generatedAt = timestamp(feed.generatedAt, 'generatedAt')
  if (!Array.isArray(feed.offers)) throw new Error('Koondvoo offers peab olema massiiv')
  if (feed.offers.length > maximumOffers) throw new Error(`Koondvoos võib olla kuni ${maximumOffers} pakkumist`)

  const offersByKey = new Map<string, LunchOffer>()
  for (const [index, value] of feed.offers.entries()) {
    const offer = parseOffer(value, index, expectedDate)
    if (offer && !offersByKey.has(duplicateKey(offer))) offersByKey.set(duplicateKey(offer), offer)
  }

  return {
    schemaVersion: 1,
    generatedAt,
    timezone: 'Europe/Tallinn',
    offers: [...offersByKey.values()],
  }
}

export function parseAggregatorFeedJson(raw: string, expectedDate: string): AggregatorFeed {
  if (raw.length > maximumJsonLength) throw new Error('Koondvoo JSON võib olla kuni 5 MB')
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    throw new Error('Fail ei sisalda korrektset JSON-i')
  }
  return parseAggregatorFeed(value, expectedDate)
}

function aggregatorSourceStatuses(feed: AggregatorFeed): SourceStatus[] {
  const counts = new Map<AggregatorProvider, number>()
  for (const offer of feed.offers) {
    const provider = providersByHost[new URL(offer.sourceUrl).hostname]
    counts.set(provider.id, (counts.get(provider.id) ?? 0) + 1)
  }
  return [...counts].map(([providerId, count]) => {
    const provider = Object.values(providersByHost).find((item) => item.id === providerId)!
    return {
      id: provider.id,
      name: provider.name,
      url: provider.url,
      status: 'active',
      message: `${count} tänast pakkumist keskse andmevoo kaudu.`,
      lastSuccessAt: feed.generatedAt,
    }
  })
}

export function mergeAggregatorFeed(official: OffersBundle, aggregator: AggregatorFeed | null): OffersBundle {
  if (!aggregator) return official

  const offersByKey = new Map<string, LunchOffer>()
  const officialRestaurantIds = new Map<string, string>()
  for (const offer of official.offers) {
    offersByKey.set(duplicateKey(offer), offer)
    if (!officialRestaurantIds.has(restaurantLocationKey(offer))) {
      officialRestaurantIds.set(restaurantLocationKey(offer), offer.restaurantId)
    }
  }
  for (const offer of aggregator.offers) {
    const key = duplicateKey(offer)
    if (!offersByKey.has(key)) {
      const officialRestaurantId = officialRestaurantIds.get(restaurantLocationKey(offer))
      offersByKey.set(key, officialRestaurantId ? { ...offer, restaurantId: officialRestaurantId } : offer)
    }
  }

  const sourcesById = new Map(official.sources.map((source) => [source.id, source]))
  for (const source of aggregatorSourceStatuses(aggregator)) sourcesById.set(source.id, source)

  return {
    ...official,
    offers: [...offersByKey.values()],
    sources: [...sourcesById.values()],
  }
}
