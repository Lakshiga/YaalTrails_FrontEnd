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
const USER_KEY = 'jaffna_admin_user';

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
        localStorage.setItem(USER_KEY, res.username);
        this.isLoggedIn.set(true);
      })
    );
  }

  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(EXPIRY_KEY);
    localStorage.removeItem(USER_KEY);
    this.isLoggedIn.set(false);
  }

  /** When the current session ends, or null when signed out. */
  expiresAt(): Date | null {
    const expiry = localStorage.getItem(EXPIRY_KEY);
    return this.hasValidToken() && expiry ? new Date(expiry) : null;
  }

  /** The signed-in administrator's username. */
  username(): string {
    return localStorage.getItem(USER_KEY) ?? 'admin';
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
