import { describe, expect, it } from 'vitest'
import type { OffersBundle } from '../src/types'
import {
  buildPersonalOffersBundle,
  parsePaevapakkumisedHtml,
  parsePaevapraadHtml,
  tallinnDate,
} from './personal-aggregators'

const emptyOfficial: OffersBundle = {
  generatedAt: '2026-10-26T07:00:00.000Z',
  timezone: 'Europe/Tallinn',
  offers: [],
  sources: [],
  errors: [],
}

describe('isiklikud koondlehed', () => {
  it('arvutab kuupäeva Europe/Tallinn ajavööndis', () => {
    expect(tallinnDate(new Date('2026-10-25T22:30:00.000Z'))).toBe('2026-10-26')
  })

  it('loeb Päevapakkumised.ee eestikeelse kirje, koordinaadid ja tasuta pakkumise', () => {
    const parsed = parsePaevapakkumisedHtml(`
      <div class="header"><h1><span class="headerDate">Esmaspäeval, 26.10</span></h1></div>
      <div id="offers">
        <article class="meal sortable animated" id="restoran-platz">
          <div class="dinerInfo"><h3><a href="/restoran/platz">Restoran Platz</a></h3></div>
          <div class="dinerTags"><span class="district">Kesklinn</span></div>
          <div class="dinerButtons">
            <a href="https://maps.example/place/@59.437,24.752,17z" title="Roseni 7, Tallinn"><i class="icon-location"></i></a>
            <span><i class="icon-clock"></i><span class="buttonNote">11.00–15.00</span></span>
          </div>
          <div class="mealInfo">
            <div class="offer"><span class="lang-et">Tasuta sünnipäevasupp <strong>0,00 €</strong></span><span class="lang-en">Free soup</span></div>
            <div class="offer"><span class="lang-et">Praad <strong>6,50 / 8,50 €</strong></span></div>
          </div>
        </article>
      </div>
    `, '2026-10-26')

    expect(parsed.restaurants).toHaveLength(1)
    expect(parsed.restaurants[0]).toMatchObject({
      restaurantName: 'Restoran Platz',
      address: 'Roseni 7, Tallinn',
      latitude: 59.437,
      longitude: 24.752,
      lunchStartTime: '11:00',
      lunchEndTime: '15:00',
    })
    expect(parsed.restaurants[0].offers).toEqual([
      { offerName: 'Tasuta sünnipäevasupp', description: null, price: 0 },
      { offerName: 'Praad', description: 'Hinnad algallikas: 6,50 / 8,50 €', price: 6.5 },
    ])
  })

  it('loeb ainult Päevapraad.ee täisvaate read ja jätab teadmata hinna vahele', () => {
    const parsed = parsePaevapraadHtml(`
      <span class="datum"><span>Esmaspäev, 26. oktoober</span></span>
      <div class="diner" i="42" data-name="Restoran Platz" href="/restoran/platz">
        <div class="diner-list">
          <div class="he"><span class="lunchtime">11:00 - 15:00</span></div>
          <div class="socials"><a><img src="icon_location.svg">Roseni 7, Tallinn</a></div>
          <div class="menu">
            <div class="row full-view"><div class="food"><span>Borš</span></div><div class="price">0,00 €</div></div>
            <div class="row full-view"><div class="food"><span>Kotlet</span></div><div class="price double">6,90 € / 8,90 €</div></div>
            <div class="row full-view"><div class="food"><span>Hind teadmata</span></div><div class="price"></div></div>
          </div>
        </div>
        <div class="card-view"><div class="row full-view"><div class="food"><span>Duplikaat</span></div><div class="price">9 €</div></div></div>
      </div>
    `, '2026-10-26')

    expect(parsed.skippedOffers).toBe(1)
    expect(parsed.restaurants[0].offers).toEqual([
      { offerName: 'Borš', description: null, price: 0 },
      { offerName: 'Kotlet', description: 'Hinnad algallikas: 6,90 € / 8,90 €', price: 6.9 },
    ])
  })

  it('sobitab Päevapraad.ee asukoha nime järgi ja raporteerib lahendamata koha', () => {
    const paevapakkumised = parsePaevapakkumisedHtml(`
      <div class="header"><h1><span class="headerDate">Esmaspäeval, 26.10</span></h1></div>
      <div id="offers">
        <article class="meal sortable animated" id="platz">
          <div class="dinerInfo"><h3><a href="/platz">Restoran Platz</a></h3></div>
          <div class="dinerButtons"><a href="https://maps.example/@59.437,24.752,17z" title="Roseni 7, Tallinn"><i class="icon-location"></i></a></div>
          <div class="mealInfo"><div class="offer"><span class="lang-et">Supp <strong>4 €</strong></span></div></div>
        </article>
      </div>
    `, '2026-10-26')
    const paevapraad = parsePaevapraadHtml(`
      <span class="datum"><span>Esmaspäev, 26. oktoober</span></span>
      <div class="diner" i="42" data-name="PLATZ" href="/platz"><div class="diner-list"><div class="menu"><div class="row full-view"><div class="food"><span>Praad</span></div><div class="price">7 €</div></div></div></div></div>
      <div class="diner" i="99" data-name="Tundmatu" href="/tundmatu"><div class="diner-list"><div class="menu"><div class="row full-view"><div class="food"><span>Praad</span></div><div class="price">8 €</div></div></div></div></div>
    `, '2026-10-26')

    const bundle = buildPersonalOffersBundle({
      paevapakkumised,
      paevapraad,
      official: emptyOfficial,
      offerDate: '2026-10-26',
      fetchedAt: '2026-10-26T07:00:00.000Z',
    })
    expect(bundle.schemaVersion).toBe(1)
    expect(bundle.offers).toHaveLength(2)
    expect(bundle.offers[1]).toMatchObject({ address: 'Roseni 7, Tallinn', price: 7 })
    expect(bundle.errors[0].message).toContain('1 Päevapraad.ee söögikoha 1 pakkumist')
  })

  it('lükkab vananenud lehe tagasi', () => {
    expect(() => parsePaevapraadHtml(
      '<span class="datum"><span>Pühapäev, 25. oktoober</span></span>',
      '2026-10-26',
    )).toThrow('ei ole tänane')
  })
})
