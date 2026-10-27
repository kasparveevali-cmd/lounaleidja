import { describe, expect, it } from 'vitest'
import type { LunchOffer, OffersBundle } from '../types'
import { mergeAggregatorFeed, parseAggregatorFeed, parseAggregatorFeedJson } from './personal-feed'

const today = '2026-10-26'

function rawOffer(overrides: Record<string, unknown> = {}) {
  return {
    restaurantId: 'mõnus-resto',
    restaurantName: 'Mõnus Resto',
    address: 'Tartu mnt 1, Tallinn',
    latitude: 59.432,
    longitude: 24.761,
    offerName: 'Kana ja riis',
    description: null,
    price: 7.5,
    currency: 'EUR',
    offerDate: today,
    lunchStartTime: '11:00',
    lunchEndTime: '15:00',
    sourceName: 'Seda välja ei usaldata',
    sourceUrl: 'https://www.paevapraad.ee/tallinn/monus-resto/',
    fetchedAt: '2026-10-26T08:00:00+02:00',
    verificationStatus: 'verified',
    ...overrides,
  }
}

function rawFeed(offers: unknown[]) {
  return {
    schemaVersion: 1,
    generatedAt: '2026-10-26T08:05:00+02:00',
    timezone: 'Europe/Tallinn',
    offers,
  }
}

describe('parseAggregatorFeed', () => {
  it('lubab ainult tänased pakkumised ja määrab allika URL-i järgi', () => {
    const result = parseAggregatorFeed(
      rawFeed([
        rawOffer(),
        rawOffer({ offerDate: '2026-10-25', offerName: 'Eilne roog' }),
      ]),
      today,
    )

    expect(result.offers).toHaveLength(1)
    expect(result.offers[0]).toMatchObject({
      restaurantId: 'personal-monus-tartu-mnt-1-tallinn',
      sourceName: 'Päevapraad.ee',
      offerDate: today,
    })
    expect(result.generatedAt).toBe('2026-10-26T06:05:00.000Z')
  })

  it('keeldub võõrast hostist ja vigastest koordinaatidest', () => {
    expect(() => parseAggregatorFeed(rawFeed([rawOffer({ sourceUrl: 'https://example.com/menu' })]), today))
      .toThrow(/Päevapraad\.ee või Päevapakkumised\.ee/)
    expect(() => parseAggregatorFeed(rawFeed([rawOffer({ latitude: 0 })]), today))
      .toThrow(/Eesti piires/)
  })

  it('annab vigase JSON-i kohta arusaadava vea', () => {
    expect(() => parseAggregatorFeedJson('{katki', today)).toThrow('korrektset JSON-i')
  })

  it('lubab allikas selgelt märgitud tasuta pakkumise', () => {
    const result = parseAggregatorFeed(rawFeed([rawOffer({ price: 0, offerName: 'Tasuta vesi' })]), today)
    expect(result.offers[0].price).toBe(0)
  })

  it('annab kahe koondallika samale söögikohale ühise tunnuse', () => {
    const result = parseAggregatorFeed(
      rawFeed([
        rawOffer(),
        rawOffer({
          restaurantName: 'Mõnus kohvik',
          offerName: 'Kalapraad',
          sourceUrl: 'https://www.xn--pevapakkumised-5hb.ee/monus-kohvik',
        }),
      ]),
      today,
    )

    expect(result.offers).toHaveLength(2)
    expect(new Set(result.offers.map((offer) => offer.restaurantId))).toEqual(
      new Set(['personal-monus-tartu-mnt-1-tallinn']),
    )
  })
})

describe('mergeAggregatorFeed', () => {
  it('eelistab kattuva pakkumise puhul ametlikku kirjet ja aktiveerib koondallika', () => {
    const officialOffer: LunchOffer = {
      ...rawOffer(),
      restaurantId: 'official-monus',
      restaurantName: 'MÕNUS RESTO',
      address: 'Tartu mnt. 1, Tallinn',
      sourceName: 'Restorani ametlik leht',
      sourceUrl: 'https://restaurant.example/menu',
    } as LunchOffer
    const official: OffersBundle = {
      generatedAt: '2026-10-26T05:00:00.000Z',
      timezone: 'Europe/Tallinn',
      offers: [officialOffer],
      sources: [{
        id: 'paevapraad',
        name: 'Päevapraad.ee',
        url: 'https://www.paevapraad.ee/lahendused/',
        status: 'permission-required',
        message: 'Vajab luba.',
        lastSuccessAt: null,
      }],
      errors: [],
    }
    const aggregator = parseAggregatorFeed(
      rawFeed([
        rawOffer({ restaurantName: 'Mõnus resto' }),
        rawOffer({ restaurantName: 'Mõnus resto', offerName: 'Kana ja riis (G,L,P)' }),
        rawOffer({ offerName: 'Kalapraad', price: 8.5 }),
      ]),
      today,
    )

    const result = mergeAggregatorFeed(official, aggregator)

    expect(result.offers).toHaveLength(2)
    expect(result.offers[0]).toBe(officialOffer)
    expect(result.offers[1]).toMatchObject({ offerName: 'Kalapraad', restaurantId: 'official-monus' })
    expect(result.sources).toEqual([
      expect.objectContaining({
        id: 'paevapraad',
        status: 'active',
        name: 'Päevapraad.ee',
        message: '2 tänast pakkumist keskse andmevoo kaudu.',
      }),
    ])
  })
})
