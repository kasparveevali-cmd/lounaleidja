import { Heart, ListFilter, Search } from 'lucide-react'
import type { SortMode } from '../types'

interface FiltersProps {
  query: string
  sort: SortMode
  minPrice: number
  maxPrice: number
  confirmedOnly: boolean
  favoritesOnly: boolean
  hasFavorites: boolean
  onQueryChange: (value: string) => void
  onSortChange: (value: SortMode) => void
  onMinPriceChange: (value: number) => void
  onMaxPriceChange: (value: number) => void
  onConfirmedOnlyChange: (value: boolean) => void
  onFavoritesOnlyChange: (value: boolean) => void
}

export function Filters(props: FiltersProps) {
  return (
    <div className="filters" aria-label="Tulemuste filtrid">
      <div className="filter-search">
        <Search aria-hidden="true" size={18} />
        <input
          value={props.query}
          onChange={(event) => props.onQueryChange(event.target.value)}
          placeholder="Otsi restorani või toitu"
          aria-label="Otsi restorani või toitu"
        />
      </div>
      <div className="filter-select-wrap">
        <ListFilter aria-hidden="true" size={17} />
        <select
          value={props.sort}
          onChange={(event) => props.onSortChange(event.target.value as SortMode)}
          aria-label="Sorteerimine"
        >
          <option value="distance">Lähimad enne</option>
          <option value="price">Odavaim enne</option>
          <option value="name">Nime järgi</option>
        </select>
      </div>
      <div className="price-filter">
        <span>Hind</span>
        <label>
          <span className="sr-only">Miinimumhind</span>
          <input
            type="number"
            min="0"
            max={props.maxPrice}
            step="0.5"
            value={props.minPrice}
            onChange={(event) => props.onMinPriceChange(Number(event.target.value))}
          />
          <span>€</span>
        </label>
        <span className="price-dash">–</span>
        <label>
          <span className="sr-only">Maksimumhind</span>
          <input
            type="number"
            min={props.minPrice}
            max="100"
            step="0.5"
            value={props.maxPrice}
            onChange={(event) => props.onMaxPriceChange(Number(event.target.value))}
          />
          <span>€</span>
        </label>
      </div>
      <label className="toggle-filter">
        <input
          type="checkbox"
          checked={props.confirmedOnly}
          onChange={(event) => props.onConfirmedOnlyChange(event.target.checked)}
        />
        <span className="toggle-track" />
        Ainult kinnitatud
      </label>
      <button
        className={`favorite-filter ${props.favoritesOnly ? 'active' : ''}`}
        type="button"
        disabled={!props.hasFavorites}
        onClick={() => props.onFavoritesOnlyChange(!props.favoritesOnly)}
        aria-pressed={props.favoritesOnly}
      >
        <Heart size={17} fill={props.favoritesOnly ? 'currentColor' : 'none'} />
        Lemmikud
      </button>
    </div>
  )
}
