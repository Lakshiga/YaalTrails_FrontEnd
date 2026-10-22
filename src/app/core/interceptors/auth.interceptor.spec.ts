import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from '../config';
import { CLIENT_CREDENTIALS } from '../services/client-token.service';
import { AuthService } from '../services/auth.service';
import { authInterceptor } from './auth.interceptor';

describe('authInterceptor (client tokens)', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let adminToken: string | null;

  beforeEach(() => {
    adminToken = null;
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withXhr(), withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: CLIENT_CREDENTIALS, useValue: { clientId: 'yaal-web', clientSecret: 's3cret' } },
        { provide: AuthService, useValue: { getToken: () => adminToken } }
      ]
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  /** Lets the token promise resolve so the real request goes out. */
  const tick = () => new Promise((r) => setTimeout(r));

  function issueToken(value: string, expiresIn = 3600): void {
    const req = backend.expectOne(`${API_BASE_URL}/auth/client-token`);
    expect(req.request.body).toEqual({ clientId: 'yaal-web', clientSecret: 's3cret' });
    expect(req.request.headers.has('Authorization')).toBeFalse();
    req.flush({ accessToken: value, tokenType: 'Bearer', expiresIn, expiresAtUtc: '' });
  }

  it('gets a client token once and sends it with every API request', async () => {
    const first = firstValueFrom(http.get(`${API_BASE_URL}/places`));
    const second = firstValueFrom(http.get(`${API_BASE_URL}/districts`));
    issueToken('client-1'); // both requests share one token request
    await tick();
    for (const url of ['places', 'districts']) {
      const req = backend.expectOne(`${API_BASE_URL}/${url}`);
      expect(req.request.headers.get('Authorization')).toBe('Bearer client-1');
      req.flush([]);
    }
    await Promise.all([first, second]);

    const third = firstValueFrom(http.get(`${API_BASE_URL}/places`));
    await tick();
    backend.expectOne(`${API_BASE_URL}/places`).flush([]); // cached: no new token request
    await third;
  });

  it('renews a rejected token once and retries the request', async () => {
    const result = firstValueFrom(http.get(`${API_BASE_URL}/places`));
    issueToken('old');
    await tick();
    backend.expectOne(`${API_BASE_URL}/places`).flush({}, { status: 401, statusText: 'Unauthorized' });
    await tick();
    issueToken('new');
    await tick();
    const retry = backend.expectOne(`${API_BASE_URL}/places`);
    expect(retry.request.headers.get('Authorization')).toBe('Bearer new');
    retry.flush([{ id: 1 }]);
    expect(await result).toEqual([{ id: 1 }]);
  });

  it('sends the admin token instead when an administrator is signed in', async () => {
    adminToken = 'admin-jwt';
    const result = firstValueFrom(http.get(`${API_BASE_URL}/places`));
    const req = backend.expectOne(`${API_BASE_URL}/places`);
    expect(req.request.headers.get('Authorization')).toBe('Bearer admin-jwt');
    req.flush([]);
    await result;
  });

  it('never sends a token to other sites', async () => {
    const result = firstValueFrom(http.get('https://tile.openstreetmap.org/1/1/1.png'));
    const req = backend.expectOne('https://tile.openstreetmap.org/1/1/1.png');
    expect(req.request.headers.has('Authorization')).toBeFalse();
    req.flush({});
    await result;
  });
});
