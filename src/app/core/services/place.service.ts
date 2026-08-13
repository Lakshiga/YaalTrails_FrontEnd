import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE_URL } from '../config';
import { Place, PlaceUpsert } from '../models/place.model';

@Injectable({ providedIn: 'root' })
export class PlaceService {
  private http = inject(HttpClient);
  private baseUrl = `${API_BASE_URL}/places`;

  getAll(category?: string): Observable<Place[]> {
    let params = new HttpParams();
    if (category && category !== 'All') {
      params = params.set('category', category);
    }
    return this.http.get<Place[]>(this.baseUrl, { params });
  }

  getById(id: number): Observable<Place> {
    return this.http.get<Place>(`${this.baseUrl}/${id}`);
  }

  getCategories(): Observable<string[]> {
    return this.http.get<string[]>(`${this.baseUrl}/categories`);
  }

  create(place: PlaceUpsert): Observable<Place> {
    return this.http.post<Place>(this.baseUrl, place);
  }

  update(id: number, place: PlaceUpsert): Observable<Place> {
    return this.http.put<Place>(`${this.baseUrl}/${id}`, place);
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }
}
