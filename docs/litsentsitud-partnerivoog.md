# Litsentsitud partnerivoo ühendamine

Lõunaleidja saab Päevapraad.ee ja Päevapakkumised.ee andmeid kuvada siis, kui teenusepakkujaga on sõlmitud kirjalik kokkulepe ning saadud masinloetav andmevoog või luba samaväärse voo koostamiseks.

Brauser ei päri partnerit otse. GitHub Actions loeb voo serveripoolel, kontrollib iga välja ja kirjutab ainult tänase kuupäevaga pakkumised faili `public/data/offers.json`. Nii ei ole vaja CORS-proksit ega avalikku API-võtit.

## Voo formaat

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-10-26T07:00:00.000Z",
  "timezone": "Europe/Tallinn",
  "items": [
    {
      "provider": "paevapakkumised",
      "externalRestaurantId": "restoran-platz",
      "restaurantName": "Restoran Platz",
      "address": "Roseni 7, Tallinn",
      "latitude": 59.438595,
      "longitude": 24.755465,
      "sourceUrl": "https://www.xn--pevapakkumised-5hb.ee/tallinn/restoran-platz",
      "offerDate": "2026-10-26",
      "lunchStartTime": "11:30",
      "lunchEndTime": "15:00",
      "fetchedAt": "2026-10-26T07:00:00.000Z",
      "offers": [
        {
          "name": "Kreemine pasta kanaga",
          "description": null,
          "price": 8.9,
          "currency": "EUR"
        }
      ]
    }
  ]
}
```

`provider` võib olla `paevapraad` või `paevapakkumised`. `sourceUrl` peab viitama sama teenuse konkreetsele HTTPS-algallikale. Koordinaadid peavad asuma Eestis, hind peab olema positiivne ja kuupäev peab olema kujul `YYYY-MM-DD`. Tänasest erineva kuupäevaga kirjed jäetakse automaatselt välja.

## GitHubi seadistus

Repository seadetes tuleb lisada Actionsi secret'id:

- `LOUNALEIDJA_PARTNER_FEED_URL` — litsentsitud JSON-voo HTTPS-aadress;
- `LOUNALEIDJA_PARTNER_FEED_TOKEN` — valikuline Bearer token.

Tokenit ei kasutata brauseris ega `VITE_` prefiksiga muutujas. Kui URL puudub, ei tehta ühtegi partneripäringut ja mõlemad agregaatorid jäävad kasutajavaates olekusse „Vajab luba”. Eduka voo järel muutub vastav allikas automaatselt aktiivseks.

Ühe menüü kopeerimine mitmele LIDO asukohale tehakse partnerivoos eraldi asukohakirjetena või Lõunaleidja olemasoleva kontrollitud LIDO asukohaloendi kaudu. Apollo Plaza LIDO on eraldi pakkumine ning seda nelja ühismenüü asukohaga ei ühendata.
