import L from 'leaflet'
import { useEffect, useRef } from 'react'
import type { LocationPoint, RestaurantResult } from '../types'

interface MapViewProps {
  restaurants: RestaurantResult[]
  location: LocationPoint | null
  radiusKm: number
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#039;',
      '"': '&quot;',
    }
    return entities[character]
  })
}

export function MapView({ restaurants, location, radiusKm }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const center: L.LatLngExpression = location
      ? [location.latitude, location.longitude]
      : restaurants.length
        ? [restaurants[0].latitude, restaurants[0].longitude]
        : [58.6, 25.4]
    const map = L.map(containerRef.current, { zoomControl: false, scrollWheelZoom: true }).setView(
      center,
      location ? 13 : restaurants.length ? 12 : 7,
    )
    L.control.zoom({ position: 'bottomright' }).addTo(map)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map)

    const bounds = L.latLngBounds([])
    if (location) {
      L.circle([location.latitude, location.longitude], {
        radius: radiusKm * 1000,
        color: '#557466',
        fillColor: '#8fa99b',
        fillOpacity: 0.1,
        weight: 1.5,
      }).addTo(map)
      L.circleMarker([location.latitude, location.longitude], {
        radius: 7,
        color: '#ffffff',
        fillColor: '#29463a',
        fillOpacity: 1,
        weight: 3,
      })
        .bindTooltip('Sinu asukoht')
        .addTo(map)
      bounds.extend([location.latitude, location.longitude])
    }

    restaurants.forEach((restaurant, index) => {
      const icon = L.divIcon({
        className: 'restaurant-map-marker',
        html: `<span><b>${index + 1}</b></span>`,
        iconSize: [34, 42],
        iconAnchor: [17, 40],
        popupAnchor: [0, -36],
      })
      const offerPreview = restaurant.offers
        .slice(0, 3)
        .map(
          (offer) =>
            `<li><span>${escapeHtml(offer.offerName)}</span><b>${offer.price.toLocaleString('et-EE', { minimumFractionDigits: 2 })} €</b></li>`,
        )
        .join('')
      L.marker([restaurant.latitude, restaurant.longitude], { icon })
        .bindPopup(
          `<div class="map-popup"><strong>${escapeHtml(restaurant.restaurantName)}</strong><small>${escapeHtml(restaurant.address)}</small><ul>${offerPreview}</ul><a href="${restaurant.sourceUrl}" target="_blank" rel="noreferrer">Ava menüü ↗</a></div>`,
          { minWidth: 240 },
        )
        .addTo(map)
      bounds.extend([restaurant.latitude, restaurant.longitude])
    })

    if (bounds.isValid() && restaurants.length > 0) {
      map.fitBounds(bounds.pad(0.18), { maxZoom: 14 })
    }

    window.setTimeout(() => map.invalidateSize(), 80)
    return () => {
      map.remove()
    }
  }, [location, radiusKm, restaurants])

  return <div className="map-container" ref={containerRef} aria-label="Restoranide kaart" />
}
