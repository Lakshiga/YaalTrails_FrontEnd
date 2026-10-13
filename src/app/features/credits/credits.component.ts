import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PlaceService } from '../../core/services/place.service';
import { Place } from '../../core/models/place.model';
import { PHOTO_CREDITS } from '../../core/models/photo-credits';
import { I18nService } from '../../core/i18n/i18n.service';

@Component({
  selector: 'app-credits',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="container section" style="max-width: 960px">
      <div class="page-head">
        <div>
          <span class="eyebrow">{{ i18n.t('credits.eyebrow') }}</span>
          <h1 class="mt-1">{{ i18n.t('credits.title') }}</h1>
          <p>{{ i18n.t('credits.lead') }}</p>
        </div>
      </div>

      <div class="surface credit-list">
        @for (c of rows(); track c.image) {
          <div class="credit-row">
            <img [src]="c.image" alt="" loading="lazy" />
            <div class="credit-text">
              @if (c.place) {
                <a [routerLink]="['/places', c.place.id]" class="credit-place">{{ i18n.placeName(c.place) }}</a>
              }
              <div class="credit-meta">{{ i18n.t('credits.by') }} <strong>{{ c.author }}</strong> · {{ c.license }}</div>
            </div>
            <a [href]="c.source" target="_blank" rel="noopener" class="btn btn-soft btn-sm">{{ i18n.t('credits.source') }} <i class="bi bi-box-arrow-up-right"></i></a>
          </div>
        }
      </div>

      <p class="text-muted small mt-3">
        {{ i18n.t('credits.services') }}
      </p>
    </div>
  `,
  styles: [
    `
      .credit-list { padding: 0.5rem; }
      .credit-row { display: flex; align-items: center; gap: 1rem; padding: 0.75rem; border-bottom: 1px solid var(--line-2); }
      .credit-row:last-child { border-bottom: 0; }
      .credit-row img { width: 84px; height: 60px; object-fit: cover; border-radius: 10px; flex: none; }
      .credit-text { flex: 1; min-width: 0; }
      .credit-place { font-weight: 700; color: var(--ink); }
      .credit-place:hover { color: var(--brand); }
      .credit-meta { font-size: 0.85rem; color: var(--muted); }
    `
  ]
})
export class CreditsComponent implements OnInit {
  private placeService = inject(PlaceService);
  private places = signal<Place[]>([]);
  readonly i18n = inject(I18nService);

  rows = computed(() => PHOTO_CREDITS.map((c) => ({ ...c, place: this.places().find((p) => p.imageUrl === c.image) })));

  ngOnInit(): void {
    this.placeService.getAll().subscribe({ next: (places) => this.places.set(places) });
  }
}
