import { Routes } from '@angular/router';
import { adminGuard } from './core/guards/admin.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/home/home.component').then((m) => m.HomeComponent)
  },
  {
    path: 'places/google/:placeId',
    loadComponent: () =>
      import('./features/google-place-detail/google-place-detail.component').then((m) => m.GooglePlaceDetailComponent)
  },
  {
    path: 'places/:id',
    loadComponent: () => import('./features/place-detail/place-detail.component').then((m) => m.PlaceDetailComponent)
  },
  {
    path: 'map',
    loadComponent: () => import('./features/map-view/map-view.component').then((m) => m.MapViewComponent)
  },
  {
    path: 'planner',
    loadComponent: () =>
      import('./features/visit-planner/visit-planner.component').then((m) => m.VisitPlannerComponent)
  },
  {
    path: 'credits',
    loadComponent: () => import('./features/credits/credits.component').then((m) => m.CreditsComponent)
  },
  {
    path: 'admin/login',
    loadComponent: () =>
      import('./features/admin/admin-login/admin-login.component').then((m) => m.AdminLoginComponent)
  },
  {
    // The admin console: its own layout (sidebar / bottom tabs), signed-in administrators only.
    path: 'admin',
    canActivate: [adminGuard],
    canActivateChild: [adminGuard],
    loadComponent: () => import('./features/admin/admin-shell/admin-shell.component').then((m) => m.AdminShellComponent),
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./features/admin/admin-dashboard/admin-dashboard.component').then((m) => m.AdminDashboardComponent)
      },
      {
        path: 'new',
        loadComponent: () =>
          import('./features/admin/admin-place-form/admin-place-form.component').then((m) => m.AdminPlaceFormComponent)
      },
      {
        path: 'edit/:id',
        loadComponent: () =>
          import('./features/admin/admin-place-form/admin-place-form.component').then((m) => m.AdminPlaceFormComponent)
      }
    ]
  },
  { path: '**', redirectTo: '' }
];
