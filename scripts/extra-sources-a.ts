import { load, type CheerioAPI } from 'cheerio'
import type { ParsedOffer } from './parsers'

export interface ParsedOfficialLunchMenu {
  lunchStartTime: string | null
  lunchEndTime: string | null
  offers: ParsedOffer[]
}

export interface OfficialRestaurantLocation {
  restaurantName: string
  address: string
}

/**
 * Poké Bowl publishes one shared lunch menu for its five Tallinn restaurants.
 * The collector can apply the one parsed offer to each of these locations.
 */
export const POKE_BOWL_TALLINN_LOCATIONS: OfficialRestaurantLocation[] = [
  { restaurantName: 'Poké Bowl Mustamäe', address: 'A. H. Tammsaare tee 104a, Tallinn' },
  { restaurantName: 'Poké Bowl Järve', address: 'Pärnu maantee 238, Tallinn' },
  { restaurantName: 'Poké Bowl Ülemiste', address: 'Suur-Sõjamäe 4, Tallinn' },
  { restaurantName: 'Poké Bowl Kristiine', address: 'Endla 45, Tallinn' },
  { restaurantName: 'Poké Bowl Viru', address: 'Viru väljak 4, Tallinn' },
]

const WEEKDAYS = [
  '',
  'esmaspäev',
  'teisipäev',
  'kolmapäev',
  'neljapäev',
  'reede',
] as const

function compact(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function normalizedHeading(value: string) {
  return compact(value).toLocaleLowerCase('et-EE')
}

function parseIsoDate(dateIso: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) return null
  const parsed = new Date(`${dateIso}T12:00:00Z`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function weekdayFor(dateIso: string) {
  const date = parseIsoDate(dateIso)
  if (!date) return null
  const day = date.getUTCDay()
  return day >= 1 && day <= 5 ? WEEKDAYS[day] : null
}

function parsePrice(value: string) {
  const match = compact(value).match(/(\d+(?:[.,]\d{1,2})?)\s*€(?:\s|$)/)
  if (!match) return null
  const price = Number(match[1].replace(',', '.'))
  return Number.isFinite(price) && price > 0 ? price : null
}

function emptyMenu(
  lunchStartTime: string | null,
  lunchEndTime: string | null,
): ParsedOfficialLunchMenu {
  return { lunchStartTime, lunchEndTime, offers: [] }
}

function dateIsRelevantToTargetWeek(sourceDateValue: string, dateIso: string) {
  const target = parseIsoDate(dateIso)
  const sourceDateIso = sourceDateValue.match(/\d{4}-\d{2}-\d{2}/)?.[0]
  const source = sourceDateIso ? parseIsoDate(sourceDateIso) : null
  if (!target || !source) return false

  const targetWeekday = target.getUTCDay()
  const monday = new Date(target)
  monday.setUTCDate(target.getUTCDate() - (targetWeekday - 1))

  // Sites commonly publish the next week's menu during the preceding weekend.
  const earliest = new Date(monday)
  earliest.setUTCDate(monday.getUTCDate() - 2)
  const latest = new Date(monday)
  latest.setUTCDate(monday.getUTCDate() + 6)
  return source >= earliest && source <= latest
}

function pageModifiedDate($: CheerioAPI) {
  const metaDate = $('meta[property="article:modified_time"]').attr('content')
    ?? $('meta[name="article:modified_time"]').attr('content')
  if (metaDate) return metaDate

  for (const element of $('script[type="application/ld+json"]').toArray()) {
    const json = $(element).text()
    const match = json.match(/"dateModified"\s*:\s*"([^"]+)"/)
    if (match) return match[1]
  }
  return null
}

/**
 * Parses the single shared Poké Bowl weekday lunch offer.
 *
 * The page labels the menu as this week's menu but does not print a date range.
 * When its official modified date is available, an old/future week's menu is
 * rejected. A preceding-weekend publication is accepted for the coming week.
 */
export function parsePokeBowlLunchHtml(html: string, dateIso: string): ParsedOfficialLunchMenu {
  const weekday = weekdayFor(dateIso)
  if (!weekday) return emptyMenu('11:00', '14:00')

  const $ = load(html)
  const modifiedDate = pageModifiedDate($)
  if (modifiedDate && !dateIsRelevantToTargetWeek(modifiedDate, dateIso)) {
    return emptyMenu('11:00', '14:00')
  }

  const menuHeading = $('h2')
    .filter((_, element) => /selle nädala lõunapakkumised/i.test(compact($(element).text())))
    .first()
  if (!menuHeading.length) return emptyMenu('11:00', '14:00')

  const dayHeading = menuHeading
    .parent()
    .parent()
    .parent()
    .parent()
    .nextAll('.vc_row')
    .find('h3')
    .filter((_, element) => normalizedHeading($(element).text()) === weekday)
    .first()

  // A simpler fallback keeps the parser resilient if WPBakery changes wrappers.
  const resolvedDayHeading = dayHeading.length
    ? dayHeading
    : $('h3').filter((_, element) => normalizedHeading($(element).text()) === weekday).first()
  if (!resolvedDayHeading.length) return emptyMenu('11:00', '14:00')

  const column = resolvedDayHeading.closest('.wpb_column')
  const offerName = compact(column.find('h4').first().text())
  const price = parsePrice(column.find('.eltdf-pli-price').first().text())
  if (!offerName || price === null) return emptyMenu('11:00', '14:00')

  return {
    lunchStartTime: '11:00',
    lunchEndTime: '14:00',
    offers: [{ offerName, description: null, price }],
  }
}

function parseLunchTimes(value: string) {
  const match = value.match(/(\d{1,2})(?:[.:](\d{2}))?\s*[–-]\s*(\d{1,2})(?:[.:](\d{2}))?/)
  if (!match) return { start: null, end: null }
  return {
    start: `${match[1].padStart(2, '0')}:${match[2] ?? '00'}`,
    end: `${match[3].padStart(2, '0')}:${match[4] ?? '00'}`,
  }
}

function offerNameWithoutPrice($: CheerioAPI, element: Parameters<CheerioAPI>[0]) {
  const strongName = compact($(element).find('strong').first().text())
  if (strongName) return strongName
  return compact($(element).text()).replace(/\s*\d+(?:[.,]\d{1,2})?\s*€.*$/, '')
}

function meaningfulParagraphs(
  $: CheerioAPI,
  nodes: ReturnType<CheerioAPI>[],
  from: number,
  until: number,
) {
  const parts: string[] = []
  for (let index = from; index < until; index += 1) {
    const node = nodes[index]
    if (!node?.is('p')) continue
    const value = compact(node.text())
    if (!value || value === '+') continue
    parts.push(value)
  }
  return parts.length ? parts.join(' + ') : null
}

/**
 * Parses Tokumaru's lunch page for any location using the same Squarespace
 * layout (Balti Jaam, Solaris and T1 included). Every-day combos retain their
 * own prices; today's don bowls inherit the published PÄEVA-DON price.
 */
export function parseTokumaruLunchHtml(html: string, dateIso: string): ParsedOfficialLunchMenu {
  const weekday = weekdayFor(dateIso)
  if (!weekday) return emptyMenu(null, null)

  const $ = load(html)
  const elements = $('main .sqs-html-content')
    .find('h2, h3, p')
    .toArray()
    .map((element) => $(element))
  const start = elements.findIndex(
    (element) => element.is('h2') && normalizedHeading(element.text()) === 'lõunapakkumised',
  )
  if (start === -1) return emptyMenu(null, null)

  const timeText = elements
    .slice(start + 1)
    .find((element) => element.is('p') && /saadaval/i.test(element.text()))
    ?.text() ?? ''
  const times = parseLunchTimes(timeText)

  const everyDay = elements.findIndex(
    (element, index) => index > start
      && element.is('h2')
      && normalizedHeading(element.text()).startsWith('iga päev'),
  )
  const firstWeekday = elements.findIndex(
    (element, index) => index > everyDay
      && element.is('h2')
      && WEEKDAYS.includes(normalizedHeading(element.text()) as typeof WEEKDAYS[number]),
  )
  if (everyDay === -1 || firstWeekday === -1) return emptyMenu(times.start, times.end)

  const offers: ParsedOffer[] = []
  let dayPrice: number | null = null
  const everyDayHeadings: number[] = []
  for (let index = everyDay + 1; index < firstWeekday; index += 1) {
    const element = elements[index]
    if (!element.is('h3')) continue
    const name = offerNameWithoutPrice($, element[0])
    const price = parsePrice(element.text())
    if (/päeva-?\s*don/i.test(normalizedHeading(element.text()))) {
      dayPrice = price
      continue
    }
    if (name && price !== null) everyDayHeadings.push(index)
  }

  for (const headingIndex of everyDayHeadings) {
    const nextHeading = elements.findIndex(
      (element, index) => index > headingIndex && index < firstWeekday && element.is('h3'),
    )
    const heading = elements[headingIndex]
    const price = parsePrice(heading.text())
    if (price === null) continue
    offers.push({
      offerName: offerNameWithoutPrice($, heading[0]),
      description: meaningfulParagraphs(
        $,
        elements,
        headingIndex + 1,
        nextHeading === -1 ? firstWeekday : nextHeading,
      ),
      price,
    })
  }

  const currentDay = elements.findIndex(
    (element, index) => index >= firstWeekday
      && element.is('h2')
      && normalizedHeading(element.text()) === weekday,
  )
  if (currentDay === -1 || dayPrice === null) {
    return { lunchStartTime: times.start, lunchEndTime: times.end, offers }
  }

  let nextDay = elements.length
  for (let index = currentDay + 1; index < elements.length; index += 1) {
    const element = elements[index]
    if (element.is('h2')
      && WEEKDAYS.includes(normalizedHeading(element.text()) as typeof WEEKDAYS[number])) {
      nextDay = index
      break
    }
  }

  for (let index = currentDay + 1; index < nextDay; index += 1) {
    const element = elements[index]
    if (!element.is('p')) continue
    const offerName = compact(element.find('strong').first().text())
    if (!offerName || offerName === '+') continue

    let description: string | null = null
    for (let descriptionIndex = index + 1; descriptionIndex < nextDay; descriptionIndex += 1) {
      const candidate = elements[descriptionIndex]
      if (!candidate.is('p')) continue
      if (compact(candidate.find('strong').first().text())) break
      const value = compact(candidate.text())
      if (value && value !== '+') {
        description = value
        break
      }
    }
    offers.push({ offerName, description, price: dayPrice })
  }

  return { lunchStartTime: times.start, lunchEndTime: times.end, offers }
}
