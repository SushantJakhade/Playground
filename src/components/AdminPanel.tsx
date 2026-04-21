import { useState } from 'react';
import { DashboardManifest, RoleConfig, ViewConfig, DashboardWidget } from '../types';
import {
  adminToggleView,
  adminToggleWidget,
  adminUpdateRole,
  adminUpdateView,
  adminResetManifest,
} from '../lib/api';

interface AdminPanelProps {
  manifest: DashboardManifest;
  token: string;
  onRefresh: () => void;
}

export function AdminPanel({ manifest, token, onRefresh }: AdminPanelProps) {
  const [expandedRole, setExpandedRole] = useState<string | null>(null);
  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [editingView, setEditingView] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Inline edit state
  const [editLabel, setEditLabel] = useState('');
  const [editSummary, setEditSummary] = useState('');
  const [editViewLabel, setEditViewLabel] = useState('');
  const [editViewTitle, setEditViewTitle] = useState('');
  const [editViewSummary, setEditViewSummary] = useState('');

  const roles = Object.values(manifest.roles).filter((r) => r.id !== 'admin');

  async function handleToggleView(roleId: string, viewId: string) {
    setSaving(true);
    await adminToggleView(token, roleId, viewId);
    onRefresh();
    setSaving(false);
  }

  async function handleToggleWidget(roleId: string, viewId: string, widgetId: string) {
    setSaving(true);
    await adminToggleWidget(token, roleId, viewId, widgetId);
    onRefresh();
    setSaving(false);
  }

  async function handleSaveRole(roleId: string) {
    setSaving(true);
    await adminUpdateRole(token, roleId, { label: editLabel, summary: editSummary });
    setEditingRole(null);
    onRefresh();
    setSaving(false);
  }

  async function handleSaveView(roleId: string, viewId: string) {
    setSaving(true);
    await adminUpdateView(token, roleId, viewId, {
      label: editViewLabel,
      title: editViewTitle,
      summary: editViewSummary,
    });
    setEditingView(null);
    onRefresh();
    setSaving(false);
  }

  async function handleReset() {
    if (!confirm('Reset all roles to their original configuration?')) return;
    setSaving(true);
    await adminResetManifest(token);
    setExpandedRole(null);
    setEditingRole(null);
    setEditingView(null);
    onRefresh();
    setSaving(false);
  }

  function startEditRole(role: RoleConfig) {
    setEditingRole(role.id);
    setEditLabel(role.label);
    setEditSummary(role.summary);
  }

  function startEditView(roleId: string, view: ViewConfig) {
    setEditingView(`${roleId}:${view.id}`);
    setEditViewLabel(view.label);
    setEditViewTitle(view.title);
    setEditViewSummary(view.summary);
  }

  return (
    <div className="admin-panel">
      <div className="admin-panel__header">
        <div>
          <p className="widget-eyebrow">Admin Controls</p>
          <h2 className="admin-panel__title">Manage Roles & Permissions</h2>
          <p className="admin-panel__subtitle">
            Changes made here affect what other roles see immediately.
          </p>
        </div>
        <button
          className="admin-reset-btn"
          onClick={handleReset}
          disabled={saving}
          type="button"
        >
          Reset to defaults
        </button>
      </div>

      <div className="admin-roles">
        {roles.map((role) => {
          const isExpanded = expandedRole === role.id;
          const enabledViews = role.views.filter((v) => !v.disabled).length;

          return (
            <div className="admin-role-card" key={role.id}>
              <button
                className="admin-role-card__header"
                onClick={() => setExpandedRole(isExpanded ? null : role.id)}
                type="button"
              >
                <div className="admin-role-card__info">
                  <div
                    className="admin-role-dot"
                    style={{ background: role.theme.accent }}
                  />
                  <div>
                    <strong>{role.label}</strong>
                    <span>{role.summary}</span>
                  </div>
                </div>
                <div className="admin-role-card__meta">
                  <span className="admin-badge">
                    {enabledViews}/{role.views.length} views
                  </span>
                  <span className="admin-chevron">{isExpanded ? '\u25B2' : '\u25BC'}</span>
                </div>
              </button>

              {isExpanded && (
                <div className="admin-role-card__body">
                  {/* Role edit section */}
                  {editingRole === role.id ? (
                    <div className="admin-edit-form">
                      <label className="admin-field">
                        <span>Label</span>
                        <input
                          value={editLabel}
                          onChange={(e) => setEditLabel(e.target.value)}
                        />
                      </label>
                      <label className="admin-field">
                        <span>Summary</span>
                        <input
                          value={editSummary}
                          onChange={(e) => setEditSummary(e.target.value)}
                        />
                      </label>
                      <div className="admin-edit-actions">
                        <button
                          className="primary-button admin-btn--sm"
                          onClick={() => handleSaveRole(role.id)}
                          disabled={saving}
                          type="button"
                        >
                          Save
                        </button>
                        <button
                          className="ghost-button admin-btn--sm"
                          onClick={() => setEditingRole(null)}
                          type="button"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      className="admin-inline-btn"
                      onClick={() => startEditRole(role)}
                      type="button"
                    >
                      Edit role label & summary
                    </button>
                  )}

                  {/* Views */}
                  <div className="admin-views">
                    {role.views.map((view) => {
                      const isDisabled = !!view.disabled;
                      const editKey = `${role.id}:${view.id}`;
                      const enabledWidgets = view.widgets.filter(
                        (w) => !(w as any).disabled,
                      ).length;

                      return (
                        <div
                          className={`admin-view-card ${isDisabled ? 'admin-view-card--disabled' : ''}`}
                          key={view.id}
                        >
                          <div className="admin-view-card__top">
                            <div className="admin-view-card__info">
                              <strong>{view.label}</strong>
                              <span>{view.title}</span>
                            </div>
                            <div className="admin-view-card__actions">
                              <span className="admin-badge admin-badge--sm">
                                {enabledWidgets}/{view.widgets.length} widgets
                              </span>
                              <button
                                className={`admin-toggle ${isDisabled ? 'admin-toggle--off' : 'admin-toggle--on'}`}
                                onClick={() => handleToggleView(role.id, view.id)}
                                disabled={saving}
                                title={isDisabled ? 'Enable view' : 'Disable view'}
                                type="button"
                              >
                                <span className="admin-toggle__thumb" />
                              </button>
                            </div>
                          </div>

                          {/* Edit view */}
                          {editingView === editKey ? (
                            <div className="admin-edit-form admin-edit-form--nested">
                              <label className="admin-field">
                                <span>Tab label</span>
                                <input
                                  value={editViewLabel}
                                  onChange={(e) => setEditViewLabel(e.target.value)}
                                />
                              </label>
                              <label className="admin-field">
                                <span>Title</span>
                                <input
                                  value={editViewTitle}
                                  onChange={(e) => setEditViewTitle(e.target.value)}
                                />
                              </label>
                              <label className="admin-field">
                                <span>Summary</span>
                                <input
                                  value={editViewSummary}
                                  onChange={(e) => setEditViewSummary(e.target.value)}
                                />
                              </label>
                              <div className="admin-edit-actions">
                                <button
                                  className="primary-button admin-btn--sm"
                                  onClick={() => handleSaveView(role.id, view.id)}
                                  disabled={saving}
                                  type="button"
                                >
                                  Save
                                </button>
                                <button
                                  className="ghost-button admin-btn--sm"
                                  onClick={() => setEditingView(null)}
                                  type="button"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              className="admin-inline-btn"
                              onClick={() => startEditView(role.id, view)}
                              type="button"
                            >
                              Edit view details
                            </button>
                          )}

                          {/* Widgets */}
                          <div className="admin-widgets">
                            {view.widgets.map((widget) => {
                              const wDisabled = !!(widget as any).disabled;
                              return (
                                <div
                                  className={`admin-widget-row ${wDisabled ? 'admin-widget-row--disabled' : ''}`}
                                  key={widget.id}
                                >
                                  <div className="admin-widget-row__info">
                                    <span className="admin-widget-kind">{widget.kind}</span>
                                    <span>{widget.title}</span>
                                  </div>
                                  <button
                                    className={`admin-toggle admin-toggle--sm ${wDisabled ? 'admin-toggle--off' : 'admin-toggle--on'}`}
                                    onClick={() =>
                                      handleToggleWidget(role.id, view.id, widget.id)
                                    }
                                    disabled={saving}
                                    title={wDisabled ? 'Enable widget' : 'Disable widget'}
                                    type="button"
                                  >
                                    <span className="admin-toggle__thumb" />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
