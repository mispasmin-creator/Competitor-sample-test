import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  Search,
  Shield,
  Trash2,
  UserCheck,
  Users as UsersIcon,
  UserX,
  X,
} from 'lucide-react';
import { useLab } from '../context/LabContext';
import { formatShortDate } from '../utils/fileHelpers';
import { Pagination } from '../components/Pagination';
import { ConfirmDialog, EmptyState, MobileBanner, PageHeader, SegmentedTabs, toneStyle } from '../components/ui';
import {
  canDeleteUser,
  canToggleUserActive,
  countActiveAdmins,
  createEmptyPermissions,
  normalizePermissions,
  PERMISSION_PRESETS,
  resolveSchemaPageRows,
  validatePasswordResetForm,
  validateUserForm,
} from '../utils/auth';
import type { PagePermission, User, UserPermissions } from '../types/lab';

const PERMISSION_OPTIONS: Array<{ value: PagePermission; label: string }> = [
  { value: 'none', label: 'None' },
  { value: 'view', label: 'View only' },
  { value: 'full', label: 'Full access' },
];

export function UsersPage() {
  const {
    users,
    schema,
    currentUser,
    saveUser,
    resetUserPassword,
    deleteUser,
  } = useLab();

  const pageRows = useMemo(() => resolveSchemaPageRows(schema.pages), [schema.pages]);
  const pageKeys = useMemo(() => pageRows.map((p) => p.key), [pageRows]);

  const [userPage, setUserPage] = useState(1);
  const [userPageSize, setUserPageSize] = useState(10);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [userSearch, setUserSearch] = useState('');

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    return users.filter((u) => {
      if (statusFilter === 'active' && !u.isActive) return false;
      if (statusFilter === 'inactive' && u.isActive) return false;
      if (!q) return true;
      return u.name.toLowerCase().includes(q) || u.username.toLowerCase().includes(q);
    });
  }, [users, statusFilter, userSearch]);

  useEffect(() => {
    setUserPage(1);
  }, [statusFilter, userSearch]);

  const paginatedUsers = useMemo(() => {
    const start = (userPage - 1) * userPageSize;
    return filteredUsers.slice(start, start + userPageSize);
  }, [filteredUsers, userPage, userPageSize]);

  // Add / Edit modal state
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showFormPassword, setShowFormPassword] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [permissions, setPermissions] = useState<UserPermissions>(() =>
    createEmptyPermissions(pageKeys)
  );
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [savingUser, setSavingUser] = useState(false);
  const [togglingUserId, setTogglingUserId] = useState<string | null>(null);

  // Reset Password modal state
  const [resetTarget, setResetTarget] = useState<User | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetConfirm, setResetConfirm] = useState('');
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resetErrors, setResetErrors] = useState<Record<string, string>>({});
  const [savingReset, setSavingReset] = useState(false);

  // Delete confirmation modal state
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [deletingUser, setDeletingUser] = useState(false);

  const openAddModal = () => {
    setEditingUser(null);
    setName('');
    setUsername('');
    setPassword('');
    setConfirmPassword('');
    setShowFormPassword(false);
    setIsAdmin(false);
    setIsActive(true);
    setPermissions(createEmptyPermissions(pageKeys));
    setFormErrors({});
    setShowUserModal(true);
  };

  const openEditModal = (user: User) => {
    setEditingUser(user);
    setName(user.name);
    setUsername(user.username);
    setPassword('');
    setConfirmPassword('');
    setShowFormPassword(false);
    setIsAdmin(user.isAdmin);
    setIsActive(user.isActive);
    setPermissions(normalizePermissions(user.permissions, pageKeys));
    setFormErrors({});
    setShowUserModal(true);
  };

  // Global "+ New Entry" / FAB lands here with ?new=1
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    if (searchParams.get('new') !== '1') return;
    openAddModal();
    const next = new URLSearchParams(searchParams);
    next.delete('new');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleApplyPreset = (presetPermissions: UserPermissions) => {
    const next = createEmptyPermissions(pageKeys);
    for (const key of pageKeys) {
      if (presetPermissions[key]) {
        next[key] = presetPermissions[key];
      }
    }
    setPermissions(next);
  };

  const handleSetPagePermission = (pageKey: string, value: PagePermission) => {
    setPermissions((prev) => ({
      ...prev,
      [pageKey]: value,
    }));
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const validation = validateUserForm(
      {
        name,
        username,
        password,
        confirmPassword,
        isAdmin,
        isActive,
      },
      users,
      {
        editingUser,
        currentUserId: currentUser?.id,
      }
    );

    if (!validation.valid) {
      setFormErrors(validation.errors);
      return;
    }

    setSavingUser(true);
    try {
      const ok = await saveUser({
        ...(editingUser ? { id: editingUser.id } : {}),
        name,
        username,
        ...(password ? { password } : {}),
        isAdmin,
        isActive,
        permissions,
      });
      if (ok) {
        setShowUserModal(false);
      }
    } finally {
      setSavingUser(false);
    }
  };

  const handleToggleActive = async (user: User) => {
    setTogglingUserId(user.id);
    try {
      await saveUser({
        id: user.id,
        name: user.name,
        username: user.username,
        isAdmin: user.isAdmin,
        isActive: !user.isActive,
        permissions: user.permissions,
      });
    } finally {
      setTogglingUserId(null);
    }
  };

  const openResetModal = (user: User) => {
    setResetTarget(user);
    setResetPassword('');
    setResetConfirm('');
    setShowResetPassword(false);
    setResetErrors({});
  };

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget) return;
    const check = validatePasswordResetForm(resetPassword, resetConfirm);
    if (!check.valid) {
      setResetErrors(check.errors);
      return;
    }
    setSavingReset(true);
    try {
      const ok = await resetUserPassword(resetTarget.id, resetPassword);
      if (ok) {
        setResetTarget(null);
      }
    } finally {
      setSavingReset(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeletingUser(true);
    try {
      const ok = await deleteUser(deleteTarget.id);
      if (ok) {
        setDeleteTarget(null);
      }
    } finally {
      setDeletingUser(false);
    }
  };

  const activeAdminCount = countActiveAdmins(users);
  const isEditingDefaultAdmin = editingUser?.username.toLowerCase() === 'admin';
  const isEditingSelf = Boolean(editingUser && currentUser && editingUser.id === currentUser.id);
  const isEditingSoleActiveAdmin = Boolean(
    editingUser && editingUser.isAdmin && editingUser.isActive && activeAdminCount <= 1
  );

  const activeCount = users.filter((u) => u.isActive).length;
  const disabledCount = users.length - activeCount;

  const renderPageChips = (user: User) => {
    if (user.isAdmin) {
      return (
        <span className="inline-flex items-center px-2.5 py-1 text-[11px] font-semibold rounded-full whitespace-nowrap" style={toneStyle('brand')}>
          All {pageRows.length} pages · Admin
        </span>
      );
    }
    const rows = pageRows.filter((row) => (user.permissions?.[row.key] ?? 'none') !== 'none');
    if (rows.length === 0) return <span className="text-xs text-[var(--text-muted)]">No pages assigned</span>;
    return (
      <div className="flex flex-wrap gap-1.5">
        {rows.map((row) => {
          const perm = user.permissions?.[row.key] ?? 'none';
          return (
            <span
              key={row.key}
              className="inline-flex items-center px-2 py-0.5 text-[11px] font-semibold rounded-full"
              style={perm === 'full' ? toneStyle('brand') : toneStyle('neutral')}
            >
              {row.label} · {perm === 'full' ? 'Full' : 'View'}
            </span>
          );
        })}
      </div>
    );
  };

  const statusPill = (user: User) => (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold rounded-full whitespace-nowrap"
      style={user.isActive ? toneStyle('success') : toneStyle('neutral')}
    >
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ backgroundColor: user.isActive ? 'var(--status-success-fg)' : 'var(--text-muted)' }}
        aria-hidden="true"
      />
      {user.isActive ? 'Active' : 'Deactivated'}
    </span>
  );

  const avatar = (user: User, size = 'w-11 h-11') => (
    <span
      className={`${size} rounded-full flex items-center justify-center font-display font-bold text-xs shrink-0`}
      style={
        user.isAdmin
          ? { backgroundColor: '#0D4F3C', color: '#A3F046' }
          : { backgroundColor: 'var(--mint)', color: 'var(--color-primary)' }
      }
    >
      {user.name
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((p, i, arr) => (i === 0 || i === arr.length - 1 ? p[0] : ''))
        .join('')
        .slice(0, 2)
        .toUpperCase() || '?'}
    </span>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Access & Settings"
        title="User Management"
        actions={
          <button type="button" onClick={openAddModal} className="fin-btn-primary inline-flex items-center gap-2 px-4 text-sm">
            <Plus className="w-4 h-4" aria-hidden="true" />
            Add User
          </button>
        }
      />

      <MobileBanner
        label="Workspace users"
        count={users.length}
        caption="Accounts, page access and sign-in status"
        onNew={openAddModal}
        newLabel="Add"
      />

      {/* Summary strip */}
      <section className="grid grid-cols-3 gap-2.5 sm:gap-4" aria-label="User summary">
        {[
          { label: 'Total', value: users.length, icon: <UsersIcon className="w-4 h-4" />, tone: 'brand' as const, filter: 'all' as const },
          { label: 'Active', value: activeCount, icon: <UserCheck className="w-4 h-4" />, tone: 'success' as const, filter: 'active' as const },
          { label: 'Disabled', value: disabledCount, icon: <UserX className="w-4 h-4" />, tone: 'neutral' as const, filter: 'inactive' as const },
        ].map((s) => (
          <button
            key={s.label}
            type="button"
            onClick={() => setStatusFilter(s.filter)}
            aria-pressed={statusFilter === s.filter}
            className="glass rounded-2xl p-3 sm:p-4 text-left transition-shadow aria-pressed:ring-2 aria-pressed:ring-[var(--color-primary)]"
          >
            <span className="w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center" style={toneStyle(s.tone)}>
              {s.icon}
            </span>
            <p className="font-mono text-2xl sm:text-3xl font-bold tabular-nums text-[var(--text-heading)] mt-2 sm:mt-3 leading-none">
              {s.value}
            </p>
            <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--text-muted)] mt-1">{s.label}</p>
          </button>
        ))}
      </section>

      {/* Filter toolbar */}
      <div className="md:glass md:rounded-2xl md:p-3 flex flex-col sm:flex-row sm:items-center gap-3">
        <SegmentedTabs
          ariaLabel="Filter users by status"
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: 'all', label: 'All', count: users.length },
            { value: 'active', label: 'Active', count: activeCount },
            { value: 'inactive', label: 'Deactivated', count: disabledCount },
          ]}
          className="self-start"
        />
        <div className="relative flex-1 min-w-0 sm:max-w-sm">
          <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
          <input
            type="search"
            value={userSearch}
            onChange={(e) => setUserSearch(e.target.value)}
            placeholder="Search name or username..."
            aria-label="Search users"
            className="fin-input w-full pl-10 pr-3.5"
          />
        </div>
      </div>

      {/* Mobile roster cards */}
      <div className="md:hidden space-y-3">
        {filteredUsers.length === 0 ? (
          <div className="feed-card">
            <EmptyState icon={<UsersIcon className="w-5 h-5" />} title={users.length === 0 ? 'No users registered yet' : 'No matching users'} />
          </div>
        ) : (
          paginatedUsers.map((user) => {
            const toggleGuard = canToggleUserActive(user, currentUser?.id ?? '', users);
            const deleteGuard = canDeleteUser(user, currentUser?.id ?? '', users);
            return (
              <article key={user.id} className="feed-card p-4">
                <div className="flex items-center gap-3">
                  {avatar(user)}
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-[15px] font-bold text-[var(--text-heading)] truncate flex items-center gap-1.5">
                      {user.name}
                      {user.isAdmin && <Shield className="w-3.5 h-3.5 text-[var(--color-primary)] shrink-0" aria-label="Admin" />}
                    </p>
                    <p className="font-mono text-xs text-[var(--text-muted)] truncate">@{user.username}</p>
                  </div>
                  {statusPill(user)}
                </div>

                <div className="mt-3">{renderPageChips(user)}</div>

                <div
                  className="mt-3 flex items-center justify-between gap-3 rounded-xl px-3 py-2"
                  style={{ backgroundColor: 'var(--bg-surface-muted)' }}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <KeyRound className="w-4 h-4 text-[var(--color-primary)] shrink-0" aria-hidden="true" />
                    <span className="text-xs text-[var(--text-muted)]">Password</span>
                    <span className="font-mono text-sm tracking-widest text-[var(--text-heading)]" aria-label="Hidden">
                      ••••••••
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => openResetModal(user)}
                    className="text-xs font-semibold text-[var(--color-primary)] min-h-[44px] px-1"
                  >
                    Reset
                  </button>
                </div>

                <p className="text-[11px] text-[var(--text-muted)] mt-2 font-mono">
                  Last login: {user.lastLoginAt ? formatShortDate(user.lastLoginAt) : 'Never'}
                </p>

                <div className="grid grid-cols-2 gap-2 mt-3">
                  <button
                    type="button"
                    onClick={() => openEditModal(user)}
                    aria-label={`Edit ${user.name}`}
                    className="fin-btn-primary h-11 inline-flex items-center justify-center gap-1.5 text-sm"
                  >
                    <Pencil className="w-4 h-4" aria-hidden="true" />
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleToggleActive(user)}
                    disabled={!toggleGuard.allowed || togglingUserId === user.id}
                    title={toggleGuard.allowed ? undefined : toggleGuard.reason}
                    aria-label={`${user.isActive ? 'Deactivate' : 'Activate'} ${user.name}`}
                    className="fin-btn-secondary h-11 inline-flex items-center justify-center gap-1.5 text-sm"
                  >
                    {togglingUserId === user.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                    ) : user.isActive ? (
                      <UserX className="w-4 h-4" aria-hidden="true" />
                    ) : (
                      <UserCheck className="w-4 h-4" aria-hidden="true" />
                    )}
                    {user.isActive ? 'Deactivate' : 'Activate'}
                  </button>
                </div>
                {deleteGuard.allowed && (
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(user)}
                    aria-label={`Delete ${user.name}`}
                    className="w-full mt-2 h-11 rounded-xl text-sm font-semibold inline-flex items-center justify-center gap-1.5 text-[var(--status-danger-fg)] hover:bg-[var(--status-danger-bg)] transition-colors"
                  >
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                    Delete user
                  </button>
                )}
              </article>
            );
          })
        )}
      </div>

      {/* Desktop roster table */}
      <div className="hidden md:block fin-card p-4 lg:p-5">
        <div className="fin-table-wrap">
          <table className="w-full min-w-[820px] text-left border-collapse">
            <thead>
              <tr className="fin-table-head text-[11px] uppercase">
                <th className="py-3 px-3 rounded-l-xl whitespace-nowrap">Name</th>
                <th className="py-3 px-3 whitespace-nowrap">Username</th>
                <th className="py-3 px-3 whitespace-nowrap">Status</th>
                <th className="py-3 px-3 whitespace-nowrap">Page Access</th>
                <th className="py-3 px-3 whitespace-nowrap">Last Login</th>
                <th className="py-3 px-3 rounded-r-xl text-right whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)] text-sm">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <EmptyState icon={<UsersIcon className="w-5 h-5" />} title={users.length === 0 ? 'No users registered yet' : 'No matching users'} />
                  </td>
                </tr>
              ) : (
                paginatedUsers.map((user) => {
                  const toggleGuard = canToggleUserActive(user, currentUser?.id ?? '', users);
                  const deleteGuard = canDeleteUser(user, currentUser?.id ?? '', users);
                  const actionBtn =
                    'w-9 h-9 rounded-full inline-flex items-center justify-center border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--color-primary)] hover:bg-[var(--mint)] disabled:opacity-35 disabled:cursor-not-allowed transition-colors';
                  return (
                    <tr key={user.id} className="fin-table-row">
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-3">
                          {avatar(user, 'w-9 h-9')}
                          <span className="font-semibold text-[var(--text-heading)] whitespace-nowrap">{user.name}</span>
                          {user.isAdmin && (
                            <span
                              className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded-full"
                              style={{ backgroundColor: '#0D4F3C', color: '#A3F046' }}
                            >
                              <Shield className="w-3 h-3" aria-hidden="true" />
                              Admin
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-3 font-mono text-xs text-[var(--text-body)] whitespace-nowrap">@{user.username}</td>
                      <td className="py-3 px-3 whitespace-nowrap">{statusPill(user)}</td>
                      <td className="py-3 px-3 max-w-[300px]">{renderPageChips(user)}</td>
                      <td className="py-3 px-3 text-xs font-mono text-[var(--text-muted)] whitespace-nowrap">
                        {user.lastLoginAt ? formatShortDate(user.lastLoginAt) : 'Never'}
                      </td>
                      <td className="py-3 px-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button type="button" onClick={() => openEditModal(user)} aria-label={`Edit ${user.name}`} title="Edit user" className={actionBtn}>
                            <Pencil className="w-4 h-4" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openResetModal(user)}
                            aria-label={`Reset password for ${user.name}`}
                            title="Reset password"
                            className={actionBtn}
                          >
                            <KeyRound className="w-4 h-4" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleToggleActive(user)}
                            disabled={!toggleGuard.allowed || togglingUserId === user.id}
                            title={toggleGuard.allowed ? (user.isActive ? 'Deactivate user' : 'Activate user') : toggleGuard.reason}
                            aria-label={`${user.isActive ? 'Deactivate' : 'Activate'} ${user.name}`}
                            className={actionBtn}
                          >
                            {togglingUserId === user.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                            ) : user.isActive ? (
                              <UserX className="w-4 h-4" aria-hidden="true" />
                            ) : (
                              <UserCheck className="w-4 h-4" aria-hidden="true" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(user)}
                            disabled={!deleteGuard.allowed}
                            title={deleteGuard.allowed ? 'Delete user' : deleteGuard.reason}
                            aria-label={`Delete ${user.name}`}
                            className={`${actionBtn} hover:!bg-[var(--status-danger-bg)] hover:!text-[var(--status-danger-fg)]`}
                          >
                            <Trash2 className="w-4 h-4" aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Pagination
        currentPage={userPage}
        totalItems={filteredUsers.length}
        pageSize={userPageSize}
        onPageChange={setUserPage}
        onPageSizeChange={setUserPageSize}
      />

      {/* Add / Edit User Modal */}
      {showUserModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center fin-modal-backdrop p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="user-modal-title"
        >
          <div className="fin-modal-panel max-w-[min(92vw,720px)] w-full max-h-[90dvh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-[var(--border-subtle)] shrink-0">
              <div>
                <h2 id="user-modal-title" className="text-base font-bold text-[var(--text-heading)]">
                  {editingUser ? `Edit User · ${editingUser.name}` : 'Add Workspace User'}
                </h2>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  Configure credentials, active status, and per-page access permissions.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowUserModal(false)}
                aria-label="Close user modal"
                className="p-1.5 rounded-[10px] text-[var(--text-muted)] hover:text-[var(--text-heading)] hover:bg-[var(--bg-surface-muted)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveUser} noValidate className="p-5 sm:p-6 space-y-5 overflow-y-auto flex-1 min-h-0">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="usr-name"
                    className="block text-xs font-semibold text-[var(--text-body)] mb-1.5"
                  >
                    Full Name *
                  </label>
                  <input
                    id="usr-name"
                    type="text"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      setFormErrors((prev) => ({ ...prev, name: '' }));
                    }}
                    placeholder="e.g. Elena Vance"
                    className="fin-input w-full px-3.5 text-sm"
                  />
                  {formErrors.name && (
                    <p
                      className="text-xs mt-1"
                      style={{ color: 'var(--status-danger-fg)' }}
                      role="alert"
                    >
                      {formErrors.name}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="usr-username"
                    className="block text-xs font-semibold text-[var(--text-body)] mb-1.5"
                  >
                    Username *
                  </label>
                  <input
                    id="usr-username"
                    type="text"
                    value={username}
                    readOnly={isEditingDefaultAdmin}
                    onChange={(e) => {
                      setUsername(e.target.value);
                      setFormErrors((prev) => ({ ...prev, username: '' }));
                    }}
                    placeholder="e.g. elena.vance"
                    className="fin-input w-full px-3.5 text-sm font-mono"
                  />
                  {isEditingDefaultAdmin && (
                    <p className="text-[11px] text-[var(--text-muted)] mt-1">
                      Default admin username cannot be changed.
                    </p>
                  )}
                  {formErrors.username && (
                    <p
                      className="text-xs mt-1"
                      style={{ color: 'var(--status-danger-fg)' }}
                      role="alert"
                    >
                      {formErrors.username}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="usr-password"
                    className="block text-xs font-semibold text-[var(--text-body)] mb-1.5"
                  >
                    {editingUser ? 'New Password (optional)' : 'Password *'}
                  </label>
                  <div className="relative">
                    <input
                      id="usr-password"
                      type={showFormPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setFormErrors((prev) => ({ ...prev, password: '', confirmPassword: '' }));
                      }}
                      placeholder={
                        editingUser ? 'Leave blank to keep current password' : 'Min 6 characters'
                      }
                      className="fin-input w-full px-3.5 pr-10 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowFormPassword((prev) => !prev)}
                      aria-label={showFormPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-[var(--text-muted)] hover:text-[var(--text-heading)]"
                    >
                      {showFormPassword ? (
                        <EyeOff className="w-4 h-4" aria-hidden="true" />
                      ) : (
                        <Eye className="w-4 h-4" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                  {formErrors.password && (
                    <p
                      className="text-xs mt-1"
                      style={{ color: 'var(--status-danger-fg)' }}
                      role="alert"
                    >
                      {formErrors.password}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="usr-confirm"
                    className="block text-xs font-semibold text-[var(--text-body)] mb-1.5"
                  >
                    {editingUser ? 'Confirm New Password' : 'Confirm Password *'}
                  </label>
                  <input
                    id="usr-confirm"
                    type={showFormPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      setFormErrors((prev) => ({ ...prev, confirmPassword: '' }));
                    }}
                    placeholder="Re-enter password"
                    className="fin-input w-full px-3.5 text-sm"
                  />
                  {formErrors.confirmPassword && (
                    <p
                      className="text-xs mt-1"
                      style={{ color: 'var(--status-danger-fg)' }}
                      role="alert"
                    >
                      {formErrors.confirmPassword}
                    </p>
                  )}
                </div>
              </div>

              <div
                className="flex flex-wrap items-center gap-6 p-4 rounded-[14px] border border-[var(--border-subtle)]"
                style={{ backgroundColor: 'var(--bg-surface-muted)' }}
              >
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--text-heading)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isActive}
                    disabled={isEditingSelf || isEditingSoleActiveAdmin}
                    onChange={(e) => {
                      setIsActive(e.target.checked);
                      setFormErrors((prev) => ({ ...prev, isActive: '' }));
                    }}
                    className="w-4 h-4 rounded accent-[var(--color-primary)] disabled:opacity-50"
                  />
                  <span>Account Active</span>
                </label>

                <label className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--text-heading)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isAdmin}
                    disabled={isEditingSoleActiveAdmin}
                    onChange={(e) => {
                      setIsAdmin(e.target.checked);
                      setFormErrors((prev) => ({ ...prev, isAdmin: '' }));
                    }}
                    className="w-4 h-4 rounded accent-[var(--color-primary)] disabled:opacity-50"
                  />
                  <span>Administrator (Full access to all pages &amp; User Management)</span>
                </label>

                {(formErrors.isActive || formErrors.isAdmin) && (
                  <p
                    className="w-full text-xs"
                    style={{ color: 'var(--status-danger-fg)' }}
                    role="alert"
                  >
                    {formErrors.isActive || formErrors.isAdmin}
                  </p>
                )}
              </div>

              {/* Permissions Matrix */}
              {isAdmin ? (
                <div
                  className="p-4 rounded-[14px] text-xs font-medium"
                  style={{
                    backgroundColor: 'var(--color-primary-soft)',
                    color: 'var(--color-primary)',
                  }}
                >
                  Admin accounts automatically receive <strong>Full access</strong> to all{' '}
                  {pageRows.length} laboratory pages as well as User Management &amp; Settings.
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h3 className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
                        Page Permissions Matrix
                      </h3>
                      <p className="text-xs text-[var(--text-muted)]">
                        Choose a quick preset or customize access per page.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {PERMISSION_PRESETS.map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => handleApplyPreset(preset.permissions)}
                          className="fin-btn-secondary px-3 py-1.5 text-xs"
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="border border-[var(--border-subtle)] rounded-[16px] overflow-hidden">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="fin-table-head text-[11px] font-semibold uppercase tracking-wider">
                          <th className="py-2.5 px-4">Page</th>
                          <th className="py-2.5 px-4 text-right">Access Level</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border-subtle)] text-xs">
                        {pageRows.map((row) => {
                          const current = permissions[row.key] ?? 'none';
                          return (
                            <tr key={row.key} className="fin-table-row">
                              <td className="py-2.5 px-4 font-semibold text-[var(--text-heading)]">
                                {row.label}
                              </td>
                              <td className="py-2.5 px-4 text-right">
                                <div
                                  className="inline-flex items-center p-1 rounded-[12px]"
                                  style={{ backgroundColor: 'var(--bg-surface-muted)' }}
                                  role="group"
                                  aria-label={`Permission for ${row.label}`}
                                >
                                  {PERMISSION_OPTIONS.map((opt) => {
                                    const active = current === opt.value;
                                    return (
                                      <button
                                        key={opt.value}
                                        type="button"
                                        aria-pressed={active}
                                        onClick={() => handleSetPagePermission(row.key, opt.value)}
                                        className="px-2.5 py-1 text-xs font-semibold rounded-[9px] transition-colors whitespace-nowrap"
                                        style={
                                          active
                                            ? opt.value === 'full'
                                              ? {
                                                  backgroundColor: 'var(--color-primary)',
                                                  color: 'var(--color-primary-fg)',
                                                }
                                              : opt.value === 'view'
                                                ? {
                                                    backgroundColor: 'var(--bg-surface)',
                                                    color: 'var(--text-heading)',
                                                  }
                                                : {
                                                    backgroundColor: 'var(--text-body)',
                                                    color: 'var(--bg-surface)',
                                                  }
                                            : { color: 'var(--text-muted)' }
                                        }
                                      >
                                        {opt.label}
                                      </button>
                                    );
                                  })}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => setShowUserModal(false)}
                  className="fin-btn-secondary px-4 py-2 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingUser}
                  className="fin-btn-primary px-5 py-2 text-xs inline-flex items-center gap-1.5"
                >
                  {savingUser && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
                  {savingUser ? 'Saving...' : editingUser ? 'Save Changes' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {resetTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center fin-modal-backdrop p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reset-pw-title"
        >
          <div className="fin-modal-panel max-w-[min(92vw,440px)] w-full max-h-[90dvh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-[var(--border-subtle)] shrink-0">
              <div>
                <h2 id="reset-pw-title" className="text-base font-bold text-[var(--text-heading)]">
                  Reset Password
                </h2>
                <p className="text-xs text-[var(--text-muted)] font-mono">
                  {resetTarget.name} (@{resetTarget.username})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setResetTarget(null)}
                aria-label="Close reset password modal"
                className="p-1.5 rounded-[10px] text-[var(--text-muted)] hover:text-[var(--text-heading)] hover:bg-[var(--bg-surface-muted)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleResetSubmit} noValidate className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
              <div>
                <label
                  htmlFor="reset-pw-input"
                  className="block text-xs font-semibold text-[var(--text-body)] mb-1.5"
                >
                  New Password *
                </label>
                <div className="relative">
                  <input
                    id="reset-pw-input"
                    type={showResetPassword ? 'text' : 'password'}
                    value={resetPassword}
                    onChange={(e) => {
                      setResetPassword(e.target.value);
                      setResetErrors({});
                    }}
                    placeholder="Min 6 characters"
                    className="fin-input w-full px-3.5 pr-10 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowResetPassword((prev) => !prev)}
                    aria-label={showResetPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-[var(--text-muted)] hover:text-[var(--text-heading)]"
                  >
                    {showResetPassword ? (
                      <EyeOff className="w-4 h-4" aria-hidden="true" />
                    ) : (
                      <Eye className="w-4 h-4" aria-hidden="true" />
                    )}
                  </button>
                </div>
                {resetErrors.password && (
                  <p
                    className="text-xs mt-1"
                    style={{ color: 'var(--status-danger-fg)' }}
                    role="alert"
                  >
                    {resetErrors.password}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="reset-pw-confirm"
                  className="block text-xs font-semibold text-[var(--text-body)] mb-1.5"
                >
                  Confirm New Password *
                </label>
                <input
                  id="reset-pw-confirm"
                  type={showResetPassword ? 'text' : 'password'}
                  value={resetConfirm}
                  onChange={(e) => {
                    setResetConfirm(e.target.value);
                    setResetErrors((prev) => ({ ...prev, confirmPassword: '' }));
                  }}
                  placeholder="Re-enter password"
                  className="fin-input w-full px-3.5 text-sm"
                />
                {resetErrors.confirmPassword && (
                  <p
                    className="text-xs mt-1"
                    style={{ color: 'var(--status-danger-fg)' }}
                    role="alert"
                  >
                    {resetErrors.confirmPassword}
                  </p>
                )}
              </div>

              <div className="flex justify-end gap-2.5 pt-4 border-t border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => setResetTarget(null)}
                  className="fin-btn-secondary px-4 py-2 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingReset}
                  className="fin-btn-primary px-4 py-2 text-xs inline-flex items-center gap-1.5"
                >
                  {savingReset && (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                  )}
                  {savingReset ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete User Confirmation Modal */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        tone="danger"
        title="Delete this user?"
        message={
          deleteTarget ? (
            <>
              <span className="font-semibold">{deleteTarget.name}</span>{' '}
              <span className="font-mono text-xs">(@{deleteTarget.username})</span> will no longer be able to sign in.
            </>
          ) : undefined
        }
        details={
          deleteTarget
            ? [
                deleteTarget.isAdmin ? 'Administrator account' : 'Standard account',
                `Last login: ${deleteTarget.lastLoginAt ? formatShortDate(deleteTarget.lastLoginAt) : 'Never'}`,
                'The row is removed from the Users tab. This cannot be undone.',
              ]
            : []
        }
        confirmLabel="Delete User"
        busyLabel="Deleting..."
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
