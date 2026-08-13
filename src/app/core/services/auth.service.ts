import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { API_BASE_URL } from '../config';

interface LoginResponse {
  token: string;
  username: string;
  expiresAtUtc: string;
}

const TOKEN_KEY = 'jaffna_admin_token';
const EXPIRY_KEY = 'jaffna_admin_token_expiry';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private baseUrl = `${API_BASE_URL}/auth`;

  isLoggedIn = signal<boolean>(this.hasValidToken());

  login(username: string, password: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.baseUrl}/login`, { username, password }).pipe(
      tap((res) => {
        localStorage.setItem(TOKEN_KEY, res.token);
        localStorage.setItem(EXPIRY_KEY, res.expiresAtUtc);
        this.isLoggedIn.set(true);
      })
    );
  }

  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(EXPIRY_KEY);
    this.isLoggedIn.set(false);
  }

  getToken(): string | null {
    return this.hasValidToken() ? localStorage.getItem(TOKEN_KEY) : null;
  }

  private hasValidToken(): boolean {
    const token = localStorage.getItem(TOKEN_KEY);
    const expiry = localStorage.getItem(EXPIRY_KEY);
    if (!token || !expiry) return false;
    return new Date(expiry).getTime() > Date.now();
  }
}
