import { describe, expect, it } from 'vitest'
import { parsePartnerFeed, partnerSourceId } from './partner-feed'

const validFeed = {
  schemaVersion: 1,
  generatedAt: '2026-10-26T07:00:00.000Z',
  timezone: 'Europe/Tallinn',
  items: [
    {
      provider: 'paevapakkumised',
      externalRestaurantId: 'restoran-platz',
      restaurantName: 'Restoran Platz',
      address: 'Roseni 7, Tallinn',
      latitude: 59.438595,
      longitude: 24.755465,
      sourceUrl: 'https://www.xn--pevapakkumised-5hb.ee/tallinn/restoran-platz',
      offerDate: '2026-10-26',
      lunchStartTime: '11:30',
      lunchEndTime: '15:00',
      fetchedAt: '2026-10-26T07:00:00.000Z',
      offers: [
        {
          name: 'Kreemine pasta kanaga',
          description: null,
          price: 8.9,
          currency: 'EUR',
        },
      ],
    },
  ],
}

describe('parsePartnerFeed', () => {
  it('normaliseerib litsentsitud voo tänaseks Lõunaleidja andmemudeliks', () => {
    const offers = parsePartnerFeed(validFeed, '2026-10-26')
    expect(offers).toHaveLength(1)
    expect(offers[0]).toMatchObject({
      restaurantId: 'partner-paevapakkumised-restoran-platz',
      restaurantName: 'Restoran Platz',
      offerName: 'Kreemine pasta kanaga',
      price: 8.9,
      verificationStatus: 'verified',
    })
    expect(partnerSourceId(offers[0])).toBe('paevapakkumised')
  })

  it('ei lase eilset menüüd tänaste pakkumiste hulka', () => {
    expect(parsePartnerFeed(validFeed, '2026-10-27')).toEqual([])
  })

  it('lükkab tagasi vale pakkuja, domeeni, koordinaadid ja hinna', () => {
    const item = validFeed.items[0]
    for (const changed of [
      { provider: 'muu' },
      { sourceUrl: 'https://example.com/menu' },
      { latitude: 0 },
      { offers: [{ ...item.offers[0], price: 0 }] },
    ]) {
      expect(() => parsePartnerFeed({ ...validFeed, items: [{ ...item, ...changed }] }, '2026-10-26')).toThrow()
    }
  })
})
