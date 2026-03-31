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
