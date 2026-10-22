import { Directive, ElementRef, EventEmitter, OnInit, Output, Renderer2, inject } from '@angular/core';

/**
 * Shows a shimmering placeholder behind an image while it downloads, then fades it in.
 * If the image fails to load it is hidden and (failed) fires, so the page can show its icon instead.
 * Styles: .img-fade / .img-loading in styles.css.
 */
@Directive({
  selector: 'img[appFadeImage]',
  standalone: true,
  host: {
    class: 'img-fade',
    '(load)': 'done(true)',
    '(error)': 'done(false)'
  }
})
export class FadeImageDirective implements OnInit {
  private el = inject<ElementRef<HTMLImageElement>>(ElementRef);
  private renderer = inject(Renderer2);

  @Output() failed = new EventEmitter<void>();

  ngOnInit(): void {
    const img = this.el.nativeElement;
    // Already in the browser cache: no placeholder needed.
    if (img.complete && img.naturalWidth > 0) {
      this.done(true);
      return;
    }
    const parent = img.parentElement;
    if (parent) this.renderer.addClass(parent, 'img-loading');
  }

  done(loaded: boolean): void {
    const img = this.el.nativeElement;
    const parent = img.parentElement;
    if (parent) this.renderer.removeClass(parent, 'img-loading');
    if (loaded) {
      this.renderer.addClass(img, 'loaded');
    } else {
      this.renderer.setStyle(img, 'display', 'none');
      this.failed.emit();
    }
  }
}
