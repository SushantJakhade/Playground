# Adaptive Role Dashboard

A generalized, config-driven dashboard framework that maps user roles to independently composed views. The current build includes a backend API that serves the dashboard manifest and datasets for three simulated roles:

- `Admin`: command and governance heavy
- `Analyst`: signal and exploration focused
- `Business User`: planning and portfolio oriented

## Stack

- React 19
- TypeScript
- Vite
- D3.js for chart primitives

## Scripts

```bash
npm install
npm run dev
npm run build
```

## Architecture

- `server/index.ts`: backend API entry point
- `server/seed/dashboardManifest.ts`: manifest describing roles, views, and widget layouts
- `server/seed/demoData.ts`: seeded datasets served by the backend
- `src/lib/api.ts`: frontend API client that fetches the bootstrap payload
- `src/components/DashboardGrid.tsx`: config-driven renderer that resolves widgets into UI
- `src/components/widgets/*`: reusable cards and D3 visualizations

To add a new role, define:

1. Metrics and datasets in `server/seed/demoData.ts`
2. A role entry with one or more views in `server/seed/dashboardManifest.ts`
3. Optional new widget renderer if the existing registry is not enough

The frontend no longer imports the seed files directly. It loads the bootstrap payload from `/api/dashboard/bootstrap`, which makes it straightforward to replace the current seed layer with a real database-backed service later.
