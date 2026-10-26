import { load } from 'cheerio'
import type { LunchOffer, OffersBundle, SourceStatus } from '../src/types.ts'

export type PersonalAggregator = 'paevapraad' | 'paevapakkumised'

export interface ParsedPersonalOffer {
  offerName: string
  description: string | null
  price: number
}

export interface ParsedPersonalRestaurant {
  provider: PersonalAggregator
  externalId: string
  restaurantName: string
  address: string | null
  latitude: number | null
  longitude: number | null
  lunchStartTime: string | null
  lunchEndTime: string | null
  sourceUrl: string
  offers: ParsedPersonalOffer[]
}

export interface ParsedPersonalPage {
  provider: PersonalAggregator
  dateLabel: string
  restaurantCount: number
  restaurants: ParsedPersonalRestaurant[]
  skippedOffers: number
}

export interface PersonalOffersBundle extends OffersBundle {
  schemaVersion: 1
}

interface LocationCandidate {
  restaurantName: string
  address: string
  latitude: number
  longitude: number
}

const providerDetails: Record<PersonalAggregator, { name: string; pageUrl: string }> = {
  paevapraad: {
    name: 'Päevapraad.ee · isiklik voog',
    pageUrl: 'https://www.paevapraad.ee/tallinn/',
  },
  paevapakkumised: {
    name: 'Päevapakkumised.ee · isiklik voog',
    pageUrl: 'https://www.xn--pevapakkumised-5hb.ee/tallinn',
  },
}

function compact(value: string) {
  return value.replace(/[\u200b-\u200d\ufeff]/g, '').replace(/\s+/g, ' ').trim()
}

function dateFromIso(dateIso: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) throw new Error(`Vigane kuupäev: ${dateIso}`)
  const result = new Date(`${dateIso}T12:00:00.000Z`)
  if (!Number.isFinite(result.getTime()) || result.toISOString().slice(0, 10) !== dateIso) {
    throw new Error(`Vigane kuupäev: ${dateIso}`)
  }
  return result
}

export function tallinnDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Tallinn',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

function expectedPaevapraadDate(dateIso: string) {
  return new Intl.DateTimeFormat('et-EE', {
    timeZone: 'Europe/Tallinn',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(dateFromIso(dateIso))
}

function expectedPaevapakkumisedDate(dateIso: string) {
  const date = dateFromIso(dateIso)
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Tallinn',
    weekday: 'short',
  }).format(date)
  const weekdayLocative: Record<string, string> = {
    Mon: 'esmaspäeval',
    Tue: 'teisipäeval',
    Wed: 'kolmapäeval',
    Thu: 'neljapäeval',
    Fri: 'reedel',
    Sat: 'laupäeval',
    Sun: 'pühapäeval',
  }
  const [, month, day] = dateIso.split('-')
  return `${weekdayLocative[weekday]}, ${Number(day)}.${month}`
}

function assertDateLabel(actual: string, expected: string, provider: string) {
  if (compact(actual).toLocaleLowerCase('et') !== expected.toLocaleLowerCase('et')) {
    throw new Error(`${provider} lehe kuupäev „${compact(actual) || 'puudub'}“ ei ole tänane „${expected}“`)
  }
}

function parseTimeRange(value: string) {
  const match = value.match(/(\d{1,2})[.:](\d{2})\s*[-–—]\s*(\d{1,2})[.:](\d{2})/)
  if (!match) return { start: null, end: null }
  return {
    start: `${match[1].padStart(2, '0')}:${match[2]}`,
    end: `${match[3].padStart(2, '0')}:${match[4]}`,
  }
}

function numericPrices(value: string) {
  const prices: number[] = []
  for (const match of value.matchAll(/(?:^|[^\d])(\d{1,3}(?:[.,]\d{1,2})?)(?=\s*(?:€|eur|\/|$))/gi)) {
    const price = Number(match[1].replace(',', '.'))
    if (Number.isFinite(price) && price >= 0 && price <= 1_000) prices.push(price)
  }
  return [...new Set(prices)]
}

function pricedOffer(offerName: string, rawPrice: string, fallbackText?: string): ParsedPersonalOffer | null {
  const cleanedName = compact(offerName).replace(/^[-–—:]+\s*/, '')
  if (!cleanedName) return null

  const cleanPrice = compact(rawPrice)
  let prices = numericPrices(cleanPrice)
  let displayedPrice = cleanPrice
  if (!prices.length && fallbackText && /(?:€|\beur\b)/i.test(fallbackText)) {
    displayedPrice = compact(fallbackText)
    prices = numericPrices(displayedPrice)
  }
  if (!prices.length) return null

  return {
    offerName: cleanedName,
    description: prices.length > 1 ? `Hinnad algallikas: ${displayedPrice}` : null,
    price: Math.min(...prices),
  }
}

function safeProviderUrl(rawUrl: string | undefined, baseUrl: string, provider: PersonalAggregator) {
  const fallback = providerDetails[provider].pageUrl
  if (!rawUrl) return fallback
  try {
    const url = new URL(rawUrl, baseUrl)
    const allowedHosts = provider === 'paevapraad'
      ? new Set(['paevapraad.ee', 'www.paevapraad.ee'])
      : new Set(['xn--pevapakkumised-5hb.ee', 'www.xn--pevapakkumised-5hb.ee'])
    return url.protocol === 'https:' && allowedHosts.has(url.hostname) ? url.toString() : fallback
  } catch {
    return fallback
  }
}

function parseMapCoordinates(value: string | undefined) {
  if (!value) return null
  const match = value.match(/\/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/)
  if (!match) return null
  const latitude = Number(match[1])
  const longitude = Number(match[2])
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < 57 ||
    latitude > 60 ||
    longitude < 21 ||
    longitude > 29
  ) return null
  return { latitude, longitude }
}

export function parsePaevapakkumisedHtml(
  html: string,
  expectedDate: string,
  baseUrl = providerDetails.paevapakkumised.pageUrl,
): ParsedPersonalPage {
  const $ = load(html)
  const dateLabel = compact($('.header > h1 .headerDate').first().text())
  assertDateLabel(dateLabel, expectedPaevapakkumisedDate(expectedDate), 'Päevapakkumised.ee')

  const cards = $('#offers > .meal.sortable.animated[id]').toArray()
  const restaurants: ParsedPersonalRestaurant[] = []
  let skippedOffers = 0

  for (const element of cards) {
    const card = $(element)
    const nameLink = card.find('.dinerInfo h3 > a').first()
    const restaurantName = compact(nameLink.text())
    const externalId = compact(card.attr('id') ?? '') || restaurantName
    const mapLink = card.find('.dinerButtons > a').filter((_, anchor) => (
      $(anchor).find('.icon-location').length > 0
    )).first()
    const coordinates = parseMapCoordinates(mapLink.attr('href'))
    const address = compact(mapLink.attr('title') ?? '')
    if (!restaurantName || !coordinates || !address) continue

    const clock = card.find('.dinerButtons .icon-clock').first()
    const timeText = clock.find('.buttonNote').first().text()
      || clock.siblings('.buttonNote').first().text()
      || clock.parent().find('.buttonNote').first().text()
    const time = parseTimeRange(timeText)
    const offers: ParsedPersonalOffer[] = []
    card.find('.mealInfo > .offer').each((_, offerElement) => {
      const offer = $(offerElement)
      const estonian = offer.find('.lang-et').first()
      const label = (estonian.length ? estonian : offer).clone()
      const rawPrice = compact((estonian.length ? estonian : offer).find('strong').first().text())
      label.find('strong, img, script, style').remove()
      const parsed = pricedOffer(label.text(), rawPrice, offer.text())
      if (parsed) offers.push(parsed)
      else skippedOffers += 1
    })
    if (!offers.length) continue

    restaurants.push({
      provider: 'paevapakkumised',
      externalId,
      restaurantName,
      address,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      lunchStartTime: time.start,
      lunchEndTime: time.end,
      sourceUrl: safeProviderUrl(nameLink.attr('href'), baseUrl, 'paevapakkumised'),
      offers,
    })
  }

  return {
    provider: 'paevapakkumised',
    dateLabel,
    restaurantCount: cards.length,
    restaurants,
    skippedOffers,
  }
}

export function parsePaevapraadHtml(
  html: string,
  expectedDate: string,
  baseUrl = providerDetails.paevapraad.pageUrl,
): ParsedPersonalPage {
  const $ = load(html)
  const dateLabel = compact($('span.datum > span').first().text())
  assertDateLabel(dateLabel, expectedPaevapraadDate(expectedDate), 'Päevapraad.ee')

  const cards = $('div.diner[i][data-name][href]').toArray()
  const restaurants: ParsedPersonalRestaurant[] = []
  let skippedOffers = 0

  for (const element of cards) {
    const card = $(element)
    const dinerList = card.children('.diner-list').first()
    const restaurantName = compact(card.attr('data-name') ?? '')
    const externalId = compact(card.attr('i') ?? '') || restaurantName
    if (!restaurantName || !dinerList.length) continue

    const time = parseTimeRange(dinerList.find('.he .lunchtime').first().text())
    const locationLink = dinerList.find('.socials a').filter((_, anchor) => (
      $(anchor).find('img[src*="icon_location"]').length > 0
    )).first()
    const rawAddress = compact(locationLink.text())
    const address = rawAddress && !/^asukoht kaardil$/i.test(rawAddress) ? rawAddress : null
    const offers: ParsedPersonalOffer[] = []

    dinerList.find('.menu > .row.full-view').each((_, rowElement) => {
      const row = $(rowElement)
      const name = compact(row.find('.food > span').first().text())
      const rawPrice = compact(row.find('.price').first().text())
      const parsed = pricedOffer(name, rawPrice, row.text())
      if (parsed) offers.push(parsed)
      else skippedOffers += 1
    })
    if (!offers.length) continue

    restaurants.push({
      provider: 'paevapraad',
      externalId,
      restaurantName,
      address,
      latitude: null,
      longitude: null,
      lunchStartTime: time.start,
      lunchEndTime: time.end,
      sourceUrl: safeProviderUrl(card.attr('href'), baseUrl, 'paevapraad'),
      offers,
    })
  }

  return {
    provider: 'paevapraad',
    dateLabel,
    restaurantCount: cards.length,
    restaurants,
    skippedOffers,
  }
}

export function normalizeRestaurantName(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('et')
    .replace(/&/g, ' ja ')
    .replace(/\b(?:ou|as)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function restaurantMatchKey(value: string) {
  const normalized = normalizeRestaurantName(value)
  const withoutGenericWords = normalized
    .split(' ')
    .filter((part) => !['restoran', 'resto', 'kohvik', 'bistroo', 'cafe'].includes(part))
    .join(' ')
  return withoutGenericWords || normalized
}

function normalizeAddress(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('et')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function slug(value: string) {
  return normalizeRestaurantName(value).replace(/\s+/g, '-').slice(0, 100) || 'restoran'
}

function uniqueLocations(candidates: LocationCandidate[]) {
  return [...new Map(candidates.map((candidate) => [
    `${candidate.latitude.toFixed(6)}|${candidate.longitude.toFixed(6)}`,
    candidate,
  ])).values()]
}

function addLocation(lookup: Map<string, LocationCandidate[]>, candidate: LocationCandidate) {
  const key = restaurantMatchKey(candidate.restaurantName)
  if (!key) return
  lookup.set(key, uniqueLocations([...(lookup.get(key) ?? []), candidate]))
}

function findLocation(
  restaurant: ParsedPersonalRestaurant,
  lookup: Map<string, LocationCandidate[]>,
) {
  const candidates = lookup.get(restaurantMatchKey(restaurant.restaurantName)) ?? []
  if (candidates.length === 1) return candidates[0]
  if (!restaurant.address || !candidates.length) return null
  const address = normalizeAddress(restaurant.address)
  const addressMatches = candidates.filter((candidate) => {
    const candidateAddress = normalizeAddress(candidate.address)
    return candidateAddress === address || candidateAddress.includes(address) || address.includes(candidateAddress)
  })
  return addressMatches.length === 1 ? addressMatches[0] : null
}

function offerId(provider: PersonalAggregator, externalId: string, restaurantName: string) {
  return `personal-${provider}-${slug(externalId || restaurantName)}`
}

function toLunchOffers(
  restaurant: ParsedPersonalRestaurant,
  location: LocationCandidate,
  offerDate: string,
  fetchedAt: string,
): LunchOffer[] {
  return restaurant.offers.map((offer) => ({
    restaurantId: offerId(restaurant.provider, restaurant.externalId, restaurant.restaurantName),
    restaurantName: restaurant.restaurantName,
    address: location.address,
    latitude: location.latitude,
    longitude: location.longitude,
    offerName: offer.offerName,
    description: offer.description,
    price: offer.price,
    currency: 'EUR',
    offerDate,
    lunchStartTime: restaurant.lunchStartTime,
    lunchEndTime: restaurant.lunchEndTime,
    sourceName: providerDetails[restaurant.provider].name,
    sourceUrl: restaurant.sourceUrl,
    fetchedAt,
    verificationStatus: 'verified',
  }))
}

function sourceStatus(page: ParsedPersonalPage, fetchedAt: string): SourceStatus {
  const offers = page.restaurants.reduce((sum, restaurant) => sum + restaurant.offers.length, 0)
  return {
    id: page.provider,
    name: providerDetails[page.provider].name,
    url: providerDetails[page.provider].pageUrl,
    status: 'active',
    message: `${offers} hinnaga tänast pakkumist ${page.restaurantCount} leitud söögikohast; ${page.skippedOffers} hinnata rida jäeti välja.`,
    lastSuccessAt: fetchedAt,
  }
}

export function buildPersonalOffersBundle(options: {
  paevapakkumised: ParsedPersonalPage
  paevapraad: ParsedPersonalPage
  official: OffersBundle
  offerDate: string
  fetchedAt: string
}): PersonalOffersBundle {
  const locationLookup = new Map<string, LocationCandidate[]>()
  for (const restaurant of options.paevapakkumised.restaurants) {
    if (restaurant.address && restaurant.latitude !== null && restaurant.longitude !== null) {
      addLocation(locationLookup, {
        restaurantName: restaurant.restaurantName,
        address: restaurant.address,
        latitude: restaurant.latitude,
        longitude: restaurant.longitude,
      })
    }
  }
  for (const offer of options.official.offers) {
    addLocation(locationLookup, {
      restaurantName: offer.restaurantName,
      address: offer.address,
      latitude: offer.latitude,
      longitude: offer.longitude,
    })
  }

  const offers: LunchOffer[] = []
  for (const restaurant of options.paevapakkumised.restaurants) {
    if (restaurant.address && restaurant.latitude !== null && restaurant.longitude !== null) {
      offers.push(...toLunchOffers(restaurant, {
        restaurantName: restaurant.restaurantName,
        address: restaurant.address,
        latitude: restaurant.latitude,
        longitude: restaurant.longitude,
      }, options.offerDate, options.fetchedAt))
    }
  }

  let unmatchedPaevapraadRestaurants = 0
  let unmatchedPaevapraadOffers = 0
  for (const restaurant of options.paevapraad.restaurants) {
    const location = findLocation(restaurant, locationLookup)
    if (!location) {
      unmatchedPaevapraadRestaurants += 1
      unmatchedPaevapraadOffers += restaurant.offers.length
      continue
    }
    offers.push(...toLunchOffers(restaurant, location, options.offerDate, options.fetchedAt))
  }

  const errors = unmatchedPaevapraadRestaurants
    ? [{
        sourceId: 'paevapraad',
        message: `${unmatchedPaevapraadRestaurants} Päevapraad.ee söögikoha ${unmatchedPaevapraadOffers} pakkumist jäeti välja, sest koordinaate ei saanud üheselt sobitada.`,
      }]
    : []

  return {
    schemaVersion: 1,
    generatedAt: options.fetchedAt,
    timezone: 'Europe/Tallinn',
    offers,
    sources: [
      sourceStatus(options.paevapakkumised, options.fetchedAt),
      sourceStatus(options.paevapraad, options.fetchedAt),
    ],
    errors,
  }
}
