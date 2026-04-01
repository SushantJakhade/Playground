import { FormEvent, useEffect, useState } from 'react';
import type { AuthSession } from '../types';

interface LoginPageProps {
  onLogin: (session: AuthSession) => void;
}

interface RoleOption {
  id: string;
  label: string;
  summary: string;
}

type Tab = 'login' | 'register';

export function LoginPage({ onLogin }: LoginPageProps) {
  const [tab, setTab] = useState<Tab>('login');
  const [roles, setRoles] = useState<RoleOption[]>([]);

  // Login state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  // Register state
  const [regUsername, setRegUsername] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regDisplayName, setRegDisplayName] = useState('');
  const [regRoleId, setRegRoleId] = useState('');

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/auth/roles')
      .then((r) => r.json())
      .then((data) => {
        if (data.ok && data.roles) {
          setRoles(data.roles);
          if (data.roles.length > 0) setRegRoleId(data.roles[0].id);
        }
      })
      .catch(() => {});
  }, []);

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || 'Login failed.');
        setLoading(false);
        return;
      }
      onLogin(data.session);
    } catch {
      setError('Unable to reach the server. Is the backend running?');
      setLoading(false);
    }
  }

  async function handleRegister(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: regUsername,
          password: regPassword,
          displayName: regDisplayName,
          roleId: regRoleId,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || 'Registration failed.');
        setLoading(false);
        return;
      }
      onLogin(data.session);
    } catch {
      setError('Unable to reach the server. Is the backend running?');
      setLoading(false);
    }
  }

  function switchTab(next: Tab) {
    setTab(next);
    setError('');
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-card__header">
          <p className="status-card__eyebrow">Adaptive Role Dashboard</p>
          <h1>{tab === 'login' ? 'Sign in' : 'Create account'}</h1>
          <p className="login-card__subtitle">
            {tab === 'login'
              ? 'Sign in to access your role-specific dashboard.'
              : 'Register a new account and pick your dashboard role.'}
          </p>
        </div>

        <div className="login-tabs">
          <button
            className={`login-tab ${tab === 'login' ? 'login-tab--active' : ''}`}
            onClick={() => switchTab('login')}
            type="button"
          >
            Sign in
          </button>
          <button
            className={`login-tab ${tab === 'register' ? 'login-tab--active' : ''}`}
            onClick={() => switchTab('register')}
            type="button"
          >
            Sign up
          </button>
        </div>

        {tab === 'login' ? (
          <form className="login-form" onSubmit={handleLogin}>
            <div className="login-field">
              <label htmlFor="login-username">Username</label>
              <input
                autoComplete="username"
                autoFocus
                disabled={loading}
                id="login-username"
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username"
                required
                type="text"
                value={username}
              />
            </div>

            <div className="login-field">
              <label htmlFor="login-password">Password</label>
              <input
                autoComplete="current-password"
                disabled={loading}
                id="login-password"
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                type="password"
                value={password}
              />
            </div>

            {error && (
              <div className="login-error" role="alert">
                {error}
              </div>
            )}

            <button className="primary-button login-submit" disabled={loading} type="submit">
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        ) : (
          <form className="login-form" onSubmit={handleRegister}>
            <div className="login-field">
              <label htmlFor="reg-displayname">Display Name</label>
              <input
                autoFocus
                disabled={loading}
                id="reg-displayname"
                onChange={(e) => setRegDisplayName(e.target.value)}
                placeholder="Your full name"
                required
                type="text"
                value={regDisplayName}
              />
            </div>

            <div className="login-field">
              <label htmlFor="reg-username">Username</label>
              <input
                autoComplete="username"
                disabled={loading}
                id="reg-username"
                onChange={(e) => setRegUsername(e.target.value)}
                placeholder="Choose a username"
                required
                type="text"
                value={regUsername}
              />
            </div>

            <div className="login-field">
              <label htmlFor="reg-password">Password</label>
              <input
                autoComplete="new-password"
                disabled={loading}
                id="reg-password"
                onChange={(e) => setRegPassword(e.target.value)}
                placeholder="Choose a password"
                required
                type="password"
                value={regPassword}
              />
            </div>

            <div className="login-field">
              <label htmlFor="reg-role">Dashboard Role</label>
              <select
                disabled={loading}
                id="reg-role"
                onChange={(e) => setRegRoleId(e.target.value)}
                required
                value={regRoleId}
              >
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.label} — {role.summary}
                  </option>
                ))}
              </select>
            </div>

            {error && (
              <div className="login-error" role="alert">
                {error}
              </div>
            )}

            <button className="primary-button login-submit" disabled={loading} type="submit">
              {loading ? 'Creating account...' : 'Create account'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
