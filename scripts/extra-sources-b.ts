import { load } from 'cheerio'
import { compact, parsePrice, type ParsedOffer } from './parsers.ts'

const weekdays = ['Pühapäev', 'Esmaspäev', 'Teisipäev', 'Kolmapäev', 'Neljapäev', 'Reede', 'Laupäev']
const shortWeekdays = ['', 'E', 'T', 'K', 'N', 'R', '']
const months = [
  'jaanuar',
  'veebruar',
  'märts',
  'aprill',
  'mai',
  'juuni',
  'juuli',
  'august',
  'september',
  'oktoober',
  'november',
  'detsember',
]

function dateParts(dateIso: string) {
  const match = dateIso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  const date = new Date(`${dateIso}T12:00:00.000Z`)
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== dateIso) return null
  return {
    year: Number(match[1]),
    day: Number(match[3]),
    month: Number(match[2]),
    weekday: date.getUTCDay(),
  }
}

export function parseAlfredHtml(html: string, dateIso: string): ParsedOffer[] {
  const $ = load(html)
  const day = $(`[data-week] [data-date="${dateIso}"][data-has-offer="1"]`).first()
  if (!day.length) return []

  const main = compact(day.attr('data-main') ?? day.find('.week__main').text())
  const soup = compact(day.attr('data-soup') ?? day.find('.week__soup').text())
  const mainPrice = parsePrice($('[data-row-main] dd').first().text())
  const soupPrice = parsePrice($('[data-row-soup] dd').first().text())
  const comboPrice = parsePrice($('[data-row-combo] dd').first().text())
  const offers: ParsedOffer[] = []

  if (main && mainPrice !== null) offers.push({ offerName: main, description: 'Päevapraad', price: mainPrice })
  if (soup && soupPrice !== null) offers.push({ offerName: soup, description: 'Päevasupp', price: soupPrice })
  if (main && soup && comboPrice !== null) {
    offers.push({ offerName: 'Praad ja supp', description: `${main} · ${soup}`, price: comboPrice })
  }
  return offers
}

function scotlandWeekIsCurrent(value: string, dateIso: string) {
  const date = dateParts(dateIso)
  if (!date) return false
  const normalized = compact(value).toLocaleLowerCase('et')
  const monthNumber = (label: string) => {
    const month = label.toLocaleLowerCase('et')
    const index = months.findIndex((name) => month.startsWith(name.slice(0, Math.min(4, name.length))))
    return index === -1 ? null : index + 1
  }

  const crossMonth = normalized.match(
    /(\d{1,2})\.?\s+([a-zõäöüšž]+)\s*[–-]\s*(\d{1,2})\.?\s+([a-zõäöüšž]+)/i,
  )
  const sameMonth = normalized.match(
    /(\d{1,2})\.\s*[–-]\s*(\d{1,2})\.\s*([a-zõäöüšž]+)/i,
  )
  const numericMonths = normalized.match(
    /(\d{1,2})\.(\d{1,2})\.\s*[–-]\s*(\d{1,2})\.(\d{1,2})\./,
  )

  let startDay: number
  let endDay: number
  let startMonth: number | null
  let endMonth: number | null
  if (crossMonth) {
    startDay = Number(crossMonth[1])
    startMonth = monthNumber(crossMonth[2])
    endDay = Number(crossMonth[3])
    endMonth = monthNumber(crossMonth[4])
  } else if (numericMonths) {
    startDay = Number(numericMonths[1])
    startMonth = Number(numericMonths[2])
    endDay = Number(numericMonths[3])
    endMonth = Number(numericMonths[4])
  } else if (sameMonth) {
    startDay = Number(sameMonth[1])
    endDay = Number(sameMonth[2])
    startMonth = monthNumber(sameMonth[3])
    endMonth = startMonth
  } else {
    return false
  }
  if (!startMonth || !endMonth) return false

  const target = Date.UTC(date.year, date.month - 1, date.day)
  for (const startYear of [date.year - 1, date.year, date.year + 1]) {
    const endYear = startYear + (endMonth < startMonth ? 1 : 0)
    const start = Date.UTC(startYear, startMonth - 1, startDay)
    const end = Date.UTC(endYear, endMonth - 1, endDay, 23, 59, 59, 999)
    if (target >= start && target <= end) return true
  }
  return false
}

function weekdayInRange(weekday: string, start: string, end: string) {
  const order = ['E', 'T', 'K', 'N', 'R']
  const value = order.indexOf(weekday)
  const from = order.indexOf(start)
  const to = order.indexOf(end)
  return value >= from && value <= to
}

function currentScotlandSoup(value: string, weekday: string) {
  const normalized = compact(value)
  for (const match of normalized.matchAll(
    /([ETKNR])(?:\s*[–-]\s*([ETKNR]))?\s+(.+?)(?=,\s*[ETKNR](?:\s*[–-]\s*[ETKNR])?\s+|$)/g,
  )) {
    if (weekdayInRange(weekday, match[1], match[2] ?? match[1])) return compact(match[3])
  }
  return ''
}

export function parseScotlandYardHtml(html: string, dateIso: string): ParsedOffer[] {
  const date = dateParts(dateIso)
  if (!date || date.weekday < 1 || date.weekday > 5) return []
  const $ = load(html)
  const heading = $('h2').filter((_, element) => /Selle nädala lõunad/i.test($(element).text())).first()
  if (!heading.length || !scotlandWeekIsCurrent(heading.text(), dateIso)) return []

  const menu = heading.nextAll('.sywk').first().length ? heading.nextAll('.sywk').first() : heading.parent()
  const weekday = shortWeekdays[date.weekday]
  const dailyName = compact(menu.find('.mrow').filter((_, element) => (
    compact($(element).find('b').first().text()) === weekday
  )).first().find('p').text())
  const fullRows = menu.find('.mfull')
  const soupRow = fullRows.filter((_, element) => /^Supp$/i.test(compact($(element).find('b').first().text()))).first()
  const weekRow = fullRows.filter((_, element) => /Nädalapraad/i.test($(element).find('b').first().text())).first()
  const soupText = compact(soupRow.clone().find('b').remove().end().text())
  const soupName = currentScotlandSoup(soupText, weekday)
  const weekName = compact(weekRow.clone().find('b').remove().end().text())

  const prices = new Map<string, number>()
  $('.facts span').each((_, element) => {
    const text = compact($(element).text())
    const price = parsePrice(text)
    if (price === null) return
    if (/Päevapraad/i.test(text)) prices.set('daily', price)
    else if (/Nädalapraad/i.test(text)) prices.set('week', price)
    else if (/Supp/i.test(text)) prices.set('soup', price)
  })

  const offers: ParsedOffer[] = []
  if (dailyName && prices.has('daily')) offers.push({ offerName: dailyName, description: 'Päevapraad', price: prices.get('daily')! })
  if (soupName && prices.has('soup')) offers.push({ offerName: soupName, description: 'Päevasupp', price: prices.get('soup')! })
  if (weekName && prices.has('week')) offers.push({ offerName: weekName, description: 'Nädalapraad', price: prices.get('week')! })
  return offers
}

function offersFromLunchGroup($: ReturnType<typeof load>, group: ReturnType<ReturnType<typeof load>>, label: string) {
  const offers: ParsedOffer[] = []
  group.find('.lunch-item').each((_, element) => {
    const item = $(element)
    const offerName = compact(item.find('.lunch-item-title').first().text())
    const price = parsePrice(item.find('.lunch-item-price').first().text())
    const description = compact(item.find('.lunch-item-description').first().text())
    if (!offerName || price === null) return
    offers.push({ offerName, description: [label, description].filter(Boolean).join(' · ') || null, price })
  })
  return offers
}

export function parseOmHouseHtml(html: string, dateIso: string): ParsedOffer[] {
  const date = dateParts(dateIso)
  if (!date || date.weekday < 1 || date.weekday > 5) return []
  const $ = load(html)
  const groups = $('.lunch-time-group')
  const daily = groups.filter((_, element) => (
    compact($(element).find('.lunch-time-title').first().text()).toLocaleLowerCase('et')
      .startsWith(weekdays[date.weekday].toLocaleLowerCase('et'))
  )).first()
  const poke = groups.filter((_, element) => /Poke bar E-R/i.test($(element).find('.lunch-time-title').first().text())).first()
  return [
    ...offersFromLunchGroup($, daily, 'Päevapakkumine'),
    ...offersFromLunchGroup($, poke, 'Poke bar'),
  ]
}

export function parseSushiArtHtml(html: string, dateIso: string): ParsedOffer[] {
  const date = dateParts(dateIso)
  if (!date || date.weekday < 1 || date.weekday > 5) return []
  const $ = load(html)
  const title = $('.elementor-tabs-wrapper .elementor-tab-title').filter((_, element) => (
    compact($(element).text()).toLocaleLowerCase('et') === weekdays[date.weekday].toLocaleLowerCase('et')
  )).first()
  const contentId = title.attr('aria-controls')
  if (!contentId) return []

  const offers: ParsedOffer[] = []
  $(`#${contentId}`).find('p').each((_, element) => {
    const paragraph = $(element)
    const heading = compact(paragraph.find('strong').first().text())
    const match = heading.match(/^(.+?)\s+(\d+(?:[.,]\d{1,2})?)\s*€/)
    const price = match ? parsePrice(match[2]) : null
    if (!match || price === null) return
    const description = compact(paragraph.clone().find('strong').remove().end().text()).replace(/^\(|\)$/g, '')
    offers.push({ offerName: compact(match[1]), description: description || null, price })
  })
  return offers
}

export function parseAlleeHtml(html: string, dateIso: string): ParsedOffer[] {
  const date = dateParts(dateIso)
  if (!date || date.weekday < 1 || date.weekday > 5) return []
  const shortDate = `${String(date.day).padStart(2, '0')}.${String(date.month).padStart(2, '0')}`
  const $ = load(html)
  const row = $('.menu-item[data-seo="lounapakkumised"] .hCont').filter((_, element) => (
    compact($(element).text()).includes(shortDate)
  )).first()
  if (!row.length) return []

  const lines = row.find('em').first().clone().find('br').replaceWith('\n').end().text()
    .split('\n').map(compact).filter(Boolean)
  if (lines.length < 2) return []
  const prices = compact($('.groupDesc[data-seo="lounapakkumised"]').first().text())
  const mainPrice = parsePrice(prices.match(/Päevapraad\s+(\d+(?:[.,]\d{1,2})?)/i)?.[1] ?? '')
  const soupPrice = parsePrice(prices.match(/Päevasupp\s+(\d+(?:[.,]\d{1,2})?)/i)?.[1] ?? '')
  const offers: ParsedOffer[] = []
  if (mainPrice !== null) offers.push({ offerName: lines[0], description: 'Päevapraad', price: mainPrice })
  if (soupPrice !== null) offers.push({ offerName: lines[1], description: 'Päevasupp', price: soupPrice })
  return offers
}
