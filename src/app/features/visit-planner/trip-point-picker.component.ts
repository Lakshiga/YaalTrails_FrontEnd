import { Component, EventEmitter, Input, Output, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { I18nService } from '../../core/i18n/i18n.service';
import { UserLocationService } from '../../core/services/user-location.service';
import { TripPoint } from '../../core/services/visit-plan.service';
import { ToastService } from '../../core/services/toast.service';
import { SelectComponent, SelectOption } from '../../shared/select/select.component';

/** What the picker currently shows: the district town, back-to-start / last stop (end only), or a chosen point. */
export type PickerValue = 'town' | 'start' | 'none' | TripPoint;

/** Chooses a trip's start or end: the district town, the visitor's location, or a point tapped on the map. */
@Component({
  selector: 'app-trip-point-picker',
  standalone: true,
  imports: [SelectComponent],
  template: `
    <label class="tpp-row">
      <span class="control-label"><i class="bi" [class]="kind === 'start' ? 'bi-house-door' : 'bi-flag'"></i> {{ i18n.t(kind === 'start' ? 'trip.start' : 'trip.end') }}</span>
      <app-select
        size="sm"
        [options]="options()"
        [value]="selectedKey()"
        (selected)="onSelect($event)"
        [disabled]="locating()"
        [ariaLabel]="i18n.t(kind === 'start' ? 'trip.start' : 'trip.end')"
        [searchable]="false"
      />
      @if (locating()) {
        <span class="spinner-border spinner-border-sm" role="status" [attr.aria-label]="i18n.t('trip.locating')"></span>
      }
    </label>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [
    `
      :host { display: block; }
      .tpp-row { display: flex; align-items: center; gap: 0.6rem; margin: 0; font-size: 0.875rem; font-weight: 600; color: var(--ink-2); flex-wrap: wrap; }
      .tpp-row app-select { min-width: 11rem; max-width: 16rem; }
      .control-label .bi { color: var(--brand); margin-right: 0.25rem; }
    `
  ]
})
export class TripPointPickerComponent {
  readonly i18n = inject(I18nService);
  private location = inject(UserLocationService);
  private toast = inject(ToastService);

  @Input() kind: 'start' | 'end' = 'start';
  @Input() value: PickerValue = 'town';
  /** e.g. "Kandy town". */
  @Input() townLabel = '';

  @Output() choose = new EventEmitter<PickerValue>();
  /** "Choose on the map" was picked: the page lets the visitor tap the map. */
  @Output() pickOnMap = new EventEmitter<void>();

  locating = signal(false);

  selectedKey(): string {
    return typeof this.value === 'string' ? this.value : 'custom';
  }

  customLabel(): string | null {
    return typeof this.value === 'string' ? null : this.value.label;
  }

  /** The choices; "My location" and "Choose on the map" are actions that set a new point when they finish. */
  options(): SelectOption[] {
    const t = (key: string) => this.i18n.t(key);
    const custom = this.customLabel();
    return [
      ...(this.kind === 'end'
        ? [
            { value: 'start', label: t('trip.backToStart'), icon: 'bi-arrow-repeat' },
            { value: 'none', label: t('trip.lastStop'), icon: 'bi-flag' }
          ]
        : []),
      { value: 'town', label: this.townLabel, icon: 'bi-buildings' },
      ...(custom ? [{ value: 'custom', label: custom, icon: 'bi-pin-map' }] : []),
      { value: 'here', label: t('trip.myLocation'), icon: 'bi-crosshair', action: true },
      { value: 'map', label: t('trip.onMap'), icon: 'bi-hand-index', action: true }
    ];
  }

  async onSelect(key: string): Promise<void> {
    if (key === 'here' || key === 'map') {
      // The shown choice stays until the new point is set.
      if (key === 'map') this.pickOnMap.emit();
      else await this.useMyLocation();
    } else if (key === 'town' || key === 'start' || key === 'none') {
      this.choose.emit(key);
    }
  }

  private async useMyLocation(): Promise<void> {
    this.locating.set(true);
    const position = await this.location.requestPosition();
    this.locating.set(false);
    if (!position) {
      this.toast.show(this.i18n.t('trip.locationFailed'), 'bi-exclamation-triangle');
      return;
    }
    this.choose.emit({ kind: 'here', label: this.i18n.t('trip.myLocation'), ...position });
  }
}
