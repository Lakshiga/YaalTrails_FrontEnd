import { Routes } from '@angular/router';
import { adminGuard } from './core/guards/admin.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/home/home.component').then((m) => m.HomeComponent)
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
    path: 'admin/login',
    loadComponent: () =>
      import('./features/admin/admin-login/admin-login.component').then((m) => m.AdminLoginComponent)
  },
  {
    path: 'admin',
    canActivate: [adminGuard],
    loadComponent: () =>
      import('./features/admin/admin-dashboard/admin-dashboard.component').then((m) => m.AdminDashboardComponent)
  },
  {
    path: 'admin/new',
    canActivate: [adminGuard],
    loadComponent: () =>
      import('./features/admin/admin-place-form/admin-place-form.component').then((m) => m.AdminPlaceFormComponent)
  },
  {
    path: 'admin/edit/:id',
    canActivate: [adminGuard],
    loadComponent: () =>
      import('./features/admin/admin-place-form/admin-place-form.component').then((m) => m.AdminPlaceFormComponent)
  },
  { path: '**', redirectTo: '' }
];
