# Lõunaleidja isiklikud allikad

See Manifest V3 Chrome'i laiendus loeb Päevapraad.ee ja Päevapakkumised.ee Tallinna lehti ning lisab tänased pakkumised ainult kasutaja brauseris avatud Lõunaleidjasse.

- Menüüandmeid ei kirjutata GitHubi reposse ega avalikku `offers.json` faili.
- Lähtelehti päritakse automaatselt kõige rohkem kord tunnis; käsitsi uuendamisel kehtib viieminutiline kaitsevahemik.
- Laienduse õigused on piiratud kahe andmeallika ning Lõunaleidja enda lehega.
- Päevapakkumised.ee asukohad tulevad lehe kaardilinkidest. Päevapraad.ee kirje lisatakse ainult siis, kui sama söögikoha kontrollitud asukoht on juba teada.

## Paigaldamine Chrome'is

1. Ava `chrome://extensions`.
2. Lülita sisse **Arendajarežiim**.
3. Vajuta **Laadi pakkimata**.
4. Vali selle projekti kaust `personal-extension`.
5. Ava või värskenda Lõunaleidja leht.

Laienduse eemaldamisel jääb viimane isiklik voog brauserisse. Selle saab Lõunaleidja andmeallikate jaotisest nupuga **Eemalda isiklik voog** kustutada.
