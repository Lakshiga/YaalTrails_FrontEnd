import { Component, Input, computed, effect, inject, input, untracked, ChangeDetectionStrategy } from '@angular/core';
import { FORECAST_DAYS, WeatherService, weatherInfo } from '../../core/services/weather.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { HOME_LOCATION } from '../../core/models/home-reference';
import { LatLng } from '../../core/utils/geo';

/**
 * Weather from Open-Meteo.
 *  - variant "hero": compact current conditions in Jaffna for the dark home hero.
 *  - variant "day": the forecast for a trip date and place, with an hourly strip and planning advice (planner page).
 */
@Component({
  selector: 'app-weather-widget',
  standalone: true,
  template: `
    @if (weather(); as w) {
      @if (variant === 'hero') {
        <div class="wx-hero">
          <i class="bi wx-hero-icon" [class]="info(w.now.code, w.now.isDay).icon"></i>
          <div>
            <div class="wx-hero-label">{{ placeName ? i18n.t('weather.nowAt', { place: placeName }) : i18n.t('weather.now') }}</div>
            <div class="wx-hero-temp">{{ w.now.temperature }}°C <span>{{ i18n.t(info(w.now.code, w.now.isDay).key) }}</span></div>
            <div class="wx-hero-sub">
              {{ i18n.t('weather.feels', { t: w.now.feelsLike }) }} · {{ i18n.t('weather.rainChance', { p: w.days[0].rainChance }) }}
            </div>
          </div>
        </div>
      } @else {
        <div class="wx-day surface">
          <div class="wx-day-head">
            <div class="wx-day-title"><i class="bi bi-cloud-sun"></i> {{ i18n.t('weather.title') }}</div>
            <span class="wx-day-source">{{ i18n.t('weather.source') }}</span>
          </div>
          @if (placeName) {
            <div class="wx-day-place"><i class="bi bi-geo-alt"></i> {{ placeName }}</div>
          }
          @if (day(); as d) {
          <div class="wx-day-main">
            <i class="bi wx-day-icon" [class]="info(d.code).icon"></i>
            <div class="wx-day-temps">
              <div class="wx-day-big">{{ d.max }}° <small>/ {{ d.min }}°</small></div>
              <div class="wx-day-desc">{{ dayLabel(d.date) }} · {{ i18n.t(info(d.code).key) }}</div>
            </div>
            <dl class="wx-facts">
              <div><dt><i class="bi bi-umbrella"></i></dt><dd>{{ d.rainChance }}%</dd></div>
              <div><dt><i class="bi bi-sunrise"></i></dt><dd>{{ timeOf(d.sunrise) }}</dd></div>
              <div><dt><i class="bi bi-sunset"></i></dt><dd>{{ timeOf(d.sunset) }}</dd></div>
              <div><dt>UV</dt><dd>{{ d.uvMax }}</dd></div>
            </dl>
          </div>
          <div class="wx-hours">
            @for (h of dayHours(); track h.time) {
              <div class="wx-hour" [class.wet]="h.rainChance >= 50">
                <span class="wx-hour-time">{{ hourLabel(h.time) }}</span>
                <i class="bi" [class]="info(h.code).icon"></i>
                <span class="wx-hour-temp">{{ h.temperature }}°</span>
                <span class="wx-hour-rain"><i class="bi bi-droplet"></i>{{ h.rainChance }}%</span>
              </div>
            }
          </div>
          <div class="wx-advice" [class.warn]="advice().warn">
            <i class="bi" [class]="advice().warn ? 'bi-exclamation-triangle' : 'bi-check2-circle'"></i>
            {{ advice().text }}
          </div>
          } @else {
            <div class="wx-advice"><i class="bi bi-calendar-x"></i> {{ i18n.t('weather.outOfRange', { days: forecastDays }) }}</div>
          }
        </div>
      }
    } @else if (failed() && variant === 'day') {
      <div class="wx-day surface wx-unavailable"><i class="bi bi-cloud-slash"></i> {{ i18n.t('weather.unavailable') }}</div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [
    `
      :host { display: block; container-type: inline-size; }
      .wx-hero {
        display: flex; align-items: center; gap: 0.9rem;
        padding: 0.85rem 1.1rem; border-radius: var(--radius);
        background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.16);
        backdrop-filter: blur(6px); color: #fff;
      }
      .wx-hero-icon { font-size: 2.1rem; color: #f3c27a; }
      .wx-hero-label { font-size: 0.72rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(255,255,255,0.65); }
      .wx-hero-temp { font-size: 1.25rem; font-weight: 800; }
      .wx-hero-temp span { font-size: 0.9rem; font-weight: 600; color: rgba(255,255,255,0.85); margin-left: 0.3rem; }
      .wx-hero-sub { font-size: 0.78rem; color: rgba(255,255,255,0.7); }

      .wx-day { padding: 1rem 1.1rem; }
      .wx-day-head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: 0.15rem 0.5rem; margin-bottom: 0.75rem; }
      .wx-day-title { font-weight: 700; }
      .wx-day-title .bi { color: var(--accent); margin-right: 0.3rem; }
      .wx-day-source { font-size: 0.72rem; color: var(--muted); }
      .wx-day-main { display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; }
      .wx-day-icon { font-size: 2.6rem; color: var(--accent); }
      .wx-day-big { font-size: 1.6rem; font-weight: 800; line-height: 1; }
      .wx-day-big small { font-size: 1rem; color: var(--muted); font-weight: 600; }
      .wx-day-desc { font-size: 0.85rem; color: var(--muted); margin-top: 0.2rem; }
      .wx-facts { display: flex; gap: 0.9rem; margin: 0 0 0 auto; font-size: 0.8rem; }
      .wx-facts div { text-align: center; }
      .wx-facts dt { color: var(--muted); font-weight: 700; font-size: 0.75rem; }
      .wx-facts dd { margin: 0; font-weight: 700; }
      .wx-day-place { margin-top: 0.3rem; font-size: 0.8rem; color: var(--muted); }
      .wx-hours { display: flex; gap: 0.4rem; overflow-x: auto; margin-top: 0.9rem; padding-bottom: 0.25rem; scroll-snap-type: x proximity; scrollbar-width: thin; }
      .wx-hour { scroll-snap-align: start; }
      .wx-hour {
        flex: none; display: flex; flex-direction: column; align-items: center; gap: 0.15rem;
        min-width: 56px; padding: 0.5rem 0.3rem; border-radius: 12px; background: var(--line-2); font-size: 0.75rem;
      }
      .wx-hour.wet { background: #e5effa; }
      .wx-hour .bi { font-size: 1.05rem; color: var(--ink-2); }
      .wx-hour-time { color: var(--muted); font-weight: 600; }
      .wx-hour-temp { font-weight: 800; }
      .wx-hour-rain { color: #3d6fa8; font-size: 0.7rem; }
      .wx-hour-rain .bi { font-size: 0.65rem; color: inherit; }
      .wx-advice {
        display: flex; gap: 0.5rem; align-items: flex-start; margin-top: 0.8rem; padding: 0.6rem 0.8rem;
        border-radius: 10px; font-size: 0.82rem; background: var(--brand-50); color: var(--brand-700);
      }
      .wx-advice.warn { background: var(--accent-50); color: #7a4a14; }
      .wx-unavailable { color: var(--muted); font-size: 0.9rem; }
      /* Narrow card (phones, or the planner's side column): facts become an even row under the temperature. */
      @container (max-width: 520px) {
        .wx-day-head { flex-direction: column; align-items: flex-start; }
        .wx-facts {
          flex: 1 1 100%; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0.25rem;
          margin: 0.2rem 0 0; padding: 0.55rem 0.4rem; border-radius: 12px; background: var(--line-2);
        }
        .wx-facts dd { font-size: 0.78rem; white-space: nowrap; }
      }
      @container (max-width: 300px) {
        .wx-hero { padding: 0.75rem 0.85rem; gap: 0.65rem; }
        .wx-hero-icon { font-size: 1.7rem; }
        .wx-hero-temp span { display: block; margin: 0; }
        .wx-day-icon { font-size: 2.1rem; }
      }
    `
  ]
})
export class WeatherWidgetComponent {
  private weatherService = inject(WeatherService);
  i18n = inject(I18nService);

  @Input() variant: 'hero' | 'day' = 'hero';
  /** Place name shown under the title (day variant). */
  @Input() placeName: string | null = null;
  /** Trip date, YYYY-MM-DD (day variant); defaults to today. */
  date = input<string | null>(null);
  /** Where to forecast; defaults to Jaffna town. */
  location = input<LatLng | null>(null);
  /** Planner start/end (minutes after midnight) to focus the hourly strip and advice. */
  fromMinutes = input(8 * 60);
  toMinutes = input(18 * 60);

  readonly forecastDays = FORECAST_DAYS;
  private place = computed(() => this.location() ?? HOME_LOCATION);
  weather = computed(() => this.weatherService.weatherAt(this.place()));
  failed = computed(() => this.weatherService.failedAt(this.place()));
  info = weatherInfo;

  /** The forecast day for the trip date, or null when the date is beyond the forecast range. */
  day = computed(() => {
    const w = this.weather();
    if (!w) return null;
    const date = this.date();
    return date ? (w.days.find((d) => d.date === date) ?? null) : w.days[0];
  });

  constructor() {
    // Fetch (or reuse) the forecast whenever the location changes.
    effect(() => {
      const place = this.place();
      untracked(() => this.weatherService.load(place));
    });
  }

  dayHours = computed(() => {
    const w = this.weather();
    const day = this.day();
    if (!w || !day) return [];
    const today = day.date;
    const fromHour = Math.floor(this.fromMinutes() / 60);
    const toHour = Math.min(23, Math.ceil(this.toMinutes() / 60));
    return w.hours.filter((h) => {
      if (!h.time.startsWith(today)) return false;
      const hour = Number(h.time.slice(11, 13));
      return hour >= fromHour && hour <= toHour;
    });
  });

  advice = computed(() => {
    this.i18n.lang();
    const hours = this.dayHours();
    const wet = hours.find((h) => h.rainChance >= 50);
    if (wet) return { warn: true, text: this.i18n.t('weather.rainWarning', { time: this.hourLabel(wet.time) }) };
    const max = Math.max(...hours.map((h) => h.temperature), -Infinity);
    if (max >= 33) return { warn: true, text: this.i18n.t('weather.hot', { t: max }) };
    return { warn: false, text: this.i18n.t('weather.allGood') };
  });

  /** "Today", or the date written out. */
  dayLabel(date: string): string {
    const w = this.weather();
    if (w && date === w.days[0].date) return this.i18n.t('weather.today');
    return this.i18n.date(`${date}T00:00:00`, { weekday: 'short', day: 'numeric', month: 'short' });
  }

  timeOf(iso: string): string {
    const [h, m] = iso.slice(11, 16).split(':').map(Number);
    return this.i18n.clock(h * 60 + m);
  }

  hourLabel(iso: string): string {
    const hour = Number(iso.slice(11, 13));
    const h12 = hour % 12 === 0 ? 12 : hour % 12;
    return `${h12} ${this.i18n.t(hour < 12 ? 'time.am' : 'time.pm')}`;
  }
}
