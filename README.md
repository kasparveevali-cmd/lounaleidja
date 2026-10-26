# Lõunaleidja

Lõunaleidja on eestikeelne veebirakendus, mis kuvab kasutaja lähedal asuvaid, kuupäevaga kinnitatud lõunapakkumisi. Rakendus on teadlikult konservatiivne: eilseid või kuupäevata pakkumisi tänaste tulemustena ei näidata ning igal pakkumisel on link algallikale.

## Valmis funktsioonid

- aadressiotsing Nominatimi ja OpenStreetMapi kaudu;
- brauseri geolokatsioon koos arusaadavate veateadetega;
- 0,5–30 km otsinguraadius ja Haversine'i valemil põhinev kaugusarvutus;
- nimekirja- ja kaardivaade koos kasutaja asukoha, markerite ning raadiuseringiga;
- otsing restorani või toidu järgi, hinnavahemik ja kolm sortimisviisi;
- ainult kinnitatud pakkumiste filter;
- brauseri `localStorage`-is hoitavad lemmikud;
- algallika ja Google Mapsi teekonnajuhiste lingid;
- laadimis-, vea- ja tühja oleku vaated;
- mobiilivaade ja klaviatuuriga kasutatav põhifunktsionaalsus;
- automatiseeritud andmekogumine, testid, build ja GitHub Pagesi avaldamine.

## Andmeallikad ja nende staatus

| Allikas | Staatus | Põhjus |
| --- | --- | --- |
| [Hiiu Resto ametlik menüü](https://hiiuresto.eu/menuu/) | töötab | Ametlik leht sisaldab kuupäevaga nädalamenüüd, hindu, kellaaega ja JSON-LD asukohaandmeid. Collector kontrollib enne päringut `robots.txt` faili. |
| [Päevapakkumised.ee](https://www.xn--pevapakkumised-5hb.ee/kasutustingimused) | vajab kirjalikku luba | Kasutustingimused keelavad automatiseeritud allalaadimise, kopeerimise ja kolmandatele isikutele kättesaadavaks tegemise. |
| [Päevapraad.ee](https://www.paevapraad.ee/andmekaitse-uldmaarus-ja-kasutajatingimused) | vajab kirjalikku luba | Tingimused keelavad veebilehe info kopeerimise, reprodutseerimise ja levitamise ilma kirjaliku loata. |
| [Lunchtime.ee](https://www.lunchtime.ee/) | pole saadaval | Domeeni juur kuvab praegu ainult tühja serverikataloogi; avalikku API-t, RSS-i ega menüüd ei leitud. |

Agregaatorite sisu ei kopeerita enne selgesõnalise loa saamist. Uusi allikaid tuleb lisada ametlike restoranilehtede adapteritena faili `scripts/collect.ts` või kuupäevaga käsitsi faili `data/manual-offers.json`.

## Kohalik käivitamine

Vajalik on Node.js 24 ja pnpm 10.

```bash
pnpm install
pnpm collect
pnpm dev
```

Vite kuvab terminalis kohaliku aadressi. Andmefail tekib asukohta `public/data/offers.json`.

## Kontrollid

```bash
pnpm lint
pnpm test
pnpm build
```

Kõik kontrollid korraga:

```bash
pnpm check
```

Testid katavad muu hulgas kaugusarvutuse, tänase kuupäeva filtri, otsinguraadiuse ning hinnavahemiku.

## Automaatne uuendamine

`.github/workflows/deploy.yml` käivitub tööpäeviti Eesti aja järgi kell 07.00, 09.00 ja 11.00. GitHub Actionsi IANA ajavöönd `Europe/Tallinn` arvestab automaatselt suve- ja talveajaga.

Töövoog:

1. kontrollib iga aktiivse allika `robots.txt` reegleid;
2. ootab enne menüülehe päringut, et vältida liigset koormust;
3. loeb ametlikult lehelt ainult tänase kuupäevaga pakkumised;
4. normaliseerib andmed, valideerib väljad ja eemaldab duplikaadid;
5. ühe allika vea korral jätkab teistega ning säilitab sama päeva varasema vahemälu;
6. käivitab lindi, testid ja production-buildi;
7. commit'ib muutunud andmefaili ning avaldab sama buildi GitHub Pagesis.

Veateated jäävad nii Actionsi logisse kui ka andmefaili `errors` massiivi. Avalikus vaates näidatakse ainult `offerDate` väärtusega tänaseid pakkumisi.

## GitHub Pagesi esmane seadistus

Pärast uue avaliku repository loomist:

1. ava GitHubis **Settings → Pages**;
2. vali **Build and deployment → Source → GitHub Actions**;
3. ava **Actions** ja käivita töövoog **Uuenda andmeid ja avalda** käsitsi või push'i `main` harusse.

Workflow vajab repository seadetes kirjutamisõigust: **Settings → Actions → General → Workflow permissions → Read and write permissions**. Kui organisatsiooni poliitika seda ei luba, tuleb andmefaili commit'i samm eemaldada; avaldamine töötab endiselt.

## Geokodeerimine ja kaart

Aadressisoovitused kasutavad avalikku [Nominatim](https://nominatim.org/) teenust ainult kasutaja kirjutamise järel, vähemalt 1,1-sekundilise viitega, maksimaalselt viie tulemusega ja brauseri kohaliku vahemäluga. Kaart kasutab OpenStreetMapi standardseid kaardiplaate koos nõutud omistusega.

Suurema kasutuskoormuse korral tuleks avalikud teenused asendada enda Nominatimi/kaartide infrastruktuuri või lepingulise pakkujaga.

## Andmemudel

Iga pakkumine sisaldab välju `restaurantId`, `restaurantName`, `address`, `latitude`, `longitude`, `offerName`, `description`, `price`, `currency`, `offerDate`, `lunchStartTime`, `lunchEndTime`, `sourceName`, `sourceUrl`, `fetchedAt` ja `verificationStatus`.

## Piirangud

- Aktiivne automaatallikas on praegu ainult Hiiu Resto ametlik menüü; üle-eestilise katvuse saavutamiseks on vaja rohkem ametlikke adaptereid või agregaatorite kirjalikku luba.
- Facebooki integratsiooni ei aktiveerita ega proovita autentimispiirangutest mööda minna.
- Nominatimi avalik teenus sobib väikese koormusega MVP-le, mitte suure liiklusega kommertsteenusele.
- Lemmikud püsivad ainult samas brauseris ja seadmes.
- Lõunamenüü võib restoranis muutuda; kasutaja peab hinda, saadavust ja allergeene kontrollima algallikast või restoranist.

## Litsents

Rakenduse lähtekood on MIT-litsentsiga. Algallikate sisu ja kaardiandmete õigused kuuluvad nende omanikele ning neile kehtivad vastavate teenuste tingimused.
