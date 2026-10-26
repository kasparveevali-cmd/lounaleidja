import {
  AlertCircle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Database,
  Info,
  List,
  Map as MapIcon,
  RefreshCw,
  Salad,
  SlidersHorizontal,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Filters } from './components/Filters'
import { MapView } from './components/MapView'
import { RestaurantCard } from './components/RestaurantCard'
import { SearchPanel } from './components/SearchPanel'
import { groupFilterAndSort, todayInTallinn } from './lib/offers'
import type { LocationPoint, OffersBundle, SortMode } from './types'

const emptyBundle: OffersBundle = {
  generatedAt: new Date(0).toISOString(),
  timezone: 'Europe/Tallinn',
  offers: [],
  sources: [],
  errors: [],
}

function readFavorites() {
  try {
    return new Set<string>(JSON.parse(localStorage.getItem('lounaleidja-favorites') ?? '[]') as string[])
  } catch {
    return new Set<string>()
  }
}

function todayLabel() {
  return new Intl.DateTimeFormat('et-EE', {
    timeZone: 'Europe/Tallinn',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date())
}

export default function App() {
  const [bundle, setBundle] = useState<OffersBundle>(emptyBundle)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [location, setLocation] = useState<LocationPoint | null>(null)
  const [radiusKm, setRadiusKm] = useState(3)
  const [view, setView] = useState<'list' | 'map'>('list')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortMode>('distance')
  const [minPrice, setMinPrice] = useState(0)
  const [maxPrice, setMaxPrice] = useState(30)
  const [confirmedOnly, setConfirmedOnly] = useState(true)
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(readFavorites)
  const today = todayInTallinn()

  useEffect(() => {
    let active = true
    fetch(`${import.meta.env.BASE_URL}data/offers.json`, { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) throw new Error(`Andmefail vastas ${response.status}`)
        return response.json() as Promise<OffersBundle>
      })
      .then((data) => active && setBundle(data))
      .catch(() => active && setLoadError('Lõunapakkumiste andmeid ei saanud laadida. Proovi lehte värskendada.'))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [])

  const restaurants = useMemo(
    () =>
      groupFilterAndSort(bundle.offers, {
        query,
        minPrice,
        maxPrice,
        confirmedOnly,
        favoriteIds,
        favoritesOnly,
        location,
        radiusKm,
        sort,
        today,
      }),
    [bundle.offers, confirmedOnly, favoriteIds, favoritesOnly, location, maxPrice, minPrice, query, radiusKm, sort, today],
  )

  const offerCount = restaurants.reduce((sum, restaurant) => sum + restaurant.offers.length, 0)
  const activeSources = bundle.sources.filter((source) => source.status === 'active')

  function toggleFavorite(restaurantId: string) {
    setFavoriteIds((current) => {
      const next = new Set(current)
      if (next.has(restaurantId)) next.delete(restaurantId)
      else next.add(restaurantId)
      localStorage.setItem('lounaleidja-favorites', JSON.stringify([...next]))
      if (next.size === 0) setFavoritesOnly(false)
      return next
    })
  }

  return (
    <div className="app-shell">
      <nav className="topbar" aria-label="Põhinavigatsioon">
        <a className="brand" href="#top" aria-label="Lõunaleidja avaleht">
          <span className="brand-mark"><Salad size={20} /></span>
          <span>Lõunaleidja</span>
        </a>
        <div className="nav-status">
          <span className="live-dot" />
          {activeSources.length} {activeSources.length === 1 ? 'töötav allikas' : 'töötavat allikat'}
        </div>
        <a className="about-link" href="#andmed">Andmetest <ArrowRight size={15} /></a>
      </nav>

      <main id="top">
        <section className="hero">
          <div className="eyebrow"><CalendarDays size={15} /> {todayLabel()}</div>
          <h1>Mida täna<br /><em>lõunaks</em> süüa?</h1>
          <p>Leia kontrollitud lõunapakkumised enda lähedalt.</p>
        </section>

        <SearchPanel
          location={location}
          radiusKm={radiusKm}
          onLocationChange={setLocation}
          onRadiusChange={setRadiusKm}
        />

        <section className="results-section">
          <div className="results-heading">
            <div>
              <span className="section-kicker">Tänased valikud</span>
              <h2>
                {loading ? 'Laadin pakkumisi…' : `${restaurants.length} ${restaurants.length === 1 ? 'söögikoht' : 'söögikohta'}`}
              </h2>
              {!loading && <p>{offerCount} kuupäevaga pakkumist{location ? ` · kuni ${radiusKm.toLocaleString('et-EE')} km` : ' üle Eesti'}</p>}
            </div>
            <div className="view-switcher" role="group" aria-label="Vaate valik">
              <button type="button" className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}>
                <List size={17} /> Nimekiri
              </button>
              <button type="button" className={view === 'map' ? 'active' : ''} onClick={() => setView('map')}>
                <MapIcon size={17} /> Kaart
              </button>
            </div>
          </div>

          <Filters
            query={query}
            sort={sort}
            minPrice={minPrice}
            maxPrice={maxPrice}
            confirmedOnly={confirmedOnly}
            favoritesOnly={favoritesOnly}
            hasFavorites={favoriteIds.size > 0}
            onQueryChange={setQuery}
            onSortChange={setSort}
            onMinPriceChange={setMinPrice}
            onMaxPriceChange={setMaxPrice}
            onConfirmedOnlyChange={setConfirmedOnly}
            onFavoritesOnlyChange={setFavoritesOnly}
          />

          {loadError && (
            <div className="notice error-notice"><AlertCircle size={20} /><span>{loadError}</span></div>
          )}

          {loading ? (
            <div className="loading-grid" aria-label="Laadib pakkumisi">
              {[1, 2].map((item) => <div className="skeleton-card" key={item} />)}
            </div>
          ) : restaurants.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon"><SlidersHorizontal size={26} /></div>
              <h3>Praegu sobivaid pakkumisi ei leidunud</h3>
              <p>
                {location
                  ? 'Suurenda otsinguraadiust või proovi leebemaid filtreid. Näitame ainult tänase kuupäevaga pakkumisi.'
                  : 'Täna ei ole meie lubatud allikates kuupäevaga kinnitatud pakkumisi.'}
              </p>
              {location && radiusKm < 30 && (
                <button type="button" onClick={() => setRadiusKm(Math.min(30, Math.max(5, radiusKm * 2)))}>
                  Suurenda raadiust <ArrowRight size={16} />
                </button>
              )}
            </div>
          ) : view === 'list' ? (
            <div className="restaurant-grid">
              {restaurants.map((restaurant) => (
                <RestaurantCard
                  key={restaurant.restaurantId}
                  restaurant={restaurant}
                  favorite={favoriteIds.has(restaurant.restaurantId)}
                  onToggleFavorite={toggleFavorite}
                />
              ))}
            </div>
          ) : (
            <MapView restaurants={restaurants} location={location} radiusKm={radiusKm} />
          )}
        </section>

        <section className="data-section" id="andmed">
          <div className="data-intro">
            <span className="section-kicker">Läbipaistev algusest peale</span>
            <h2>Päris andmed.<br />Aus staatus.</h2>
            <p>
              Iga pakkumine peab pärinema kuupäevaga algallikast. Kui automaatne kasutamine pole lubatud,
              me sisu ei kopeeri.
            </p>
          </div>
          <div className="source-list">
            {bundle.sources.map((source) => (
              <a href={source.url} target="_blank" rel="noreferrer" className="source-row" key={source.id}>
                <span className={`source-icon ${source.status}`}>
                  {source.status === 'active' ? <CheckCircle2 size={19} /> : source.status === 'permission-required' ? <Info size={19} /> : <AlertCircle size={19} />}
                </span>
                <span>
                  <strong>{source.name}</strong>
                  <small>{source.message}</small>
                </span>
                <span className="source-state">
                  {source.status === 'active' ? 'Töötab' : source.status === 'permission-required' ? 'Vajab luba' : 'Pole saadaval'}
                </span>
              </a>
            ))}
            <div className="source-refresh">
              <RefreshCw size={16} /> Andmeid kontrollitakse tööpäeviti kell 07.00, 09.00 ja 11.00.
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <a className="brand" href="#top"><span className="brand-mark"><Salad size={18} /></span><span>Lõunaleidja</span></a>
        <p>Lõunapakkumine võib muutuda. Kontrolli olulist infot alati algallikast.</p>
        <span className="footer-data"><Database size={15} /> {offerCount} tänast pakkumist</span>
      </footer>
    </div>
  )
}
