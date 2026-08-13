import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PlaceService } from '../../../core/services/place.service';
import { AuthService } from '../../../core/services/auth.service';
import { Place } from '../../../core/models/place.model';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './admin-dashboard.component.html'
})
export class AdminDashboardComponent implements OnInit {
  private placeService = inject(PlaceService);
  private auth = inject(AuthService);

  places = signal<Place[]>([]);
  loading = signal(true);
  errorMessage = signal<string | null>(null);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.placeService.getAll().subscribe({
      next: (places) => {
        this.places.set(places);
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  deletePlace(place: Place): void {
    if (!confirm(`Delete "${place.name}"? This cannot be undone.`)) return;

    this.placeService.delete(place.id).subscribe({
      next: () => this.places.set(this.places().filter((p) => p.id !== place.id)),
      error: () => this.errorMessage.set('Failed to delete place.')
    });
  }

  logout(): void {
    this.auth.logout();
  }
}
