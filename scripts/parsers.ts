import { load } from 'cheerio'

export interface ParsedOffer {
  offerName: string
  description: string | null
  price: number
}

export interface ParsedMenu {
  restaurantName: string
  lunchStartTime: string | null
  lunchEndTime: string | null
  offers: ParsedOffer[]
}

export interface ParsedLocationMenu extends ParsedMenu {
  address: string
  latitude: number
  longitude: number
}

export interface ParsedUlemisteCityMenu extends ParsedLocationMenu {
  restaurantId: string
  sourceUrl: string
}

export function compact(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

export function parsePrice(value: string): number | null {
  const normalized = value
    .replace(/\s/g, '')
    .replace(/(\d[.,]\d)o\b/gi, (_match, prefix: string) => `${prefix}0`)
  const match = normalized.match(/(\d+(?:[.,]\d{1,2})?)/)
  if (!match) return null
  const parsed = Number(match[1].replace(',', '.'))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function parseTimeRange(value: string) {
  const match = value.match(/(\d{1,2})[.:](\d{2})\s*[-–]\s*(\d{1,2})[.:](\d{2})/)
  if (!match) return { start: null, end: null }
  return {
    start: `${match[1].padStart(2, '0')}:${match[2]}`,
    end: `${match[3].padStart(2, '0')}:${match[4]}`,
  }
}

function parseLineWithPrice(value: string): ParsedOffer | null {
  const normalized = compact(value).replace(/(\d[.,]\d)o\b/gi, (_match, prefix: string) => `${prefix}0`)
  const discounted = normalized.match(
    /^(.+?)\s+(\d+(?:[.,]\d{1,2})?)\s*€?\s*->\s*(\d+(?:[.,]\d{1,2})?)\s*€?$/,
  )
  if (discounted) {
    const regularPrice = parsePrice(discounted[2])
    const price = parsePrice(discounted[3])
    if (regularPrice === null || price === null) return null
    return {
      offerName: compact(discounted[1]),
      description: `Tavahind ${regularPrice.toLocaleString('et-EE', { minimumFractionDigits: 2 })} €`,
      price,
    }
  }

  const match = normalized.match(/(\d+(?:[.,]\d{1,2})?)\s*€?\s*$/)
  if (!match || match.index === undefined) return null
  const price = parsePrice(match[1])
  if (price === null) return null

  let label = normalized
    .slice(0, match.index)
    .replace(/\bHind\s*:?\s*$/i, '')
    .replace(/[.,;:]\s*$/, '')
    .trim()
  if (!label) return null

  const contains = label.match(/^(.+?)\s+sisaldab:\s*(.+)$/i)
  if (contains) {
    label = compact(contains[1])
    return { offerName: label, description: compact(contains[2]), price }
  }
  return { offerName: label, description: null, price }
}

function parseMenuLines(lines: string[]) {
  const offers: ParsedOffer[] = []
  let pendingLabel = ''
  for (const rawLine of lines) {
    const line = compact(rawLine)
    if (!line) continue
    const parsed = parseLineWithPrice(line)
    if (!parsed) {
      pendingLabel = line
      continue
    }
    if (/^\d+(?:[.,]\d{1,2})?\s*€?$/.test(line) && pendingLabel) {
      parsed.offerName = pendingLabel
    }
    offers.push(parsed)
    pendingLabel = ''
  }
  return offers
}

function markdownBlock(section: string, heading: string) {
  const marker = `**${heading}**`
  const start = section.indexOf(marker)
  if (start === -1) return null
  const afterHeading = section.slice(start + marker.length)
  const nextHeading = afterHeading.search(/^\*\*.+\*\*\s*$/m)
  return nextHeading === -1 ? afterHeading : afterHeading.slice(0, nextHeading)
}

export function parseKristiineMarkdown(markdown: string, dateIso: string): ParsedMenu[] {
  const sections = markdown.split(/^###\s+/m).slice(1)
  const menus: ParsedMenu[] = []

  for (const section of sections) {
    const newline = section.indexOf('\n')
    if (newline === -1) continue
    const restaurantName = compact(section.slice(0, newline))
    const timeText = section.match(/^- Lunch time:\s*(.+)$/m)?.[1] ?? ''
    const time = parseTimeRange(timeText)
    const datedBlock = markdownBlock(section, dateIso)
    const everyDayBlock = markdownBlock(section, 'Every day')
    const block = datedBlock ?? everyDayBlock
    if (!block) continue

    const lines = block
      .split('\n')
      .map((line) => line.match(/^\s*-\s+(.+)$/)?.[1] ?? '')
      .filter(Boolean)

    let offers: ParsedOffer[]
    if (restaurantName.toLocaleLowerCase('et') === 'lido') {
      const priceLine = lines.find((line) => /^Hind\s*:/i.test(line))
      const price = priceLine ? parsePrice(priceLine) : null
      const description = lines.filter((line) => !/^Hind\s*:/i.test(line)).map(compact).join(' ')
      offers = price !== null && description
        ? [{ offerName: 'Lõunapakkumine', description, price }]
        : []
    } else {
      offers = parseMenuLines(lines)
    }

    if (offers.length) {
      menus.push({
        restaurantName,
        lunchStartTime: time.start,
        lunchEndTime: time.end,
        offers,
      })
    }
  }

  return menus
}

export function parseRevalHtml(html: string, dateShort: string) {
  const $ = load(html)
  const dayParagraph = $('p')
    .filter((_, element) => {
      const heading = compact($(element).children('strong').first().text())
      return heading.includes(dateShort) && !/Päevapakkumised/i.test(heading)
    })
    .first()
  if (!dayParagraph.length) return { offers: [] as ParsedOffer[], excludesMeremuuseum: false }

  const clone = dayParagraph.clone()
  clone.find('br').replaceWith('\n')
  const text = clone.text()
  const lines = text.split('\n').map(compact).filter(Boolean)
  return {
    offers: parseMenuLines(lines.slice(1)),
    excludesMeremuuseum: /v\.?\s*a\.?\s+Meremuuseumi/i.test(text),
  }
}

function rangeContainsDate(value: string, dateIso: string) {
  const match = value.match(/^(\d{1,2})\.-(\d{1,2})\.(\d{1,2})$/)
  if (!match) return false
  const [, month, day] = dateIso.split('-').map(Number)
  return month === Number(match[3]) && day >= Number(match[1]) && day <= Number(match[2])
}

export function parseVapianoHtml(html: string, dateIso: string): ParsedOffer[] {
  const $ = load(html)
  const hasCurrentRange = $('h2.elementor-heading-title')
    .toArray()
    .some((element) => rangeContainsDate(compact($(element).text()), dateIso))
  if (!hasCurrentRange) return []

  const activeSection = $('section.elementor-top-section')
    .filter((_, element) => {
      const section = $(element)
      const hasWeekMarker = section.find('h2.elementor-heading-title').toArray()
        .some((heading) => /Week [1-4] starts/i.test($(heading).text()))
      const hiddenEverywhere = ['elementor-hidden-desktop', 'elementor-hidden-tablet', 'elementor-hidden-mobile']
        .every((className) => section.hasClass(className))
      return hasWeekMarker && !hiddenEverywhere
    })
    .first()

  const offers: ParsedOffer[] = []
  activeSection.find('section.elementor-inner-section').each((_, element) => {
    const card = $(element)
    const headings = card.find('h2.elementor-heading-title').toArray().map((heading) => compact($(heading).text()))
    const priceIndex = headings.findLastIndex((heading) => /^\d+(?:[.,]\d{1,2})?\s*€$/.test(heading))
    if (priceIndex < 1) return
    const nameIndex = /^PÄEVASUPP$/i.test(headings[0]) ? 1 : 0
    const price = parsePrice(headings[priceIndex])
    const offerName = headings[nameIndex]
    if (!offerName || price === null) return
    const modifiers = headings.slice(nameIndex + 1, priceIndex)
    const paragraphs = card.find('.elementor-widget-text-editor p').toArray().map((paragraph) => compact($(paragraph).text()))
    const descriptionParts = [...modifiers, ...paragraphs].filter(Boolean)
    if (nameIndex === 1) descriptionParts.unshift('Päevasupp')
    offers.push({ offerName, description: descriptionParts.join(' · ') || null, price })
  })
  return offers
}

function isoToLongDate(dateIso: string) {
  const [year, month, day] = dateIso.split('-')
  return `${day}.${month}.${year}`
}

export function parseAmpsHtml(html: string, dateIso: string) {
  const $ = load(html)
  const tabs = $('.e-n-tabs')
    .filter((_, element) => /Järve AMPS/i.test($(element).text()) && /Arena AMPS/i.test($(element).text()))
    .first()
  const tabsWidget = tabs.closest('.elementor-widget-n-tabs')
  const dateLabel = compact(tabsWidget.prevAll('.elementor-widget-text-editor').first().text())
  if (dateLabel !== isoToLongDate(dateIso)) return new Map<string, ParsedOffer[]>()

  const result = new Map<string, ParsedOffer[]>()
  tabs.find('.e-n-tab-title').each((_, element) => {
    const title = compact($(element).text())
    if (!['Järve AMPS', 'Arena AMPS'].includes(title)) return
    const contentId = $(element).attr('aria-controls')
    if (!contentId) return
    const lines: string[] = []
    $(`#${contentId}`).find('.elementor-widget-text-editor').each((__, textElement) => {
      const clone = $(textElement).clone()
      clone.find('style,script').remove()
      clone.find('br').replaceWith('\n')
      lines.push(...clone.text().split('\n').map(compact).filter(Boolean))
    })
    result.set(title, parseMenuLines(lines))
  })
  return result
}

export function parseProtoHtml(html: string, dateShort: string): ParsedOffer[] {
  const $ = load(html)
  const dayHeading = $('p > strong')
    .filter((_, element) => compact($(element).text()).includes(dateShort))
    .first()
    .parent('p')
  if (!dayHeading.length) return []

  const soupParagraph = dayHeading.nextAll('p').first()
  const buffetParagraph = soupParagraph.nextAll('p').first()
  const soupText = compact(soupParagraph.text())
  const soupMatch = soupText.match(/^(.+?)\s+(\d+(?:[.,]\d{1,2})?)\s*€\s*\/\s*(\d+(?:[.,]\d{1,2})?)\s*€$/)
  const offers: ParsedOffer[] = []
  if (soupMatch) {
    const smallPrice = parsePrice(soupMatch[2])
    const largePrice = parsePrice(soupMatch[3])
    if (smallPrice !== null) offers.push({ offerName: `${compact(soupMatch[1])} (väike)`, description: null, price: smallPrice })
    if (largePrice !== null) offers.push({ offerName: `${compact(soupMatch[1])} (suur)`, description: null, price: largePrice })
  }

  const buffetClone = buffetParagraph.clone()
  buffetClone.find('br').replaceWith('\n')
  const buffetLines = buffetClone.text().split('\n').map(compact).filter(Boolean)
  const buffetPrice = parsePrice(buffetLines[0] ?? '')
  if (/Lõunabufee/i.test(buffetLines[0] ?? '') && buffetPrice !== null) {
    offers.push({
      offerName: 'Lõunabufee (100 g)',
      description: buffetLines.slice(1).join(' · ') || null,
      price: buffetPrice,
    })
  }
  return offers
}

const ulemisteCityLocationIds = new Map<number, string>([
  [11168, 'ulemiste-aiko-bowl'],
  [124, 'ulemiste-fredo-opiku'],
  [26534, 'ulemiste-fredo-lurich'],
  [1890, 'ulemiste-gala-sushi'],
  [12461, 'ulemiste-mona'],
  [131, 'ulemiste-plus-tervisemaja-1'],
  [22442, 'ulemiste-plus-tervisemaja-2'],
  [17312, 'ulemiste-freya-foodbar'],
  [128, 'ulemiste-nuface'],
  [58, 'ulemiste-nuudel'],
  [1252, 'ulemiste-airo-cafe'],
])

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function textFromHtml(value: unknown) {
  if (typeof value !== 'string') return ''
  return compact(load(value).root().text())
}

function normalizeUlemisteAddress(value: string) {
  const address = compact(value).replace(/\s+,/g, ',').replace(/[.\s]+$/g, '')
  return /Tallinn/i.test(address) ? address : `${address}, Tallinn`
}

function parseUlemistePrice(value: string): Pick<ParsedOffer, 'price' | 'description'> | null {
  const priceText = compact(value)
  const perHundredGrams = priceText.match(/100\s*g\s*\/\s*(\d+(?:[.,]\d{1,2})?)/i)
    ?? priceText.match(/(\d+(?:[.,]\d{1,2})?)\s*€?\s*\/\s*100\s*g/i)
  if (perHundredGrams) {
    const price = Number(perHundredGrams[1].replace(',', '.'))
    if (!Number.isFinite(price) || price <= 0) return null
    return {
      price,
      description: `Hind: ${price.toLocaleString('et-EE', { minimumFractionDigits: 2 })} €/100 g`,
    }
  }

  const prices = [...priceText.matchAll(/\d+(?:[.,]\d{1,2})?/g)]
    .map((match) => Number(match[0].replace(',', '.')))
    .filter((price) => Number.isFinite(price) && price > 0)
  if (!prices.length) return null
  return {
    price: Math.min(...prices),
    description: prices.length > 1
      ? `Hinnad: ${priceText}${/€/.test(priceText) ? '' : ' €'}`
      : null,
  }
}

export function parseUlemisteCityJson(payload: unknown): ParsedUlemisteCityMenu[] {
  const response = record(payload)
  const data = record(response?.data)
  const entries = data?.entries
  if (response?.success !== true || !Array.isArray(entries)) {
    throw new Error('Ülemiste City päevamenüü JSON-vastus on vigane')
  }

  return entries.map((rawEntry) => {
    const entry = record(rawEntry)
    const id = Number(entry?.ID)
    const restaurantName = typeof entry?.title === 'string' ? compact(entry.title) : ''
    const sourceUrl = typeof entry?.permalink === 'string' ? entry.permalink : ''
    const rawAddress = typeof entry?.location === 'string' ? entry.location : ''
    const coords = record(entry?.coords)
    const latitude = Number(coords?.latitude)
    const longitude = Number(coords?.longitude)
    let sourceHost = ''
    let sourceProtocol = ''
    try {
      const parsedSourceUrl = new URL(sourceUrl)
      sourceHost = parsedSourceUrl.hostname
      sourceProtocol = parsedSourceUrl.protocol
    } catch {
      // The validation below reports one consistent location-data error.
    }
    if (
      !entry ||
      !Number.isInteger(id) ||
      !restaurantName ||
      sourceProtocol !== 'https:' ||
      !['ulemistecity.ee', 'www.ulemistecity.ee'].includes(sourceHost) ||
      !rawAddress ||
      !Number.isFinite(latitude) || latitude < 57 || latitude > 60 ||
      !Number.isFinite(longitude) || longitude < 21 || longitude > 29
    ) {
      throw new Error(`Ülemiste City restorani asukohaandmed on vigased: ${restaurantName || id || 'tundmatu'}`)
    }

    const offers: ParsedOffer[] = []
    const rawOffers = Array.isArray(entry.offers) ? entry.offers : []
    for (const rawOffer of rawOffers) {
      const offer = record(rawOffer)
      const offerName = textFromHtml(offer?.name)
      const offerType = typeof offer?.ftype === 'string' ? compact(offer.ftype) : ''
      const priceText = typeof offer?.price === 'string' || typeof offer?.price === 'number'
        ? String(offer.price)
        : ''
      const parsedPrice = parseUlemistePrice(priceText)
      if (
        !offerName ||
        !parsedPrice ||
        /Hommikusöök/i.test(offerType) ||
        /^(?:\([^)]*\)\s*)+$/.test(offerName)
      ) continue
      offers.push({ offerName, ...parsedPrice })
    }

    return {
      restaurantId: ulemisteCityLocationIds.get(id) ?? `ulemiste-${id}`,
      restaurantName,
      sourceUrl,
      address: normalizeUlemisteAddress(rawAddress),
      latitude,
      longitude,
      lunchStartTime: null,
      lunchEndTime: null,
      offers,
    }
  })
}
