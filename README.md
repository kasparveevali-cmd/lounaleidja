# Lõunaleidja

Lõunaleidja on eestikeelne veebirakendus, mis kuvab kasutaja lähedal asuvaid, kuupäevaga kinnitatud lõunapakkumisi. Rakendus on teadlikult konservatiivne: eilseid või kuupäevata pakkumisi tänaste tulemustena ei näidata ning igal pakkumisel on link algallikale.

- Avalik rakendus: [kasparveevali-cmd.github.io/lounaleidja](https://kasparveevali-cmd.github.io/lounaleidja/)
- Lähtekood: [github.com/kasparveevali-cmd/lounaleidja](https://github.com/kasparveevali-cmd/lounaleidja)

## Valmis funktsioonid

- aadressiotsing Nominatimi ja OpenStreetMapi kaudu;
- brauseri geolokatsioon koos arusaadavate veateadetega;
- 0,5–30 km otsinguraadius ja Haversine'i valemil põhinev kaugusarvutus;
- nimekirja- ja kaardivaade koos kasutaja asukoha, markerite ning raadiuseringiga;
- otsing restorani või toidu järgi, hinnavahemik ja kolm sortimisviisi;
- ainult kinnitatud pakkumiste filter;
- brauseri `localStorage`-is hoitavad lemmikud;
- brauserisse jääv isiklik andmevoog koos JSON-impordi ja kohaliku Chrome'i laienduse toega;
- algallika ja Google Mapsi teekonnajuhiste lingid;
- laadimis-, vea- ja tühja oleku vaated;
- mobiilivaade ja klaviatuuriga kasutatav põhifunktsionaalsus;
- automatiseeritud andmekogumine, testid, build ja GitHub Pagesi avaldamine.

## Andmeallikad ja nende staatus

| Allikas | Staatus | Põhjus |
| --- | --- | --- |
| [Hiiu Resto ametlik menüü](https://hiiuresto.eu/menuu/) | töötab | Ametlik leht sisaldab kuupäevaga nädalamenüüd, hindu, kellaaega ja JSON-LD asukohaandmeid. Collector kontrollib enne päringut `robots.txt` faili. |
| [Kristiine Keskuse ametlik lõunavoog](https://www.kristiinekeskus.ee/lounapakkumised) | töötab | Avalik masinloetav Markdown-vaade sisaldab kuupäevaga KFC, Sunny Pocketi, Poke Bowl & MEZE, MySushi ja LIDO pakkumisi. LIDO menüü seotakse LIDO enda kinnituse põhjal Kristiine, Solarise, Ülemiste ja Mustamäe asukohaga. |
| [Reval Café ametlik menüü](https://revalcafe.ee/paevapakkumised/) | töötab | Kuupäevaga nädalamenüü seotakse 11 ametlikult loetletud Tallinna kohvikuga; päevapõhiseid erandeid, näiteks Meremuuseumi esmaspäeva, arvestatakse. |
| [Vapiano ametlik lõunamenüü](https://vapiano.ee/louna/) | töötab | Jooksva nädala nähtav menüü seotakse Foorumi, Solarise, Ülemiste ja Rocca al Mare restoraniga. |
| [AMPSi ametlik päevamenüü](https://amps.ee/lounapakkumised/) | töötab | Kuupäevaga asukohapõhised pakkumised Järve ja Arena AMPSile. |
| [PROTO ametlik lõunamenüü](https://www.prototehas.ee/menuu/) | töötab | Kuupäevaga supi suurused ja lõunabufee hind koos buffet' koostisega. |
| [Ülemiste City ametlik päevamenüü](https://www.ulemistecity.ee/paevapakkumised/) | töötab | Avaliku lehe ametlik kuupäevapõhine JSON-voog sisaldab hindu, aadresse ja koordinaate 11 söögikohale: AIKO BOWL, Fredo, Fredo Lurich, Gala Sushi, Mona, kaks Plus Kohvikut, Freya Foodbar, NuFace, Nuudel ja Airo Cafe. |
| [Päevapakkumised.ee](https://www.xn--pevapakkumised-5hb.ee/iseteenindus/liitumine) | vajab kirjalikku luba | Teenus pakub partneritele andmete jagamist teistesse keskkondadesse, kuid kasutustingimused ei luba andmeid omal algatusel kopeerida. |
| [Päevapraad.ee](https://www.paevapraad.ee/lahendused/) | vajab kirjalikku luba | Teenusel on veebilehe- ja ekraaniintegratsioonid, kuid avalikku litsentsitud API-t pole dokumenteeritud. |

Agregaatorite sisu ei kopeerita avalikku andmefaili enne selgesõnalise loa saamist. Valmis kontaktid, nõuded ja partnerluskirja mustand on failis [`docs/andmeallikate-partnerlus.md`](docs/andmeallikate-partnerlus.md). Litsentsitud JSON-voo adapter, täpne skeem ja GitHubi secret'ite seadistus on kirjeldatud failis [`docs/litsentsitud-partnerivoog.md`](docs/litsentsitud-partnerivoog.md). Uusi allikaid lisatakse ametlike restoranilehtede adapteritena faili `scripts/collect.ts`; puhtad parserid asuvad failis `scripts/parsers.ts`. Kuupäevaga erandandmeid saab lisada faili `data/manual-offers.json`.

## Isiklikud koondallikad

Päevapraad.ee ja Päevapakkumised.ee jaoks on eraldi isiklik režiim. Selle andmeid ei kirjutata `public/data/offers.json` faili, GitHubi reposse ega Pagesi buildi: need jäävad kasutaja brauseri `localStorage`-isse ning rakendus märgistab need isikliku voona.

- `personal-extension/` sisaldab Manifest V3 Chrome'i laiendust, mis loeb ainult kahe teenuse Tallinna koondlehte. Automaatne päring toimub kõige rohkem kord tunnis ja käsitsi uuendamisel kehtib viieminutiline kaitsevahemik.
- `pnpm collect:personal` loob sama päeva imporditava faili `personal-data/offers.json`; kaust on `.gitignore`-is.
- Mõlemas variandis kontrollitakse lehel olevat kuupäeva, hindu, allika hosti ja Eesti koordinaate. Päevapraad.ee kirje kuvatakse kaardil ainult siis, kui asukoht saab üheselt sobitatud Päevapakkumised.ee või ametliku voo asukohaga.
- Laienduse paigaldusjuhis on failis [`personal-extension/README.md`](personal-extension/README.md).

Isiklik režiim ei muuda algallikate kasutustingimusi ega anna sisu avaliku taasavaldamise õigust. Kasutaja vastutab selle eest, et tema kasutus oleks tingimustega kooskõlas.

## Kohalik käivitamine

Vajalik on Node.js 24 ja pnpm 10.

```bash
pnpm install
pnpm collect
pnpm dev
```

Vite kuvab terminalis kohaliku aadressi. Andmefail tekib asukohta `public/data/offers.json`.

Isikliku JSON-voo loomiseks:

```bash
pnpm collect:personal
```

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

Testid katavad muu hulgas kaugusarvutuse, tänase kuupäeva filtri, otsinguraadiuse, hinnavahemiku ning Kristiine, Revali, Vapiano, AMPSi, PROTO ja Ülemiste City menüüparserid.

## Automaatne uuendamine

`.github/workflows/deploy.yml` käivitub tööpäeviti Eesti aja järgi kell 07.00, 09.00 ja 11.00. GitHub Actionsi IANA ajavöönd `Europe/Tallinn` arvestab automaatselt suve- ja talveajaga.

Töövoog:

1. kontrollib iga aktiivse allika `robots.txt` reegleid;
2. ootab enne menüülehe päringut, et vältida liigset koormust;
3. loeb ametlikult lehelt ainult tänase kuupäevaga pakkumised;
4. normaliseerib andmed, valideerib väljad ja eemaldab duplikaadid;
5. ühe allika vea korral jätkab teistega ning säilitab sama päeva varasema vahemälu;
6. loeb seadistuse olemasolul litsentsitud partnerivoo ning aktiveerib ainult selles tegelikult töötava agregaatori;
7. käivitab lindi, testid ja production-buildi;
8. commit'ib muutunud andmefaili ning avaldab sama buildi GitHub Pagesis.

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

- Aktiivsed automaatallikad katavad praegu eelkõige Tallinna; üle-eestilise katvuse saavutamiseks on vaja rohkem ametlikke adaptereid või agregaatorite kirjalikku luba.
- Ühe menüü sidumine mitme asukohaga toimub ainult siis, kui kett või keskuse ametlik allikas kinnitab ühise pakkumise. LIDO Apollo Plaza on ühismenüüst teadlikult välja jäetud.
- Facebooki integratsiooni ei aktiveerita ega proovita autentimispiirangutest mööda minna.
- Nominatimi avalik teenus sobib väikese koormusega MVP-le, mitte suure liiklusega kommertsteenusele.
- Lemmikud püsivad ainult samas brauseris ja seadmes.
- Lõunamenüü võib restoranis muutuda; kasutaja peab hinda, saadavust ja allergeene kontrollima algallikast või restoranist.

## Litsents

Rakenduse lähtekood on MIT-litsentsiga. Algallikate sisu ja kaardiandmete õigused kuuluvad nende omanikele ning neile kehtivad vastavate teenuste tingimused.
