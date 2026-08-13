import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { VisitPlanService } from '../../core/services/visit-plan.service';
import { LeafletMapComponent } from '../../shared/leaflet-map/leaflet-map.component';

@Component({
  selector: 'app-visit-planner',
  standalone: true,
  imports: [RouterLink, LeafletMapComponent],
  templateUrl: './visit-planner.component.html',
  styleUrl: './visit-planner.component.css'
})
export class VisitPlannerComponent {
  visitPlan = inject(VisitPlanService);

  formatMinutes(totalMinutes: number): string {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours === 0) return `${minutes} mins`;
    if (minutes === 0) return `${hours} hr`;
    return `${hours} hr ${minutes} mins`;
  }
}
