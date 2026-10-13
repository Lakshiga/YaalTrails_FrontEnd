import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { catchError, of, retry, timeout } from 'rxjs';
import { PlaceSeedHome } from '../models/home-reference';

export interface WeatherNow {
  temperature: number;
  feelsLike: number;
  humidity: number;
  windKmh: number;
  code: number;
  isDay: boolean;
}

export interface WeatherDay {
  date: string;
  code: number;
  max: number;
  min: number;
  rainChance: number;
  sunrise: string;
  sunset: string;
  uvMax: number;
}

export interface WeatherHour {
  time: string; // local ISO, e.g. 2026-10-13T14:00
  temperature: number;
  rainChance: number;
  code: number;
}

export interface Weather {
  now: WeatherNow;
  days: WeatherDay[];
  hours: WeatherHour[];
  fetchedAt: number;
}

interface OpenMeteoResponse {
  current: { temperature_2m: number; apparent_temperature: number; relative_humidity_2m: number; weather_code: number; wind_speed_10m: number; is_day: number };
  hourly: { time: string[]; temperature_2m: number[]; precipitation_probability: number[]; weather_code: number[] };
  daily: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max: number[];
    sunrise: string[];
    sunset: string[];
    uv_index_max: number[];
  };
}

const REFRESH_MS = 15 * 60 * 1000;

/** WMO weather code → Bootstrap icon and translation key. */
export function weatherInfo(code: number, isDay = true): { icon: string; key: string } {
  if (code === 0) return { icon: isDay ? 'bi-sun' : 'bi-moon-stars', key: 'wx.0' };
  if (code === 1) return { icon: isDay ? 'bi-sun' : 'bi-moon', key: 'wx.1' };
  if (code === 2) return { icon: isDay ? 'bi-cloud-sun' : 'bi-cloud-moon', key: 'wx.2' };
  if (code === 3) return { icon: 'bi-clouds', key: 'wx.3' };
  if (code === 45 || code === 48) return { icon: 'bi-cloud-fog2', key: 'wx.fog' };
  if (code >= 51 && code <= 57) return { icon: 'bi-cloud-drizzle', key: 'wx.drizzle' };
  if (code === 65 || code === 67) return { icon: 'bi-cloud-rain-heavy', key: 'wx.heavyRain' };
  if (code >= 61 && code <= 67) return { icon: 'bi-cloud-rain', key: 'wx.rain' };
  if (code >= 80 && code <= 82) return { icon: 'bi-cloud-rain', key: 'wx.showers' };
  if (code >= 95) return { icon: 'bi-cloud-lightning-rain', key: 'wx.thunder' };
  return { icon: 'bi-cloud', key: 'wx.3' };
}

@Injectable({ providedIn: 'root' })
export class WeatherService {
  private http = inject(HttpClient);

  readonly weather = signal<Weather | null>(null);
  readonly failed = signal(false);
  private loading = false;

  /** Loads the Jaffna forecast once and refreshes it if older than 15 minutes. */
  load(): void {
    const current = this.weather();
    if (this.loading || (current && Date.now() - current.fetchedAt < REFRESH_MS)) return;
    this.loading = true;

    this.http
      .get<OpenMeteoResponse>('https://api.open-meteo.com/v1/forecast', {
        params: {
          latitude: PlaceSeedHome.Latitude,
          longitude: PlaceSeedHome.Longitude,
          current: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day',
          hourly: 'temperature_2m,precipitation_probability,weather_code',
          daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset,uv_index_max',
          timezone: 'Asia/Colombo',
          forecast_days: 3
        }
      })
      .pipe(
        timeout(10000),
        retry({ count: 1, delay: 1500 }),
        catchError(() => of(null))
      )
      .subscribe((res) => {
        this.loading = false;
        if (!res) {
          this.failed.set(true);
          return;
        }
        this.failed.set(false);
        this.weather.set({
          now: {
            temperature: Math.round(res.current.temperature_2m),
            feelsLike: Math.round(res.current.apparent_temperature),
            humidity: res.current.relative_humidity_2m,
            windKmh: Math.round(res.current.wind_speed_10m),
            code: res.current.weather_code,
            isDay: res.current.is_day === 1
          },
          days: res.daily.time.map((date, i) => ({
            date,
            code: res.daily.weather_code[i],
            max: Math.round(res.daily.temperature_2m_max[i]),
            min: Math.round(res.daily.temperature_2m_min[i]),
            rainChance: res.daily.precipitation_probability_max[i] ?? 0,
            sunrise: res.daily.sunrise[i],
            sunset: res.daily.sunset[i],
            uvMax: Math.round(res.daily.uv_index_max[i] ?? 0)
          })),
          hours: res.hourly.time.map((time, i) => ({
            time,
            temperature: Math.round(res.hourly.temperature_2m[i]),
            rainChance: res.hourly.precipitation_probability[i] ?? 0,
            code: res.hourly.weather_code[i]
          })),
          fetchedAt: Date.now()
        });
      });
  }
}
