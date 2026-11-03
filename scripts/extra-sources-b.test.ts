import { describe, expect, it } from 'vitest'
import {
  parseAlfredHtml,
  parseAlleeHtml,
  parseOmHouseHtml,
  parseScotlandYardHtml,
  parseSushiArtHtml,
} from './extra-sources-b'

describe('parseAlfredHtml', () => {
  it('valib täpse kuupäeva road ja hinnad', () => {
    const parsed = parseAlfredHtml(`
      <dl class="dishes">
        <div data-row-main><dd>6,50 €</dd></div><div data-row-soup><dd>3,90 €</dd></div>
        <div data-row-combo><dd>9,50 €</dd></div>
      </dl>
      <ol data-week><li data-date="2026-11-03" data-has-offer="1" data-main="Kalapraad" data-soup="Borš"></li></ol>
    `, '2026-11-03')
    expect(parsed).toEqual([
      { offerName: 'Kalapraad', description: 'Päevapraad', price: 6.5 },
      { offerName: 'Borš', description: 'Päevasupp', price: 3.9 },
      { offerName: 'Praad ja supp', description: 'Kalapraad · Borš', price: 9.5 },
    ])
  })
})

describe('parseScotlandYardHtml', () => {
  it('kontrollib nädalat ning valib päeva prae ja supi', () => {
    const parsed = parseScotlandYardHtml(`
      <div class="facts"><span>Päevapraad 8,50 €</span><span>Supp 5,90 €</span><span>Nädalapraad 9,90 €</span></div>
      <div><h2>Selle nädala lõunad, 2.–6. november</h2><div class="sywk">
        <div class="mrow"><b>E</b><p>Esmaspäeva praad</p></div>
        <div class="mrow"><b>T</b><p>Teisipäeva praad</p></div>
        <div class="mfull"><b>Supp</b> E–T kanasupp, K–R borš</div>
        <div class="mfull"><b>Nädalapraad</b> Kanaburger friikartulitega</div>
      </div></div>
    `, '2026-11-03')
    expect(parsed).toEqual([
      { offerName: 'Teisipäeva praad', description: 'Päevapraad', price: 8.5 },
      { offerName: 'kanasupp', description: 'Päevasupp', price: 5.9 },
      { offerName: 'Kanaburger friikartulitega', description: 'Nädalapraad', price: 9.9 },
    ])
  })

  it('ei avalda vale nädala menüüd', () => {
    expect(parseScotlandYardHtml('<h2>Selle nädala lõunad, 2.–6. november</h2>', '2026-11-10')).toEqual([])
  })

  it('tunneb ära üle kuu piiri ulatuva nädala', () => {
    const parsed = parseScotlandYardHtml(`
      <div class="facts"><span>Päevapraad 8,50 €</span></div>
      <div><h2>Selle nädala lõunad, 30. november–4. detsember</h2><div class="sywk">
        <div class="mrow"><b>T</b><p>Detsembri teisipäeva praad</p></div>
      </div></div>
    `, '2026-12-01')
    expect(parsed).toEqual([
      { offerName: 'Detsembri teisipäeva praad', description: 'Päevapraad', price: 8.5 },
    ])
  })
})

describe('parseOmHouseHtml', () => {
  it('liidab tänase menüü ja argipäevase poke-bari', () => {
    const item = (name: string, price: string) => `<div class="lunch-item"><h4 class="lunch-item-title">${name}</h4><div class="lunch-item-price">${price}</div><p class="lunch-item-description"></p></div>`
    const parsed = parseOmHouseHtml(`
      <div class="lunch-time-group"><h3 class="lunch-time-title">TEISIPÄEV 12:00–15:00</h3>${item('Kanapasta', '8.4 €')}</div>
      <div class="lunch-time-group"><h3 class="lunch-time-title">Poke bar E-R 12:00–15:00</h3>${item('Poke bowl kanaga', '11 €')}</div>
    `, '2026-11-03')
    expect(parsed.map((offer) => offer.offerName)).toEqual(['Kanapasta', 'Poke bowl kanaga'])
  })
})

describe('parseSushiArtHtml', () => {
  it('valib tänase vahelehe road', () => {
    const parsed = parseSushiArtHtml(`
      <div class="elementor-tabs-wrapper"><button class="elementor-tab-title" aria-controls="tuesday">Teisipäev</button></div>
      <div id="tuesday"><p><strong>Sensei 7.90€</strong><br>(lõhe, kurk)</p><p><strong>Donburi lõhega 8.90€</strong></p></div>
    `, '2026-11-03')
    expect(parsed).toEqual([
      { offerName: 'Sensei', description: 'lõhe, kurk', price: 7.9 },
      { offerName: 'Donburi lõhega', description: null, price: 8.9 },
    ])
  })
})

describe('parseAlleeHtml', () => {
  it('kasutab ainult kuupäevaga rida', () => {
    const parsed = parseAlleeHtml(`
      <div class="menu-item" data-seo="lounapakkumised"><div class="hCont">Teisipäev 03.11<br><em>Seapraad<br>Hapuoblikasupp</em></div></div>
      <p class="groupDesc" data-seo="lounapakkumised">Päevapraad 8.50 €<br>Päevasupp 4.50 €</p>
    `, '2026-11-03')
    expect(parsed).toEqual([
      { offerName: 'Seapraad', description: 'Päevapraad', price: 8.5 },
      { offerName: 'Hapuoblikasupp', description: 'Päevasupp', price: 4.5 },
    ])
  })
})
