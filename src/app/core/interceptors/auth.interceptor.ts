import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';
import { API_BASE_URL } from '../config';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  // Only our own API gets the admin token — never third-party services (OSRM, Open-Meteo).
  if (!req.url.startsWith(API_BASE_URL)) return next(req);

  const token = inject(AuthService).getToken();
  if (token) {
    req = req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
  }

  return next(req);
};
