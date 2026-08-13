import { Injectable, computed, signal } from '@angular/core';
import { Place } from '../models/place.model';

const STORAGE_KEY = 'jaffna_visit_plan';

function parseDurationToMinutes(text: string): number {
  const numbers = text.match(/\d+(\.\d+)?/g)?.map(Number) ?? [];
  if (numbers.length === 0) return 30;
  const avg = numbers.reduce((a, b) => a + b, 0) / numbers.length;
  // Heuristic: values <= 6 are treated as hours, otherwise minutes.
  return avg <= 6 ? Math.round(avg * 60) : Math.round(avg);
}

@Injectable({ providedIn: 'root' })
export class VisitPlanService {
  private readonly places = signal<Place[]>(this.loadFromStorage());

  readonly plan = this.places.asReadonly();

  readonly totalVisitMinutes = computed(() =>
    this.places().reduce((sum, p) => sum + parseDurationToMinutes(p.visitDuration), 0)
  );

  readonly totalDistanceKm = computed(() =>
    Math.round(this.places().reduce((sum, p) => sum + p.distanceFromHomeKm, 0) * 10) / 10
  );

  isInPlan(id: number): boolean {
    return this.places().some((p) => p.id === id);
  }

  add(place: Place): void {
    if (this.isInPlan(place.id)) return;
    const updated = [...this.places(), place];
    this.places.set(updated);
    this.saveToStorage(updated);
  }

  remove(id: number): void {
    const updated = this.places().filter((p) => p.id !== id);
    this.places.set(updated);
    this.saveToStorage(updated);
  }

  toggle(place: Place): void {
    this.isInPlan(place.id) ? this.remove(place.id) : this.add(place);
  }

  moveUp(id: number): void {
    const list = [...this.places()];
    const index = list.findIndex((p) => p.id === id);
    if (index <= 0) return;
    [list[index - 1], list[index]] = [list[index], list[index - 1]];
    this.places.set(list);
    this.saveToStorage(list);
  }

  moveDown(id: number): void {
    const list = [...this.places()];
    const index = list.findIndex((p) => p.id === id);
    if (index === -1 || index === list.length - 1) return;
    [list[index + 1], list[index]] = [list[index], list[index + 1]];
    this.places.set(list);
    this.saveToStorage(list);
  }

  clear(): void {
    this.places.set([]);
    this.saveToStorage([]);
  }

  private loadFromStorage(): Place[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as Place[]) : [];
    } catch {
      return [];
    }
  }

  private saveToStorage(places: Place[]): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(places));
  }
}
