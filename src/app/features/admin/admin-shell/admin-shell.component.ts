import { Component, DestroyRef, OnInit, computed, inject, ChangeDetectionStrategy } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NgTemplateOutlet } from '@angular/common';
import { Meta } from '@angular/platform-browser';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { DistrictService } from '../../../core/services/district.service';
import { RestrictionService } from '../../../core/services/restriction.service';
import { APP_NAME } from '../../../core/brand';
import { AdminPlacesService } from '../admin-places.service';

export type AdminTab = 'places' | 'google' | 'hidden' | 'reviews';
export const ADMIN_TABS: AdminTab[] = ['places', 'google', 'hidden', 'reviews'];

interface NavItem {
  tab: AdminTab;
  label: string;
  icon: string;
  iconActive: string;
}

/**
 * The admin console layout: a sidebar on desktop, a top bar and bottom tabs on phones.
 * Replaces the visitor site's header, footer and bottom bar on every /admin page.
 */
@Component({
  selector: 'app-admin-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, NgTemplateOutlet],
  template: `
    <div class="ac">
      <aside class="ac-side" aria-label="Admin console">
        <a class="ac-brand" routerLink="/admin">
          <img src="logo.svg" alt="" width="36" height="36" />
          <span><strong>{{ appName }}</strong><small>Admin console</small></span>
        </a>

        <nav class="ac-nav" aria-label="Admin sections">
          <span class="ac-nav-label">Manage</span>
          @for (item of items; track item.tab) {
            <a routerLink="/admin" [queryParams]="{ tab: item.tab }" [class.active]="activeTab() === item.tab" [attr.aria-current]="activeTab() === item.tab ? 'page' : null">
              <i class="bi" [class]="activeTab() === item.tab ? item.iconActive : item.icon"></i>
              <span>{{ item.label }}</span>
              @if (count(item.tab); as n) {
                <span class="ac-count">{{ n }}</span>
              }
            </a>
          }
          <span class="ac-nav-label">Create</span>
          <a routerLink="/admin/new" routerLinkActive="active"><i class="bi bi-plus-square"></i><span>Add place</span></a>
        </nav>

        <div class="ac-side-foot">
          <a routerLink="/" class="ac-site-link"><i class="bi bi-box-arrow-up-right"></i> View visitor site</a>
          <div class="ac-user">
            <span class="ac-avatar" aria-hidden="true">{{ initial }}</span>
            <span class="ac-user-text">
              <strong>{{ username }}</strong>
              <small>{{ sessionText }}</small>
            </span>
            <button type="button" class="ac-icon-btn" (click)="logout()" title="Log out" aria-label="Log out"><i class="bi bi-box-arrow-right"></i></button>
          </div>
        </div>
      </aside>

      <div class="ac-body">
        <header class="ac-top">
          <a class="ac-brand" routerLink="/admin">
            <img src="logo.svg" alt="" width="32" height="32" />
            <span><strong>{{ appName }}</strong><small>Admin console</small></span>
          </a>
          <div class="ac-top-actions">
            <a routerLink="/" class="ac-icon-btn" title="View visitor site" aria-label="View visitor site"><i class="bi bi-box-arrow-up-right"></i></a>
            <button type="button" class="ac-icon-btn" (click)="logout()" title="Log out" aria-label="Log out"><i class="bi bi-box-arrow-right"></i></button>
          </div>
        </header>
        <main class="ac-main">
          <router-outlet />
        </main>
      </div>

      <nav class="bottom-nav ac-bnav" aria-label="Admin sections">
        @for (item of items.slice(0, 2); track item.tab) {
          <ng-container *ngTemplateOutlet="tabLink; context: { $implicit: item }" />
        }
        <a routerLink="/admin/new" class="ac-bnav-add" routerLinkActive="active" aria-label="Add place"><span><i class="bi bi-plus-lg"></i></span></a>
        @for (item of items.slice(2); track item.tab) {
          <ng-container *ngTemplateOutlet="tabLink; context: { $implicit: item }" />
        }
      </nav>
    </div>

    <ng-template #tabLink let-item>
      <a routerLink="/admin" [queryParams]="{ tab: item.tab }" [class.active]="activeTab() === item.tab" [attr.aria-current]="activeTab() === item.tab ? 'page' : null">
        <span class="bnav-icon">
          <i class="bi" [class]="activeTab() === item.tab ? item.iconActive : item.icon"></i>
          @if (count(item.tab); as n) {
            <span class="bnav-badge">{{ n > 99 ? '99+' : n }}</span>
          }
        </span>
        <span class="bnav-label">{{ item.short ?? item.label }}</span>
      </a>
    </ng-template>
  `,
  changeDetection: ChangeDetectionStrategy.Eager
})
export class AdminShellComponent implements OnInit {
  private auth = inject(AuthService);
  private router = inject(Router);
  private meta = inject(Meta);
  private destroyRef = inject(DestroyRef);
  private admin = inject(AdminPlacesService);
  private restrictions = inject(RestrictionService);
  private districts = inject(DistrictService);

  readonly appName = APP_NAME;
  readonly username = this.auth.username();
  readonly initial = this.username.charAt(0).toUpperCase();
  readonly items: (NavItem & { short?: string })[] = [
    { tab: 'places', label: 'Your places', short: 'Places', icon: 'bi-geo-alt', iconActive: 'bi-geo-alt-fill' },
    { tab: 'google', label: 'Google places', short: 'Google', icon: 'bi-google', iconActive: 'bi-google' },
    { tab: 'hidden', label: 'Hidden', icon: 'bi-eye-slash', iconActive: 'bi-eye-slash-fill' },
    { tab: 'reviews', label: 'Reviews', icon: 'bi-chat-square-text', iconActive: 'bi-chat-square-text-fill' }
  ];

  private url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects)
    ),
    { initialValue: this.router.url }
  );

  /** The section shown: the dashboard's ?tab=, or "places" while adding / editing a place. */
  activeTab = computed<AdminTab | null>(() => {
    const tree = this.router.parseUrl(this.url());
    const path = tree.root.children['primary']?.segments.map((s) => s.path).join('/') ?? '';
    if (path.startsWith('admin/edit')) return 'places';
    if (path !== 'admin') return null;
    const tab = tree.queryParamMap.get('tab') as AdminTab | null;
    return tab && ADMIN_TABS.includes(tab) ? tab : 'places';
  });

  private hiddenTotal = computed(() => this.admin.hiddenPlaces().length + this.restrictions.list().length);

  get sessionText(): string {
    const end = this.auth.expiresAt();
    return end ? `Session ends ${end.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : 'Signed in';
  }

  count(tab: AdminTab): number | null {
    switch (tab) {
      case 'places':
        return this.admin.places().length || null;
      case 'hidden':
        return this.hiddenTotal() || null;
      case 'reviews':
        return this.admin.reviews().length || null;
      default:
        return null;
    }
  }

  ngOnInit(): void {
    // Admin pages should never appear in search results.
    this.meta.updateTag({ name: 'robots', content: 'noindex, nofollow' });
    this.destroyRef.onDestroy(() => this.meta.removeTag('name="robots"'));

    this.districts.load();
    void this.restrictions.load();
    this.admin.loadReviews();
    this.watchSession();
  }

  logout(): void {
    this.auth.logout();
    void this.router.navigate(['/']);
  }

  /** Signs out when the session expires, so the console never shows actions that would fail. */
  private watchSession(): void {
    const end = this.auth.expiresAt();
    if (!end) return;
    const timer = setTimeout(() => {
      this.auth.logout();
      void this.router.navigate(['/admin/login'], { queryParams: { expired: 1 } });
    }, Math.min(end.getTime() - Date.now(), 2 ** 31 - 1));
    this.destroyRef.onDestroy(() => clearTimeout(timer));
  }
}
