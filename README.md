# Yaal Trails — Frontend (Angular)

Web client for **Yaal Trails**, a tourist information and one-day visit-planning system for places of interest
within 25 km of Jaffna town, Sri Lanka. ITE2953 Programming Group Project — Lakshiga Mahendrarajah (E2410628).

The backend (ASP.NET Core Web API + SQLite) is a separate project; this app talks only to that API.

## Features

**Tourist (no login)**
- List of attractions with photo, category, rating and distance from home
- Filter by category (Religious, Heritage, Cultural, Nature)
- Details page: description, opening hours, travel tips, visit duration, distance
- Interactive map of all attractions (Leaflet + OpenStreetMap, Google Maps optional)
- One-day trip planner: add/remove/reorder stops, optimise route, timetable with opening-hours checks,
  weather, share link and print
- Ratings and reviews; English / Tamil / Sinhala interface

**Administrator**
- Secure login (JWT), route guard on all admin pages
- Add, edit, hide and delete attractions; moderate reviews

## Tech stack

Angular 22 (standalone components, signals) · TypeScript · Bootstrap 5 · Leaflet · Jasmine/Karma

## Project structure

```
src/app/
  core/       models, services, guards, interceptors, i18n, utils
  features/   home, place-detail, map-view, visit-planner, admin, credits
  shared/     reusable map, rating, weather and select components
  app.routes.ts   lazy-loaded routes
```

## Getting started

Requirements: Node.js 20+ and the backend API running (default `http://localhost:5001`).

```bash
npm install
cp .env.example .env      # Windows: copy .env.example .env
npm start                 # http://localhost:4200
```

`.env` settings (never committed):

| Variable | Purpose |
|---|---|
| `NG_APP_API_BASE_URL` | Backend API, e.g. `http://localhost:5001/api` |
| `NG_APP_GOOGLE_MAPS_API_KEY` | Optional browser key; leave empty to use OpenStreetMap |
| `NG_APP_GOOGLE_MAP_ID` | Map ID for Google markers (`DEMO_MAP_ID` for development) |
| `NG_APP_CLIENT_ID` / `NG_APP_CLIENT_SECRET` | Web client credentials registered in the backend (`ClientAuth` section) |

`npm start`, `npm run build` and `npm test` run `scripts/set-env.mjs` first, which turns `.env` into
`src/environments/env.generated.ts` (git-ignored).

## Scripts

| Command | Description |
|---|---|
| `npm start` | Development server with live reload |
| `npm run build` | Production build into `dist/` |
| `npm test` | Unit tests (Karma + Jasmine) |

## Photo credits

Place photos in `public/images/places/` come from Wikimedia Commons under Creative Commons licences;
attribution is listed in `src/app/core/models/photo-credits.ts` and shown on the `/credits` page.
