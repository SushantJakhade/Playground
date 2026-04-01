import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import { dashboardManifest } from './seed/dashboardManifest.js';
import { demoData } from './seed/demoData.js';
import { fetchLiveData } from './seed/liveData.js';
import {
  findUserByCredentials,
  findUserByUsername,
  createUser,
  insertFile,
  getFilesByRole,
  getAllFiles,
  getFileById,
  deleteFile,
  insertParsedRows,
  getParsedRows,
  getFileColumns,
  getFileSummary,
  type DbUser,
} from './db.js';
import type { DataCatalog, DashboardManifest, AuthSession } from '../src/types.js';

const apiPort = Number(process.env.API_PORT ?? 4174);

// ── Sessions ──

const activeSessions = new Map<string, AuthSession>();

function makeSession(user: DbUser): AuthSession {
  const token = randomBytes(32).toString('hex');
  const session: AuthSession = {
    token,
    user: {
      username: user.username,
      displayName: user.display_name,
      roleId: user.role_id,
    },
  };
  activeSessions.set(token, session);
  return session;
}

function getSessionFromRequest(request: IncomingMessage): AuthSession | null {
  const auth = request.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return null;
  return activeSessions.get(auth.slice(7)) ?? null;
}

// ── Manifest ──

const liveManifest: DashboardManifest = JSON.parse(JSON.stringify(dashboardManifest));

// ── Helpers ──

function sendJson(response: ServerResponse, statusCode: number, payload: unknown) {
  response.writeHead(statusCode, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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

function readRawBody(request: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => resolve(Buffer.concat(chunks)));
    request.on('error', reject);
  });
}

// ── CSV / JSON parsing ──

function parseCSV(text: string): { columns: { name: string; type: string }[]; rows: Record<string, unknown>[] } {
  const lines = text.split('\n').filter((l) => l.trim());
  if (lines.length === 0) return { columns: [], rows: [] };

  const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
  const rows: Record<string, unknown>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map((v) => v.trim().replace(/^"|"$/g, ''));
    const row: Record<string, unknown> = {};
    for (let j = 0; j < headers.length; j++) {
      const val = values[j] ?? '';
      const num = Number(val);
      row[headers[j]] = val !== '' && !isNaN(num) ? num : val;
    }
    rows.push(row);
  }

  const columns = headers.map((name) => {
    const sample = rows.slice(0, 20);
    const allNumbers = sample.length > 0 && sample.every((r) => typeof r[name] === 'number');
    return { name, type: allNumbers ? 'number' : 'text' };
  });

  return { columns, rows };
}

function parseJSON(text: string): { columns: { name: string; type: string }[]; rows: Record<string, unknown>[] } {
  const data = JSON.parse(text);
  const arr = Array.isArray(data) ? data : data.data ?? data.results ?? data.items ?? [data];
  if (arr.length === 0) return { columns: [], rows: [] };

  const keys = [...new Set(arr.flatMap((item: any) => Object.keys(item)))];
  const columns = keys.map((name) => {
    const sample = arr.slice(0, 20);
    const allNumbers = sample.length > 0 && sample.every((r: any) => typeof r[name] === 'number');
    return { name, type: allNumbers ? 'number' : 'text' };
  });

  return { columns, rows: arr };
}

// ── Multipart parser (simple boundary-based) ──

interface MultipartFile {
  filename: string;
  contentType: string;
  data: Buffer;
}

function parseMultipart(body: Buffer, boundary: string): { fields: Record<string, string>; files: MultipartFile[] } {
  const fields: Record<string, string> = {};
  const files: MultipartFile[] = [];
  const boundaryBuf = Buffer.from(`--${boundary}`);

  const parts: Buffer[] = [];
  let start = 0;
  while (true) {
    const idx = body.indexOf(boundaryBuf, start);
    if (idx === -1) break;
    if (start > 0) {
      // Strip leading \r\n and trailing \r\n before boundary
      let partStart = start;
      let partEnd = idx;
      if (body[partStart] === 0x0d && body[partStart + 1] === 0x0a) partStart += 2;
      if (body[partEnd - 2] === 0x0d && body[partEnd - 1] === 0x0a) partEnd -= 2;
      if (partEnd > partStart) parts.push(body.subarray(partStart, partEnd));
    }
    start = idx + boundaryBuf.length;
  }

  for (const part of parts) {
    const headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd === -1) continue;
    const headerStr = part.subarray(0, headerEnd).toString();
    const content = part.subarray(headerEnd + 4);

    const nameMatch = headerStr.match(/name="([^"]+)"/);
    const filenameMatch = headerStr.match(/filename="([^"]+)"/);
    const ctMatch = headerStr.match(/Content-Type:\s*(.+)/i);

    if (filenameMatch && nameMatch) {
      files.push({
        filename: filenameMatch[1],
        contentType: ctMatch?.[1]?.trim() ?? 'application/octet-stream',
        data: content,
      });
    } else if (nameMatch) {
      fields[nameMatch[1]] = content.toString().trim();
    }
  }

  return { fields, files };
}

// ── Live data cache ──

let cachedLiveData: DataCatalog | null = null;
let lastFetchError: string | null = null;

// ── Server ──

const server = createServer(async (request, response) => {
  if (!request.url) {
    sendJson(response, 400, { error: 'Missing request URL.' });
    return;
  }

  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    response.end();
    return;
  }

  const url = new URL(request.url, `http://${request.headers.host ?? '127.0.0.1'}`);

  // ══════════════════════════════════════
  // AUTH API
  // ══════════════════════════════════════

  if (request.method === 'GET' && url.pathname === '/api/auth/roles') {
    const roles = Object.values(liveManifest.roles).map((r) => ({
      id: r.id,
      label: r.label,
      summary: r.summary,
    }));
    sendJson(response, 200, { ok: true, roles });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/auth/login') {
    try {
      const body = JSON.parse(await readBody(request));
      const { username, password } = body;
      const user = findUserByCredentials(username, password);
      if (!user) {
        sendJson(response, 401, { ok: false, error: 'Invalid username or password.' });
        return;
      }
      const session = makeSession(user);
      console.log(`[Auth] User "${username}" logged in (role: ${user.role_id})`);
      sendJson(response, 200, { ok: true, session });
    } catch {
      sendJson(response, 400, { ok: false, error: 'Invalid request body.' });
    }
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/auth/register') {
    try {
      const body = JSON.parse(await readBody(request));
      const { username, password, displayName, roleId } = body;

      if (!username || !password || !displayName || !roleId) {
        sendJson(response, 400, { ok: false, error: 'All fields are required.' });
        return;
      }
      if (!liveManifest.roles[roleId]) {
        sendJson(response, 400, { ok: false, error: `Role "${roleId}" does not exist.` });
        return;
      }
      if (findUserByUsername(username)) {
        sendJson(response, 409, { ok: false, error: 'Username already taken.' });
        return;
      }

      const user = createUser(username, password, displayName, roleId);
      const session = makeSession(user);
      console.log(`[Auth] New user "${username}" registered (role: ${roleId})`);
      sendJson(response, 201, { ok: true, session });
    } catch {
      sendJson(response, 400, { ok: false, error: 'Invalid request body.' });
    }
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/auth/logout') {
    const session = getSessionFromRequest(request);
    if (session) {
      activeSessions.delete(session.token);
      console.log(`[Auth] User "${session.user.username}" logged out`);
    }
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/auth/me') {
    const session = getSessionFromRequest(request);
    if (!session) {
      sendJson(response, 401, { ok: false, error: 'Not authenticated.' });
      return;
    }
    sendJson(response, 200, { ok: true, user: session.user });
    return;
  }

  // ══════════════════════════════════════
  // FILES API
  // ══════════════════════════════════════

  // Upload file
  if (request.method === 'POST' && url.pathname === '/api/files/upload') {
    const session = getSessionFromRequest(request);
    if (!session) {
      sendJson(response, 401, { ok: false, error: 'Not authenticated.' });
      return;
    }

    const contentType = request.headers['content-type'] ?? '';
    const boundaryMatch = contentType.match(/boundary=(.+)/);
    if (!boundaryMatch) {
      sendJson(response, 400, { ok: false, error: 'Missing multipart boundary.' });
      return;
    }

    try {
      const rawBody = await readRawBody(request);
      const { files: uploadedFiles } = parseMultipart(rawBody, boundaryMatch[1]);

      if (uploadedFiles.length === 0) {
        sendJson(response, 400, { ok: false, error: 'No file provided.' });
        return;
      }

      const results = [];
      for (const file of uploadedFiles) {
        const storedName = `${Date.now()}-${randomBytes(4).toString('hex')}-${file.filename}`;
        const dbFile = insertFile(
          storedName,
          file.filename,
          file.contentType,
          file.data.length,
          session.user.username,
          session.user.roleId,
          file.data
        );

        // Auto-parse CSV and JSON files
        const ext = file.filename.toLowerCase();
        if (ext.endsWith('.csv')) {
          const { columns, rows } = parseCSV(file.data.toString('utf-8'));
          insertParsedRows(dbFile.id, columns, rows);
          console.log(`[Files] Parsed ${rows.length} rows from CSV "${file.filename}"`);
        } else if (ext.endsWith('.json')) {
          try {
            const { columns, rows } = parseJSON(file.data.toString('utf-8'));
            insertParsedRows(dbFile.id, columns, rows);
            console.log(`[Files] Parsed ${rows.length} rows from JSON "${file.filename}"`);
          } catch {
            console.warn(`[Files] Could not parse JSON "${file.filename}" as tabular data`);
          }
        }

        results.push(dbFile);
      }

      console.log(`[Files] ${session.user.username} uploaded ${results.length} file(s)`);
      sendJson(response, 201, { ok: true, files: results });
    } catch (err) {
      console.error('[Files] Upload error:', err);
      sendJson(response, 500, { ok: false, error: 'File upload failed.' });
    }
    return;
  }

  // List files (admin sees all, others see own role)
  if (request.method === 'GET' && url.pathname === '/api/files') {
    const session = getSessionFromRequest(request);
    if (!session) {
      sendJson(response, 401, { ok: false, error: 'Not authenticated.' });
      return;
    }

    const files = session.user.roleId === 'admin' ? getAllFiles() : getFilesByRole(session.user.roleId);
    sendJson(response, 200, { ok: true, files });
    return;
  }

  // Get file details + summary
  const fileDetailMatch = url.pathname.match(/^\/api\/files\/(\d+)$/);
  if (request.method === 'GET' && fileDetailMatch) {
    const session = getSessionFromRequest(request);
    if (!session) {
      sendJson(response, 401, { ok: false, error: 'Not authenticated.' });
      return;
    }

    const fileId = Number(fileDetailMatch[1]);
    const file = getFileById(fileId);
    if (!file) {
      sendJson(response, 404, { ok: false, error: 'File not found.' });
      return;
    }

    const summary = getFileSummary(fileId);
    sendJson(response, 200, {
      ok: true,
      file: {
        id: file.id,
        filename: file.filename,
        original_name: file.original_name,
        mime_type: file.mime_type,
        size: file.size,
        uploaded_by: file.uploaded_by,
        role_id: file.role_id,
        created_at: file.created_at,
      },
      summary,
    });
    return;
  }

  // Get parsed data for a file
  const fileDataMatch = url.pathname.match(/^\/api\/files\/(\d+)\/data$/);
  if (request.method === 'GET' && fileDataMatch) {
    const session = getSessionFromRequest(request);
    if (!session) {
      sendJson(response, 401, { ok: false, error: 'Not authenticated.' });
      return;
    }

    const fileId = Number(fileDataMatch[1]);
    const file = getFileById(fileId);
    if (!file) {
      sendJson(response, 404, { ok: false, error: 'File not found.' });
      return;
    }

    const columns = getFileColumns(fileId);
    const rows = getParsedRows(fileId);
    sendJson(response, 200, { ok: true, columns, rows, totalRows: rows.length });
    return;
  }

  // Download raw file
  const fileDownloadMatch = url.pathname.match(/^\/api\/files\/(\d+)\/download$/);
  if (request.method === 'GET' && fileDownloadMatch) {
    const session = getSessionFromRequest(request);
    if (!session) {
      sendJson(response, 401, { ok: false, error: 'Not authenticated.' });
      return;
    }

    const fileId = Number(fileDownloadMatch[1]);
    const file = getFileById(fileId);
    if (!file) {
      sendJson(response, 404, { ok: false, error: 'File not found.' });
      return;
    }

    response.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': file.mime_type,
      'Content-Disposition': `attachment; filename="${file.original_name}"`,
      'Content-Length': file.content.length,
    });
    response.end(file.content);
    return;
  }

  // Delete file
  const fileDeleteMatch = url.pathname.match(/^\/api\/files\/(\d+)$/);
  if (request.method === 'DELETE' && fileDeleteMatch) {
    const session = getSessionFromRequest(request);
    if (!session) {
      sendJson(response, 401, { ok: false, error: 'Not authenticated.' });
      return;
    }

    const fileId = Number(fileDeleteMatch[1]);
    const deleted = deleteFile(fileId);
    if (!deleted) {
      sendJson(response, 404, { ok: false, error: 'File not found.' });
      return;
    }

    console.log(`[Files] ${session.user.username} deleted file #${fileId}`);
    sendJson(response, 200, { ok: true });
    return;
  }

  // ══════════════════════════════════════
  // DASHBOARD & HEALTH
  // ══════════════════════════════════════

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

  // ══════════════════════════════════════
  // ADMIN API
  // ══════════════════════════════════════

  const toggleViewMatch = url.pathname.match(/^\/api\/admin\/roles\/([^/]+)\/views\/([^/]+)\/toggle$/);
  if (request.method === 'POST' && toggleViewMatch) {
    const [, roleId, viewId] = toggleViewMatch;
    const role = liveManifest.roles[roleId];
    if (!role) { sendJson(response, 404, { error: `Role "${roleId}" not found.` }); return; }
    const view = role.views.find((v) => v.id === viewId);
    if (!view) { sendJson(response, 404, { error: `View "${viewId}" not found.` }); return; }
    view.disabled = !view.disabled;
    if (view.disabled && role.defaultViewId === viewId) {
      const firstEnabled = role.views.find((v) => !v.disabled);
      if (firstEnabled) role.defaultViewId = firstEnabled.id;
    }
    sendJson(response, 200, { ok: true, viewId, disabled: view.disabled });
    return;
  }

  const toggleWidgetMatch = url.pathname.match(/^\/api\/admin\/roles\/([^/]+)\/views\/([^/]+)\/widgets\/([^/]+)\/toggle$/);
  if (request.method === 'POST' && toggleWidgetMatch) {
    const [, roleId, viewId, widgetId] = toggleWidgetMatch;
    const role = liveManifest.roles[roleId];
    if (!role) { sendJson(response, 404, { error: `Role "${roleId}" not found.` }); return; }
    const view = role.views.find((v) => v.id === viewId);
    if (!view) { sendJson(response, 404, { error: `View "${viewId}" not found.` }); return; }
    const widget = view.widgets.find((w) => w.id === widgetId);
    if (!widget) { sendJson(response, 404, { error: `Widget "${widgetId}" not found.` }); return; }
    (widget as any).disabled = !(widget as any).disabled;
    sendJson(response, 200, { ok: true, widgetId, disabled: (widget as any).disabled });
    return;
  }

  const updateRoleMatch = url.pathname.match(/^\/api\/admin\/roles\/([^/]+)$/);
  if (request.method === 'PATCH' && updateRoleMatch) {
    const [, roleId] = updateRoleMatch;
    const role = liveManifest.roles[roleId];
    if (!role) { sendJson(response, 404, { error: `Role "${roleId}" not found.` }); return; }
    try {
      const body = JSON.parse(await readBody(request));
      if (body.label !== undefined) role.label = body.label;
      if (body.summary !== undefined) role.summary = body.summary;
      if (body.description !== undefined) role.description = body.description;
      if (body.accentLabel !== undefined) role.accentLabel = body.accentLabel;
      sendJson(response, 200, { ok: true, role });
    } catch {
      sendJson(response, 400, { error: 'Invalid JSON body.' });
    }
    return;
  }

  const updateViewMatch = url.pathname.match(/^\/api\/admin\/roles\/([^/]+)\/views\/([^/]+)$/);
  if (request.method === 'PATCH' && updateViewMatch) {
    const [, roleId, viewId] = updateViewMatch;
    const role = liveManifest.roles[roleId];
    if (!role) { sendJson(response, 404, { error: `Role "${roleId}" not found.` }); return; }
    const view = role.views.find((v) => v.id === viewId);
    if (!view) { sendJson(response, 404, { error: `View "${viewId}" not found.` }); return; }
    try {
      const body = JSON.parse(await readBody(request));
      if (body.label !== undefined) view.label = body.label;
      if (body.title !== undefined) view.title = body.title;
      if (body.summary !== undefined) view.summary = body.summary;
      sendJson(response, 200, { ok: true, view });
    } catch {
      sendJson(response, 400, { error: 'Invalid JSON body.' });
    }
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/admin/reset') {
    const fresh: DashboardManifest = JSON.parse(JSON.stringify(dashboardManifest));
    for (const key of Object.keys(liveManifest.roles)) delete liveManifest.roles[key];
    Object.assign(liveManifest, fresh);
    sendJson(response, 200, { ok: true });
    return;
  }

  sendJson(response, 404, { error: 'Route not found.', path: url.pathname });
});

server.listen(apiPort, '127.0.0.1', () => {
  console.log(`Adaptive dashboard API listening at http://127.0.0.1:${apiPort}`);
});

function closeServer() {
  server.close(() => process.exit(0));
}

process.on('SIGINT', closeServer);
process.on('SIGTERM', closeServer);
