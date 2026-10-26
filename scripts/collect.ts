import { readFile, writeFile } from 'node:fs/promises'
import { load } from 'cheerio'
import robotsParser from 'robots-parser'
import type { LunchOffer, OffersBundle, SourceStatus } from '../src/types.ts'

const outputPath = new URL('../public/data/offers.json', import.meta.url)
const manualPath = new URL('../data/manual-offers.json', import.meta.url)
const userAgent = 'Lounaleidja/0.1 (public-interest lunch index; contact via GitHub repository)'

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
    id: 'paevapakkumised',
    name: 'Päevapakkumised.ee',
    url: 'https://www.xn--pevapakkumised-5hb.ee/kasutustingimused',
    status: 'permission-required',
    message: 'Tingimused keelavad automatiseeritud kopeerimise ilma kirjaliku loata.',
    lastSuccessAt: null,
  },
  {
    id: 'paevapraad',
    name: 'Päevapraad.ee',
    url: 'https://www.paevapraad.ee/andmekaitse-uldmaarus-ja-kasutajatingimused',
    status: 'permission-required',
    message: 'Tingimused keelavad sisu kopeerimise ja levitamise ilma kirjaliku loata.',
    lastSuccessAt: null,
  },
  {
    id: 'lunchtime',
    name: 'Lunchtime.ee',
    url: 'https://www.lunchtime.ee/',
    status: 'unavailable',
    message: 'Avalik menüü, API ega andmevoog ei ole praegu saadaval.',
    lastSuccessAt: null,
  },
]

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

async function request(url: string) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': userAgent,
      Accept: 'text/html,application/xhtml+xml',
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
  const response = await fetch(robotsUrl, {
    headers: { 'User-Agent': userAgent },
    signal: AbortSignal.timeout(10_000),
  })
  if (response.status === 404) return
  if (!response.ok) throw new Error(`robots.txt kontroll ebaõnnestus: HTTP ${response.status}`)
  const parser = robotsParser(robotsUrl, await response.text())
  if (parser.isAllowed(url, userAgent) === false) {
    throw new Error('robots.txt ei luba selle lehe automatiseeritud lugemist')
  }
}

function parsePrice(value: string): number | null {
  const match = value.replace(/\s/g, '').match(/(\d+(?:[.,]\d{1,2})?)/)
  if (!match) return null
  const parsed = Number(match[1].replace(',', '.'))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function compact(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

async function collectHiiuResto(now = new Date()): Promise<LunchOffer[]> {
  const sourceUrl = 'https://hiiuresto.eu/menuu/'
  await assertRobotsAllowed(sourceUrl)
  await new Promise((resolve) => setTimeout(resolve, 1100))
  const html = await (await request(sourceUrl)).text()
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

async function main() {
  const now = new Date()
  const today = tallinnDateParts(now).iso
  const previous = await readJson<OffersBundle | null>(outputPath, null)
  const manualOffers = await readJson<LunchOffer[]>(manualPath, [])
  const errors: OffersBundle['errors'] = []
  const collected: LunchOffer[] = []

  try {
    const hiiuOffers = await collectHiiuResto(now)
    collected.push(...hiiuOffers)
    const source = sourceStatuses.find((item) => item.id === 'hiiu-resto')
    if (source) source.lastSuccessAt = now.toISOString()
    console.info(`[hiiu-resto] ${hiiuOffers.length} tänast pakkumist`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    errors.push({ sourceId: 'hiiu-resto', message })
    console.error(`[hiiu-resto] ${message}`)
    const cachedToday = previous?.offers.filter(
      (offer) => offer.restaurantId === 'hiiu-resto-tallinn' && offer.offerDate === today,
    )
    if (cachedToday?.length) collected.push(...cachedToday)
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
