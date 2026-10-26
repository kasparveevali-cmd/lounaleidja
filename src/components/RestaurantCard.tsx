import { ArrowUpRight, Check, Clock3, Heart, MapPinned, Navigation } from 'lucide-react'
import type { RestaurantResult } from '../types'
import { formatDistance } from '../lib/offers'

interface RestaurantCardProps {
  restaurant: RestaurantResult
  favorite: boolean
  onToggleFavorite: (restaurantId: string) => void
}

function formatFetchedAt(value: string) {
  return new Intl.DateTimeFormat('et-EE', {
    timeZone: 'Europe/Tallinn',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export function RestaurantCard({ restaurant, favorite, onToggleFavorite }: RestaurantCardProps) {
  const firstOffer = restaurant.offers[0]
  const sources = [...new Map(restaurant.offers.map((offer) => [
    `${offer.sourceName}|${offer.sourceUrl}`,
    { name: offer.sourceName, url: offer.sourceUrl },
  ])).values()]
  const timeLabel = firstOffer.lunchStartTime
    ? `${firstOffer.lunchStartTime}–${firstOffer.lunchEndTime ?? ''}`
    : null
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${restaurant.latitude},${restaurant.longitude}`

  return (
    <article className="restaurant-card">
      <header className="card-header">
        <div>
          <div className="card-title-row">
            <h3>{restaurant.restaurantName}</h3>
            {restaurant.verificationStatus === 'verified' && (
              <span className="verified-badge" title="Pakkumine pärineb tänase kuupäevaga algallikast">
                <Check size={13} strokeWidth={3} /> Kinnitatud
              </span>
            )}
          </div>
          <p>{restaurant.address}</p>
        </div>
        <button
          className={`heart-button ${favorite ? 'favorite' : ''}`}
          type="button"
          onClick={() => onToggleFavorite(restaurant.restaurantId)}
          aria-label={favorite ? 'Eemalda lemmikutest' : 'Lisa lemmikutesse'}
        >
          <Heart size={20} fill={favorite ? 'currentColor' : 'none'} />
        </button>
      </header>

      <div className="card-meta">
        <span><MapPinned size={16} /> {formatDistance(restaurant.distanceKm)}</span>
        {timeLabel && <span><Clock3 size={16} /> {timeLabel}</span>}
      </div>

      <div className="offer-list">
        {restaurant.offers.map((offer) => (
          <div className="offer-row" key={`${offer.offerName}-${offer.price}`}>
            <div>
              <strong>{offer.offerName}</strong>
              {offer.description && <p>{offer.description}</p>}
            </div>
            <span className="offer-price">
              {offer.price.toLocaleString('et-EE', { minimumFractionDigits: 2 })} €
            </span>
          </div>
        ))}
      </div>

      <footer className="card-footer">
        <div className="source-note">
          <span>{sources.length === 1 ? sources[0].name : `${sources.length} algallikat`}</span>
          <small>Kontrollitud {formatFetchedAt(restaurant.fetchedAt)}</small>
        </div>
        <div className="card-actions">
          {sources.map((source) => (
            <a href={source.url} target="_blank" rel="noreferrer" key={`${source.name}|${source.url}`}>
              {sources.length === 1 ? 'Vaata menüüd' : source.name.split(' · ')[0]} <ArrowUpRight size={15} />
            </a>
          ))}
          <a className="directions" href={directionsUrl} target="_blank" rel="noreferrer">
            <Navigation size={15} /> Juhised
          </a>
        </div>
      </footer>
    </article>
  )
}
