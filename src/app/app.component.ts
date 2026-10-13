import { Component, inject } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
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
  styleUrl: './app.component.css'
})
export class AppComponent {
  private auth = inject(AuthService);
  private visitPlan = inject(VisitPlanService);

  readonly appName = APP_NAME;
  readonly i18n = inject(I18nService);
  toasts = inject(ToastService).toasts;

  navOpen = false;
  year = new Date().getFullYear();
  isAdmin = this.auth.isLoggedIn;
  planCount = () => this.visitPlan.plan().length;
}
