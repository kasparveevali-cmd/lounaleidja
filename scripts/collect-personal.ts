import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import robotsParser from 'robots-parser'
import type { OffersBundle } from '../src/types.ts'
import {
  buildPersonalOffersBundle,
  parsePaevapakkumisedHtml,
  parsePaevapraadHtml,
  tallinnDate,
  type ParsedPersonalPage,
  type PersonalAggregator,
} from './personal-aggregators.ts'

const defaultOutputPath = fileURLToPath(new URL('../personal-data/offers.json', import.meta.url))
const officialOffersPath = new URL('../public/data/offers.json', import.meta.url)
const userAgent = 'Lounaleidja aggregator collector/1.0 (daily lunch index)'
const targetPages = {
  paevapakkumised: 'https://www.xn--pevapakkumised-5hb.ee/tallinn',
  paevapraad: 'https://www.paevapraad.ee/tallinn/',
} as const

function outputPathFromArguments(arguments_: string[]) {
  if (arguments_.includes('--help') || arguments_.includes('-h')) {
    console.log('Kasutus: pnpm collect:personal -- [--output fail.json]')
    process.exit(0)
  }
  const outputIndex = arguments_.findIndex((argument) => argument === '--output' || argument === '-o')
  if (outputIndex === -1) return defaultOutputPath
  const value = arguments_[outputIndex + 1]
  if (!value || value.startsWith('-')) throw new Error('--output järel peab olema failitee')
  return resolve(value)
}

function assertSameFixedTarget(actualUrl: string, expectedUrl: string) {
  const actual = new URL(actualUrl)
  const expected = new URL(expectedUrl)
  const actualPath = actual.pathname.replace(/\/$/, '')
  const expectedPath = expected.pathname.replace(/\/$/, '')
  if (actual.protocol !== 'https:' || actual.hostname !== expected.hostname || actualPath !== expectedPath) {
    throw new Error(`${expectedUrl} suunas ootamatusse asukohta ${actualUrl}`)
  }
}

async function assertRobotsAllowed(url: string) {
  if (!Object.values(targetPages).includes(url as (typeof targetPages)[keyof typeof targetPages])) {
    throw new Error(`Koguja sihtleht ei ole lubatud nimekirjas: ${url}`)
  }
  const robotsUrl = new URL('/robots.txt', url).toString()
  const response = await fetch(robotsUrl, {
    headers: { 'User-Agent': userAgent },
    redirect: 'follow',
    signal: AbortSignal.timeout(15_000),
  })
  if (response.status === 404) return
  if (!response.ok) throw new Error(`${robotsUrl} vastas HTTP ${response.status}`)
  const finalRobotsUrl = new URL(response.url)
  const targetUrl = new URL(url)
  if (finalRobotsUrl.protocol !== 'https:' || finalRobotsUrl.hostname !== targetUrl.hostname) {
    throw new Error(`${robotsUrl} suunas ootamatusse asukohta ${response.url}`)
  }
  const robots = robotsParser(robotsUrl, await response.text())
  if (robots.isAllowed(url, userAgent) === false) {
    throw new Error(`${robotsUrl} ei luba lehte ${url} automatiseeritult lugeda`)
  }
}

async function fetchHtml(url: (typeof targetPages)[keyof typeof targetPages]) {
  await assertRobotsAllowed(url)
  const response = await fetch(url, {
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'et,en;q=0.8',
      'User-Agent': userAgent,
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) throw new Error(`${url} vastas HTTP ${response.status}`)
  assertSameFixedTarget(response.url, url)
  const html = await response.text()
  if (html.length > 5 * 1024 * 1024) throw new Error(`${url} vastus on ootamatult suur`)
  return html
}

function unavailablePage(provider: PersonalAggregator): ParsedPersonalPage {
  return {
    provider,
    dateLabel: '',
    restaurantCount: 0,
    restaurants: [],
    skippedOffers: 0,
  }
}

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return message.replace(/\s+/g, ' ').trim().slice(0, 500) || 'Tundmatu kogumisviga'
}

async function main() {
  const outputPath = outputPathFromArguments(process.argv.slice(2))
  const fetchedAt = new Date().toISOString()
  const offerDate = tallinnDate()
  const officialJson = await readFile(officialOffersPath, 'utf8')
  const official = JSON.parse(officialJson) as OffersBundle
  const [paevapakkumisedResult, paevapraadResult] = await Promise.allSettled([
    fetchHtml(targetPages.paevapakkumised).then((html) => (
      parsePaevapakkumisedHtml(html, offerDate)
    )),
    fetchHtml(targetPages.paevapraad).then((html) => (
      parsePaevapraadHtml(html, offerDate)
    )),
  ])
  const failures = new Map<PersonalAggregator, string>()
  const paevapakkumised = paevapakkumisedResult.status === 'fulfilled'
    ? paevapakkumisedResult.value
    : unavailablePage('paevapakkumised')
  const paevapraad = paevapraadResult.status === 'fulfilled'
    ? paevapraadResult.value
    : unavailablePage('paevapraad')
  if (paevapakkumisedResult.status === 'rejected') {
    failures.set('paevapakkumised', errorMessage(paevapakkumisedResult.reason))
  }
  if (paevapraadResult.status === 'rejected') {
    failures.set('paevapraad', errorMessage(paevapraadResult.reason))
  }
  const bundle = buildPersonalOffersBundle({
    paevapakkumised,
    paevapraad,
    official,
    offerDate,
    fetchedAt,
  })
  for (const source of bundle.sources) {
    const failure = failures.get(source.id as PersonalAggregator)
    if (!failure) continue
    source.status = 'unavailable'
    source.message = `Kogumine ebaõnnestus: ${failure}`
    source.lastSuccessAt = null
    bundle.errors.push({ sourceId: source.id, message: failure })
  }

  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(bundle, null, 2)}\n`, 'utf8')

  const providerCounts = new Map<string, number>()
  for (const offer of bundle.offers) {
    providerCounts.set(offer.sourceName, (providerCounts.get(offer.sourceName) ?? 0) + 1)
  }
  console.log(`Salvestatud ${bundle.offers.length} tänast pakkumist faili ${outputPath}`)
  for (const [provider, count] of providerCounts) console.log(`- ${provider}: ${count}`)
  for (const error of bundle.errors) console.warn(`- ${error.message}`)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
