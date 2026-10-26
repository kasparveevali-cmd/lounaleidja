const CACHE_KEY = 'lounaleidja-source-pages-v1'
const CACHE_MAX_AGE_MS = 60 * 60 * 1000
const FORCE_REFRESH_COOLDOWN_MS = 5 * 60 * 1000
const MAX_PAGE_BYTES = 5 * 1024 * 1024

const pages = {
  paevapraad: 'https://www.paevapraad.ee/tallinn/',
  paevapakkumised: 'https://www.xn--pevapakkumised-5hb.ee/tallinn',
}

function tallinnDate() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Tallinn',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(new Date())
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  )
  return `${parts.year}-${parts.month}-${parts.day}`
}

async function fetchPage(url) {
  const response = await fetch(url, {
    credentials: 'omit',
    redirect: 'follow',
    cache: 'no-store',
  })
  if (!response.ok) throw new Error(`${new URL(url).hostname} vastas HTTP ${response.status}`)
  if (!response.headers.get('content-type')?.toLowerCase().includes('text/html')) {
    throw new Error(`${new URL(url).hostname} ei tagastanud HTML-i`)
  }
  const html = await response.text()
  if (new TextEncoder().encode(html).byteLength > MAX_PAGE_BYTES) {
    throw new Error(`${new URL(url).hostname} vastus oli liiga suur`)
  }
  return html
}

async function loadPages(forceRefresh) {
  const now = Date.now()
  const today = tallinnDate()
  const stored = await chrome.storage.local.get(CACHE_KEY)
  const cached = stored[CACHE_KEY]
  const cacheAgeLimit = forceRefresh ? FORCE_REFRESH_COOLDOWN_MS : CACHE_MAX_AGE_MS
  if (
    cached?.date === today &&
    Number.isFinite(cached?.fetchedAtMs) &&
    now - cached.fetchedAtMs < cacheAgeLimit &&
    typeof cached?.paevapraad === 'string' &&
    typeof cached?.paevapakkumised === 'string'
  ) {
    return { ...cached, fromCache: true }
  }

  const [paevapraad, paevapakkumised] = await Promise.all([
    fetchPage(pages.paevapraad),
    fetchPage(pages.paevapakkumised),
  ])
  const next = {
    date: today,
    fetchedAt: new Date(now).toISOString(),
    fetchedAtMs: now,
    paevapraad,
    paevapakkumised,
  }
  await chrome.storage.local.set({ [CACHE_KEY]: next })
  return { ...next, fromCache: false }
}

function isAllowedSender(sender) {
  try {
    const url = new URL(sender.url ?? '')
    return (
      (url.hostname === 'kasparveevali-cmd.github.io' && url.pathname.startsWith('/lounaleidja/')) ||
      url.hostname === '127.0.0.1' ||
      url.hostname === 'localhost'
    )
  } catch {
    return false
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'LOUNALEIDJA_FETCH_PERSONAL_SOURCES' || !isAllowedSender(sender)) return false
  loadPages(message.force === true)
    .then((result) => sendResponse({ ok: true, result }))
    .catch((error) => sendResponse({
      ok: false,
      error: error instanceof Error ? error.message : 'Isiklike allikate laadimine ebaõnnestus',
    }))
  return true
})
