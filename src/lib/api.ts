import { DashboardBootstrap } from '../types';

export async function fetchDashboardBootstrap(
  signal?: AbortSignal,
): Promise<DashboardBootstrap> {
  const response = await fetch('/api/dashboard/bootstrap', {
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
    },
    signal,
  });

  if (!response.ok) {
    throw new Error(`Dashboard API request failed with status ${response.status}.`);
  }

  return response.json() as Promise<DashboardBootstrap>;
}

// ── Admin API ──

export async function adminToggleView(roleId: string, viewId: string) {
  const res = await fetch(`/api/admin/roles/${roleId}/views/${viewId}/toggle`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to toggle view');
  return res.json();
}

export async function adminToggleWidget(roleId: string, viewId: string, widgetId: string) {
  const res = await fetch(`/api/admin/roles/${roleId}/views/${viewId}/widgets/${widgetId}/toggle`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to toggle widget');
  return res.json();
}

export async function adminUpdateRole(roleId: string, updates: Record<string, string>) {
  const res = await fetch(`/api/admin/roles/${roleId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error('Failed to update role');
  return res.json();
}

export async function adminUpdateView(roleId: string, viewId: string, updates: Record<string, string>) {
  const res = await fetch(`/api/admin/roles/${roleId}/views/${viewId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error('Failed to update view');
  return res.json();
}

export async function adminResetManifest() {
  const res = await fetch('/api/admin/reset', { method: 'POST' });
  if (!res.ok) throw new Error('Failed to reset manifest');
  return res.json();
}
