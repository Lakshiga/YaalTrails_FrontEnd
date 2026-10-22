import { Injectable, computed, effect, signal } from '@angular/core';
import { EN, Lang, SI, TA } from './translations';
import { Place } from '../models/place.model';
import { District } from '../models/district.model';

const LANG_KEY = 'yaal_lang';
const DICTS: Record<Lang, Record<string, string>> = { en: EN, ta: TA, si: SI };
const LOCALES: Record<Lang, string> = { en: 'en-GB', ta: 'ta-LK', si: 'si-LK' };

@Injectable({ providedIn: 'root' })
export class I18nService {
  readonly lang = signal<Lang>(this.loadLang());
  readonly isTamil = computed(() => this.lang() === 'ta');
  readonly isSinhala = computed(() => this.lang() === 'si');

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
    const order: Lang[] = ['en', 'ta', 'si'];
    this.lang.set(order[(order.indexOf(this.lang()) + 1) % order.length]);
  }

  /** Translate a key, replacing {placeholders} with params. Falls back to English, then the key. */
  t(key: string, params?: Record<string, string | number>): string {
    const dict = DICTS[this.lang()];
    let text = dict[key] ?? EN[key] ?? key;
    if (params) {
      for (const [name, value] of Object.entries(params)) text = text.split(`{${name}}`).join(String(value));
    }
    return text;
  }

  category(category: string): string {
    return this.t(`category.${category}`) === `category.${category}` ? category : this.t(`category.${category}`);
  }

  /** The Tamil or Sinhala text when the site is in that language and it exists, otherwise English. */
  pick(en: string, ta?: string | null, si?: string | null): string {
    const lang = this.lang();
    if (lang === 'ta' && ta) return ta;
    if (lang === 'si' && si) return si;
    return en;
  }

  /** Name of one of our places, a Google / OpenStreetMap place, or a tour card's place. */
  placeName(p: { name: string; nameTa?: string | null; nameSi?: string | null }): string {
    return this.pick(p.name, p.nameTa, p.nameSi);
  }

  districtName(d: Pick<District, 'name' | 'nameTa' | 'nameSi'>): string {
    return this.pick(d.name, d.nameTa, d.nameSi);
  }

  placeDescription(p: Place): string {
    return this.pick(p.description, p.descriptionTa, p.descriptionSi);
  }

  placeHours(p: Pick<Place, 'openingHours' | 'openingHoursTa' | 'openingHoursSi'>): string {
    return this.pick(p.openingHours, p.openingHoursTa, p.openingHoursSi);
  }

  placeTips(p: Place): string {
    return this.pick(p.travelTips, p.travelTipsTa, p.travelTipsSi);
  }

  /** "45 mins - 1 hour" → "45 நிமி. - 1 மணி" in Tamil, "45 මිනි. - 1 පැය" in Sinhala; unchanged in English. */
  duration(text: string): string {
    if (this.isSinhala()) {
      return text
        .replace(/\bhours?\b/gi, 'පැය')
        .replace(/\bmins?\b|\bminutes?\b/gi, 'මිනි.');
    }
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
    return new Date(value).toLocaleDateString(LOCALES[this.lang()], options);
  }

  private loadLang(): Lang {
    try {
      const saved = localStorage.getItem(LANG_KEY);
      return saved === 'ta' || saved === 'si' ? saved : 'en';
    } catch {
      return 'en';
    }
  }
}
