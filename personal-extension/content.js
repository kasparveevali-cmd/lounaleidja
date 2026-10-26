const PERSONAL_FEED_KEY = 'lounaleidja-personal-feed-v1'
const PROVIDER_HOSTS = new Set([
  'paevapraad.ee',
  'www.paevapraad.ee',
  'xn--pevapakkumised-5hb.ee',
  'www.xn--pevapakkumised-5hb.ee',
])

function compact(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function normalize(value) {
  return compact(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function normalizeRestaurant(value) {
  const genericWords = new Set(['restoran', 'resto', 'kohvik', 'cafe', 'bistroo', 'bistro'])
  return normalize(value)
    .split(' ')
    .filter((word) => word && !genericWords.has(word))
    .join(' ')
}

function stableSlug(value) {
  return normalize(value).replace(/\s+/g, '-') || 'tundmatu'
}

function tallinnDateParts() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Tallinn',
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(new Date())
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  )
  return {
    iso: `${parts.year}-${parts.month}-${parts.day}`,
    short: `${Number(parts.day)}.${parts.month}`,
    day: Number(parts.day),
    month: Number(parts.month),
    isWeekday: !['Sat', 'Sun'].includes(parts.weekday),
  }
}

function parsePriceLabel(value) {
  const label = compact(value)
  const values = [...label.matchAll(/\d+(?:[.,]\d{1,2})?/g)]
    .map((match) => Number(match[0].replace(',', '.')))
    .filter((price) => Number.isFinite(price) && price >= 0)
  if (!values.length) return null
  return {
    price: Math.min(...values),
    description: values.length > 1 ? `Hinnad: ${label}` : null,
  }
}

function parseTimeRange(value) {
  const match = compact(value).match(/(\d{1,2})[.:](\d{2})\s*[–-]\s*(\d{1,2})[.:](\d{2})/)
  if (!match) return { start: null, end: null }
  return {
    start: `${match[1].padStart(2, '0')}:${match[2]}`,
    end: `${match[3].padStart(2, '0')}:${match[4]}`,
  }
}

function parseMapLocation(anchor) {
  const href = anchor?.getAttribute('href') ?? ''
  const match = href.match(/\/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/)
  if (!match) return null
  const latitude = Number(match[1])
  const longitude = Number(match[2])
  if (latitude < 57 || latitude > 60 || longitude < 21 || longitude > 29) return null
  return {
    address: compact(anchor.getAttribute('title')),
    latitude,
    longitude,
  }
}

function absoluteProviderUrl(value, base) {
  try {
    const url = new URL(value, base)
    return url.protocol === 'https:' && PROVIDER_HOSTS.has(url.hostname) ? url.href : null
  } catch {
    return null
  }
}

function parsePaevapakkumised(html, fetchedAt, date) {
  const document = new DOMParser().parseFromString(html, 'text/html')
  const publishedDate = compact(document.querySelector('.header > h1 .headerDate')?.textContent)
  if (!publishedDate.includes(date.short)) {
    throw new Error(`Päevapakkumised.ee kuupäev ei ole tänane (${publishedDate || 'puudub'})`)
  }

  const offers = []
  const locations = new Map()
  const cards = [...document.querySelectorAll('#offers > .meal.sortable.animated[id]')]
  for (const card of cards) {
    const name = compact(card.querySelector('.dinerInfo h3 > a')?.textContent)
    const sourceUrl = absoluteProviderUrl(
      card.querySelector('.dinerInfo h3 > a')?.getAttribute('href'),
      'https://www.xn--pevapakkumised-5hb.ee/tallinn',
    )
    const mapAnchor = card.querySelector('.dinerButtons > a:has(.icon-location)')
    const location = parseMapLocation(mapAnchor)
    if (!name || !sourceUrl || !location?.address) continue
    locations.set(normalizeRestaurant(name), { ...location, name })
    const time = parseTimeRange(card.querySelector('.dinerButtons .icon-clock .buttonNote')?.textContent)

    for (const row of card.querySelectorAll('.mealInfo > .offer')) {
      const languageRow = row.querySelector('.lang-et') ?? row
      const priceNodes = [...languageRow.querySelectorAll('strong')]
      let priceLabel = compact(priceNodes.map((node) => node.textContent).join(' / '))
      if (!priceLabel && /€|\bEUR\b/i.test(languageRow.textContent ?? '')) {
        priceLabel = compact(languageRow.textContent)
      }
      const parsedPrice = parsePriceLabel(priceLabel)
      const clone = languageRow.cloneNode(true)
      clone.querySelectorAll('strong, img').forEach((node) => node.remove())
      const offerName = compact(clone.textContent).replace(/[–-]\s*$/, '').trim()
      if (!offerName || !parsedPrice) continue
      offers.push({
        restaurantId: `personal-${stableSlug(name)}`,
        restaurantName: name,
        address: location.address,
        latitude: location.latitude,
        longitude: location.longitude,
        offerName,
        description: parsedPrice.description,
        price: parsedPrice.price,
        currency: 'EUR',
        offerDate: date.iso,
        lunchStartTime: time.start,
        lunchEndTime: time.end,
        sourceName: 'Päevapakkumised.ee (isiklik)',
        sourceUrl,
        fetchedAt,
        verificationStatus: 'verified',
      })
    }
  }
  return { offers, locations, restaurantCount: cards.length }
}

async function officialLocations() {
  try {
    const basePath = location.hostname === 'kasparveevali-cmd.github.io' ? '/lounaleidja/' : '/'
    const response = await fetch(`${location.origin}${basePath}data/offers.json`, { cache: 'no-store' })
    if (!response.ok) return new Map()
    const data = await response.json()
    const result = new Map()
    for (const offer of Array.isArray(data?.offers) ? data.offers : []) {
      if (
        typeof offer?.restaurantName === 'string' &&
        typeof offer?.address === 'string' &&
        Number.isFinite(offer?.latitude) &&
        Number.isFinite(offer?.longitude)
      ) {
        result.set(normalizeRestaurant(offer.restaurantName), {
          name: offer.restaurantName,
          address: offer.address,
          latitude: offer.latitude,
          longitude: offer.longitude,
        })
      }
    }
    return result
  } catch {
    return new Map()
  }
}

function parsePaevapraad(html, fetchedAt, date, locations) {
  const document = new DOMParser().parseFromString(html, 'text/html')
  const publishedDate = compact(document.querySelector('span.datum > span')?.textContent).toLowerCase()
  const months = ['jaanuar', 'veebruar', 'märts', 'aprill', 'mai', 'juuni', 'juuli', 'august', 'september', 'oktoober', 'november', 'detsember']
  if (!publishedDate.includes(`${date.day}. ${months[date.month - 1]}`)) {
    throw new Error(`Päevapraad.ee kuupäev ei ole tänane (${publishedDate || 'puudub'})`)
  }

  const offers = []
  let matchedRestaurants = 0
  let skippedRestaurants = 0
  const cards = [...document.querySelectorAll('div.diner[i][data-name][href]')]
  for (const card of cards) {
    const rows = [...card.querySelectorAll(':scope > .diner-list .menu > .row.full-view')]
    if (!rows.length) continue
    const name = compact(card.getAttribute('data-name'))
    const sourceUrl = absoluteProviderUrl(card.getAttribute('href'), 'https://www.paevapraad.ee/tallinn/')
    const matchedLocation = locations.get(normalizeRestaurant(name))
    if (!name || !sourceUrl || !matchedLocation) {
      skippedRestaurants += 1
      continue
    }
    matchedRestaurants += 1
    const ownAddress = compact(
      [...card.querySelectorAll('.diner-list .socials a')]
        .find((anchor) => anchor.querySelector('img[src*="icon_location"]'))?.textContent,
    )
    const address = ownAddress && !/asukoht kaardil/i.test(ownAddress)
      ? ownAddress
      : matchedLocation.address
    const time = parseTimeRange(card.querySelector(':scope > .diner-list .he .lunchtime')?.textContent)

    for (const row of rows) {
      const offerName = compact(row.querySelector('.food > span:first-child')?.textContent)
      let priceLabel = compact(row.querySelector('.price')?.textContent)
      if (!priceLabel && /€|\bEUR\b/i.test(row.textContent ?? '')) priceLabel = compact(row.textContent)
      const parsedPrice = parsePriceLabel(priceLabel)
      if (!offerName || !parsedPrice) continue
      offers.push({
        restaurantId: `personal-${stableSlug(name)}`,
        restaurantName: name,
        address,
        latitude: matchedLocation.latitude,
        longitude: matchedLocation.longitude,
        offerName,
        description: parsedPrice.description,
        price: parsedPrice.price,
        currency: 'EUR',
        offerDate: date.iso,
        lunchStartTime: time.start,
        lunchEndTime: time.end,
        sourceName: 'Päevapraad.ee (isiklik)',
        sourceUrl,
        fetchedAt,
        verificationStatus: 'verified',
      })
    }
  }
  return { offers, matchedRestaurants, skippedRestaurants }
}

function deduplicate(offers) {
  const seen = new Set()
  return offers.filter((offer) => {
    const key = [
      offer.sourceName,
      offer.restaurantId,
      normalize(offer.offerName),
      offer.price.toFixed(2),
      offer.offerDate,
    ].join('|')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

async function buildBundle(raw) {
  const date = tallinnDateParts()
  if (!date.isWeekday) throw new Error('Isiklikud koondallikad kuvatakse tööpäeviti')
  const paevapakkumised = parsePaevapakkumised(raw.paevapakkumised, raw.fetchedAt, date)
  const locations = new Map([...paevapakkumised.locations, ...await officialLocations()])
  const paevapraad = parsePaevapraad(raw.paevapraad, raw.fetchedAt, date, locations)
  return {
    schemaVersion: 1,
    generatedAt: raw.fetchedAt,
    timezone: 'Europe/Tallinn',
    offers: deduplicate([...paevapakkumised.offers, ...paevapraad.offers]),
    sources: [
      {
        id: 'paevapakkumised',
        name: 'Päevapakkumised.ee isiklik brauserivoog',
        url: 'https://www.xn--pevapakkumised-5hb.ee/tallinn',
        status: 'active',
        message: `${paevapakkumised.restaurantCount} Tallinna söögikoha pakkumised laaditi ainult sinu brauserisse.`,
        lastSuccessAt: raw.fetchedAt,
      },
      {
        id: 'paevapraad',
        name: 'Päevapraad.ee isiklik brauserivoog',
        url: 'https://www.paevapraad.ee/tallinn/',
        status: 'active',
        message: `${paevapraad.matchedRestaurants} söögikohta seoti kontrollitud asukohaga; ${paevapraad.skippedRestaurants} asukohata kohta jäeti kaardilt välja.`,
        lastSuccessAt: raw.fetchedAt,
      },
    ],
    errors: [],
  }
}

async function refresh(force = false) {
  document.documentElement.dataset.lounaleidjaPersonalFeed = 'loading'
  const response = await chrome.runtime.sendMessage({
    type: 'LOUNALEIDJA_FETCH_PERSONAL_SOURCES',
    force,
  })
  if (!response?.ok) throw new Error(response?.error || 'Isiklike allikate laadimine ebaõnnestus')
  const bundle = await buildBundle(response.result)
  localStorage.setItem(PERSONAL_FEED_KEY, JSON.stringify(bundle))
  document.documentElement.dataset.lounaleidjaPersonalFeed = 'ready'
  document.dispatchEvent(new CustomEvent('lounaleidja:personal-feed-updated'))
}

document.documentElement.dataset.lounaleidjaPersonalExtension = 'ready'
document.dispatchEvent(new CustomEvent('lounaleidja:personal-extension-ready'))
document.addEventListener('lounaleidja:personal-feed-refresh-request', () => {
  refresh(true).catch((error) => {
    document.documentElement.dataset.lounaleidjaPersonalFeed = 'error'
    document.documentElement.dataset.lounaleidjaPersonalError = error instanceof Error ? error.message : 'Uuendamine ebaõnnestus'
    document.dispatchEvent(new CustomEvent('lounaleidja:personal-feed-updated'))
  })
})

refresh(false).catch((error) => {
  document.documentElement.dataset.lounaleidjaPersonalFeed = 'error'
  document.documentElement.dataset.lounaleidjaPersonalError = error instanceof Error ? error.message : 'Laadimine ebaõnnestus'
  document.dispatchEvent(new CustomEvent('lounaleidja:personal-feed-updated'))
})
