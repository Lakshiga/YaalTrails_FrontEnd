import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PlaceService } from '../../core/services/place.service';
import { VisitPlanService } from '../../core/services/visit-plan.service';
import { Place } from '../../core/models/place.model';
import { LeafletMapComponent } from '../../shared/leaflet-map/leaflet-map.component';

@Component({
  selector: 'app-place-detail',
  standalone: true,
  imports: [RouterLink, LeafletMapComponent],
  templateUrl: './place-detail.component.html',
  styleUrl: './place-detail.component.css'
})
export class PlaceDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private placeService = inject(PlaceService);
  private visitPlan = inject(VisitPlanService);

  place = signal<Place | null>(null);
  loading = signal(true);
  notFound = signal(false);

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.placeService.getById(id).subscribe({
      next: (place) => {
        this.place.set(place);
        this.loading.set(false);
      },
      error: () => {
        this.notFound.set(true);
        this.loading.set(false);
      }
    });
  }

  isInPlan(): boolean {
    const p = this.place();
    return p ? this.visitPlan.isInPlan(p.id) : false;
  }

  toggleInPlan(): void {
    const p = this.place();
    if (p) this.visitPlan.toggle(p);
  }
}
