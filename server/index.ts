import { createServer, ServerResponse } from 'node:http';
import { dashboardManifest } from './seed/dashboardManifest.js';
import { demoData } from './seed/demoData.js';
import { fetchLiveData } from './seed/liveData.js';
import type { DataCatalog } from '../src/types.js';

const apiPort = Number(process.env.API_PORT ?? 4174);

function sendJson(response: ServerResponse, statusCode: number, payload: unknown) {
  response.writeHead(statusCode, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(payload));
}

// Cache the last successful live data fetch
let cachedLiveData: DataCatalog | null = null;
let lastFetchError: string | null = null;

const server = createServer((request, response) => {
  if (!request.url) {
    sendJson(response, 400, { error: 'Missing request URL.' });
    return;
  }

  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
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
          manifest: dashboardManifest,
          meta: {
            environment: process.env.NODE_ENV ?? 'development',
            generatedAt: new Date().toISOString(),
            roleCount: Object.keys(dashboardManifest.roles).length,
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
          manifest: dashboardManifest,
          meta: {
            environment: process.env.NODE_ENV ?? 'development',
            generatedAt: new Date().toISOString(),
            roleCount: Object.keys(dashboardManifest.roles).length,
            seeded: cachedLiveData === null,
            source: cachedLiveData ? 'cached-live' : 'fallback-demo',
            dataSources: cachedLiveData ? ['CoinGecko', 'GitHub', 'HackerNews'] : ['demo-seed'],
            warning: `Live fetch failed: ${message}`,
          },
        });
      });
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
