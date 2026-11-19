import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Bell,
  ClipboardList,
  Eye,
  EyeOff,
  FlaskConical,
  KeyRound,
  LayoutDashboard,
  Loader2,
  LogOut,
  Menu,
  Moon,
  Package,
  RefreshCw,
  Sun,
  Users,
  X,
} from 'lucide-react';
import { useLab } from '../context/LabContext';
import { useTheme } from '../context/ThemeContext';
import {
  canViewPage,
  getEffectivePagePermission,
  getPermissionSummary,
  PAGE_DEFINITIONS,
  validateOwnPasswordChangeForm,
} from '../utils/auth';
import { isCaseOverdue } from '../utils/labCalculations';
import type { PageKey } from '../types/lab';

const PAGE_ICONS: Record<PageKey, React.ReactNode> = {
  dashboard: <LayoutDashboard className="w-4 h-4" />,
  lostOrders: <ClipboardList className="w-4 h-4" />,
  samples: <Package className="w-4 h-4" />,
  testEntry: <FlaskConical className="w-4 h-4" />,
};

function getInitials(name?: string): string {
  if (!name) return 'CS';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function Layout({ children }: { children: React.ReactNode }) {
  const {
    currentUser,
    cases,
    mustChangePassword,
    refreshing,
    refreshAll,
    signOut,
    changeOwnPassword,
    toasts,
    dismissToast,
  } = useLab();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notifContainerRef = useRef<HTMLDivElement | null>(null);

  const handleToggleMenu = () => {
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setMobileMenuOpen((prev) => !prev);
    } else {
      setDesktopCollapsed((prev) => !prev);
    }
  };

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  // Change own password modal state (oldPassword + newPassword + confirmPassword)
  const [showChangePwModal, setShowChangePwModal] = useState(false);
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showPwText, setShowPwText] = useState(false);
  const [pwErrors, setPwErrors] = useState<Record<string, string>>({});
  const [savingPw, setSavingPw] = useState(false);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        notifContainerRef.current &&
        !notifContainerRef.current.contains(event.target as Node)
      ) {
        setNotificationsOpen(false);
      }
    };
    if (notificationsOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [notificationsOpen]);

  const currentPageDef = PAGE_DEFINITIONS.find((def) => def.path === location.pathname);
  const pageTitle =
    location.pathname === '/users'
      ? 'User Management & Settings'
      : currentPageDef?.title || 'Workspace';

  const isViewOnlyPage = Boolean(
    currentUser &&
      !currentUser.isAdmin &&
      currentPageDef &&
      getEffectivePagePermission(currentUser, currentPageDef.key) === 'view'
  );

  const visiblePageItems = PAGE_DEFINITIONS.filter((def) =>
    canViewPage(currentUser, def.key)
  );

  const userSummary = getPermissionSummary(currentUser);
  const showDefaultAdminBanner = Boolean(mustChangePassword && !bannerDismissed);

  const notifications = useMemo(() => {
    const items: Array<{
      id: string;
      title: string;
      detail: string;
      tone: 'danger' | 'warning' | 'info';
      path?: string;
    }> = [];

    const overdueCount = cases.filter((c) => isCaseOverdue(c)).length;
    if (overdueCount > 0 && canViewPage(currentUser, 'samples')) {
      items.push({
        id: 'overdue-cases',
        title: `${overdueCount} overdue SLA case${overdueCount === 1 ? '' : 's'}`,
        detail: 'Pending stage planned deadline has been exceeded.',
        tone: 'danger',
        path: '/samples',
      });
    }

    const activeTests = cases.filter(
      (c) => c.pendingStageNo === 4 || c.status === 'Testing'
    ).length;
    if (activeTests > 0 && canViewPage(currentUser, 'testEntry')) {
      items.push({
        id: 'active-tests',
        title: `${activeTests} bench test${activeTests === 1 ? '' : 's'} pending entry`,
        detail: 'Measurements awaiting completion on Test Entry.',
        tone: 'info',
        path: '/test-entry',
      });
    }

    if (mustChangePassword) {
      items.push({
        id: 'default-pw',
        title: 'Please change the default password',
        detail: 'Update your account password to secure workspace access.',
        tone: 'warning',
      });
    }

    return items;
  }, [cases, currentUser, mustChangePassword]);

  const openChangePwModal = () => {
    setOldPw('');
    setNewPw('');
    setConfirmPw('');
    setPwErrors({});
    setShowPwText(false);
    setShowChangePwModal(true);
  };

  const handleOwnPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validation = validateOwnPasswordChangeForm(oldPw, newPw, confirmPw);
    if (!validation.valid) {
      setPwErrors(validation.errors);
      return;
    }
    setSavingPw(true);
    try {
      const ok = await changeOwnPassword(oldPw, newPw);
      if (ok) {
        setShowChangePwModal(false);
        setOldPw('');
        setNewPw('');
        setConfirmPw('');
        setPwErrors({});
      }
    } finally {
      setSavingPw(false);
    }
  };

  const renderSidebar = (isDrawer = false) => {
    const isCollapsed = !isDrawer && desktopCollapsed;

    return (
      <div className={`flex flex-col h-full bg-[var(--bg-surface)] overflow-y-auto ${isDrawer ? 'w-full' : 'w-full border-r border-[var(--border-subtle)]'}`}>
        {/* Brand */}
        <div className={`px-4 pt-5 pb-4 flex items-center gap-3 shrink-0 ${isCollapsed ? 'justify-center' : 'justify-start'}`}>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-xs overflow-hidden border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-1">
            <img src="/image.png" alt="Logo" className="w-full h-full object-contain" />
          </div>
          {!isCollapsed && (
            <div className="min-w-0">
              <span className="font-display font-bold text-[15px] leading-tight tracking-tight text-[var(--color-primary)] block truncate">
                Sample Lab
              </span>
              <span className="text-[11px] text-[var(--text-muted)] block truncate">
                Competitor Bench
              </span>
            </div>
          )}
        </div>

        {/* Main Menu */}
        <nav
          className="flex-1 px-3 py-2 space-y-1 overflow-y-auto flex flex-col min-h-0"
          aria-label="Main navigation"
        >
          <div className="space-y-1">
            {visiblePageItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/'}
                onClick={() => setMobileMenuOpen(false)}
                title={item.label}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-2.5 py-2 rounded-[12px] text-[13px] whitespace-nowrap transition-colors ${
                    isCollapsed ? 'justify-center' : 'justify-start'
                  } ${
                    isActive
                      ? 'bg-[var(--color-primary-soft)] text-[var(--color-primary)] font-semibold'
                      : 'text-[var(--text-body)] hover:bg-[var(--bg-surface-muted)] hover:text-[var(--text-heading)] font-medium'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={`w-8 h-8 rounded-[9px] flex items-center justify-center shrink-0 ${
                        isActive
                          ? 'bg-[var(--color-primary)] text-[var(--color-primary-fg)]'
                          : 'text-[var(--text-muted)]'
                      }`}
                    >
                      {PAGE_ICONS[item.key]}
                    </span>
                    {!isCollapsed && <span className="truncate">{item.label}</span>}
                  </>
                )}
              </NavLink>
            ))}

            {/* User Management placed one-by-one with main pages */}
            {currentUser?.isAdmin && (
              <NavLink
                to="/users"
                onClick={() => setMobileMenuOpen(false)}
                title="User Management"
                className={({ isActive }) =>
                  `flex items-center gap-3 px-2.5 py-2 rounded-[12px] text-[13px] whitespace-nowrap transition-colors ${
                    isCollapsed ? 'justify-center' : 'justify-start'
                  } ${
                    isActive
                      ? 'bg-[var(--color-primary-soft)] text-[var(--color-primary)] font-semibold'
                      : 'text-[var(--text-body)] hover:bg-[var(--bg-surface-muted)] hover:text-[var(--text-heading)] font-medium'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={`w-8 h-8 rounded-[9px] flex items-center justify-center shrink-0 ${
                        isActive
                          ? 'bg-[var(--color-primary)] text-[var(--color-primary-fg)]'
                          : 'text-[var(--text-muted)]'
                      }`}
                    >
                      <Users className="w-4 h-4" />
                    </span>
                    {!isCollapsed && <span className="truncate">User Management</span>}
                  </>
                )}
              </NavLink>
            )}
          </div>

          {/* Bottom Actions (Log out) */}
          <div className="pt-4 mt-auto">
            <button
              type="button"
              onClick={() => void signOut()}
              aria-label="Log out"
              title="Log out"
              className={`w-full flex items-center gap-3 px-2.5 py-2 rounded-[12px] text-[13px] font-medium text-[var(--text-body)] hover:bg-[var(--status-danger-bg)] hover:text-[var(--status-danger-fg)] transition-colors whitespace-nowrap ${
                isCollapsed ? 'justify-center' : 'justify-start'
              }`}
            >
              <span className="w-8 h-8 rounded-[9px] flex items-center justify-center shrink-0 text-[var(--text-muted)]">
                <LogOut className="w-4 h-4" />
              </span>
              {!isCollapsed && <span className="truncate">Log out</span>}
            </button>
          </div>
        </nav>

        {/* Sidebar Footer */}
        <div className={`px-4 py-3 border-t border-[var(--border-subtle)] space-y-1 shrink-0 ${isCollapsed ? 'hidden' : 'block'}`}>
          <div className="min-w-0 text-center">
            <p className="text-xs font-semibold text-[var(--text-heading)] truncate">
              {currentUser?.name}
            </p>
            <p className="text-[11px] text-[var(--text-muted)] truncate">{userSummary}</p>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="app-shell 2xl:p-3">
      <div className="flex w-full h-full bg-[var(--bg-canvas)] 2xl:rounded-[24px] 2xl:border 2xl:border-[var(--border-subtle)] overflow-hidden shadow-none 2xl:shadow-[var(--shadow-shell)]">
        {/* Desktop / Laptop Sidebar (toggled width 72px or 250px) */}
        <aside className={`hidden lg:flex flex-col ${desktopCollapsed ? 'w-[72px]' : 'w-[250px]'} shrink-0 h-full transition-all duration-200 overflow-y-auto`}>
          {renderSidebar(false)}
        </aside>

        {/* Mobile / Tablet Drawer (<1024px) */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 lg:hidden flex">
            <div
              className="fixed inset-0 fin-modal-backdrop animate-in fade-in duration-200"
              onClick={() => setMobileMenuOpen(false)}
              aria-hidden="true"
            />
            <div className="relative w-[280px] max-w-[85vw] h-full z-10 shadow-2xl animate-in slide-in-from-left duration-200">
              {renderSidebar(true)}
            </div>
          </div>
        )}

        {/* Main Area */}
        <div className="app-main">
          {/* Top Header */}
          <header className="app-header border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
              <button
                type="button"
                onClick={handleToggleMenu}
                aria-label="Toggle navigation sidebar"
                title="Toggle Sidebar"
                className="fin-icon-btn shrink-0"
              >
                <Menu className="w-5 h-5" />
              </button>
              <div className="min-w-0">
                <p className="font-display font-bold tracking-tight leading-tight text-[var(--text-heading)] truncate text-[clamp(0.95rem,1.5vw,1.35rem)]">
                  Welcome to Competitor Sample Lab
                </p>
                <p className="text-xs text-[var(--text-muted)] mt-0.5 truncate hidden sm:block">
                  Hi, {currentUser?.name}. Welcome back.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => void refreshAll()}
                disabled={refreshing}
                aria-label="Refresh data from Google Sheet"
                title="Refresh data"
                className="fin-icon-btn disabled:opacity-60"
              >
                <RefreshCw
                  className={`w-[18px] h-[18px] ${refreshing ? 'animate-spin' : ''}`}
                  aria-hidden="true"
                />
              </button>

              <button
                type="button"
                onClick={toggleTheme}
                aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
                title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
                className="fin-icon-btn"
              >
                {isDark ? (
                  <Sun className="w-[18px] h-[18px]" aria-hidden="true" />
                ) : (
                  <Moon className="w-[18px] h-[18px]" aria-hidden="true" />
                )}
              </button>

              <div className="relative" ref={notifContainerRef}>
                <button
                  type="button"
                  onClick={() => setNotificationsOpen((prev) => !prev)}
                  aria-label="Open lab notifications"
                  aria-expanded={notificationsOpen}
                  className="fin-icon-btn relative"
                >
                  <Bell className="w-[18px] h-[18px]" aria-hidden="true" />
                  {notifications.length > 0 && (
                    <span
                      className="absolute top-2 right-2 w-2 h-2 rounded-full ring-2 ring-[var(--bg-surface)]"
                      style={{ backgroundColor: 'var(--color-primary)' }}
                      aria-hidden="true"
                    />
                  )}
                </button>

                {notificationsOpen && (
                  <div className="absolute right-0 mt-2.5 w-80 max-w-[calc(100vw-2rem)] max-h-[min(26rem,70dvh)] flex flex-col fin-modal-panel p-4 z-40">
                    <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-[var(--border-subtle)] shrink-0">
                      <span className="text-xs font-bold text-[var(--text-heading)]">
                        Lab Notifications
                      </span>
                      <span className="text-[11px] font-medium text-[var(--text-muted)]">
                        {notifications.length} active
                      </span>
                    </div>
                    {notifications.length === 0 ? (
                      <p className="text-xs text-[var(--text-muted)] py-3 text-center">
                        All laboratory queues are up to date.
                      </p>
                    ) : (
                      <div className="space-y-2 overflow-y-auto flex-1 min-h-0">
                        {notifications.map((item) => {
                          const dotColor =
                            item.tone === 'danger'
                              ? 'var(--status-danger-fg)'
                              : item.tone === 'warning'
                                ? 'var(--status-warning-fg)'
                                : 'var(--color-primary)';
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => {
                                setNotificationsOpen(false);
                                if (item.path) {
                                  navigate(item.path);
                                } else if (item.id === 'default-pw') {
                                  openChangePwModal();
                                }
                              }}
                              className="w-full text-left p-2.5 rounded-[12px] hover:bg-[var(--bg-surface-muted)] transition-colors flex items-start gap-2.5"
                            >
                              <span
                                className="w-2 h-2 rounded-full mt-1.5 shrink-0"
                                style={{ backgroundColor: dotColor }}
                                aria-hidden="true"
                              />
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-[var(--text-heading)]">
                                  {item.title}
                                </p>
                                <p className="text-[11px] text-[var(--text-muted)] mt-0.5 leading-snug">
                                  {item.detail}
                                </p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div
                className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs tracking-wide shadow-[var(--shadow-card)] select-none shrink-0"
                style={{
                  backgroundColor: 'var(--color-primary)',
                  color: 'var(--color-primary-fg)',
                }}
                title={`${currentUser?.name} (${userSummary})`}
              >
                {getInitials(currentUser?.name)}
              </div>
            </div>
          </header>

          {/* Default Password Security Banner */}
          {showDefaultAdminBanner && (
            <div className="px-4 sm:px-6 pt-3 pb-1 shrink-0">
              <div
                role="region"
                aria-label="Security notice"
                className="rounded-[16px] px-4 py-3 flex flex-wrap items-center justify-between gap-3 border"
                style={{
                  backgroundColor: 'var(--status-warning-bg)',
                  color: 'var(--status-warning-fg)',
                  borderColor: 'color-mix(in srgb, var(--status-warning-fg) 25%, transparent)',
                }}
              >
                <div className="flex items-center gap-2.5 text-xs font-medium">
                  <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>Please change the default password to secure workspace access.</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={openChangePwModal}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-[10px] transition-opacity hover:opacity-90 whitespace-nowrap"
                    style={{
                      backgroundColor: 'var(--status-warning-fg)',
                      color: '#FFFFFF',
                    }}
                  >
                    <KeyRound className="w-3.5 h-3.5" aria-hidden="true" />
                    Change Password
                  </button>
                  <button
                    type="button"
                    onClick={() => setBannerDismissed(true)}
                    aria-label="Dismiss password warning"
                    className="p-1.5 rounded-[10px] hover:bg-black/5"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Main Scrollable Workspace Content */}
          <main className="app-content">
            <div className="app-content-inner">
              {/* Active Module Title Strip */}
              <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                <div className="flex items-center gap-3 min-w-0">
                  <h1 className="font-display font-bold tracking-tight text-[var(--text-heading)] truncate text-[clamp(1.25rem,2vw,1.75rem)]">
                    {pageTitle}
                  </h1>
                  {isViewOnlyPage && (
                    <span
                      className="inline-flex items-center px-3 py-1 text-[11px] font-semibold rounded-full whitespace-nowrap shrink-0"
                      style={{
                        backgroundColor: 'var(--color-primary-soft)',
                        color: 'var(--color-primary)',
                      }}
                    >
                      View only
                    </span>
                  )}
                </div>
              </div>

              {children}
            </div>
          </main>

          {/* Bottom Copyright Footer */}
          <footer className="w-full py-2.5 px-4 text-center shrink-0 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] z-30 shadow-xs">
            <p
              style={{ fontFamily: 'Calibri, Candara, Segoe, "Segoe UI", Arial, sans-serif' }}
              className="text-[11px] font-bold tracking-wider text-[var(--text-heading)] uppercase select-none"
            >
              &copy; ALL RIGHT RESERVED BY MD MLAUDDIN . 2026
            </p>
          </footer>
        </div>
      </div>

      {/* Change Own Password Modal */}
      {showChangePwModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center fin-modal-backdrop p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="change-own-pw-title"
        >
          <div className="fin-modal-panel max-w-[min(92vw,480px)] w-full max-h-[90dvh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-[var(--border-subtle)] shrink-0">
              <h2
                id="change-own-pw-title"
                className="text-base font-bold text-[var(--text-heading)]"
              >
                Change Account Password
              </h2>
              <button
                type="button"
                onClick={() => setShowChangePwModal(false)}
                aria-label="Close change password modal"
                className="p-1.5 rounded-[10px] text-[var(--text-muted)] hover:text-[var(--text-heading)] hover:bg-[var(--bg-surface-muted)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleOwnPasswordSubmit} noValidate className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
              <div>
                <label
                  htmlFor="own-old-pw"
                  className="block text-xs font-semibold text-[var(--text-body)] mb-1.5"
                >
                  Current Password *
                </label>
                <input
                  id="own-old-pw"
                  type={showPwText ? 'text' : 'password'}
                  value={oldPw}
                  onChange={(e) => {
                    setOldPw(e.target.value);
                    setPwErrors((prev) => ({ ...prev, oldPassword: '' }));
                  }}
                  placeholder="Enter current password"
                  className="fin-input w-full px-3.5 text-sm"
                />
                {pwErrors.oldPassword && (
                  <p className="text-xs mt-1" style={{ color: 'var(--status-danger-fg)' }} role="alert">
                    {pwErrors.oldPassword}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="own-new-pw"
                  className="block text-xs font-semibold text-[var(--text-body)] mb-1.5"
                >
                  New Password *
                </label>
                <div className="relative">
                  <input
                    id="own-new-pw"
                    type={showPwText ? 'text' : 'password'}
                    value={newPw}
                    onChange={(e) => {
                      setNewPw(e.target.value);
                      setPwErrors((prev) => ({ ...prev, newPassword: '' }));
                    }}
                    placeholder="Min 6 characters"
                    className="fin-input w-full px-3.5 pr-10 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwText((prev) => !prev)}
                    aria-label={showPwText ? 'Hide password' : 'Show password'}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-[var(--text-muted)] hover:text-[var(--text-heading)]"
                  >
                    {showPwText ? (
                      <EyeOff className="w-4 h-4" aria-hidden="true" />
                    ) : (
                      <Eye className="w-4 h-4" aria-hidden="true" />
                    )}
                  </button>
                </div>
                {pwErrors.newPassword && (
                  <p className="text-xs mt-1" style={{ color: 'var(--status-danger-fg)' }} role="alert">
                    {pwErrors.newPassword}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="own-confirm-pw"
                  className="block text-xs font-semibold text-[var(--text-body)] mb-1.5"
                >
                  Confirm New Password *
                </label>
                <input
                  id="own-confirm-pw"
                  type={showPwText ? 'text' : 'password'}
                  value={confirmPw}
                  onChange={(e) => {
                    setConfirmPw(e.target.value);
                    setPwErrors((prev) => ({ ...prev, confirmPassword: '' }));
                  }}
                  placeholder="Re-enter new password"
                  className="fin-input w-full px-3.5 text-sm"
                />
                {pwErrors.confirmPassword && (
                  <p className="text-xs mt-1" style={{ color: 'var(--status-danger-fg)' }} role="alert">
                    {pwErrors.confirmPassword}
                  </p>
                )}
              </div>

              <div className="flex justify-end gap-2.5 pt-4 border-t border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => setShowChangePwModal(false)}
                  className="fin-btn-secondary px-4 py-2 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingPw}
                  className="fin-btn-primary px-4 py-2 text-xs inline-flex items-center gap-1.5"
                >
                  {savingPw && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
                  {savingPw ? 'Saving...' : 'Save Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Toast Notifications */}
      {toasts.length > 0 && (
        <div
          className="fixed bottom-4 sm:bottom-5 right-4 sm:right-5 z-50 flex flex-col gap-2.5 max-w-[min(22rem,calc(100vw-2rem))] w-full pointer-events-none"
          aria-live="polite"
        >
          {toasts.slice(-3).map((toast) => {
            const accentColor =
              toast.type === 'error'
                ? 'var(--status-danger-fg)'
                : toast.type === 'success'
                  ? 'var(--status-success-fg)'
                  : 'var(--color-primary)';
            return (
              <div
                key={toast.id}
                className="pointer-events-auto fin-card border border-[var(--border-subtle)] flex items-start justify-between gap-3 p-4"
                style={{ borderLeft: `4px solid ${accentColor}` }}
                role="status"
              >
                <div className="min-w-0">
                  <p className="text-xs font-bold text-[var(--text-heading)]">{toast.title}</p>
                  {toast.message && (
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">{toast.message}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => dismissToast(toast.id)}
                  aria-label="Dismiss notification"
                  className="p-1 rounded-[8px] text-[var(--text-muted)] hover:text-[var(--text-heading)] hover:bg-[var(--bg-surface-muted)] shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
