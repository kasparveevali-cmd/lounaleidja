import { Crosshair, LoaderCircle, LocateFixed, MapPin, Search } from 'lucide-react'
import { useState, type CSSProperties } from 'react'
import { useGeocoding } from '../hooks/useGeocoding'
import type { LocationPoint } from '../types'

interface SearchPanelProps {
  location: LocationPoint | null
  radiusKm: number
  onLocationChange: (location: LocationPoint | null) => void
  onRadiusChange: (radiusKm: number) => void
}

export function SearchPanel({
  location,
  radiusKm,
  onLocationChange,
  onRadiusChange,
}: SearchPanelProps) {
  const [query, setQuery] = useState(location?.label ?? '')
  const [isEditing, setIsEditing] = useState(false)
  const [geoError, setGeoError] = useState<string | null>(null)
  const [locating, setLocating] = useState(false)
  const { suggestions, loading, error } = useGeocoding(query, isEditing)

  function useMyLocation() {
    if (!navigator.geolocation) {
      setGeoError('Sinu brauser ei toeta asukoha määramist.')
      return
    }
    setLocating(true)
    setGeoError(null)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextLocation = {
          label: 'Minu praegune asukoht',
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        }
        onLocationChange(nextLocation)
        setQuery(nextLocation.label)
        setIsEditing(false)
        setLocating(false)
      },
      (positionError) => {
        const messages: Record<number, string> = {
          1: 'Asukoha kasutamine pole lubatud. Sisesta aadress käsitsi.',
          2: 'Sinu asukohta ei õnnestunud määrata. Sisesta aadress käsitsi.',
          3: 'Asukoha leidmine võttis liiga kaua. Proovi uuesti.',
        }
        setGeoError(messages[positionError.code] ?? 'Asukoha kasutamine ei õnnestunud.')
        setLocating(false)
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 },
    )
  }

  return (
    <section className="search-panel" aria-label="Lõunapakkumiste otsing">
      <div className="location-block">
        <div className="field-label-row">
          <label htmlFor="location-search">Asukoht</label>
          {location && (
            <button
              className="clear-location"
              type="button"
              onClick={() => {
                setQuery('')
                onLocationChange(null)
                setIsEditing(true)
              }}
            >
              Tühjenda
            </button>
          )}
        </div>
        <div className="location-controls">
          <div className="autocomplete-wrap">
            <MapPin aria-hidden="true" size={19} />
            <input
              id="location-search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setIsEditing(true)
              }}
              onFocus={() => setIsEditing(true)}
              placeholder="Sisesta aadress või asukoht"
              autoComplete="off"
              aria-autocomplete="list"
              aria-expanded={isEditing && (loading || suggestions.length > 0)}
            />
            {loading ? <LoaderCircle className="spin" aria-label="Laadib" size={18} /> : <Search size={18} />}
            {isEditing && (loading || suggestions.length > 0) && (
              <div className="suggestions" role="listbox">
                {loading && <div className="suggestion-loading">Otsin asukohti…</div>}
                {!loading &&
                  suggestions.map((suggestion) => (
                    <button
                      type="button"
                      role="option"
                      aria-selected="false"
                      key={suggestion.id}
                      onClick={() => {
                        onLocationChange(suggestion)
                        setQuery(suggestion.label)
                        setIsEditing(false)
                      }}
                    >
                      <MapPin aria-hidden="true" size={17} />
                      <span>{suggestion.label}</span>
                    </button>
                  ))}
                <a
                  className="nominatim-credit"
                  href="https://nominatim.org/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Otsing: Nominatim / OpenStreetMap
                </a>
              </div>
            )}
          </div>
          <button className="location-button" type="button" onClick={useMyLocation} disabled={locating}>
            {locating ? <LoaderCircle className="spin" size={18} /> : <LocateFixed size={18} />}
            {locating ? 'Määran asukohta…' : 'Kasuta minu asukohta'}
          </button>
        </div>
        {(geoError || error) && <p className="inline-error">{geoError || error}</p>}
        {!location && <p className="field-hint">Ilma asukohata näed kõiki tänaseid pakkumisi üle Eesti.</p>}
      </div>

      <div className="radius-block">
        <div className="radius-heading">
          <div>
            <span className="field-label">Otsinguraadius</span>
            <strong>{radiusKm.toLocaleString('et-EE')} km</strong>
          </div>
          <Crosshair aria-hidden="true" size={22} />
        </div>
        <input
          className="radius-slider"
          type="range"
          min="0.5"
          max="30"
          step="0.5"
          value={radiusKm}
          onChange={(event) => onRadiusChange(Number(event.target.value))}
          aria-label="Otsinguraadius kilomeetrites"
          style={{ '--progress': `${((radiusKm - 0.5) / 29.5) * 100}%` } as CSSProperties}
        />
        <div className="range-labels" aria-hidden="true">
          <span>0,5 km</span>
          <span>30 km</span>
        </div>
      </div>
    </section>
  )
}
