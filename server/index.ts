import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { dashboardManifest } from './seed/dashboardManifest.js';
import { demoData } from './seed/demoData.js';
import { fetchLiveData } from './seed/liveData.js';
import type { DataCatalog, DashboardManifest } from '../src/types.js';

const apiPort = Number(process.env.API_PORT ?? 4174);

// Mutable copy of the manifest that admin can modify
const liveManifest: DashboardManifest = JSON.parse(JSON.stringify(dashboardManifest));

function sendJson(response: ServerResponse, statusCode: number, payload: unknown) {
  response.writeHead(statusCode, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(payload));
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => resolve(Buffer.concat(chunks).toString()));
    request.on('error', reject);
  });
}

// Cache the last successful live data fetch
let cachedLiveData: DataCatalog | null = null;
let lastFetchError: string | null = null;

const server = createServer(async (request, response) => {
  if (!request.url) {
    sendJson(response, 400, { error: 'Missing request URL.' });
    return;
  }

  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    response.end();
    return;
  }

  const url = new URL(request.url, `http://${request.headers.host ?? '127.0.0.1'}`);

  if (request.method === 'GET' && url.pathname === '/api/health') {
    sendJson(response, 200, {
      service: 'adaptive-role-dashboard-api',
      status: 'ok',
      timestamp: new Date().toISOString(),
      liveData: cachedLiveData !== null,
      lastError: lastFetchError,
    });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/dashboard/bootstrap') {
    fetchLiveData()
      .then((liveData) => {
        cachedLiveData = liveData;
        lastFetchError = null;
        console.log(`[${new Date().toISOString()}] Live data fetched successfully`);
        sendJson(response, 200, {
          data: liveData,
          manifest: liveManifest,
          meta: {
            environment: process.env.NODE_ENV ?? 'development',
            generatedAt: new Date().toISOString(),
            roleCount: Object.keys(liveManifest.roles).length,
            seeded: false,
            source: 'live-api',
            dataSources: ['CoinGecko', 'GitHub', 'HackerNews'],
          },
        });
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : 'Unknown error';
        lastFetchError = message;
        console.warn(`[${new Date().toISOString()}] Live data fetch failed: ${message}`);
        console.log('Falling back to', cachedLiveData ? 'cached live data' : 'demo data');
        sendJson(response, 200, {
          data: cachedLiveData ?? demoData,
          manifest: liveManifest,
          meta: {
            environment: process.env.NODE_ENV ?? 'development',
            generatedAt: new Date().toISOString(),
            roleCount: Object.keys(liveManifest.roles).length,
            seeded: cachedLiveData === null,
            source: cachedLiveData ? 'cached-live' : 'fallback-demo',
            dataSources: cachedLiveData ? ['CoinGecko', 'GitHub', 'HackerNews'] : ['demo-seed'],
            warning: `Live fetch failed: ${message}`,
          },
        });
      });
    return;
  }

  // ── Admin API: Toggle view enabled/disabled ──
  const toggleViewMatch = url.pathname.match(/^\/api\/admin\/roles\/([^/]+)\/views\/([^/]+)\/toggle$/);
  if (request.method === 'POST' && toggleViewMatch) {
    const [, roleId, viewId] = toggleViewMatch;
    const role = liveManifest.roles[roleId];
    if (!role) {
      sendJson(response, 404, { error: `Role "${roleId}" not found.` });
      return;
    }
    const view = role.views.find((v) => v.id === viewId);
    if (!view) {
      sendJson(response, 404, { error: `View "${viewId}" not found in role "${roleId}".` });
      return;
    }
    view.disabled = !view.disabled;
    // If we disabled the default view, pick the first enabled one
    if (view.disabled && role.defaultViewId === viewId) {
      const firstEnabled = role.views.find((v) => !v.disabled);
      if (firstEnabled) role.defaultViewId = firstEnabled.id;
    }
    console.log(`[Admin] Toggled view "${viewId}" in role "${roleId}" → ${view.disabled ? 'disabled' : 'enabled'}`);
    sendJson(response, 200, { ok: true, viewId, disabled: view.disabled });
    return;
  }

  // ── Admin API: Toggle widget enabled/disabled ──
  const toggleWidgetMatch = url.pathname.match(/^\/api\/admin\/roles\/([^/]+)\/views\/([^/]+)\/widgets\/([^/]+)\/toggle$/);
  if (request.method === 'POST' && toggleWidgetMatch) {
    const [, roleId, viewId, widgetId] = toggleWidgetMatch;
    const role = liveManifest.roles[roleId];
    if (!role) {
      sendJson(response, 404, { error: `Role "${roleId}" not found.` });
      return;
    }
    const view = role.views.find((v) => v.id === viewId);
    if (!view) {
      sendJson(response, 404, { error: `View "${viewId}" not found.` });
      return;
    }
    const widget = view.widgets.find((w) => w.id === widgetId);
    if (!widget) {
      sendJson(response, 404, { error: `Widget "${widgetId}" not found.` });
      return;
    }
    // Store disabled state on the widget
    (widget as any).disabled = !(widget as any).disabled;
    const disabled = (widget as any).disabled;
    console.log(`[Admin] Toggled widget "${widgetId}" in view "${viewId}" of role "${roleId}" → ${disabled ? 'disabled' : 'enabled'}`);
    sendJson(response, 200, { ok: true, widgetId, disabled });
    return;
  }

  // ── Admin API: Update role properties ──
  const updateRoleMatch = url.pathname.match(/^\/api\/admin\/roles\/([^/]+)$/);
  if (request.method === 'PATCH' && updateRoleMatch) {
    const [, roleId] = updateRoleMatch;
    const role = liveManifest.roles[roleId];
    if (!role) {
      sendJson(response, 404, { error: `Role "${roleId}" not found.` });
      return;
    }
    try {
      const body = JSON.parse(await readBody(request));
      if (body.label !== undefined) role.label = body.label;
      if (body.summary !== undefined) role.summary = body.summary;
      if (body.description !== undefined) role.description = body.description;
      if (body.accentLabel !== undefined) role.accentLabel = body.accentLabel;
      console.log(`[Admin] Updated role "${roleId}" properties`);
      sendJson(response, 200, { ok: true, role });
    } catch {
      sendJson(response, 400, { error: 'Invalid JSON body.' });
    }
    return;
  }

  // ── Admin API: Update view properties ──
  const updateViewMatch = url.pathname.match(/^\/api\/admin\/roles\/([^/]+)\/views\/([^/]+)$/);
  if (request.method === 'PATCH' && updateViewMatch) {
    const [, roleId, viewId] = updateViewMatch;
    const role = liveManifest.roles[roleId];
    if (!role) {
      sendJson(response, 404, { error: `Role "${roleId}" not found.` });
      return;
    }
    const view = role.views.find((v) => v.id === viewId);
    if (!view) {
      sendJson(response, 404, { error: `View "${viewId}" not found.` });
      return;
    }
    try {
      const body = JSON.parse(await readBody(request));
      if (body.label !== undefined) view.label = body.label;
      if (body.title !== undefined) view.title = body.title;
      if (body.summary !== undefined) view.summary = body.summary;
      console.log(`[Admin] Updated view "${viewId}" in role "${roleId}"`);
      sendJson(response, 200, { ok: true, view });
    } catch {
      sendJson(response, 400, { error: 'Invalid JSON body.' });
    }
    return;
  }

  // ── Admin API: Reset manifest to defaults ──
  if (request.method === 'POST' && url.pathname === '/api/admin/reset') {
    const fresh: DashboardManifest = JSON.parse(JSON.stringify(dashboardManifest));
    for (const key of Object.keys(liveManifest.roles)) {
      delete liveManifest.roles[key];
    }
    Object.assign(liveManifest, fresh);
    console.log(`[Admin] Manifest reset to defaults`);
    sendJson(response, 200, { ok: true });
    return;
  }

  sendJson(response, 404, {
    error: 'Route not found.',
    path: url.pathname,
  });
});

server.listen(apiPort, '127.0.0.1', () => {
  console.log(`Adaptive dashboard API listening at http://127.0.0.1:${apiPort}`);
});

function closeServer() {
  server.close(() => {
    process.exit(0);
  });
}

process.on('SIGINT', closeServer);
process.on('SIGTERM', closeServer);
