import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  parseAmpsHtml,
  parseArterHtml,
  parseKristiineMarkdown,
  parseProtoHtml,
  parseRevalHtml,
  parseUlemisteCityJson,
  parseVapianoHtml,
} from './parsers'

describe('parseKristiineMarkdown', () => {
  const markdown = `
### KFC
- Lunch time: Tööpäeviti 11.00-15.00
**Every day**
- Lõunapakkumine 1 sisaldab: burgerit ja jooki. Hind 5,95€

### Poke Bowl & MEZE
- Lunch time: E-R 11.00-14.00
**2026-10-26**
- Caesari kana wrap 6.9€ -> 5.9€
**2026-10-27**
- Korea kauss 10.40€ -> 8.9€

### Lido
- Lunch time: 12.00-15.00
**2026-10-26**
- Kanakotlet, tatar ja salat.
- Hind: 5.90€
`

  it('loeb kuupäevaga ja iga päev kehtivad pakkumised', () => {
    const menus = parseKristiineMarkdown(markdown, '2026-10-26')
    expect(menus).toHaveLength(3)
    expect(menus[0]).toMatchObject({ lunchStartTime: '11:00', lunchEndTime: '15:00' })
    expect(menus[0].offers[0]).toMatchObject({ offerName: 'Lõunapakkumine 1', price: 5.95 })
    expect(menus[1].offers[0]).toMatchObject({ offerName: 'Caesari kana wrap', price: 5.9 })
    expect(menus[1].offers[0].description).toContain('6,90')
    expect(menus[2].offers[0]).toMatchObject({ offerName: 'Lõunapakkumine', price: 5.9 })
  })
})

describe('parseRevalHtml', () => {
  it('loeb õige päeva read ja arvestab asukoha erandit', () => {
    const parsed = parseRevalHtml(`
      <p><strong>Päevapakkumised 26.10-30.10.2026</strong></p>
      <p><strong>Esmaspäeval 26.10</strong> (v.a Meremuuseumi kohvik)<br>
      Guljašš-supp 5€<br>Kanašnitsel riisiga 8.20€</p>
    `, '26.10')
    expect(parsed.excludesMeremuuseum).toBe(true)
    expect(parsed.offers).toEqual([
      { offerName: 'Guljašš-supp', description: null, price: 5 },
      { offerName: 'Kanašnitsel riisiga', description: null, price: 8.2 },
    ])
  })
})

describe('parseVapianoHtml', () => {
  it('valib ainult nähtava jooksva nädala', () => {
    const parsed = parseVapianoHtml(`
      <h2 class="elementor-heading-title">26.-30.10</h2>
      <section class="elementor-top-section">
        <h2 class="elementor-heading-title">Week 1 starts (HIDE)</h2>
        <section class="elementor-inner-section">
          <h2 class="elementor-heading-title">PASTA CARBONARA</h2>
          <h2 class="elementor-heading-title">8,50 €</h2>
          <div class="elementor-widget-text-editor"><p>Peekoni ja koorekastmega.</p></div>
        </section>
      </section>
      <section class="elementor-top-section elementor-hidden-desktop elementor-hidden-tablet elementor-hidden-mobile">
        <h2 class="elementor-heading-title">Week 2 starts (HIDE)</h2>
        <section class="elementor-inner-section">
          <h2 class="elementor-heading-title">VALE NÄDAL</h2>
          <h2 class="elementor-heading-title">9,50 €</h2>
        </section>
      </section>
    `, '2026-10-26')
    expect(parsed).toEqual([
      { offerName: 'PASTA CARBONARA', description: 'Peekoni ja koorekastmega.', price: 8.5 },
    ])
  })
})

describe('parseAmpsHtml', () => {
  it('ei sega asukohtade erinevaid menüüsid', () => {
    const parsed = parseAmpsHtml(`
      <div class="elementor-widget-text-editor">26.10.2026</div>
      <div class="elementor-widget-n-tabs">
        <div class="e-n-tabs">
          <button class="e-n-tab-title" aria-controls="jarve">Järve AMPS</button>
          <button class="e-n-tab-title" aria-controls="arena">Arena AMPS</button>
          <div id="jarve"><div class="elementor-widget-text-editor">Kotlet kanalihast 5,90 €</div></div>
          <div id="arena"><div class="elementor-widget-text-editor">Frikadellisupp 4.20<br>Kikerhernekarri 5.9o</div></div>
        </div>
      </div>
    `, '2026-10-26')
    expect(parsed.get('Järve AMPS')).toHaveLength(1)
    expect(parsed.get('Arena AMPS')).toEqual([
      { offerName: 'Frikadellisupp', description: null, price: 4.2 },
      { offerName: 'Kikerhernekarri', description: null, price: 5.9 },
    ])
  })
})

describe('parseProtoHtml', () => {
  it('eristab supi suurused ja buffet-hinna', () => {
    const parsed = parseProtoHtml(`
      <p><strong>Esmaspäev 26.10</strong></p>
      <p>Lihapallisupp (L) 3.50 € / 5.50 €</p>
      <p><strong>Lõunabufee 1.85 € / 100 g</strong><br>Ahjulõhe<br>Ahjukartulid</p>
    `, '26.10')
    expect(parsed.map((offer) => offer.price)).toEqual([3.5, 5.5, 1.85])
    expect(parsed[2].description).toBe('Ahjulõhe · Ahjukartulid')
  })
})

describe('parseArterHtml', () => {
  const html = `
    <section class="daily-offers-section2">
      <div class="title-bdr"><h2>26.10 — 01.11.2026</h2></div>
      <div class="items">
        <h3>Bistroo Arter</h3>
        <div class="daily-offers-s2-content-info">
          <div class="row align-items-center">
            <div><h4><strong>E</strong></h4></div>
            <div class="col-md-11"><p>Eilne praad 7,50</p></div>
          </div>
          <div class="row align-items-center">
            <div><h4><strong>T</strong></h4></div>
            <div class="col-md-11"><p>Gruusia veiselihahautis granaatõunaseemnetega 9,50 (G,L,P)<br>Kana-klimbisupp 4,90</p></div>
          </div>
        </div>
      </div>
      <div class="items">
        <h3>VÕIVÕI Tuli Resto Baar</h3>
        <div class="daily-offers-s2-content-info entry-content">
          <p>Omaperelõuna E–R 11.30–15 Praad 9,5 € / Supp 6 € / Salat 8 € / Magus 4 €</p>
        </div>
        <div class="daily-offers-s2-content-info">
          <div class="row align-items-center">
            <div><h4><strong>T</strong></h4></div>
            <div class="col-md-11"><p>Kanakints punase veini kastmes, seened ja<br>kartulipüree<br>Niçoise salat Cajun lõhega<br>Kookosene kõrvitsasupp tšilliga<br>Küpsetatud õuna- ja muraka-crumble<br>vanillikastmega</p></div>
          </div>
        </div>
      </div>
    </section>
  `

  it('valib jooksva nädala õige päeva mõlema söögikoha menüüst', () => {
    const menus = parseArterHtml(html, '2026-10-27')
    expect(menus).toHaveLength(2)
    expect(menus[0]).toMatchObject({
      restaurantName: 'Bistroo Arter',
      lunchStartTime: '11:00',
      lunchEndTime: '15:00',
    })
    expect(menus[0].offers).toEqual([
      { offerName: 'Gruusia veiselihahautis granaatõunaseemnetega', description: 'Märgised: G, L, P', price: 9.5 },
      { offerName: 'Kana-klimbisupp', description: null, price: 4.9 },
    ])
    expect(menus[1].offers).toEqual([
      { offerName: 'Kanakints punase veini kastmes, seened ja kartulipüree', description: 'Praad', price: 9.5 },
      { offerName: 'Niçoise salat Cajun lõhega', description: 'Salat', price: 8 },
      { offerName: 'Kookosene kõrvitsasupp tšilliga', description: 'Supp', price: 6 },
      { offerName: 'Küpsetatud õuna- ja muraka-crumble vanillikastmega', description: 'Magus', price: 4 },
    ])
  })

  it('ei kasuta vale nädala menüüd', () => {
    expect(parseArterHtml(html, '2026-11-03')).toEqual([])
  })

  it('ei pea päevaprae lisandit ekslikult salatipakkumiseks', () => {
    const wrapped = html.replace(
      'Kanakints punase veini kastmes, seened ja<br>kartulipüree<br>Niçoise salat Cajun lõhega',
      'Meriahvena filee ja<br>soe tatrasalat<br>Kanasalat kurgi ja ubadega',
    )
    const voivoi = parseArterHtml(wrapped, '2026-10-27')[1]
    expect(voivoi.offers[0].offerName).toBe('Meriahvena filee ja soe tatrasalat')
    expect(voivoi.offers[1].offerName).toBe('Kanasalat kurgi ja ubadega')
  })

  it('tunneb ära supi nime ka ilma sõnata „supp”', () => {
    const tomKha = html.replace('Kookosene kõrvitsasupp tšilliga', 'Tom kha kanaga')
    const voivoi = parseArterHtml(tomKha, '2026-10-27')[1]
    expect(voivoi.offers[2]).toEqual({
      offerName: 'Tom kha kanaga',
      description: 'Supp',
      price: 6,
    })
  })
})

describe('parseUlemisteCityJson', () => {
  const fixture = JSON.parse(readFileSync(
    new URL('./fixtures/ulemiste-city-daily.json', import.meta.url),
    'utf8',
  )) as unknown

  it('normaliseerib ametliku voo kõik 11 asukohta ja hinnavormingud', () => {
    const menus = parseUlemisteCityJson(fixture)
    expect(menus).toHaveLength(11)
    expect(menus.flatMap((menu) => menu.offers)).toHaveLength(11)
    expect(menus.map((menu) => menu.restaurantId)).toEqual([
      'ulemiste-aiko-bowl',
      'ulemiste-fredo-opiku',
      'ulemiste-fredo-lurich',
      'ulemiste-gala-sushi',
      'ulemiste-mona',
      'ulemiste-plus-tervisemaja-1',
      'ulemiste-plus-tervisemaja-2',
      'ulemiste-freya-foodbar',
      'ulemiste-nuface',
      'ulemiste-nuudel',
      'ulemiste-airo-cafe',
    ])

    expect(menus[0]).toMatchObject({
      restaurantName: 'AIKO BOWL',
      address: 'Lõõtsa 1a, Viktor Palmi maja esimene korrus, Ülemiste City, Lasnamäe, Tallinn',
      latitude: 59.42254790910803,
      longitude: 24.80275086878664,
      sourceUrl: 'https://www.ulemistecity.ee/sook/lounasook-ulemiste/',
    })
    expect(menus[0].offers).toEqual([{
      offerName: 'Taipärane kollane kanakarri (L, S)',
      description: 'Hinnad: 6.90/8.50 €',
      price: 6.9,
    }])
    expect(menus[6].offers).toEqual([{
      offerName: 'SOE JA KÜLM BUFFET',
      description: 'Hind: 1,69 €/100 g',
      price: 1.69,
    }])
    expect(menus[8].offers[0]).toMatchObject({ price: 7, description: 'Hinnad: 7/9/11 €' })
  })

  it('lükkab vigase vastuse tagasi', () => {
    expect(() => parseUlemisteCityJson({ success: false })).toThrow('JSON-vastus on vigane')
  })
})
