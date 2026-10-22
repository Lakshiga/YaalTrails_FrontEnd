import {
  Component,
  DestroyRef,
  ElementRef,
  computed,
  forwardRef,
  inject,
  input,
  model,
  output,
  signal,
  viewChild,
  ChangeDetectionStrategy
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

export interface SelectOption {
  value: string;
  label: string;
  /** Bootstrap icon class, e.g. "bi-geo-alt". */
  icon?: string;
  /** Small text under the label. */
  hint?: string;
  /** Options with the same group are listed under a heading (consecutive options only). */
  group?: string;
  /** Extra words the search box matches (e.g. the English name of a Tamil label). */
  keywords?: string;
  /**
   * An action rather than a value ("Use my location"): choosing it emits (selected) but does not change the
   * shown value — the parent sets the value once the action has finished.
   */
  action?: boolean;
}

type Row = { kind: 'group'; key: string; label: string } | { kind: 'option'; key: string; option: SelectOption; index: number };

let nextId = 0;

/** "Kovil" matches "kōvil" and case is ignored. */
function normalise(text: string): string {
  return text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
}

/**
 * The site's dropdown: a themed replacement for <select>, whose open list browsers draw in the operating system's
 * style. Supports icons, groups, search (automatic for long lists), keyboard use, screen readers, ngModel, and opens
 * as a bottom sheet on phones. Styles live in styles.css ("Dropdown").
 *
 *   <app-select [options]="opts" [(value)]="choice" ariaLabel="District" />
 *   <app-select [options]="opts" [(ngModel)]="form.district" name="district" required />
 */
@Component({
  selector: 'app-select',
  standalone: true,
  host: {
    class: 'ys',
    '[class.ys-sm]': "size() === 'sm'",
    '[class.ys-pill]': 'pill()',
    '[class.ys-open]': 'open()',
    '[class.ys-disabled]': 'isDisabled()',
    '(document:pointerdown)': 'onDocumentPointer($event)'
  },
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => SelectComponent), multi: true }],
  template: `
    <button
      #trigger
      type="button"
      class="ys-trigger"
      role="combobox"
      aria-haspopup="listbox"
      [attr.aria-expanded]="open()"
      [attr.aria-controls]="open() ? listId : null"
      [attr.aria-label]="ariaLabel()"
      [attr.aria-activedescendant]="open() && !showSearch() && activeOption() ? optionId(active()) : null"
      [attr.id]="inputId()"
      [disabled]="isDisabled()"
      (click)="toggle()"
      (keydown)="onKey($event)"
      (blur)="onTouched()"
    >
      @if (current()?.icon ?? icon(); as lead) {
        <i class="bi ys-lead" [class]="lead" aria-hidden="true"></i>
      }
      <span class="ys-value" [class.ys-placeholder]="!current()">{{ current()?.label ?? placeholder() }}</span>
      <i class="bi bi-chevron-down ys-chevron" aria-hidden="true"></i>
    </button>

    @if (open()) {
      <div class="ys-backdrop" (click)="close(true)" aria-hidden="true"></div>
      <div class="ys-panel" [class.ys-up]="openUp()" [style.top.px]="pos().top" [style.bottom.px]="pos().bottom" [style.left.px]="pos().left" [style.min-width.px]="pos().width">
        <div class="ys-sheet-head">
          <span>{{ ariaLabel() || placeholder() }}</span>
          <button type="button" class="ys-sheet-close" (click)="close(true)" aria-label="Close"><i class="bi bi-x-lg"></i></button>
        </div>
        @if (showSearch()) {
          <div class="ys-search">
            <i class="bi bi-search" aria-hidden="true"></i>
            <input
              #search
              type="text"
              role="combobox"
              aria-autocomplete="list"
              [attr.aria-controls]="listId"
              [attr.aria-activedescendant]="activeOption() ? optionId(active()) : null"
              [attr.aria-label]="searchPlaceholder()"
              [placeholder]="searchPlaceholder()"
              [value]="query()"
              (input)="onQuery($event)"
              (keydown)="onKey($event)"
              autocomplete="off"
              spellcheck="false"
            />
          </div>
        }
        <ul class="ys-list" role="listbox" [id]="listId" [attr.aria-label]="ariaLabel()" #list>
          @for (row of rows(); track row.key) {
            @if (row.kind === 'group') {
              <li class="ys-group" role="presentation">{{ row.label }}</li>
            } @else {
              <li
                class="ys-option"
                role="option"
                [id]="optionId(row.index)"
                [class.active]="row.index === active()"
                [class.selected]="!row.option.action && row.option.value === value()"
                [class.ys-action]="row.option.action"
                [attr.aria-selected]="!row.option.action && row.option.value === value()"
                (pointermove)="active.set(row.index)"
                (click)="choose(row.option)"
              >
                @if (row.option.icon) {
                  <i class="bi ys-opt-icon" [class]="row.option.icon" aria-hidden="true"></i>
                }
                <span class="ys-opt-text">
                  <span class="ys-opt-label">{{ row.option.label }}</span>
                  @if (row.option.hint) {
                    <span class="ys-opt-hint">{{ row.option.hint }}</span>
                  }
                </span>
                @if (!row.option.action && row.option.value === value()) {
                  <i class="bi bi-check2 ys-check" aria-hidden="true"></i>
                }
              </li>
            }
          } @empty {
            <li class="ys-empty" role="presentation"><i class="bi bi-search"></i> {{ noResults() }}</li>
          }
        </ul>
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.Eager
})
export class SelectComponent implements ControlValueAccessor {
  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  private destroyRef = inject(DestroyRef);

  readonly options = input<SelectOption[]>([]);
  readonly value = model<string | null>(null);
  readonly placeholder = input('Select…');
  /** null = automatic: a search box for lists longer than 8 options. */
  readonly searchable = input<boolean | null>(null);
  readonly searchPlaceholder = input('Search…');
  readonly noResults = input('No matches');
  readonly size = input<'md' | 'sm'>('md');
  /** Rounded "pill" trigger (toolbars). */
  readonly pill = input(false);
  /** Icon shown when the chosen option has none. */
  readonly icon = input<string | null>(null);
  readonly ariaLabel = input<string | null>(null);
  /** id for the trigger, so a <label for="…"> can point at it. */
  readonly inputId = input<string | null>(null);
  readonly disabled = input(false);
  /** Every choice, including actions and re-choosing the current value. */
  readonly selected = output<string>();

  readonly open = signal(false);
  readonly query = signal('');
  readonly active = signal(0);
  readonly openUp = signal(false);
  readonly pos = signal<{ top: number | null; bottom: number | null; left: number; width: number }>({ top: 0, bottom: null, left: 0, width: 0 });
  readonly listId = `ys-list-${++nextId}`;

  private trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  private searchBox = viewChild<ElementRef<HTMLInputElement>>('search');
  private list = viewChild<ElementRef<HTMLUListElement>>('list');
  private formDisabled = signal(false);
  private onChange: (value: string | null) => void = () => {};
  onTouched: () => void = () => {};
  private typed = '';
  private typedAt = 0;
  private reposition = () => this.place();

  readonly isDisabled = computed(() => this.disabled() || this.formDisabled());
  readonly current = computed(() => this.options().find((o) => !o.action && o.value === this.value()) ?? null);
  readonly showSearch = computed(() => this.searchable() ?? this.options().length > 8);

  /** Options matching the search, in order. */
  readonly filtered = computed(() => {
    const q = normalise(this.query().trim());
    if (!q) return this.options();
    return this.options().filter((o) => normalise(`${o.label} ${o.keywords ?? ''} ${o.hint ?? ''}`).includes(q));
  });

  readonly rows = computed<Row[]>(() => {
    const rows: Row[] = [];
    let group: string | undefined;
    this.filtered().forEach((option, index) => {
      if (option.group && option.group !== group) rows.push({ kind: 'group', key: `g:${option.group}:${index}`, label: option.group });
      group = option.group;
      rows.push({ kind: 'option', key: `o:${option.value}`, option, index });
    });
    return rows;
  });

  readonly activeOption = computed(() => this.filtered()[this.active()] ?? null);

  constructor() {
    this.destroyRef.onDestroy(() => this.unwatch());
  }

  optionId(index: number): string {
    return `${this.listId}-${index}`;
  }

  toggle(): void {
    if (this.open()) this.close(false);
    else this.show();
  }

  show(initialQuery = ''): void {
    if (this.isDisabled() || this.open()) return;
    this.query.set(initialQuery);
    const selectedIndex = this.filtered().findIndex((o) => !o.action && o.value === this.value());
    this.active.set(Math.max(0, selectedIndex));
    this.place();
    this.open.set(true);
    window.addEventListener('resize', this.reposition);
    window.addEventListener('scroll', this.reposition, true);
    // After the panel renders: focus the search box (if any) and bring the chosen option into view.
    setTimeout(() => {
      this.searchBox()?.nativeElement.focus();
      this.scrollActiveIntoView();
    });
  }

  close(returnFocus: boolean): void {
    if (!this.open()) return;
    this.open.set(false);
    this.query.set('');
    this.unwatch();
    this.onTouched();
    if (returnFocus) this.trigger().nativeElement.focus();
  }

  choose(option: SelectOption): void {
    if (!option.action && option.value !== this.value()) {
      this.value.set(option.value);
      this.onChange(option.value);
    }
    this.selected.emit(option.value);
    this.close(true);
  }

  onQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
    this.active.set(0);
  }

  onKey(event: KeyboardEvent): void {
    const count = this.filtered().length;
    if (!this.open()) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
        event.preventDefault();
        this.show();
      } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey && this.showSearch()) {
        event.preventDefault();
        this.show(event.key); // start searching straight away
      }
      return;
    }
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.move(count ? (this.active() + 1) % count : 0);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.move(count ? (this.active() - 1 + count) % count : 0);
        break;
      case 'Home':
        if (!this.showSearch()) {
          event.preventDefault();
          this.move(0);
        }
        break;
      case 'End':
        if (!this.showSearch()) {
          event.preventDefault();
          this.move(count - 1);
        }
        break;
      case 'Enter':
        event.preventDefault();
        if (this.activeOption()) this.choose(this.activeOption()!);
        break;
      case ' ':
        if (!this.showSearch()) {
          event.preventDefault();
          if (this.activeOption()) this.choose(this.activeOption()!);
        }
        break;
      case 'Escape':
        event.preventDefault();
        this.close(true);
        break;
      case 'Tab':
        this.close(false);
        break;
      default:
        if (!this.showSearch() && event.key.length === 1) this.typeAhead(event.key);
    }
  }

  onDocumentPointer(event: PointerEvent): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) this.close(false);
  }

  // ---------- ControlValueAccessor (ngModel / reactive forms) ----------

  writeValue(value: string | null): void {
    this.value.set(value ?? null);
  }

  registerOnChange(fn: (value: string | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.formDisabled.set(disabled);
  }

  // ---------- Helpers ----------

  private move(index: number): void {
    this.active.set(Math.max(0, index));
    this.scrollActiveIntoView();
  }

  /** Typing letters jumps to the next option starting with them (like a native select). */
  private typeAhead(key: string): void {
    const now = Date.now();
    this.typed = now - this.typedAt > 700 ? key : this.typed + key;
    this.typedAt = now;
    const options = this.filtered();
    const term = normalise(this.typed);
    const start = this.typed.length === 1 ? this.active() + 1 : this.active();
    for (let i = 0; i < options.length; i++) {
      const index = (start + i) % options.length;
      if (normalise(options[index].label).startsWith(term)) {
        this.move(index);
        return;
      }
    }
  }

  private scrollActiveIntoView(): void {
    setTimeout(() => this.list()?.nativeElement.querySelector('.ys-option.active')?.scrollIntoView({ block: 'nearest' }));
  }

  /** Fixed position under (or above) the trigger, so panels are never clipped by scrolling cards. */
  private place(): void {
    const rect = this.trigger().nativeElement.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom;
    const up = below < 280 && rect.top > below;
    this.openUp.set(up);
    this.pos.set({
      top: up ? null : rect.bottom + 6,
      bottom: up ? window.innerHeight - rect.top + 6 : null,
      left: Math.max(8, Math.min(rect.left, window.innerWidth - Math.max(rect.width, 220) - 8)),
      width: rect.width
    });
  }

  private unwatch(): void {
    window.removeEventListener('resize', this.reposition);
    window.removeEventListener('scroll', this.reposition, true);
  }
}
