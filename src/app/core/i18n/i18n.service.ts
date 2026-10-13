import { Injectable, computed, effect, signal } from '@angular/core';
import { EN, Lang, TA } from './translations';
import { Place } from '../models/place.model';

const LANG_KEY = 'yaal_lang';

@Injectable({ providedIn: 'root' })
export class I18nService {
  readonly lang = signal<Lang>(this.loadLang());
  readonly isTamil = computed(() => this.lang() === 'ta');

  constructor() {
    effect(() => {
      const lang = this.lang();
      document.documentElement.lang = lang;
      try {
        localStorage.setItem(LANG_KEY, lang);
      } catch {
        // Storage unavailable; the choice still applies for this session.
      }
    });
  }

  setLang(lang: Lang): void {
    this.lang.set(lang);
  }

  toggle(): void {
    this.lang.set(this.lang() === 'en' ? 'ta' : 'en');
  }

  /** Translate a key, replacing {placeholders} with params. Falls back to English, then the key. */
  t(key: string, params?: Record<string, string | number>): string {
    const dict = this.lang() === 'ta' ? TA : EN;
    let text = dict[key] ?? EN[key] ?? key;
    if (params) {
      for (const [name, value] of Object.entries(params)) text = text.split(`{${name}}`).join(String(value));
    }
    return text;
  }

  category(category: string): string {
    return this.t(`category.${category}`) === `category.${category}` ? category : this.t(`category.${category}`);
  }

  placeName(p: Pick<Place, 'name' | 'nameTa'>): string {
    return this.isTamil() && p.nameTa ? p.nameTa : p.name;
  }

  placeDescription(p: Place): string {
    return this.isTamil() && p.descriptionTa ? p.descriptionTa : p.description;
  }

  placeHours(p: Pick<Place, 'openingHours' | 'openingHoursTa'>): string {
    return this.isTamil() && p.openingHoursTa ? p.openingHoursTa : p.openingHours;
  }

  placeTips(p: Place): string {
    return this.isTamil() && p.travelTipsTa ? p.travelTipsTa : p.travelTips;
  }

  /** "45 mins - 1 hour" → "45 நிமி. - 1 மணி" in Tamil; unchanged in English. */
  duration(text: string): string {
    if (!this.isTamil()) return text;
    return text
      .replace(/\bhours?\b/gi, 'மணி')
      .replace(/\bmins?\b|\bminutes?\b/gi, 'நிமி.');
  }

  /** Minutes after midnight → "8:05 AM" / "8:05 மு.ப." */
  clock(minutes: number): string {
    const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
    const h24 = Math.floor(m / 60);
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    return `${h12}:${String(m % 60).padStart(2, '0')} ${this.t(h24 < 12 ? 'time.am' : 'time.pm')}`;
  }

  /** 135 → "2 hr 15 min" / "2 மணி 15 நிமி." */
  minutes(total: number): string {
    const hours = Math.floor(total / 60);
    const mins = total % 60;
    const hr = this.t('unit.hr');
    const min = this.t('unit.min');
    if (hours === 0) return `${mins} ${min}`;
    if (mins === 0) return `${hours} ${hr}`;
    return `${hours} ${hr} ${mins} ${min}`;
  }

  date(value: string | Date, options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }): string {
    return new Date(value).toLocaleDateString(this.isTamil() ? 'ta-LK' : 'en-GB', options);
  }

  private loadLang(): Lang {
    try {
      return localStorage.getItem(LANG_KEY) === 'ta' ? 'ta' : 'en';
    } catch {
      return 'en';
    }
  }
}
