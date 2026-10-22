import { AfterViewChecked, Component, ElementRef, Input, ViewChild, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { categoryIcon } from '../../core/models/category-meta';
import { I18nService } from '../../core/i18n/i18n.service';
import { StarRatingComponent } from '../star-rating/star-rating.component';
import { FadeImageDirective } from '../fade-image/fade-image.directive';

/** One place in the popular strip — our own place or a well-rated Google place. */
export interface PopularItem {
  key: string;
  name: string;
  category: string;
  photoUrl: string | null;
  /** A photo lookup is still running: show a placeholder. */
  photoPending: boolean;
  /** Details page inside the site, or null to open `url` instead. */
  link: string[] | null;
  url: string | null;
  rating: number | null;
  ratingCount: number;
  /** Straight-line km from the area centre. */
  km: number;
}

/**
 * The most popular places in an area. One or two places get wide "feature" cards; three or more
 * become a swipeable row with arrow buttons on larger screens.
 */
@Component({
  selector: 'app-popular-places',
  standalone: true,
  imports: [RouterLink, StarRatingComponent, FadeImageDirective],
  template: `
    @if (items.length > 0) {
      <section class="popular" [class.is-row]="items.length > 2" [attr.aria-labelledby]="headingId">
        <div class="popular-head">
          <h2 class="popular-title" [id]="headingId"><i class="bi bi-fire" aria-hidden="true"></i> {{ title }}</h2>
          @if (items.length > 2) {
            <div class="popular-nav">
              <button type="button" class="btn btn-soft btn-icon" (click)="scroll(-1)" [disabled]="atStart()" [attr.aria-label]="i18n.t('popular.prev')">
                <i class="bi bi-chevron-left"></i>
              </button>
              <button type="button" class="btn btn-soft btn-icon" (click)="scroll(1)" [disabled]="atEnd()" [attr.aria-label]="i18n.t('popular.next')">
                <i class="bi bi-chevron-right"></i>
              </button>
            </div>
          }
        </div>

        <div class="popular-track" #track (scroll)="updateEdges()" [class.fade-start]="!atStart()" [class.fade-end]="!atEnd()">
          @for (item of items; track item.key) {
            <article class="pop-card" [attr.data-category]="item.category">
              <div class="pop-img" [class.photo-pending]="item.photoPending && !item.photoUrl">
                @if (item.photoUrl && !failed().has(item.photoUrl)) {
                  <img appFadeImage (failed)="markFailed(item.photoUrl)" [src]="item.photoUrl" alt="" loading="lazy" />
                } @else if (!item.photoPending) {
                  <i class="bi" [class]="categoryIcon(item.category)" aria-hidden="true"></i>
                }
                <span class="pop-rank">{{ $index + 1 }}</span>
              </div>
              <div class="pop-body">
                <span class="pop-cat"><i class="bi" [class]="categoryIcon(item.category)" aria-hidden="true"></i> {{ i18n.category(item.category) }}</span>
                <h3 class="pop-name" [title]="item.name">
                  @if (item.link) {
                    <a [routerLink]="item.link" class="stretched-link">{{ item.name }}</a>
                  } @else {
                    <a [href]="item.url" target="_blank" rel="noopener" class="stretched-link">{{ item.name }}</a>
                  }
                </h3>
                <div class="pop-meta">
                  @if (item.rating != null) {
                    <app-star-rating [value]="item.rating" size="0.78rem" />
                    <strong>{{ item.rating.toFixed(1) }}</strong>
                    @if (item.ratingCount > 0) {
                      <span>({{ item.ratingCount }})</span>
                    }
                  }
                  <span class="pop-km"><i class="bi bi-signpost-2" aria-hidden="true"></i> {{ item.km }} {{ i18n.t('unit.km') }}</span>
                </div>
                <span class="pop-more" aria-hidden="true">{{ i18n.t('card.details') }} <i class="bi bi-arrow-right"></i></span>
              </div>
            </article>
          }
        </div>
      </section>
    }
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [
    `
      :host { display: block; }
      .popular { margin-bottom: 2rem; }
      .popular-head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: 0.85rem; }
      .popular-title { font-size: clamp(1.05rem, 2.6vw, 1.25rem); font-weight: 800; margin: 0; }
      .popular-title .bi { color: var(--accent); }
      .popular-nav { display: flex; gap: 0.4rem; }

      /* ----- One or two places: wide feature cards ----- */
      .popular-track {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 340px), 1fr));
        gap: 1rem;
      }
      /* Each feature card is at most 460px wide, so a single place does not stretch across the page. */
      .popular:not(.is-row) .popular-track { grid-template-columns: repeat(auto-fit, minmax(min(100%, 340px), 460px)); }
      .pop-card {
        position: relative;
        display: grid;
        grid-template-columns: minmax(130px, 42%) 1fr;
        min-height: 150px;
        overflow: hidden;
        border-radius: 16px;
        background: var(--surface, #fff);
        border: 1px solid var(--line-2);
        color: var(--ink);
        transition: transform 0.15s ease, box-shadow 0.15s ease;
      }
      .pop-card:hover { transform: translateY(-2px); box-shadow: var(--shadow); }
      .pop-card:focus-within { outline: 2px solid var(--brand); outline-offset: 2px; }
      .pop-img {
        position: relative;
        display: grid;
        place-items: center;
        min-height: 130px;
        background: var(--cat-soft);
        color: var(--cat);
        font-size: 1.9rem;
        overflow: hidden;
      }
      .pop-img img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
      .pop-rank {
        position: absolute;
        top: 0.55rem;
        left: 0.55rem;
        z-index: 1;
        min-width: 1.6rem;
        height: 1.6rem;
        padding: 0 0.4rem;
        display: grid;
        place-items: center;
        border-radius: 999px;
        background: var(--accent);
        color: #fff;
        font-size: 0.75rem;
        font-weight: 800;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
      }
      .pop-body { display: flex; flex-direction: column; gap: 0.35rem; padding: 0.9rem 1rem; min-width: 0; }
      .pop-cat { font-size: 0.72rem; font-weight: 700; color: var(--cat); text-transform: uppercase; letter-spacing: 0.04em; }
      /* Long names are cut to two lines so one place cannot stretch every card in the row. */
      .pop-name {
        display: -webkit-box;
        -webkit-line-clamp: 2;
        line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        font-size: 1rem;
        font-weight: 700;
        line-height: 1.3;
        margin: 0;
        overflow-wrap: anywhere;
      }
      .pop-name a { color: inherit; }
      .pop-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 0.3rem 0.45rem; font-size: 0.78rem; color: var(--muted); }
      .pop-meta strong { color: var(--ink); }
      .pop-km { white-space: nowrap; }
      .pop-more { margin-top: auto; font-size: 0.8rem; font-weight: 700; color: var(--brand); }

      /* ----- Three or more: a swipeable row of compact cards ----- */
      .is-row .popular-track {
        display: flex;
        gap: 0.85rem;
        overflow-x: auto;
        scroll-snap-type: x mandatory;
        scroll-behavior: smooth;
        overscroll-behavior-x: contain;
        padding: 0.25rem 0.1rem 0.6rem;
        scrollbar-width: thin;
      }
      .is-row .popular-track.fade-end { mask-image: linear-gradient(to right, #000 85%, transparent); }
      .is-row .popular-track.fade-start { mask-image: linear-gradient(to right, transparent, #000 15%); }
      .is-row .popular-track.fade-start.fade-end { mask-image: linear-gradient(to right, transparent, #000 10%, #000 90%, transparent); }
      .is-row .pop-card {
        flex: 0 0 clamp(200px, 62vw, 240px);
        grid-template-columns: 1fr;
        grid-template-rows: 140px auto;
        scroll-snap-align: start;
      }
      .is-row .pop-img { min-height: 0; }
      .is-row .pop-body { padding: 0.7rem 0.8rem 0.8rem; }
      .is-row .pop-name { font-size: 0.92rem; }

      /* Phones: feature cards stack the photo on top; swiping replaces the arrows. */
      @media (max-width: 575.98px) {
        .pop-card { grid-template-columns: 1fr; grid-template-rows: 160px auto; }
        .popular-nav { display: none; }
      }
      @media (prefers-reduced-motion: reduce) {
        .pop-card { transition: none; }
        .is-row .popular-track { scroll-behavior: auto; }
      }
    `
  ]
})
export class PopularPlacesComponent implements AfterViewChecked {
  readonly i18n = inject(I18nService);
  readonly categoryIcon = categoryIcon;
  private static nextId = 0;
  readonly headingId = `popular-heading-${PopularPlacesComponent.nextId++}`;

  @Input() items: PopularItem[] = [];
  @Input() title = '';

  @ViewChild('track') track?: ElementRef<HTMLElement>;

  atStart = signal(true);
  atEnd = signal(false);
  failed = signal<ReadonlySet<string>>(new Set());

  /** Scrolls the row by about one screenful of cards. */
  scroll(direction: 1 | -1): void {
    const el = this.track?.nativeElement;
    if (el) el.scrollBy({ left: direction * el.clientWidth * 0.85, behavior: 'smooth' });
  }

  updateEdges(): void {
    const el = this.track?.nativeElement;
    if (!el) return;
    this.atStart.set(el.scrollLeft <= 4);
    this.atEnd.set(el.scrollLeft + el.clientWidth >= el.scrollWidth - 4);
  }

  markFailed(url: string): void {
    this.failed.update((failed) => new Set(failed).add(url));
  }

  ngAfterViewChecked(): void {
    // The cards (and so the row's width) change with the area: keep the arrows and edge fades in step.
    const el = this.track?.nativeElement;
    if (el && this.atEnd() !== el.scrollLeft + el.clientWidth >= el.scrollWidth - 4) queueMicrotask(() => this.updateEdges());
  }
}
