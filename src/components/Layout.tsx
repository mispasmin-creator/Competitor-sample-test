import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  AlertTriangle,
  Bell,
  Check,
  ClipboardList,
  CornerDownLeft,
  Eye,
  EyeOff,
  FileSearch,
  FlaskConical,
  Info,
  KeyRound,
  LayoutDashboard,
  Loader2,
  LogOut,
  Menu,
  Moon,
  Package,
  Plus,
  RefreshCw,
  Search,
  Sun,
  Users,
  X,
} from 'lucide-react';
import { useLab } from '../context/LabContext';
import { useTheme } from '../context/ThemeContext';
import {
  canFullAccessPage,
  canViewPage,
  getPermissionSummary,
  PAGE_DEFINITIONS,
  validateOwnPasswordChangeForm,
} from '../utils/auth';
import { isCaseOverdue } from '../utils/labCalculations';
import { CaseDetailModal } from './CaseDetailModal';
import type { LabCase } from '../types/lab';

type NavItem = { key: string; path: string; label: string; icon: React.ComponentType<{ className?: string }> };

const ICONS: Record<string, NavItem['icon']> = {
  dashboard: LayoutDashboard,
  lostOrders: ClipboardList,
  samples: Package,
  testEntry: FlaskConical,
  users: Users,
};

function getInitials(name?: string): string {
  if (!name) return 'CS';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

type JumpResult =
  | { kind: 'page'; id: string; label: string; hint: string; path: string }
  | { kind: 'case'; id: string; label: string; hint: string; labCase: LabCase };

export function Layout({ children }: { children: React.ReactNode }) {
  const {
    currentUser,
    cases,
    masters,
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

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileMenuOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notifContainerRef.current && !notifContainerRef.current.contains(event.target as Node)) {
        setNotificationsOpen(false);
      }
    };
    if (notificationsOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [notificationsOpen]);

  /* ---------------- Navigation model ---------------- */

  const navItems: NavItem[] = useMemo(() => {
    const items: NavItem[] = PAGE_DEFINITIONS.filter((def) => canViewPage(currentUser, def.key)).map((def) => ({
      key: def.key,
      path: def.path,
      label: def.label,
      icon: ICONS[def.key],
    }));
    if (currentUser?.isAdmin) {
      items.push({ key: 'users', path: '/users', label: 'User Management', icon: Users });
    }
    return items;
  }, [currentUser]);

  const pageTitle =
    location.pathname === '/users'
      ? 'User Management'
      : PAGE_DEFINITIONS.find((d) => d.path === location.pathname)?.label || 'Workspace';

  // Primary "+ New Entry" action, chosen by what the user is allowed to create.
  const newEntry = useMemo(() => {
    if (canFullAccessPage(currentUser, 'lostOrders')) return { path: '/lost-orders?new=1', label: 'New Lost Order' };
    if (canFullAccessPage(currentUser, 'samples')) return { path: '/samples?new=1', label: 'Request Sample' };
    if (currentUser?.isAdmin) return { path: '/users?new=1', label: 'Add User' };
    return null;
  }, [currentUser]);

  // Bottom pill bar: 4 nav slots around a centered FAB.
  const bottomItems = navItems.filter((i) => i.key !== 'users').slice(0, 4);
  const bottomSlots: Array<NavItem | null> = [...bottomItems];
  while (bottomSlots.length < 4) bottomSlots.push(null);

  const userSummary = getPermissionSummary(currentUser);
  const showDefaultAdminBanner = Boolean(mustChangePassword && !bannerDismissed);

  /* ---------------- Notifications ---------------- */

  const notifications = useMemo(() => {
    const items: Array<{ id: string; title: string; detail: string; tone: 'danger' | 'warning' | 'info'; path?: string }> = [];
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
    const activeTests = cases.filter((c) => c.pendingStageNo === 4 || c.status === 'Testing').length;
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

  /* ---------------- Quick-jump search (Ctrl/⌘K) ---------------- */

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const searchWrapRef = useRef<HTMLDivElement | null>(null);
  const [jumpQuery, setJumpQuery] = useState('');
  const [jumpOpen, setJumpOpen] = useState(false);
  const [jumpIndex, setJumpIndex] = useState(0);
  const [dossierCase, setDossierCase] = useState<LabCase | null>(null);

  const competitorNames = useMemo(
    () => new Map(masters.competitors.map((c) => [c.id, c.name])),
    [masters.competitors]
  );

  const canSeeCases = navItems.some((i) => i.key !== 'users' && i.key !== 'dashboard') || canViewPage(currentUser, 'dashboard');

  const jumpResults: JumpResult[] = useMemo(() => {
    const q = jumpQuery.trim().toLowerCase();
    if (!q) return [];
    const pages: JumpResult[] = navItems
      .filter((i) => i.label.toLowerCase().includes(q))
      .map((i) => ({ kind: 'page', id: `page-${i.key}`, label: i.label, hint: 'Go to page', path: i.path }));
    const caseHits: JumpResult[] = canSeeCases
      ? cases
          .filter((c) => {
            const comp = (competitorNames.get(c.competitorId) || c.competitorName || '').toLowerCase();
            return (
              c.caseId.toLowerCase().includes(q) ||
              (c.sampleCode || '').toLowerCase().includes(q) ||
              c.customer.toLowerCase().includes(q) ||
              c.product.toLowerCase().includes(q) ||
              comp.includes(q)
            );
          })
          .map((c) => ({
            kind: 'case' as const,
            id: `case-${c.caseId}`,
            label: `${c.caseId}${c.sampleCode ? ` · ${c.sampleCode}` : ''}`,
            hint: `${c.customer} — ${c.product}`,
            labCase: c,
          }))
      : [];
    return [...pages, ...caseHits].slice(0, 6);
  }, [jumpQuery, navItems, cases, canSeeCases, competitorNames]);

  useEffect(() => {
    setJumpIndex(0);
  }, [jumpQuery]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        setJumpOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target as Node)) setJumpOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const selectJump = useCallback(
    (r: JumpResult) => {
      setJumpOpen(false);
      setJumpQuery('');
      searchInputRef.current?.blur();
      if (r.kind === 'page') navigate(r.path);
      else setDossierCase(r.labCase);
    },
    [navigate]
  );

  const handleJumpKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setJumpOpen(true);
      setJumpIndex((i) => Math.min(i + 1, Math.max(jumpResults.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setJumpIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      const r = jumpResults[jumpIndex];
      if (r) {
        e.preventDefault();
        selectJump(r);
      }
    } else if (e.key === 'Escape') {
      setJumpOpen(false);
      searchInputRef.current?.blur();
    }
  };

  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

  /* ---------------- Change own password ---------------- */

  const [showChangePwModal, setShowChangePwModal] = useState(false);
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showPwText, setShowPwText] = useState(false);
  const [pwErrors, setPwErrors] = useState<Record<string, string>>({});
  const [savingPw, setSavingPw] = useState(false);

  const openChangePwModal = () => {
    setOldPw('');
    setNewPw('');
    setConfirmPw('');
    setPwErrors({});
    setShowPwText(false);
    setMobileMenuOpen(false);
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

  const goNewEntry = () => {
    if (newEntry) navigate(newEntry.path);
    else {
      searchInputRef.current?.focus();
      setJumpOpen(true);
    }
  };

  /* ---------------- Sidebar ---------------- */

  const renderSidebar = (isDrawer: boolean) => {
    const collapsed = !isDrawer && desktopCollapsed;

    const utilityBtn =
      'w-11 h-11 lg:w-10 lg:h-10 rounded-xl inline-flex items-center justify-center text-[#0D4F3C] dark:text-[var(--color-primary)] hover:bg-white/70 dark:hover:bg-white/5 transition-colors';

    return (
      <div className="flex flex-col h-full">
        {/* Brand */}
        <div className={`flex items-center gap-3 px-4 pt-5 pb-4 ${collapsed ? 'justify-center px-2' : ''}`}>
          <div className="w-10 h-10 rounded-xl bg-white shadow-sm border border-white/80 p-1.5 shrink-0 overflow-hidden">
            <img src="/image.png" alt="" className="w-full h-full object-contain" />
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="font-display font-bold text-[15px] leading-tight text-[#0D4F3C] dark:text-[var(--color-primary)] truncate">
                Sample Lab
              </p>
              <p className="text-[11px] text-[var(--text-muted)] truncate">Competitor Bench</p>
            </div>
          )}
          {isDrawer && (
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              aria-label="Close navigation menu"
              className={utilityBtn}
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 min-h-0 overflow-y-auto px-3 space-y-1" aria-label="Main navigation">
          {!collapsed && (
            <p className="px-3 pt-2 pb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">
              Workspace
            </p>
          )}
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/'}
                title={collapsed ? item.label : undefined}
                className={({ isActive }) =>
                  `group flex items-center gap-3 min-h-[44px] rounded-xl text-sm font-semibold transition-colors ${
                    collapsed ? 'justify-center px-0' : 'px-3'
                  } ${
                    isActive
                      ? 'bg-[#0D4F3C] text-white shadow-[0_6px_16px_rgba(13,79,60,0.25)]'
                      : 'text-slate-600 dark:text-[var(--text-body)] hover:bg-white/70 dark:hover:bg-white/5'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon
                      className={`w-[18px] h-[18px] shrink-0 ${
                        isActive ? 'text-[#A3F046]' : 'text-[#0D4F3C] dark:text-[var(--color-primary)]'
                      }`}
                    />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* Utilities */}
        <div className={`px-3 pt-3 ${collapsed ? 'flex flex-col items-center gap-1' : 'flex items-center justify-between'}`}>
          <button
            type="button"
            onClick={() => void refreshAll()}
            disabled={refreshing}
            aria-label="Refresh data from Google Sheet"
            title="Refresh data"
            className={`${utilityBtn} disabled:opacity-60`}
          >
            <RefreshCw className={`w-[18px] h-[18px] ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            title={isDark ? 'Light mode' : 'Dark mode'}
            className={utilityBtn}
          >
            {isDark ? <Sun className="w-[18px] h-[18px]" /> : <Moon className="w-[18px] h-[18px]" />}
          </button>
          <button
            type="button"
            onClick={openChangePwModal}
            aria-label="Change your password"
            title="Change password"
            className={utilityBtn}
          >
            <KeyRound className="w-[18px] h-[18px]" />
          </button>
          <button
            type="button"
            onClick={() => void signOut()}
            aria-label="Log out"
            title="Log out"
            className={`${utilityBtn} hover:!bg-[var(--status-danger-bg)] hover:!text-[var(--status-danger-fg)]`}
          >
            <LogOut className="w-[18px] h-[18px]" />
          </button>
        </div>

        {/* User badge */}
        <div className="p-3">
          <div
            className={`glass rounded-2xl flex items-center gap-3 ${collapsed ? 'justify-center p-1.5' : 'p-2.5'}`}
            title={collapsed ? `${currentUser?.name} · ${userSummary}` : undefined}
          >
            <span className="w-9 h-9 rounded-full bg-[#0D4F3C] text-[#A3F046] font-display font-bold text-xs flex items-center justify-center shrink-0">
              {getInitials(currentUser?.name)}
            </span>
            {!collapsed && (
              <div className="min-w-0">
                <p className="text-[13px] font-bold text-[var(--text-heading)] truncate">{currentUser?.name}</p>
                <p className="text-[11px] text-[var(--text-muted)] truncate">
                  @{currentUser?.username} · {userSummary}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  /* ---------------- Render ---------------- */

  return (
    <>
      <div className="min-h-dvh flex no-print">
        {/* Desktop sidebar */}
        <aside
          className={`hidden lg:flex flex-col sticky top-0 h-screen shrink-0 bg-white/55 dark:bg-[rgba(15,28,25,0.6)] backdrop-blur-xl border-r border-white/70 dark:border-white/5 transition-[width] duration-200 ${
            desktopCollapsed ? 'w-[76px]' : 'w-[248px]'
          }`}
        >
          {renderSidebar(false)}
        </aside>

        {/* Main column */}
        <div className="flex-1 min-w-0 flex flex-col">
          <header className="sticky top-0 z-30 h-14 lg:h-16 bg-white/65 dark:bg-[rgba(15,28,25,0.65)] backdrop-blur-xl border-b border-white/70 dark:border-white/5 flex items-center gap-2.5 sm:gap-3 px-3 sm:px-5 lg:px-8">
            <button
              type="button"
              onClick={() => {
                // Phones/tablets: slide-over drawer. Desktop: collapse/expand the sidebar.
                if (window.matchMedia('(min-width: 1024px)').matches) setDesktopCollapsed((v) => !v);
                else setMobileMenuOpen(true);
              }}
              aria-label="Toggle navigation sidebar"
              title="Toggle sidebar"
              className="fin-icon-btn"
            >
              <Menu className="w-5 h-5" />
            </button>
            <span className="hidden sm:inline font-display font-bold text-[15px] lg:text-base text-[var(--text-heading)] truncate max-w-[12rem] shrink-0">
              {pageTitle}
            </span>

            {/* Quick-jump search */}
            <div ref={searchWrapRef} className="relative flex-1 min-w-0 max-w-xl mx-auto">
              <Search
                className="w-4 h-4 text-[var(--text-muted)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <input
                ref={searchInputRef}
                type="search"
                role="combobox"
                aria-label="Quick jump: search pages and case records"
                aria-expanded={jumpOpen && jumpQuery.trim().length > 0}
                aria-controls="quick-jump-list"
                aria-autocomplete="list"
                aria-activedescendant={jumpResults[jumpIndex] ? `qj-${jumpResults[jumpIndex].id}` : undefined}
                value={jumpQuery}
                onChange={(e) => {
                  setJumpQuery(e.target.value);
                  setJumpOpen(true);
                }}
                onFocus={() => setJumpOpen(true)}
                onKeyDown={handleJumpKeyDown}
                placeholder="Search case, sample, customer…"
                className="fin-input w-full pl-10 pr-3 sm:pr-16 !bg-white/80 dark:!bg-white/5"
              />
              <kbd className="hidden sm:inline-flex absolute right-3 top-1/2 -translate-y-1/2 items-center gap-0.5 px-1.5 py-0.5 rounded-md border border-[var(--border-subtle)] bg-white/70 dark:bg-white/5 font-mono text-[10px] text-[var(--text-muted)] pointer-events-none">
                {isMac ? '⌘' : 'Ctrl'} K
              </kbd>

              {jumpOpen && jumpQuery.trim() && (
                <div className="absolute left-0 right-0 mt-2 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-[var(--shadow-shell)] overflow-hidden z-40 anim-pop">
                  {jumpResults.length === 0 ? (
                    <p className="px-4 py-5 text-sm text-[var(--text-muted)] text-center">No matches for “{jumpQuery.trim()}”.</p>
                  ) : (
                    <ul id="quick-jump-list" role="listbox" aria-label="Quick jump results" className="py-1.5">
                      {jumpResults.map((r, idx) => (
                        <li
                          key={r.id}
                          id={`qj-${r.id}`}
                          role="option"
                          aria-selected={idx === jumpIndex}
                          onMouseEnter={() => setJumpIndex(idx)}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            selectJump(r);
                          }}
                          className={`mx-1.5 px-3 min-h-[44px] py-2 rounded-xl flex items-center gap-3 cursor-pointer ${
                            idx === jumpIndex ? 'bg-[var(--mint)]' : ''
                          }`}
                        >
                          <span className="w-8 h-8 rounded-full bg-[var(--mint)] text-[var(--color-primary)] flex items-center justify-center shrink-0">
                            {r.kind === 'page' ? (
                              <LayoutDashboard className="w-4 h-4" aria-hidden="true" />
                            ) : (
                              <FileSearch className="w-4 h-4" aria-hidden="true" />
                            )}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span
                              className={`block text-sm font-semibold text-[var(--text-heading)] truncate ${
                                r.kind === 'case' ? 'font-mono text-[13px]' : ''
                              }`}
                            >
                              {r.label}
                            </span>
                            <span className="block text-xs text-[var(--text-muted)] truncate">{r.hint}</span>
                          </span>
                          {idx === jumpIndex && (
                            <CornerDownLeft className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" aria-hidden="true" />
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            {/* Notifications */}
            <div className="relative shrink-0" ref={notifContainerRef}>
              <button
                type="button"
                onClick={() => setNotificationsOpen((prev) => !prev)}
                aria-label={`Notifications${notifications.length ? ` (${notifications.length})` : ''}`}
                aria-expanded={notificationsOpen}
                className="fin-icon-btn relative"
              >
                <Bell className="w-[18px] h-[18px]" aria-hidden="true" />
                {notifications.length > 0 && (
                  <span
                    className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full bg-[#A3F046] ring-2 ring-[#0D4F3C]"
                    aria-hidden="true"
                  />
                )}
              </button>

              {notificationsOpen && (
                <div className="absolute right-0 mt-2.5 w-80 max-w-[calc(100vw-1.5rem)] max-h-[min(26rem,70dvh)] flex flex-col rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-[var(--shadow-shell)] p-3 z-40 anim-pop">
                  <div className="flex items-center justify-between px-1.5 pb-2.5 mb-1.5 border-b border-[var(--border-subtle)]">
                    <span className="text-sm font-bold text-[var(--text-heading)] font-display">Notifications</span>
                    <span className="text-[11px] font-mono text-[var(--text-muted)]">{notifications.length} active</span>
                  </div>
                  {notifications.length === 0 ? (
                    <p className="text-xs text-[var(--text-muted)] py-4 text-center">All laboratory queues are up to date.</p>
                  ) : (
                    <div className="space-y-1 overflow-y-auto flex-1 min-h-0">
                      {notifications.map((item) => {
                        const dot =
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
                              if (item.path) navigate(item.path);
                              else if (item.id === 'default-pw') openChangePwModal();
                            }}
                            className="w-full text-left p-2.5 min-h-[44px] rounded-xl hover:bg-[var(--bg-surface-muted)] transition-colors flex items-start gap-2.5"
                          >
                            <span className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: dot }} aria-hidden="true" />
                            <span className="min-w-0">
                              <span className="block text-xs font-semibold text-[var(--text-heading)]">{item.title}</span>
                              <span className="block text-[11px] text-[var(--text-muted)] mt-0.5 leading-snug">{item.detail}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </header>

          {/* Default password banner */}
          {showDefaultAdminBanner && (
            <div className="px-4 sm:px-6 lg:px-8 pt-4">
              <div
                role="region"
                aria-label="Security notice"
                className="rounded-2xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 border"
                style={{
                  backgroundColor: 'var(--status-warning-bg)',
                  color: 'var(--status-warning-fg)',
                  borderColor: 'color-mix(in srgb, var(--status-warning-fg) 25%, transparent)',
                }}
              >
                <div className="flex items-center gap-2.5 text-xs font-semibold">
                  <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>Please change the default password to secure workspace access.</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={openChangePwModal}
                    className="inline-flex items-center gap-1.5 px-3.5 h-9 text-xs font-semibold rounded-full whitespace-nowrap text-white"
                    style={{ backgroundColor: 'var(--status-warning-fg)' }}
                  >
                    <KeyRound className="w-3.5 h-3.5" aria-hidden="true" />
                    Change Password
                  </button>
                  <button
                    type="button"
                    onClick={() => setBannerDismissed(true)}
                    aria-label="Dismiss password warning"
                    className="w-9 h-9 rounded-full inline-flex items-center justify-center hover:bg-black/5"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}

          <main className="flex-1 w-full max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 pt-4 lg:pt-6 pb-24 lg:pb-8">
            {children}
            <footer className="mt-10 text-center">
              <p className="text-[10.5px] tracking-wider text-[var(--text-muted)] uppercase select-none opacity-75">
                &copy; ALL RIGHT RESERVED BY MD MLAUDDIN . 2026
              </p>
            </footer>
          </main>
        </div>

        {/* Mobile drawer */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation menu">
            <div className="absolute inset-0 fin-modal-backdrop anim-fade" onClick={() => setMobileMenuOpen(false)} aria-hidden="true" />
            <div className="absolute left-0 top-0 bottom-0 w-[264px] max-w-[85vw] bg-white/90 dark:bg-[rgba(15,28,25,0.94)] backdrop-blur-xl shadow-2xl pt-safe pb-safe anim-slide-left">
              {renderSidebar(true)}
            </div>
          </div>
        )}

        {/* Mobile floating bottom pill bar */}
        <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 px-4 pb-safe pointer-events-none" aria-label="Quick navigation">
          <div className="pointer-events-auto max-w-md mx-auto rounded-full bg-[#0D4F3C] shadow-[0_12px_32px_rgba(7,51,38,0.35)] grid grid-cols-5 items-center h-16 px-2">
            {[bottomSlots[0], bottomSlots[1], 'fab' as const, bottomSlots[2], bottomSlots[3]].map((slot, idx) => {
              if (slot === 'fab') {
                return (
                  <div key="fab" className="flex justify-center">
                    <button
                      type="button"
                      onClick={goNewEntry}
                      aria-label={newEntry ? newEntry.label : 'Search records'}
                      className="w-11 h-11 rounded-full bg-[#A3F046] text-[#073326] flex items-center justify-center shadow-[0_6px_16px_rgba(163,240,70,0.35)] active:scale-95 transition-transform"
                    >
                      {newEntry ? <Plus className="w-5 h-5" strokeWidth={2.6} /> : <Search className="w-5 h-5" />}
                    </button>
                  </div>
                );
              }
              if (!slot) return <div key={`empty-${idx}`} aria-hidden="true" />;
              const Icon = slot.icon;
              return (
                <NavLink
                  key={slot.path}
                  to={slot.path}
                  end={slot.path === '/'}
                  className="flex flex-col items-center justify-center gap-0.5 min-h-[44px] rounded-full"
                >
                  {({ isActive }) => (
                    <>
                      <Icon className={`w-5 h-5 ${isActive ? 'text-[#A3F046]' : 'text-white/60'}`} />
                      <span className={`text-[10px] font-semibold leading-none ${isActive ? 'text-white' : 'text-white/60'}`}>
                        {slot.label.split(' ')[0]}
                      </span>
                    </>
                  )}
                </NavLink>
              );
            })}
          </div>
        </nav>
      </div>

      {/* Global dossier opened from quick-jump */}
      <CaseDetailModal labCase={dossierCase} onClose={() => setDossierCase(null)} />

      {/* Change Own Password Modal */}
      {showChangePwModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center fin-modal-backdrop p-4 no-print"
          role="dialog"
          aria-modal="true"
          aria-labelledby="change-own-pw-title"
        >
          <div className="fin-modal-panel max-w-[min(92vw,480px)] w-full flex flex-col overflow-hidden anim-pop">
            <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-[var(--border-subtle)] shrink-0">
              <h2 id="change-own-pw-title" className="text-base font-bold text-[var(--text-heading)]">
                Change Account Password
              </h2>
              <button
                type="button"
                onClick={() => setShowChangePwModal(false)}
                aria-label="Close change password modal"
                className="w-10 h-10 rounded-full inline-flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-heading)] hover:bg-[var(--bg-surface-muted)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleOwnPasswordSubmit} noValidate className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
              <div className="sheet-section space-y-4">
                <div>
                  <label htmlFor="own-old-pw" className="block text-xs font-semibold text-[var(--text-body)] mb-1.5">
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
                    className="fin-input w-full px-3.5"
                  />
                  {pwErrors.oldPassword && (
                    <p className="text-xs mt-1" style={{ color: 'var(--status-danger-fg)' }} role="alert">
                      {pwErrors.oldPassword}
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="own-new-pw" className="block text-xs font-semibold text-[var(--text-body)] mb-1.5">
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
                      className="fin-input w-full px-3.5 pr-12"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPwText((prev) => !prev)}
                      aria-label={showPwText ? 'Hide password' : 'Show password'}
                      className="absolute right-1 top-1/2 -translate-y-1/2 w-10 h-10 inline-flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-heading)]"
                    >
                      {showPwText ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
                    </button>
                  </div>
                  {pwErrors.newPassword && (
                    <p className="text-xs mt-1" style={{ color: 'var(--status-danger-fg)' }} role="alert">
                      {pwErrors.newPassword}
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="own-confirm-pw" className="block text-xs font-semibold text-[var(--text-body)] mb-1.5">
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
                    className="fin-input w-full px-3.5"
                  />
                  {pwErrors.confirmPassword && (
                    <p className="text-xs mt-1" style={{ color: 'var(--status-danger-fg)' }} role="alert">
                      {pwErrors.confirmPassword}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2.5 pt-4 border-t border-[var(--border-subtle)]">
                <button type="button" onClick={() => setShowChangePwModal(false)} className="fin-btn-secondary px-4 text-sm">
                  Cancel
                </button>
                <button type="submit" disabled={savingPw} className="fin-btn-primary px-4 text-sm inline-flex items-center justify-center gap-1.5">
                  {savingPw && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
                  {savingPw ? 'Saving...' : 'Save Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Toast banners */}
      {toasts.length > 0 && (
        <div
          className="fixed z-[80] bottom-24 left-4 right-4 lg:bottom-5 lg:right-5 lg:left-auto lg:w-[24rem] flex flex-col gap-2 pointer-events-none no-print"
          aria-live="polite"
        >
          {toasts.slice(-3).map((toast) => {
            const Icon = toast.type === 'error' ? AlertCircle : toast.type === 'info' ? Info : Check;
            return (
              <div
                key={toast.id}
                role="status"
                className="pointer-events-auto rounded-[1.75rem] bg-[#0D4F3C] text-white pl-2 pr-2 py-2 flex items-center gap-3 shadow-[0_12px_32px_rgba(7,51,38,0.35)] anim-pop"
              >
                <span
                  className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                    toast.type === 'error' ? 'bg-rose-400/20 text-rose-200' : 'bg-[#A3F046]/15 text-[#A3F046]'
                  }`}
                >
                  <Icon className="w-[18px] h-[18px]" strokeWidth={2.6} aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1 py-0.5">
                  <p className="text-[13px] font-semibold leading-snug">{toast.title}</p>
                  {toast.message && <p className="text-xs text-white/70 leading-snug mt-0.5">{toast.message}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => dismissToast(toast.id)}
                  aria-label="Dismiss notification"
                  className="w-9 h-9 rounded-full inline-flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
