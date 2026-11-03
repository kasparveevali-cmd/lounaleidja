import { describe, expect, it } from 'vitest'
import {
  POKE_BOWL_TALLINN_LOCATIONS,
  parsePokeBowlLunchHtml,
  parseTokumaruLunchHtml,
} from './extra-sources-a'

function pokeFixture(modified = '2026-11-01T19:31:01+02:00') {
  return `
    <meta property="article:modified_time" content="${modified}">
    <div class="vc_row"><div><div><div><div>
      <h2>Selle nädala lõunapakkumised</h2>
    </div></div></div></div></div>
    <div class="vc_row">
      <div class="wpb_column vc_col-sm-1/5"><h3>Esmaspäev</h3><h4>BBQ veiseliha wrap</h4><span class="eltdf-pli-price">6.5 €</span></div>
      <div class="wpb_column vc_col-sm-1/5"><h3>Teisipäev</h3><h4>Teriyaki riisikauss Korea tempeh’ga</h4><span class="eltdf-pli-price">7.9 €</span></div>
      <div class="wpb_column vc_col-sm-1/5"><h3>Kolmapäev</h3><h4>Tom Kha supp krevetiga</h4><span class="eltdf-pli-price">6.9 €</span></div>
      <div class="wpb_column vc_col-sm-1/5"><h3>Neljapäev</h3><h4>SUPER Lõhekauss</h4><span class="eltdf-pli-price">11.9 €</span></div>
      <div class="wpb_column vc_col-sm-1/5"><h3>Reede</h3><h4>Teriyaki munanuudlikauss kanaga</h4><span class="eltdf-pli-price">7.5 €</span></div>
    </div>
  `
}

describe('parsePokeBowlLunchHtml', () => {
  it('valib tänase nädalapäeva pakkumise, mis kehtib kõigis viies Tallinna asukohas', () => {
    const parsed = parsePokeBowlLunchHtml(pokeFixture(), '2026-11-03')
    expect(POKE_BOWL_TALLINN_LOCATIONS).toHaveLength(5)
    expect(parsed).toEqual({
      lunchStartTime: '11:00',
      lunchEndTime: '14:00',
      offers: [{
        offerName: 'Teriyaki riisikauss Korea tempeh’ga',
        description: null,
        price: 7.9,
      }],
    })
  })

  it('ei näita vana nädala menüüd, kui lehe muutmise kuupäev on teise nädala oma', () => {
    expect(parsePokeBowlLunchHtml(pokeFixture('2026-10-20T10:00:00+03:00'), '2026-11-03').offers)
      .toEqual([])
  })

  it('ei näita tööpäevamenüüd nädalavahetusel', () => {
    expect(parsePokeBowlLunchHtml(pokeFixture(), '2026-11-07').offers).toEqual([])
  })
})

const tokumaruBaltiFixture = `
  <main><div class="sqs-html-content">
    <h2>LÕUNAPAKKUMISED</h2><p>Saadaval E–R 11–15</p>
    <h2>Iga päev</h2>
    <h3><strong>MISOSUPP + ONIGIRI</strong> 7,90 €</h3>
    <p><strong>Misosupp lõhe või tofuga</strong></p><p><strong>+</strong></p>
    <p><strong>Onigiri-riisipall sööja valikul</strong></p>
    <h3><strong>PÄEVA-<em>DON</em></strong> 8,90 €</h3><p>Uuenenud retseptid!</p>
    <h2>ESMASPÄEV</h2><p><strong>Krõbekana<em>-don</em></strong> (l)</p><p>Kana ja salatiga</p>
    <h2>TEISIPÄEV</h2>
    <p><strong>Vürtsikas<em>-</em>lõhe-<em>don</em></strong> (l)</p>
    <p>Riisikauss värske lõhe-avokaadotartari ja värske salatiga</p>
    <p><strong>Kookosene <em>shimeji-</em>köögivilja-don</strong> (v)</p>
    <p>Riisikauss köögiviljade, seente ja kookoskastmega</p>
    <h2>KOLMAPÄEV</h2><p><strong>Tonkatsu-don</strong></p><p>Seasisefileega</p>
  </div></main>
`

describe('parseTokumaruLunchHtml', () => {
  it('liidab iga päeva kombo ja tänase päeva don-pakkumised', () => {
    const parsed = parseTokumaruLunchHtml(tokumaruBaltiFixture, '2026-11-03')
    expect(parsed).toMatchObject({ lunchStartTime: '11:00', lunchEndTime: '15:00' })
    expect(parsed.offers).toEqual([
      {
        offerName: 'MISOSUPP + ONIGIRI',
        description: 'Misosupp lõhe või tofuga + Onigiri-riisipall sööja valikul',
        price: 7.9,
      },
      {
        offerName: 'Vürtsikas-lõhe-don',
        description: 'Riisikauss värske lõhe-avokaadotartari ja värske salatiga',
        price: 8.9,
      },
      {
        offerName: 'Kookosene shimeji-köögivilja-don',
        description: 'Riisikauss köögiviljade, seente ja kookoskastmega',
        price: 8.9,
      },
    ])
  })

  it('töötab ka Solarise ja T1 mitme iga-päev-kombo variandiga', () => {
    const parsed = parseTokumaruLunchHtml(`
      <main><div class="sqs-html-content">
        <h2>LÕUNAPAKKUMISED</h2><p>Saadaval E-R 11.00-15.00</p><h2>Iga päev</h2>
        <h3><strong>RAMEN ja GYOZA</strong> 9,90 €</h3><p>Ramen ja viis gyoza't</p>
        <h3><strong>RAMEN+SUSHI</strong> 10,40 €</h3><p>Ramen ja päevamaki</p>
        <h3><strong>RAMEN+SUSHI+GYOZA</strong> 13,80 €</h3><p>Kõik kolm</p>
        <h3><strong>PÄEVA-DON</strong> 9,60 €</h3>
        <h2>Esmaspäev</h2><p><strong>Krõbekana-don</strong></p><p>Kana ja salatiga</p>
        <h2>Teisipäev</h2><p><strong>Lõhe-don</strong></p><p>Lõhe ja avokaadoga</p>
      </div></main>
    `, '2026-11-02')
    expect(parsed.offers.map(({ offerName, price }) => ({ offerName, price }))).toEqual([
      { offerName: 'RAMEN ja GYOZA', price: 9.9 },
      { offerName: 'RAMEN+SUSHI', price: 10.4 },
      { offerName: 'RAMEN+SUSHI+GYOZA', price: 13.8 },
      { offerName: 'Krõbekana-don', price: 9.6 },
    ])
  })

  it('leiab päeva ka siis, kui Squarespace jagab menüü mitme sisuploki vahel', () => {
    const parsed = parseTokumaruLunchHtml(`
      <main>
        <div class="sqs-html-content">
          <h2>LÕUNAPAKKUMISED</h2><p>Saadaval E–R 11–15</p><h2>Iga päev</h2>
          <h3><strong>MISOSUPP + ONIGIRI</strong> 7,90 €</h3><p>Supp ja riisipall</p>
          <h3><strong>PÄEVA-DON</strong> 8,90 €</h3>
          <h2>Kolmapäev</h2><p><strong>Tonkatsu-don</strong></p><p>Sealihaga</p>
        </div>
        <div class="sqs-html-content">
          <h2>Neljapäev</h2><p><strong>Pankokreveti-don</strong></p><p>Hiidkrevettidega</p>
          <h2>Reede</h2><p><strong>Choregi-kana-don</strong></p><p>Kanaga</p>
        </div>
      </main>
    `, '2026-11-05')
    expect(parsed.offers.at(-1)).toEqual({
      offerName: 'Pankokreveti-don',
      description: 'Hiidkrevettidega',
      price: 8.9,
    })
  })
})
