# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Adaptive Role Dashboard — a config-driven dashboard framework that maps user roles (Admin, Analyst, Business User) to independently composed views. Built as a full-stack TypeScript monorepo with a React frontend and a vanilla Node.js HTTP backend.

## Commands

```bash
npm install           # Install dependencies
npm run dev           # Run server + client concurrently (server on :4174, client on :5173)
npm run dev:client    # Frontend only (Vite)
npm run dev:server    # Backend only (tsx watch)
npm run build         # Full build: tsc (client) + tsc -p tsconfig.server.json + vite build
npm run preview       # Preview built frontend
```

No test runner or linter is configured.

## Architecture

### Data Flow

1. Frontend boots and calls `GET /api/dashboard/bootstrap`
2. Backend merges the **manifest** (roles/views/widget specs from `server/seed/dashboardManifest.ts`) with **data** (demo data + live external API data) into a single bootstrap payload
3. Frontend renders based on selected role → view using `DashboardGrid` as a widget registry
4. Live data refreshes every 5 seconds via re-fetching the bootstrap endpoint

### Key Layers

- **Manifest** (`server/seed/dashboardManifest.ts`): Declarative role → view → widget definitions. This is the single source of layout truth.
- **Data** (`server/seed/demoData.ts`, `server/seed/liveData.ts`): Demo datasets and live external API fetches (CoinGecko, GitHub, HackerNews) with a 5-second cache.
- **Widget Registry** (`src/components/DashboardGrid.tsx`): Maps `widget.kind` strings to React components. Supported kinds: `hero`, `metric-strip`, `trend`, `comparison`, `bullet-list`, `activity-feed`, `table`, `manifest`, `spotlight`.
- **Types** (`src/types.ts`): Shared type definitions imported by both client and server (via `tsconfig.server.json`).

### Backend API (server/index.ts)

Raw Node.js `http` module — no framework. CORS fully open. Routes:

- `GET /api/dashboard/bootstrap` — main payload
- `GET /api/health` — status check
- `POST /api/admin/roles/{roleId}/views/{viewId}/toggle` — toggle view visibility
- `POST /api/admin/roles/{roleId}/views/{viewId}/widgets/{widgetId}/toggle` — toggle widget
- `PATCH /api/admin/roles/{roleId}` — update role properties
- `PATCH /api/admin/roles/{roleId}/views/{viewId}` — update view properties
- `POST /api/admin/reset` — reset manifest to defaults

### Frontend

- React 19 + Vite 7, vanilla CSS (no preprocessor/CSS-in-JS)
- D3.js for chart rendering in widget components
- Vite proxies `/api` requests to `http://127.0.0.1:4174`
- CSS uses custom properties for theming (`--text`, `--muted`, `--accent`, `--signal`, etc.)

### Adding a New Role/Widget

1. Add metrics/datasets in `server/seed/demoData.ts`
2. Add role entry with views in `server/seed/dashboardManifest.ts`
3. If a new widget kind is needed, create a component in `src/components/widgets/` and register it in `DashboardGrid.tsx`

## Environment

- `API_PORT` env var overrides backend port (default: 4174)
- No `.env` file required
