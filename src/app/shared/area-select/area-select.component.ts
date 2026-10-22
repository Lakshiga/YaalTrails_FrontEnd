import { Component, OnInit, computed, inject, ChangeDetectionStrategy } from '@angular/core';
import { DistrictService } from '../../core/services/district.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { HOME_AREA } from '../../core/models/district.model';
import { SERVICE_RADIUS_KM } from '../../core/models/home-reference';
import { SelectComponent, SelectOption } from '../select/select.component';

/** Chooses the area to explore: the 25 km home area around Jaffna town, or one of Sri Lanka's districts. */
@Component({
  selector: 'app-area-select',
  standalone: true,
  imports: [SelectComponent],
  template: `
    <div class="area-select">
      <span class="area-label"><i class="bi bi-geo-alt"></i> {{ i18n.t('area.label') }}</span>
      <app-select
        [options]="options()"
        [value]="districts.area()"
        (valueChange)="districts.setArea($event ?? homeArea)"
        icon="bi-map"
        [ariaLabel]="i18n.t('area.label')"
        [searchPlaceholder]="i18n.t('area.search')"
        [noResults]="i18n.t('select.noResults')"
      />
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [
    `
      :host { display: block; }
      .area-select { display: flex; flex-direction: column; gap: 0.3rem; margin: 0; }
      .area-label { font-size: 0.78rem; font-weight: 700; color: var(--muted); }
      app-select { display: block; min-width: 15rem; max-width: 100%; }
    `
  ]
})
export class AreaSelectComponent implements OnInit {
  readonly districts = inject(DistrictService);
  readonly i18n = inject(I18nService);
  readonly homeArea = HOME_AREA;
  readonly radiusKm = SERVICE_RADIUS_KM;

  ngOnInit(): void {
    this.districts.load();
  }

  /** The home area first, then every district (searchable in English, Tamil and Sinhala). */
  readonly options = computed<SelectOption[]>(() => [
    { value: HOME_AREA, label: this.i18n.t('area.home', { radius: this.radiusKm }), icon: 'bi-house-door' },
    ...this.districts.districts().map((d) => ({
      value: d.code,
      label: this.i18n.districtName(d),
      group: this.i18n.t('area.districts'),
      keywords: `${d.name} ${d.nameTa} ${d.nameSi ?? ''}`
    }))
  ]);
}
