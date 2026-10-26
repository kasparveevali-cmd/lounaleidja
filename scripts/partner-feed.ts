import type { LunchOffer } from '../src/types.ts'

type PartnerProvider = 'paevapraad' | 'paevapakkumised'

const providerNames: Record<PartnerProvider, string> = {
  paevapraad: 'Päevapraad.ee litsentsitud partnerivoog',
  paevapakkumised: 'Päevapakkumised.ee litsentsitud partnerivoog',
}

const providerHosts: Record<PartnerProvider, Set<string>> = {
  paevapraad: new Set(['paevapraad.ee', 'www.paevapraad.ee']),
  paevapakkumised: new Set([
    'xn--pevapakkumised-5hb.ee',
    'www.xn--pevapakkumised-5hb.ee',
  ]),
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} peab olema objekt`)
  }
  return value as Record<string, unknown>
}

function string(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} peab olema mittetühi tekst`)
  }
  return value.trim()
}

function optionalString(value: unknown, label: string): string | null {
  if (value === null) return null
  return string(value, label)
}

function timestamp(value: unknown, label: string): string {
  const result = string(value, label)
  if (!Number.isFinite(Date.parse(result))) throw new Error(`${label} ei ole ajatempel`)
  return result
}

function time(value: unknown, label: string): string | null {
  const result = optionalString(value, label)
  if (result !== null && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(result)) {
    throw new Error(`${label} peab olema HH:MM kujul`)
  }
  return result
}

function coordinate(value: unknown, label: string, minimum: number, maximum: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${label} on vigane`)
  }
  return value
}

function provider(value: unknown): PartnerProvider {
  if (value !== 'paevapraad' && value !== 'paevapakkumised') {
    throw new Error('Tundmatu partnerivoo pakkuja')
  }
  return value
}

function sourceUrl(value: unknown, source: PartnerProvider): string {
  const result = new URL(string(value, 'sourceUrl'))
  if (result.protocol !== 'https:' || !providerHosts[source].has(result.hostname)) {
    throw new Error(`sourceUrl ei viita ${providerNames[source]} algallikale`)
  }
  return result.toString()
}

function stableId(providerId: PartnerProvider, externalId: string) {
  const normalized = externalId
    .normalize('NFKD')
    .toLocaleLowerCase('et')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  if (!normalized) throw new Error('externalRestaurantId ei anna stabiilset tunnust')
  return `partner-${providerId}-${normalized}`
}

export function parsePartnerFeed(value: unknown, expectedDate: string): LunchOffer[] {
  const feed = object(value, 'Partnerivoog')
  if (feed.schemaVersion !== 1) throw new Error('Partnerivoo schemaVersion peab olema 1')
  if (feed.timezone !== 'Europe/Tallinn') throw new Error('Partnerivoo ajavöönd peab olema Europe/Tallinn')
  timestamp(feed.generatedAt, 'generatedAt')
  if (!Array.isArray(feed.items)) throw new Error('Partnerivoo items peab olema massiiv')

  const result: LunchOffer[] = []
  for (const [itemIndex, rawItem] of feed.items.entries()) {
    const item = object(rawItem, `items[${itemIndex}]`)
    const itemProvider = provider(item.provider)
    const offerDate = string(item.offerDate, `items[${itemIndex}].offerDate`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(offerDate)) {
      throw new Error(`items[${itemIndex}].offerDate on vigane`)
    }
    if (offerDate !== expectedDate) continue

    const externalId = string(item.externalRestaurantId, `items[${itemIndex}].externalRestaurantId`)
    const restaurantId = stableId(itemProvider, externalId)
    const restaurantName = string(item.restaurantName, `items[${itemIndex}].restaurantName`)
    const address = string(item.address, `items[${itemIndex}].address`)
    const latitude = coordinate(item.latitude, `items[${itemIndex}].latitude`, 57, 60)
    const longitude = coordinate(item.longitude, `items[${itemIndex}].longitude`, 21, 29)
    const itemSourceUrl = sourceUrl(item.sourceUrl, itemProvider)
    const lunchStartTime = time(item.lunchStartTime, `items[${itemIndex}].lunchStartTime`)
    const lunchEndTime = time(item.lunchEndTime, `items[${itemIndex}].lunchEndTime`)
    const fetchedAt = timestamp(item.fetchedAt, `items[${itemIndex}].fetchedAt`)
    if (!Array.isArray(item.offers)) throw new Error(`items[${itemIndex}].offers peab olema massiiv`)

    for (const [offerIndex, rawOffer] of item.offers.entries()) {
      const offer = object(rawOffer, `items[${itemIndex}].offers[${offerIndex}]`)
      if (offer.currency !== 'EUR') throw new Error('Partnerivoog toetab ainult EUR hindu')
      if (typeof offer.price !== 'number' || !Number.isFinite(offer.price) || offer.price <= 0) {
        throw new Error(`items[${itemIndex}].offers[${offerIndex}].price on vigane`)
      }
      result.push({
        restaurantId,
        restaurantName,
        address,
        latitude,
        longitude,
        offerName: string(offer.name, `items[${itemIndex}].offers[${offerIndex}].name`),
        description: optionalString(
          offer.description,
          `items[${itemIndex}].offers[${offerIndex}].description`,
        ),
        price: offer.price,
        currency: 'EUR',
        offerDate,
        lunchStartTime,
        lunchEndTime,
        sourceName: providerNames[itemProvider],
        sourceUrl: itemSourceUrl,
        fetchedAt,
        verificationStatus: 'verified',
      })
    }
  }
  return result
}

export function partnerSourceId(offer: LunchOffer) {
  if (offer.sourceName === providerNames.paevapraad) return 'paevapraad'
  if (offer.sourceName === providerNames.paevapakkumised) return 'paevapakkumised'
  return null
}
