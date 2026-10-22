import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FadeImageDirective } from './fade-image.directive';

@Component({
  standalone: true,
  imports: [FadeImageDirective],
  template: `<div class="box"><img appFadeImage src="data:," alt="" (failed)="failures = failures + 1" /></div>`
})
class HostComponent {
  failures = 0;
}

describe('FadeImageDirective', () => {
  function setup() {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const box = fixture.nativeElement.querySelector('.box') as HTMLElement;
    const img = box.querySelector('img') as HTMLImageElement;
    return { fixture, box, img };
  }

  it('shows a placeholder until the image loads, then fades it in', () => {
    const { box, img } = setup();
    expect(img.classList).toContain('img-fade');
    expect(box.classList).toContain('img-loading');
    img.dispatchEvent(new Event('load'));
    expect(box.classList).not.toContain('img-loading');
    expect(img.classList).toContain('loaded');
  });

  it('hides a broken image and reports it', () => {
    const { fixture, box, img } = setup();
    img.dispatchEvent(new Event('error'));
    expect(box.classList).not.toContain('img-loading');
    expect(img.style.display).toBe('none');
    expect(fixture.componentInstance.failures).toBe(1);
  });
});
