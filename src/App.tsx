import {
  AlertCircle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Database,
  HardDrive,
  Info,
  List,
  Map as MapIcon,
  RefreshCw,
  Salad,
  SlidersHorizontal,
  Trash2,
  Upload,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { Filters } from './components/Filters'
import { MapView } from './components/MapView'
import { RestaurantCard } from './components/RestaurantCard'
import { SearchPanel } from './components/SearchPanel'
import { groupFilterAndSort, todayInTallinn } from './lib/offers'
import {
  mergePersonalFeed,
  parsePersonalFeedJson,
  PERSONAL_FEED_REFRESH_REQUEST_EVENT,
  PERSONAL_FEED_STORAGE_KEY,
  PERSONAL_FEED_UPDATED_EVENT,
  type PersonalFeed,
} from './lib/personal-feed'
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

interface PersonalFeedStorageState {
  feed: PersonalFeed | null
  hasStoredFeed: boolean
  error: string | null
}

function readPersonalFeedStorage(today: string): PersonalFeedStorageState {
  try {
    const raw = localStorage.getItem(PERSONAL_FEED_STORAGE_KEY)
    if (raw === null) return { feed: null, hasStoredFeed: false, error: null }
    return {
      feed: parsePersonalFeedJson(raw, today),
      hasStoredFeed: true,
      error: null,
    }
  } catch (error) {
    return {
      feed: null,
      hasStoredFeed: true,
      error: error instanceof Error ? error.message : 'Isiklikku voogu ei saanud lugeda.',
    }
  }
}

export default function App() {
  const today = todayInTallinn()
  const [officialBundle, setOfficialBundle] = useState<OffersBundle>(emptyBundle)
  const [personalFeedStorage, setPersonalFeedStorage] = useState(() => readPersonalFeedStorage(today))
  const [personalFeedMessage, setPersonalFeedMessage] = useState<string | null>(null)
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
  const importInputRef = useRef<HTMLInputElement>(null)
  const refreshTimerRef = useRef<number | null>(null)
  const personalFeed = personalFeedStorage.feed
  const personalFeedError = personalFeedStorage.error
  const hasStoredPersonalFeed = personalFeedStorage.hasStoredFeed

  const loadPersonalFeed = useCallback((message?: string) => {
    const next = readPersonalFeedStorage(today)
    setPersonalFeedStorage(next)
    setPersonalFeedMessage(next.error ? null : message ?? null)
  }, [today])

  useEffect(() => {
    let active = true
    fetch(`${import.meta.env.BASE_URL}data/offers.json`, { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) throw new Error(`Andmefail vastas ${response.status}`)
        return response.json() as Promise<OffersBundle>
      })
      .then((data) => active && setOfficialBundle(data))
      .catch(() => active && setLoadError('Lõunapakkumiste andmeid ei saanud laadida. Proovi lehte värskendada.'))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    const initialReadTimer = window.setTimeout(() => loadPersonalFeed(), 0)
    const handleUpdated = () => {
      if (refreshTimerRef.current !== null) window.clearTimeout(refreshTimerRef.current)
      refreshTimerRef.current = null
      const extensionStatus = document.documentElement.dataset.lounaleidjaPersonalFeed
      const extensionError = document.documentElement.dataset.lounaleidjaPersonalError
      if (extensionStatus === 'error') {
        setPersonalFeedStorage({
          ...readPersonalFeedStorage(today),
          error: extensionError || 'Brauserilaiendus ei saanud isiklikku voogu uuendada.',
        })
        setPersonalFeedMessage(null)
      } else {
        loadPersonalFeed('Isiklik voog uuendati brauseris.')
      }
    }
    const handleStorage = (event: StorageEvent) => {
      if (event.key === PERSONAL_FEED_STORAGE_KEY) loadPersonalFeed('Isiklik voog muutus teises vahekaardis.')
    }
    document.addEventListener(PERSONAL_FEED_UPDATED_EVENT, handleUpdated)
    window.addEventListener('storage', handleStorage)
    return () => {
      window.clearTimeout(initialReadTimer)
      document.removeEventListener(PERSONAL_FEED_UPDATED_EVENT, handleUpdated)
      window.removeEventListener('storage', handleStorage)
      if (refreshTimerRef.current !== null) window.clearTimeout(refreshTimerRef.current)
    }
  }, [loadPersonalFeed, today])

  const bundle = useMemo(
    () => mergePersonalFeed(officialBundle, personalFeed),
    [officialBundle, personalFeed],
  )

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
  const personalSourceCount = personalFeed
    ? new Set(personalFeed.offers.map((offer) => offer.sourceName)).size
    : 0

  const personalUpdatedAt = personalFeed
    ? new Intl.DateTimeFormat('et-EE', {
        timeZone: 'Europe/Tallinn',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(personalFeed.generatedAt))
    : null

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

  async function importPersonalFeed(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    if (!file) return
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('Isikliku voo JSON võib olla kuni 5 MB')
      const parsed = parsePersonalFeedJson(await file.text(), today)
      localStorage.setItem(PERSONAL_FEED_STORAGE_KEY, JSON.stringify(parsed))
      setPersonalFeedStorage({ feed: parsed, hasStoredFeed: true, error: null })
      setPersonalFeedMessage(`Imporditi ${parsed.offers.length} tänast pakkumist.`)
    } catch (error) {
      setPersonalFeedStorage((current) => ({
        ...current,
        error: error instanceof Error ? error.message : 'Isiklikku voogu ei saanud importida.',
      }))
      setPersonalFeedMessage(null)
    } finally {
      event.currentTarget.value = ''
    }
  }

  function requestPersonalFeedRefresh() {
    setPersonalFeedStorage((current) => ({ ...current, error: null }))
    setPersonalFeedMessage('Värskendustaotlus saadeti brauserilaiendusele…')
    document.dispatchEvent(new Event(PERSONAL_FEED_REFRESH_REQUEST_EVENT))
    if (refreshTimerRef.current !== null) window.clearTimeout(refreshTimerRef.current)
    refreshTimerRef.current = window.setTimeout(() => {
      refreshTimerRef.current = null
      loadPersonalFeed('Isiklik voog loeti brauseri salvestusest uuesti.')
    }, 1_500)
  }

  function removePersonalFeed() {
    if (refreshTimerRef.current !== null) window.clearTimeout(refreshTimerRef.current)
    refreshTimerRef.current = null
    localStorage.removeItem(PERSONAL_FEED_STORAGE_KEY)
    setPersonalFeedStorage({ feed: null, hasStoredFeed: false, error: null })
    setPersonalFeedMessage('Isiklik voog eemaldati sellest brauserist.')
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

        <section
          className={`personal-feed-banner${personalFeed ? ' active' : ''}${personalFeedError ? ' invalid' : ''}`}
          aria-label="Isiklikud andmeallikad"
        >
          <span className="personal-feed-icon"><HardDrive size={18} /></span>
          <div className="personal-feed-copy">
            <strong>Isiklikud allikad</strong>
            <span>
              {personalFeed
                ? `${personalFeed.offers.length} tänast pakkumist · ${personalSourceCount} ${personalSourceCount === 1 ? 'isiklik allikas' : 'isiklikku allikat'} · uuendatud ${personalUpdatedAt}`
                : 'Impordi JSON või kasuta kohalikku brauserilaiendust. Andmed jäävad sellesse brauserisse.'}
            </span>
            {personalFeedError && <small className="personal-feed-error" role="alert">{personalFeedError}</small>}
            {personalFeedMessage && <small className="personal-feed-message" aria-live="polite">{personalFeedMessage}</small>}
          </div>
          <div className="personal-feed-actions">
            <input
              ref={importInputRef}
              className="sr-only"
              type="file"
              accept="application/json,.json"
              onChange={importPersonalFeed}
              aria-label="Impordi isikliku voo JSON"
            />
            <button type="button" onClick={() => importInputRef.current?.click()}>
              <Upload size={14} /> Impordi JSON
            </button>
            <button type="button" onClick={requestPersonalFeedRefresh}>
              <RefreshCw size={14} /> Uuenda
            </button>
            {hasStoredPersonalFeed && (
              <button type="button" className="danger" onClick={removePersonalFeed}>
                <Trash2 size={14} /> Eemalda
              </button>
            )}
          </div>
        </section>

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
              Avalik voog kasutab ainult lubatud kuupäevaga algallikaid. Isiklikult imporditud
              koondlehtede andmed jäävad sellesse brauserisse ja on selgelt märgistatud.
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
