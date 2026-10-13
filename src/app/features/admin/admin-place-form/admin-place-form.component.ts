import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PlaceService } from '../../../core/services/place.service';
import { PlaceUpsert } from '../../../core/models/place.model';
import { ALL_CATEGORIES } from '../../../core/models/category-meta';

const EMPTY_FORM: PlaceUpsert = {
  name: '',
  category: 'Religious',
  description: '',
  openingHours: '',
  travelTips: '',
  visitDuration: '',
  latitude: 9.6615,
  longitude: 80.0255,
  imageUrl: '',
  nameTa: '',
  descriptionTa: '',
  openingHoursTa: '',
  travelTipsTa: ''
};

@Component({
  selector: 'app-admin-place-form',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './admin-place-form.component.html',
  styleUrl: './admin-place-form.component.css'
})
export class AdminPlaceFormComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private placeService = inject(PlaceService);

  categories = ALL_CATEGORIES;

  editingId = signal<number | null>(null);
  isEditMode = () => this.editingId() !== null;

  form: PlaceUpsert = { ...EMPTY_FORM };
  previewFailed = false;

  loading = signal(false);
  errorMessage = signal<string | null>(null);

  ngOnInit(): void {
    const idParam = this.route.snapshot.paramMap.get('id');
    if (!idParam) return;

    const id = Number(idParam);
    this.editingId.set(id);
    this.loading.set(true);

    this.placeService.getById(id).subscribe({
      next: (place) => {
        this.form = {
          name: place.name,
          category: place.category,
          description: place.description,
          openingHours: place.openingHours,
          travelTips: place.travelTips,
          visitDuration: place.visitDuration,
          latitude: place.latitude,
          longitude: place.longitude,
          imageUrl: place.imageUrl,
          nameTa: place.nameTa ?? '',
          descriptionTa: place.descriptionTa ?? '',
          openingHoursTa: place.openingHoursTa ?? '',
          travelTipsTa: place.travelTipsTa ?? ''
        };
        this.loading.set(false);
      },
      error: () => {
        this.errorMessage.set('Could not load place for editing.');
        this.loading.set(false);
      }
    });
  }

  previewUrl(): string {
    return `https://www.google.com/maps/search/?api=1&query=${this.form.latitude},${this.form.longitude}`;
  }

  submit(): void {
    this.loading.set(true);
    this.errorMessage.set(null);

    const id = this.editingId();
    const request = id ? this.placeService.update(id, this.form) : this.placeService.create(this.form);

    request.subscribe({
      next: () => {
        this.loading.set(false);
        this.router.navigate(['/admin']);
      },
      error: () => {
        this.loading.set(false);
        this.errorMessage.set('Failed to save place. Please check the form and try again.');
      }
    });
  }
}
