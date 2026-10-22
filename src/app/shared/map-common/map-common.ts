import { Directive, EventEmitter, Input, Output } from '@angular/core';
import { Place } from '../../core/models/place.model';
import { ExternalPlace } from '../../core/models/district.model';
import { categoryIcon } from '../../core/models/category-meta';
import { I18nService } from '../../core/i18n/i18n.service';
import { LatLng, googleMapsDirectionsUrl, haversineKm, roundKm } from '../../core/utils/geo';
import { shortText } from '../../core/utils/map-places';
import { externalPath, placePath } from '../../core/utils/place-ref';

/** Inputs shared by the map wrapper and both map implementations (Google Maps and Leaflet). */
@Directive()
export abstract class MapInputs {
  @Input() places: Place[] = [];
  @Input() showHome = true;
  @Input() height = '400px';
  /** Label pins 1, 2, 3… in list order instead of showing the category icon. */
  @Input() numbered = false;
  /** Draw a dashed line from home through the places in list order. */
  @Input() showRoute = false;
  /** Draw a dashed line from the last place back home (only with showRoute). */
  @Input() routeReturnsHome = false;
  /** Real road geometry ([lat, lng] pairs) to draw instead of straight dashed lines. */
  @Input() routeGeometry: [number, number][] | null = null;
  /** Show each place's name above its pin. */
  @Input() showLabels = true;
  /** The visitor's position: shown as a dot and used for "km from you" and directions. */
  @Input() userLocation: LatLng | null = null;
  /** Outline the service radius around the home reference point. */
  @Input() showServiceArea = false;
  /** Extra places (Google Places or OpenStreetMap), drawn as small dots without permanent labels. */
  @Input() externalPlaces: ExternalPlace[] = [];
  /** Start point of a plan, drawn as the home pin (defaults to the home reference point). */
  @Input() homePoint: LatLng | null = null;
  /** Label for the home pin (defaults to "Jaffna town"). */
  @Input() homeLabel: string | null = null;
  /** Where a plan ends when that is not its start: drawn as a flag pin, and the route line ends there. */
  @Input() endPoint: LatLng | null = null;
  @Input() endLabel: string | null = null;
  /** Where to centre the map when there is nothing to fit (defaults to the home reference point). */
  @Input() center: LatLng | null = null;
  /** While true, the map shows a crosshair and reports where it is clicked (mapClick). */
  @Input() pickMode = false;
  @Output() mapClick = new EventEmitter<LatLng>();
}

/**
 * A short label for a map pin: the part before the first comma ("Casuarina Beach, Karainagar" → "Casuarina Beach"),
 * at most `max` characters. The full name stays in the popup.
 */
export function shortLabel(name: string, max = 28): string {
  const head = name.split(',')[0].trim() || name.trim();
  return head.length > max ? head.slice(0, max - 1).trimEnd() + '…' : head;
}

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** Inner HTML of a category pin (styled by .map-pin in styles.css). */
export function pinHtml(category: string, label: string | null): string {
  const inner = label ?? `<i class="bi ${categoryIcon(category)}"></i>`;
  return `<div class="map-pin" data-category="${escapeHtml(category)}"><span>${inner}</span></div>`;
}

export const HOME_PIN_HTML = '<div class="map-pin home"><i class="bi bi-house-door-fill"></i></div>';
export const END_PIN_HTML = '<div class="map-pin home end"><i class="bi bi-flag-fill"></i></div>';
export const USER_DOT_HTML = '<div class="map-user-dot"></div>';

/** Popup contents, identical on both map providers. */
export class MapPopups {
  constructor(private i18n: I18nService) {}

  externalName(place: ExternalPlace): string {
    return this.i18n.placeName(place);
  }

  place(place: Place, user: LatLng | null): string {
    const image = place.imageUrl ? `<img class="map-popup-img" src="${escapeHtml(place.imageUrl)}" alt="" loading="lazy" />` : '';
    return (
      image +
      `<div class="map-popup-body">` +
      `<div class="map-popup-title">${escapeHtml(this.i18n.placeName(place))}</div>` +
      `<div class="map-popup-meta">${escapeHtml(this.i18n.category(place.category))} &middot; ${escapeHtml(this.i18n.t('map.fromHome', { km: place.distanceFromHomeKm }))}</div>` +
      this.fromYou(place, user) +
      `<p class="map-popup-desc">${escapeHtml(shortText(this.i18n.placeDescription(place)))}</p>` +
      `<div class="map-popup-actions">` +
      this.detailsLink(placePath(place), place.external?.url ?? null) +
      this.directionsLink(place, user) +
      `</div></div>`
    );
  }

  external(place: ExternalPlace, user: LatLng | null): string {
    const google = place.source === 'google';
    const image = place.photoUrl ? `<img class="map-popup-img" src="${escapeHtml(place.photoUrl)}" alt="" loading="lazy" />` : '';
    const rating =
      place.rating != null
        ? `<div class="map-popup-meta"><i class="bi bi-star-fill text-warning"></i> ${place.rating.toFixed(1)} (${place.ratingCount ?? 0})</div>`
        : '';
    const credit = place.photoCredit
      ? `<div class="map-popup-credit">${escapeHtml(this.i18n.t('ext.photoBy'))} ` +
        (place.photoCredit.url
          ? `<a href="${escapeHtml(place.photoCredit.url)}" target="_blank" rel="noopener">${escapeHtml(place.photoCredit.name)}</a>`
          : escapeHtml(place.photoCredit.name)) +
        `</div>`
      : '';
    return (
      image +
      `<div class="map-popup-body">` +
      credit +
      `<div class="map-popup-title">${escapeHtml(this.externalName(place))}</div>` +
      `<div class="map-popup-meta">${escapeHtml(this.i18n.category(place.category))} &middot; ${escapeHtml(this.i18n.t(google ? 'ext.sourceGoogle' : 'ext.sourceOsm'))}</div>` +
      rating +
      this.fromYou(place, user) +
      `<div class="map-popup-actions">` +
      this.detailsLink(externalPath(place), null) +
      `<a class="map-popup-link" href="${escapeHtml(place.url)}" target="_blank" rel="noopener">${google ? 'Google Maps' : 'OpenStreetMap'} &#8599;</a>` +
      `</div></div>`
    );
  }

  home(label: string | null): string {
    return label
      ? `<div class="map-popup-body"><div class="map-popup-title">${escapeHtml(label)}</div></div>`
      : `<div class="map-popup-body"><div class="map-popup-title">${escapeHtml(this.i18n.t('map.homeRef'))}</div>` +
          `<div class="map-popup-meta">${escapeHtml(this.i18n.t('map.homeSub'))}</div></div>`;
  }

  end(label: string | null): string {
    return `<div class="map-popup-body"><div class="map-popup-title">${escapeHtml(label ?? this.i18n.t('trip.end'))}</div></div>`;
  }

  you(): string {
    return `<div class="map-popup-body"><div class="map-popup-title">${escapeHtml(this.i18n.t('map.you'))}</div></div>`;
  }

  /** "View details" inside the app (data-route is picked up by the map component), or an outside link. */
  private detailsLink(path: string | null, outsideUrl: string | null): string {
    const label = `${escapeHtml(this.i18n.t('map.viewDetails'))} &rarr;`;
    if (path) return `<a class="map-popup-link" href="${escapeHtml(path)}" data-route="${escapeHtml(path)}">${label}</a>`;
    return outsideUrl ? `<a class="map-popup-link" href="${escapeHtml(outsideUrl)}" target="_blank" rel="noopener">${label}</a>` : '';
  }

  private fromYou(point: LatLng, user: LatLng | null): string {
    return user
      ? `<div class="map-popup-meta"><i class="bi bi-person"></i> ${escapeHtml(this.i18n.t('map.fromYou', { km: roundKm(haversineKm(user, point)) }))}</div>`
      : '';
  }

  private directionsLink(point: LatLng, user: LatLng | null): string {
    return (
      `<a class="map-popup-link" href="${escapeHtml(googleMapsDirectionsUrl(point, user))}" target="_blank" rel="noopener" ` +
      `title="${escapeHtml(this.i18n.t('map.opensGoogle'))}"><i class="bi bi-sign-turn-right"></i> ${escapeHtml(this.i18n.t('map.directions'))}</a>`
    );
  }
}
