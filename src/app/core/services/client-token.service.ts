import { HttpBackend, HttpClient } from '@angular/common/http';
import { Injectable, InjectionToken, inject } from '@angular/core';
import { firstValueFrom, timeout } from 'rxjs';
import { ENV } from '../../../environments/env.generated';
import { API_BASE_URL } from '../config';

export interface ClientCredentials {
  clientId: string;
  clientSecret: string;
}

/** The site's client ID and secret, from .env. Replaced in tests. */
export const CLIENT_CREDENTIALS = new InjectionToken<ClientCredentials>('CLIENT_CREDENTIALS', {
  providedIn: 'root',
  factory: () => ({ clientId: ENV.clientId, clientSecret: ENV.clientSecret })
});

interface ClientTokenResponse {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  expiresAtUtc: string;
}

/** Renew this long before the token expires, so no request goes out with a token about to lapse. */
const RENEW_EARLY_MS = 60_000;

/**
 * The client token every API request carries: the site swaps its client ID and secret for it
 * (POST api/auth/client-token), keeps it in memory, and renews it shortly before it expires.
 * Concurrent callers share one request.
 */
@Injectable({ providedIn: 'root' })
export class ClientTokenService {
  // HttpBackend skips the interceptors, so fetching the token never needs a token.
  private http = new HttpClient(inject(HttpBackend));
  private credentials = inject(CLIENT_CREDENTIALS);
  private current: { value: string; expiresAt: number } | null = null;
  private pending: Promise<string> | null = null;

  /** A valid client token (cached, or fetched now). */
  token(): Promise<string> {
    if (this.current && this.current.expiresAt - RENEW_EARLY_MS > Date.now()) return Promise.resolve(this.current.value);
    this.pending ??= this.fetch().finally(() => (this.pending = null));
    return this.pending;
  }

  /** Forget the token (the backend rejected it, e.g. after a restart with a new signing key). */
  invalidate(): void {
    this.current = null;
  }

  private async fetch(): Promise<string> {
    const res = await firstValueFrom(
      this.http
        .post<ClientTokenResponse>(`${API_BASE_URL}/auth/client-token`, {
          clientId: this.credentials.clientId,
          clientSecret: this.credentials.clientSecret
        })
        .pipe(timeout(15000))
    );
    this.current = { value: res.accessToken, expiresAt: Date.now() + res.expiresIn * 1000 };
    return res.accessToken;
  }
}
