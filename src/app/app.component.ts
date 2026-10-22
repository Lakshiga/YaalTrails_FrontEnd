import { Component, computed, inject, ChangeDetectionStrategy } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { GoogleMapsService } from './core/services/google-maps.service';
import { DistrictService } from './core/services/district.service';
import { NgTemplateOutlet } from '@angular/common';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from './core/services/auth.service';
import { VisitPlanService } from './core/services/visit-plan.service';
import { ToastService } from './core/services/toast.service';
import { APP_NAME } from './core/brand';
import { I18nService } from './core/i18n/i18n.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, NgTemplateOutlet],
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './app.component.css',
  host: { '[class.has-bnav]': '!adminArea()' }
})
export class AppComponent {
  private auth = inject(AuthService);
  private visitPlan = inject(VisitPlanService);

  readonly appName = APP_NAME;
  readonly i18n = inject(I18nService);
  readonly maps = inject(GoogleMapsService);
  private districts = inject(DistrictService);
  private router = inject(Router);

  /** /admin pages (sign-in included) have their own layout instead of the visitor header, footer and bottom bar. */
  adminArea = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => isAdminUrl(e.urlAfterRedirects))
    ),
    { initialValue: isAdminUrl(location.pathname) }
  );

  constructor() {
    // The header shows the chosen district's name on every page; the list is loaded once and shared.
    this.districts.load();
  }

  /** "Kandy Day-Visit Planner" — follows the area chosen on the home or map page. */
  tagline = computed(() =>
    this.districts.isHomeArea() ? this.i18n.t('brand.tagline') : this.i18n.t('brand.taglineArea', { area: this.districts.areaName() })
  );
  toasts = inject(ToastService).toasts;

  year = new Date().getFullYear();
  isAdmin = this.auth.isLoggedIn;
  /** Stops across every district's plan. */
  planCount = () => this.visitPlan.totalCount();
}

function isAdminUrl(url: string): boolean {
  return /^\/admin(\/|\?|$)/.test(url);
}
