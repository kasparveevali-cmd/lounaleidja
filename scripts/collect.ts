import { readFile, writeFile } from 'node:fs/promises'
import { load } from 'cheerio'
import robotsParser from 'robots-parser'
import type { LunchOffer, OffersBundle, SourceStatus } from '../src/types.ts'
import {
  compact,
  parseAmpsHtml,
  parseArterHtml,
  parseKristiineMarkdown,
  parsePrice,
  parseProtoHtml,
  parseRevalHtml,
  parseUlemisteCityJson,
  parseVapianoHtml,
  type ParsedOffer,
} from './parsers.ts'
import { parsePartnerFeed, partnerSourceId } from './partner-feed.ts'

const outputPath = new URL('../public/data/offers.json', import.meta.url)
const manualPath = new URL('../data/manual-offers.json', import.meta.url)
const userAgent = 'Lounaleidja/0.2 (public-interest lunch index; contact via GitHub repository)'
const robotsTextCache = new Map<string, Promise<string | null>>()

const sourceStatuses: SourceStatus[] = [
  {
    id: 'hiiu-resto',
    name: 'Hiiu Resto ametlik menüü',
    url: 'https://hiiuresto.eu/menuu/',
    status: 'active',
    message: 'Kuupäevaga nädalamenüü ametlikult restoranilehelt.',
    lastSuccessAt: null,
  },
  {
    id: 'kristiine-lunch',
    name: 'Kristiine Keskuse ametlik lõunavoog',
    url: 'https://www.kristiinekeskus.ee/lounapakkumised',
    status: 'active',
    message: 'Ametlik masinloetav voog viie söögikoha menüüdega; LIDO menüü kehtib neljas Tallinna LIDO-s.',
    lastSuccessAt: null,
  },
  {
    id: 'reval-cafe',
    name: 'Reval Café ametlik menüü',
    url: 'https://revalcafe.ee/paevapakkumised/',
    status: 'active',
    message: 'Kuupäevaga nädalamenüü Tallinna Reval Café asukohtadele.',
    lastSuccessAt: null,
  },
  {
    id: 'vapiano',
    name: 'Vapiano ametlik lõunamenüü',
    url: 'https://vapiano.ee/louna/',
    status: 'active',
    message: 'Nädalapakkumised neljale Tallinna Vapiano restoranile.',
    lastSuccessAt: null,
  },
  {
    id: 'amps',
    name: 'AMPSi ametlik päevamenüü',
    url: 'https://amps.ee/lounapakkumised/',
    status: 'active',
    message: 'Kuupäevaga pakkumised Järve ja Arena AMPSi asukohtadele.',
    lastSuccessAt: null,
  },
  {
    id: 'proto',
    name: 'PROTO ametlik lõunamenüü',
    url: 'https://www.prototehas.ee/menuu/',
    status: 'active',
    message: 'Kuupäevaga supi- ja lõunabufee pakkumised.',
    lastSuccessAt: null,
  },
  {
    id: 'arter-quarter',
    name: 'Arteri kvartali ametlik päevamenüü',
    url: 'https://arter.ee/restoranid/paevapakkumised/',
    status: 'active',
    message: 'Ametlik kuupäevaga nädalamenüü Bistroo Arteri ja VÕIVÕI Tuli Resto Baari pakkumistega.',
    lastSuccessAt: null,
  },
  {
    id: 'ulemiste-city',
    name: 'Ülemiste City ametlik päevamenüü',
    url: 'https://www.ulemistecity.ee/paevapakkumised/',
    status: 'active',
    message: 'Ametlik kuupäevapõhine JSON-voog 11 Ülemiste City söögikoha menüüde ja asukohtadega.',
    lastSuccessAt: null,
  },
  {
    id: 'paevapakkumised',
    name: 'Päevapakkumised.ee',
    url: 'https://www.xn--pevapakkumised-5hb.ee/iseteenindus/liitumine',
    status: 'permission-required',
    message: 'Partneri andmevoog on võimalik, kuid kopeerimiseks on vaja kirjalikku litsentsi.',
    lastSuccessAt: null,
  },
  {
    id: 'paevapraad',
    name: 'Päevapraad.ee',
    url: 'https://www.paevapraad.ee/lahendused/',
    status: 'permission-required',
    message: 'Integratsioonid on olemas, kuid sisu edasi kuvamiseks on vaja kirjalikku luba.',
    lastSuccessAt: null,
  },
]

interface RestaurantLocation {
  id: string
  name: string
  address: string
  latitude: number
  longitude: number
}

const kristiineLocation = {
  address: 'Endla 45, Tallinn',
  latitude: 59.425851,
  longitude: 24.7251099,
}

const lidoLocations: RestaurantLocation[] = [
  { id: 'lido-kristiine', name: 'LIDO Kristiine', ...kristiineLocation },
  { id: 'lido-solaris', name: 'LIDO Solaris', address: 'Estonia pst 9, Tallinn', latitude: 59.433466, longitude: 24.7509949 },
  { id: 'lido-ulemiste', name: 'LIDO Ülemiste', address: 'Suur-Sõjamäe 4, Tallinn', latitude: 59.4208063, longitude: 24.7935623 },
  { id: 'lido-mustamae', name: 'LIDO Mustamäe', address: 'A. H. Tammsaare tee 104A, Tallinn', latitude: 59.4085035, longitude: 24.6887486 },
]

const kristiineRestaurants: Record<string, RestaurantLocation> = {
  KFC: { id: 'kfc-kristiine', name: 'KFC Kristiine', ...kristiineLocation },
  'Sunny Pocket': { id: 'sunny-pocket-kristiine', name: 'Sunny Pocket Kristiine', ...kristiineLocation },
  'Poke Bowl & MEZE': { id: 'poke-bowl-meze-kristiine', name: 'Poke Bowl & MEZE Kristiine', ...kristiineLocation },
  MySushi: { id: 'mysushi-kristiine', name: 'MySushi Kristiine', ...kristiineLocation },
}

const revalLocations: Array<RestaurantLocation & { meremuuseum?: true }> = [
  { id: 'reval-ravala', name: 'Reval Café Rävala', address: 'Rävala pst 3, Tallinn', latitude: 59.4334569, longitude: 24.758105 },
  { id: 'reval-parnu-mnt', name: 'Reval Café Pärnu mnt', address: 'Pärnu mnt 27, Tallinn', latitude: 59.4307849, longitude: 24.7456665 },
  { id: 'reval-muurivahe', name: 'Reval Café Müürivahe', address: 'Müürivahe 14, Tallinn', latitude: 59.4348853, longitude: 24.7455885 },
  { id: 'reval-rocca', name: 'Reval Café Rocca al Mare', address: 'Paldiski mnt 102, Tallinn', latitude: 59.4259014, longitude: 24.649245 },
  { id: 'reval-kumu', name: 'Reval Café Kumu', address: 'A. Weizenbergi 34 / Valge 1, Tallinn', latitude: 59.4363374, longitude: 24.7958299 },
  { id: 'reval-tondi', name: 'Reval Café Forus (Tondi)', address: 'Sõjakooli 10, Tallinn', latitude: 59.4038676, longitude: 24.7205392 },
  { id: 'reval-laki', name: 'Reval Café Laki', address: 'Laki 11a, Tallinn', latitude: 59.4148195, longitude: 24.6800138 },
  { id: 'reval-postimaja', name: 'Reval Café Postimaja', address: 'Narva mnt 1, Tallinn', latitude: 59.4376931, longitude: 24.7562767 },
  { id: 'reval-perh', name: 'Reval Café PERH Aatrium', address: 'J. Sütiste tee 19, Tallinn', latitude: 59.39849, longitude: 24.7015107 },
  { id: 'reval-telliskivi', name: 'Reval Café Telliskivi', address: 'Telliskivi 51a, Tallinn', latitude: 59.4391382, longitude: 24.7264058 },
  { id: 'reval-meremuuseum', name: 'Reval Café Meremuuseum', address: 'Vesilennuki 6, Tallinn', latitude: 59.4517197, longitude: 24.7384401, meremuuseum: true },
]

const vapianoLocations: RestaurantLocation[] = [
  { id: 'vapiano-foorum', name: 'Vapiano Foorum', address: 'Hobujaama 10, Tallinn', latitude: 59.4387586, longitude: 24.7589174 },
  { id: 'vapiano-solaris', name: 'Vapiano Solaris', address: 'Estonia pst 9, Tallinn', latitude: 59.4332203, longitude: 24.7518993 },
  { id: 'vapiano-ulemiste', name: 'Vapiano Ülemiste', address: 'Suur-Sõjamäe 4, Tallinn', latitude: 59.4215906, longitude: 24.7941522 },
  { id: 'vapiano-rocca', name: 'Vapiano Rocca al Mare', address: 'Paldiski mnt 102, Tallinn', latitude: 59.4259014, longitude: 24.649245 },
]

const ampsLocations: Record<string, RestaurantLocation> = {
  'Järve AMPS': { id: 'amps-jarve', name: 'AMPS Järve', address: 'Pärnu mnt 238, Tallinn', latitude: 59.393409, longitude: 24.7192687 },
  'Arena AMPS': { id: 'amps-arena', name: 'AMPS Arena', address: 'Jalgpalli 21, Tallinn', latitude: 59.4207948, longitude: 24.7322602 },
}

const arterLocations: Record<string, RestaurantLocation> = {
  'Bistroo Arter': {
    id: 'bistroo-arter',
    name: 'Bistroo Arter',
    address: 'Liivalaia 36, Tallinn',
    latitude: 59.4296,
    longitude: 24.758909,
  },
  'VÕIVÕI Tuli Resto Baar': {
    id: 'voivoi-arter',
    name: 'VõiVõi',
    address: 'Liivalaia tn 36, 10132 Tallinn',
    latitude: 59.42976,
    longitude: 24.75934,
  },
}

function tallinnDateParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Tallinn',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(now)
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? ''
  return {
    iso: `${get('year')}-${get('month')}-${get('day')}`,
    short: `${get('day')}.${get('month')}`,
    isWeekday: !['Sat', 'Sun'].includes(get('weekday')),
  }
}

async function request(url: string, accept = 'text/html,application/xhtml+xml') {
  const response = await fetch(url, {
    headers: {
      'User-Agent': userAgent,
      Accept: accept,
      'Accept-Language': 'et,en;q=0.8',
    },
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) throw new Error(`${url} vastas HTTP ${response.status}`)
  return response
}

async function assertRobotsAllowed(url: string) {
  const target = new URL(url)
  const robotsUrl = new URL('/robots.txt', target).toString()
  let rules = robotsTextCache.get(robotsUrl)
  if (!rules) {
    rules = fetch(robotsUrl, {
      headers: { 'User-Agent': userAgent },
      signal: AbortSignal.timeout(10_000),
    }).then(async (response) => {
      if (response.status >= 400 && response.status < 500 && response.status !== 429) return null
      if (!response.ok) throw new Error(`robots.txt kontroll ebaõnnestus: HTTP ${response.status}`)
      return response.text()
    })
    robotsTextCache.set(robotsUrl, rules)
  }
  const text = await rules
  if (text === null) return
  const parser = robotsParser(robotsUrl, text)
  if (parser.isAllowed(url, userAgent) === false) {
    throw new Error('robots.txt ei luba selle lehe automatiseeritud lugemist')
  }
}

async function fetchSource(url: string, accept?: string) {
  await assertRobotsAllowed(url)
  await new Promise((resolve) => setTimeout(resolve, 1100))
  return (await request(url, accept)).text()
}

async function postFormJsonSource(url: string, body: URLSearchParams) {
  await assertRobotsAllowed(url)
  await new Promise((resolve) => setTimeout(resolve, 1100))
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'User-Agent': userAgent,
      Accept: 'application/json',
      'Accept-Language': 'et,en;q=0.8',
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
    },
    body,
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) throw new Error(`${url} vastas HTTP ${response.status}`)
  if (!response.headers.get('content-type')?.toLocaleLowerCase('en').includes('json')) {
    throw new Error(`${url} ei tagastanud JSON-i`)
  }
  return response.json() as Promise<unknown>
}

async function collectLicensedPartnerFeed(now = new Date()) {
  const feedUrl = process.env.LOUNALEIDJA_PARTNER_FEED_URL?.trim()
  if (!feedUrl) return []

  const target = new URL(feedUrl)
  if (target.protocol !== 'https:') throw new Error('Partnerivoo URL peab kasutama HTTPS-i')
  const token = process.env.LOUNALEIDJA_PARTNER_FEED_TOKEN?.trim()
  const response = await fetch(target, {
    headers: {
      'User-Agent': userAgent,
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) throw new Error(`Partnerivoog vastas HTTP ${response.status}`)
  if (!response.headers.get('content-type')?.toLocaleLowerCase('en').includes('json')) {
    throw new Error('Partnerivoog ei tagastanud JSON-i')
  }
  const text = await response.text()
  if (text.length > 10 * 1024 * 1024) throw new Error('Partnerivoog ületab suuruse piiri')
  return parsePartnerFeed(JSON.parse(text) as unknown, tallinnDateParts(now).iso)
}

function offersForLocation(
  parsedOffers: ParsedOffer[],
  location: RestaurantLocation,
  options: {
    offerDate: string
    fetchedAt: string
    sourceName: string
    sourceUrl: string
    lunchStartTime: string | null
    lunchEndTime: string | null
  },
): LunchOffer[] {
  return parsedOffers.map((offer) => ({
    restaurantId: location.id,
    restaurantName: location.name,
    address: location.address,
    latitude: location.latitude,
    longitude: location.longitude,
    offerName: offer.offerName,
    description: offer.description,
    price: offer.price,
    currency: 'EUR',
    offerDate: options.offerDate,
    lunchStartTime: options.lunchStartTime,
    lunchEndTime: options.lunchEndTime,
    sourceName: options.sourceName,
    sourceUrl: options.sourceUrl,
    fetchedAt: options.fetchedAt,
    verificationStatus: 'verified',
  }))
}

async function collectHiiuResto(now = new Date()): Promise<LunchOffer[]> {
  const sourceUrl = 'https://hiiuresto.eu/menuu/'
  const html = await fetchSource(sourceUrl)
  const $ = load(html)
  const date = tallinnDateParts(now)
  const fetchedAt = now.toISOString()

  const restaurantSchema = $('script[type="application/ld+json"]')
    .toArray()
    .map((element) => {
      try {
        return JSON.parse($(element).text()) as Record<string, unknown>
      } catch {
        return null
      }
    })
    .find((schema) => schema?.['@type'] === 'Restaurant')

  const addressSchema = restaurantSchema?.address as Record<string, string> | undefined
  const geoSchema = restaurantSchema?.geo as Record<string, number> | undefined
  const restaurantName = String(restaurantSchema?.name ?? 'Hiiu Resto')
  const address = [addressSchema?.streetAddress, addressSchema?.postalCode, addressSchema?.addressLocality]
    .filter(Boolean)
    .join(', ')
  const latitude = Number(geoSchema?.latitude)
  const longitude = Number(geoSchema?.longitude)
  if (!address || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error('Restorani aadress või koordinaadid puuduvad ametlikust JSON-LD andmest')
  }

  const headings = $('#paevapakkumised').nextAll('h3').toArray()
  const selectedHeadings = headings.filter((heading) => {
    const label = compact($(heading).text())
    return label.includes(date.short) || (date.isWeekday && /Iga argipäev/i.test(label))
  })

  const offers: LunchOffer[] = []
  for (const heading of selectedHeadings) {
    const table = $(heading).next('table')
    table.find('tr').each((_, row) => {
      const cells = $(row).find('td')
      const offerName = compact(cells.eq(0).clone().find('.alt').remove().end().text())
      const price = parsePrice(cells.eq(1).text())
      if (!offerName || price === null) return
      offers.push({
        restaurantId: 'hiiu-resto-tallinn',
        restaurantName,
        address,
        latitude,
        longitude,
        offerName,
        description: null,
        price,
        currency: 'EUR',
        offerDate: date.iso,
        lunchStartTime: '11:00',
        lunchEndTime: '15:00',
        sourceName: 'Hiiu Resto ametlik menüü',
        sourceUrl,
        fetchedAt,
        verificationStatus: 'verified',
      })
    })
  }

  if (date.isWeekday) {
    const comboText = $('#paevapakkumised').nextAll('p').filter((_, element) => /Päeva komplekt/i.test($(element).text())).first().text()
    const comboPrice = parsePrice(comboText)
    if (comboPrice !== null) {
      offers.push({
        restaurantId: 'hiiu-resto-tallinn',
        restaurantName,
        address,
        latitude,
        longitude,
        offerName: 'Päeva komplekt',
        description: null,
        price: comboPrice,
        currency: 'EUR',
        offerDate: date.iso,
        lunchStartTime: '11:00',
        lunchEndTime: '15:00',
        sourceName: 'Hiiu Resto ametlik menüü',
        sourceUrl,
        fetchedAt,
        verificationStatus: 'verified',
      })
    }
  }

  if (date.isWeekday && !offers.length) throw new Error('Tänase kuupäevaga menüüd ei leitud')
  return offers
}

async function collectKristiine(now = new Date()) {
  const feedUrl = 'https://www.kristiinekeskus.ee/lounapakkumised.md'
  const sourceUrl = 'https://www.kristiinekeskus.ee/lounapakkumised'
  const date = tallinnDateParts(now)
  const menus = parseKristiineMarkdown(await fetchSource(feedUrl, 'text/markdown,text/plain;q=0.9'), date.iso)
  const fetchedAt = now.toISOString()
  const offers: LunchOffer[] = []

  for (const menu of menus) {
    const locations = menu.restaurantName.toLocaleLowerCase('et') === 'lido'
      ? lidoLocations
      : kristiineRestaurants[menu.restaurantName]
        ? [kristiineRestaurants[menu.restaurantName]]
        : []
    for (const location of locations) {
      offers.push(...offersForLocation(menu.offers, location, {
        offerDate: date.iso,
        fetchedAt,
        sourceName: 'Kristiine Keskuse ametlik lõunavoog',
        sourceUrl,
        lunchStartTime: menu.lunchStartTime,
        lunchEndTime: menu.lunchEndTime,
      }))
    }
  }

  if (date.isWeekday && !offers.length) throw new Error('Tänase kuupäevaga menüüd ei leitud')
  return offers
}

async function collectReval(now = new Date()) {
  const sourceUrl = 'https://revalcafe.ee/paevapakkumised/'
  const date = tallinnDateParts(now)
  const parsed = parseRevalHtml(await fetchSource(sourceUrl), date.short)
  const locations = parsed.excludesMeremuuseum
    ? revalLocations.filter((location) => !location.meremuuseum)
    : revalLocations
  const fetchedAt = now.toISOString()
  const offers = locations.flatMap((location) => offersForLocation(parsed.offers, location, {
    offerDate: date.iso,
    fetchedAt,
    sourceName: 'Reval Café ametlik menüü',
    sourceUrl,
    lunchStartTime: null,
    lunchEndTime: null,
  }))
  if (date.isWeekday && !offers.length) throw new Error('Tänase kuupäevaga menüüd ei leitud')
  return offers
}

async function collectVapiano(now = new Date()) {
  const sourceUrl = 'https://vapiano.ee/louna/'
  const date = tallinnDateParts(now)
  const parsed = parseVapianoHtml(await fetchSource(sourceUrl), date.iso)
  const fetchedAt = now.toISOString()
  const offers = vapianoLocations.flatMap((location) => offersForLocation(parsed, location, {
    offerDate: date.iso,
    fetchedAt,
    sourceName: 'Vapiano ametlik lõunamenüü',
    sourceUrl,
    lunchStartTime: '11:00',
    lunchEndTime: '14:00',
  }))
  if (date.isWeekday && !offers.length) throw new Error('Tänase kuupäevaga menüüd ei leitud')
  return offers
}

async function collectAmps(now = new Date()) {
  const sourceUrl = 'https://amps.ee/lounapakkumised/'
  const date = tallinnDateParts(now)
  const parsedMenus = parseAmpsHtml(await fetchSource(sourceUrl), date.iso)
  const fetchedAt = now.toISOString()
  const offers: LunchOffer[] = []
  for (const [name, parsedOffers] of parsedMenus) {
    const location = ampsLocations[name]
    if (!location) continue
    offers.push(...offersForLocation(parsedOffers, location, {
      offerDate: date.iso,
      fetchedAt,
      sourceName: 'AMPSi ametlik päevamenüü',
      sourceUrl,
      lunchStartTime: null,
      lunchEndTime: null,
    }))
  }
  if (date.isWeekday && !offers.length) throw new Error('Tänase kuupäevaga menüüd ei leitud')
  return offers
}

async function collectProto(now = new Date()) {
  const sourceUrl = 'https://www.prototehas.ee/menuu/'
  const date = tallinnDateParts(now)
  const parsed = parseProtoHtml(await fetchSource(sourceUrl), date.short)
  const fetchedAt = now.toISOString()
  const location: RestaurantLocation = {
    id: 'proto-bistroo',
    name: 'PROTO Bistroo',
    address: 'Peetri 10, Tallinn',
    latitude: 59.4514557,
    longitude: 24.7305487,
  }
  const offers = offersForLocation(parsed, location, {
    offerDate: date.iso,
    fetchedAt,
    sourceName: 'PROTO ametlik lõunamenüü',
    sourceUrl,
    lunchStartTime: '11:30',
    lunchEndTime: '15:00',
  })
  if (date.isWeekday && !offers.length) throw new Error('Tänase kuupäevaga menüüd ei leitud')
  return offers
}

async function collectArter(now = new Date()) {
  const sourceUrl = 'https://arter.ee/restoranid/paevapakkumised/'
  const date = tallinnDateParts(now)
  const parsedMenus = parseArterHtml(await fetchSource(sourceUrl), date.iso)
  if (date.isWeekday) {
    const parsedNames = new Set(parsedMenus.map((menu) => menu.restaurantName))
    const missingRestaurants = Object.keys(arterLocations).filter((name) => !parsedNames.has(name))
    if (missingRestaurants.length) {
      throw new Error(`Tänase menüüta söögikohad: ${missingRestaurants.join(', ')}`)
    }
  }
  const fetchedAt = now.toISOString()
  const offers: LunchOffer[] = []
  for (const menu of parsedMenus) {
    const location = arterLocations[menu.restaurantName]
    if (!location) continue
    offers.push(...offersForLocation(menu.offers, location, {
      offerDate: date.iso,
      fetchedAt,
      sourceName: 'Arteri kvartali ametlik päevamenüü',
      sourceUrl,
      lunchStartTime: menu.lunchStartTime,
      lunchEndTime: menu.lunchEndTime,
    }))
  }
  return offers
}

async function collectUlemisteCity(now = new Date()) {
  const date = tallinnDateParts(now)
  const fetchedAt = now.toISOString()
  const endpoint = 'https://www.ulemistecity.ee/wp-admin/admin-ajax.php'
  const payload = await postFormJsonSource(endpoint, new URLSearchParams({
    action: 'ld_get_content',
    what: 'daily-offers',
    time: String(Math.floor(now.getTime() / 1000)),
    lang: 'et',
  }))
  const menus = parseUlemisteCityJson(payload)
  const offers: LunchOffer[] = []

  for (const menu of menus) {
    const location: RestaurantLocation = {
      id: menu.restaurantId,
      name: menu.restaurantName,
      address: menu.address,
      latitude: menu.latitude,
      longitude: menu.longitude,
    }
    offers.push(...offersForLocation(menu.offers, location, {
      offerDate: date.iso,
      fetchedAt,
      sourceName: 'Ülemiste City ametlik päevamenüü',
      sourceUrl: menu.sourceUrl,
      lunchStartTime: menu.lunchStartTime,
      lunchEndTime: menu.lunchEndTime,
    }))
  }

  if (date.isWeekday && !offers.length) throw new Error('Tänase kuupäevaga menüüd ei leitud')
  return offers
}

function isValidOffer(offer: LunchOffer): boolean {
  return Boolean(
    offer.restaurantId &&
      offer.restaurantName &&
      offer.address &&
      Number.isFinite(offer.latitude) &&
      Number.isFinite(offer.longitude) &&
      offer.offerName &&
      Number.isFinite(offer.price) &&
      offer.price > 0 &&
      /^\d{4}-\d{2}-\d{2}$/.test(offer.offerDate) &&
      /^https:\/\//.test(offer.sourceUrl),
  )
}

function deduplicate(offers: LunchOffer[]) {
  const unique = new Map<string, LunchOffer>()
  for (const offer of offers) {
    if (!isValidOffer(offer)) continue
    const key = [
      offer.restaurantId,
      offer.offerDate,
      offer.offerName.toLocaleLowerCase('et').replace(/\s+/g, ' '),
      offer.price.toFixed(2),
    ].join('|')
    unique.set(key, offer)
  }
  return [...unique.values()].sort((a, b) =>
    a.restaurantName.localeCompare(b.restaurantName, 'et') || a.price - b.price,
  )
}

async function readJson<T>(url: URL, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(url, 'utf8')) as T
  } catch {
    return fallback
  }
}

const collectors: Array<{
  id: string
  sourceName: string
  collect: (now: Date) => Promise<LunchOffer[]>
}> = [
  { id: 'hiiu-resto', sourceName: 'Hiiu Resto ametlik menüü', collect: collectHiiuResto },
  { id: 'kristiine-lunch', sourceName: 'Kristiine Keskuse ametlik lõunavoog', collect: collectKristiine },
  { id: 'reval-cafe', sourceName: 'Reval Café ametlik menüü', collect: collectReval },
  { id: 'vapiano', sourceName: 'Vapiano ametlik lõunamenüü', collect: collectVapiano },
  { id: 'amps', sourceName: 'AMPSi ametlik päevamenüü', collect: collectAmps },
  { id: 'proto', sourceName: 'PROTO ametlik lõunamenüü', collect: collectProto },
  { id: 'arter-quarter', sourceName: 'Arteri kvartali ametlik päevamenüü', collect: collectArter },
  { id: 'ulemiste-city', sourceName: 'Ülemiste City ametlik päevamenüü', collect: collectUlemisteCity },
]

async function main() {
  const now = new Date()
  const date = tallinnDateParts(now)
  const today = date.iso
  const previous = await readJson<OffersBundle | null>(outputPath, null)
  const manualOffers = await readJson<LunchOffer[]>(manualPath, [])
  const errors: OffersBundle['errors'] = []
  const collected: LunchOffer[] = []

  for (const collector of collectors) {
    try {
      const offers = await collector.collect(now)
      collected.push(...offers)
      const source = sourceStatuses.find((item) => item.id === collector.id)
      if (source) source.lastSuccessAt = now.toISOString()
      console.info(`[${collector.id}] ${offers.length} tänast pakkumist`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      errors.push({ sourceId: collector.id, message })
      console.error(`[${collector.id}] ${message}`)
      const cachedToday = previous?.offers.filter(
        (offer) => offer.sourceName === collector.sourceName && offer.offerDate === today,
      )
      if (cachedToday?.length) collected.push(...cachedToday)
    }
  }

  if (process.env.LOUNALEIDJA_PARTNER_FEED_URL?.trim()) {
    try {
      const partnerOffers = await collectLicensedPartnerFeed(now)
      if (date.isWeekday && !partnerOffers.length) {
        throw new Error('Litsentsitud partnerivoog ei sisaldanud tänaseid pakkumisi')
      }
      collected.push(...partnerOffers)
      for (const source of sourceStatuses) {
        if (!partnerOffers.some((offer) => partnerSourceId(offer) === source.id)) continue
        source.status = 'active'
        source.lastSuccessAt = now.toISOString()
        source.message = 'Litsentsitud partnerivoog on ühendatud ja tänased pakkumised on kuupäevaga kinnitatud.'
      }
      console.info(`[partner-feed] ${partnerOffers.length} tänast pakkumist`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      errors.push({ sourceId: 'licensed-partner-feed', message })
      console.error(`[partner-feed] ${message}`)
      const cachedToday = previous?.offers.filter(
        (offer) => partnerSourceId(offer) !== null && offer.offerDate === today,
      )
      if (cachedToday?.length) collected.push(...cachedToday)
    }
  }

  const validManualOffers = manualOffers.filter((offer) => offer.offerDate === today)
  const bundle: OffersBundle = {
    generatedAt: now.toISOString(),
    timezone: 'Europe/Tallinn',
    offers: deduplicate([...collected, ...validManualOffers]),
    sources: sourceStatuses,
    errors,
  }
  await writeFile(outputPath, `${JSON.stringify(bundle, null, 2)}\n`, 'utf8')
  console.info(`Valmis: ${bundle.offers.length} pakkumist, ${errors.length} viga.`)
}

await main()
