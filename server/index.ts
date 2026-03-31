import { createServer, ServerResponse } from 'node:http';
import { dashboardManifest } from './seed/dashboardManifest.js';
import { demoData } from './seed/demoData.js';

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
    });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/dashboard/bootstrap') {
    sendJson(response, 200, {
      data: demoData,
      manifest: dashboardManifest,
      meta: {
        environment: process.env.NODE_ENV ?? 'development',
        generatedAt: new Date().toISOString(),
        roleCount: Object.keys(dashboardManifest.roles).length,
        seeded: true,
        source: 'backend-api',
      },
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
