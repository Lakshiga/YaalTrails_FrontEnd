import { Component, EventEmitter, Input, Output, signal } from '@angular/core';

/** Read-only star display, or a 1–5 picker when `editable` is set. */
@Component({
  selector: 'app-star-rating',
  standalone: true,
  template: `
    @if (editable) {
      <div class="stars stars-input" role="radiogroup" [attr.aria-label]="label" (mouseleave)="hover.set(0)">
        @for (n of five; track n) {
          <button
            type="button"
            class="star-btn"
            role="radio"
            [attr.aria-checked]="value === n"
            [attr.aria-label]="n + ' / 5'"
            (mouseenter)="hover.set(n)"
            (click)="valueChange.emit(n)"
          >
            <i class="bi" [class.bi-star-fill]="n <= (hover() || value)" [class.bi-star]="n > (hover() || value)"></i>
          </button>
        }
      </div>
    } @else {
      <span class="stars" [style.font-size]="size" [attr.aria-label]="value + ' / 5'">
        @for (n of five; track n) {
          <i class="bi" [class]="iconFor(n)"></i>
        }
      </span>
    }
  `,
  styles: [
    `
      :host { display: inline-flex; }
      .stars { display: inline-flex; gap: 1px; color: #e3a008; line-height: 1; }
      .stars-input { gap: 4px; }
      .star-btn {
        border: 0;
        background: transparent;
        padding: 2px;
        font-size: 1.9rem;
        line-height: 1;
        color: #e3a008;
        cursor: pointer;
        transition: transform 0.12s ease;
      }
      .star-btn:hover { transform: scale(1.12); }
      .star-btn:focus-visible { outline: 2px solid var(--brand); border-radius: 6px; }
      .bi-star { color: #d9d3c7; }
      .star-btn .bi-star { color: #cfc7b8; }
    `
  ]
})
export class StarRatingComponent {
  @Input() value = 0;
  @Input() editable = false;
  @Input() size = '1rem';
  @Input() label = 'Rating';
  @Output() valueChange = new EventEmitter<number>();

  readonly five = [1, 2, 3, 4, 5];
  hover = signal(0);

  iconFor(n: number): string {
    if (this.value >= n) return 'bi-star-fill';
    if (this.value >= n - 0.5) return 'bi-star-half';
    return 'bi-star';
  }
}
