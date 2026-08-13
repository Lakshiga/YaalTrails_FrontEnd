import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from './core/services/auth.service';
import { VisitPlanService } from './core/services/visit-plan.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  private auth = inject(AuthService);
  private visitPlan = inject(VisitPlanService);

  navOpen = false;
  isAdmin = this.auth.isLoggedIn;
  planCount = () => this.visitPlan.plan().length;
}
