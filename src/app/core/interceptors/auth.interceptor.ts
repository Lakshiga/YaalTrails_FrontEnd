import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { ClientTokenService } from '../services/client-token.service';
import { API_BASE_URL } from '../config';

function withToken(req: HttpRequest<unknown>, token: string): HttpRequest<unknown> {
  return req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
}

/**
 * Every request to our API carries a token: the admin token when an administrator is signed in, otherwise the
 * site's client token. A rejected client token (401) is renewed once and the request retried.
 * Third-party services (Google map tiles, OpenStreetMap) never receive either token.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(API_BASE_URL)) return next(req);

  const adminToken = inject(AuthService).getToken();
  if (adminToken) return next(withToken(req, adminToken));

  const client = inject(ClientTokenService);
  return from(client.token()).pipe(
    switchMap((token) => next(withToken(req, token))),
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        client.invalidate();
        return from(client.token()).pipe(switchMap((token) => next(withToken(req, token))));
      }
      return throwError(() => error);
    })
  );
};
