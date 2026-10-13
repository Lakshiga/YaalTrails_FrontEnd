import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE_URL } from '../config';
import { AdminReview, Review, ReviewCreate } from '../models/place.model';

@Injectable({ providedIn: 'root' })
export class ReviewService {
  private http = inject(HttpClient);

  getForPlace(placeId: number): Observable<Review[]> {
    return this.http.get<Review[]>(`${API_BASE_URL}/places/${placeId}/reviews`);
  }

  create(placeId: number, review: ReviewCreate): Observable<Review> {
    return this.http.post<Review>(`${API_BASE_URL}/places/${placeId}/reviews`, review);
  }

  /** Admin only. */
  getAll(): Observable<AdminReview[]> {
    return this.http.get<AdminReview[]>(`${API_BASE_URL}/reviews`);
  }

  /** Admin only. */
  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${API_BASE_URL}/reviews/${id}`);
  }
}
