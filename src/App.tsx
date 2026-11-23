import { lazy, Suspense, useEffect, useRef } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Loader2, LogOut, Microscope, ShieldAlert } from 'lucide-react';
import { LabProvider, useLab } from './context/LabContext';
import { ThemeProvider } from './context/ThemeContext';
import { Layout } from './components/Layout';
import { LoginScreen } from './components/LoginScreen';
// Each page is its own chunk: only the page you open is downloaded (charts / PDF libs load only where used).
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const LostOrdersPage = lazy(() => import('./pages/LostOrdersPage').then((m) => ({ default: m.LostOrdersPage })));
const SamplesPage = lazy(() => import('./pages/SamplesPage').then((m) => ({ default: m.SamplesPage })));
const TestEntryPage = lazy(() => import('./pages/TestEntryPage').then((m) => ({ default: m.TestEntryPage })));
const Test2Page = lazy(() => import('./pages/Test2Page').then((m) => ({ default: m.Test2Page })));
const ManagementPage = lazy(() => import('./pages/ManagementPage').then((m) => ({ default: m.ManagementPage })));
const UsersPage = lazy(() => import('./pages/UsersPage').then((m) => ({ default: m.UsersPage })));

function PageFallback() {
  return (
    <div className="flex items-center justify-center py-24 text-[var(--text-muted)]">
      <Loader2 className="w-6 h-6 animate-spin" aria-hidden="true" />
    </div>
  );
}
import { canViewPage, getFirstAllowedPath } from './utils/auth';
import type { PageKey } from './types/lab';

function UnauthorizedRedirect({ targetPath }: { targetPath: string }) {
  const { addToast } = useLab();
  const location = useLocation();
  const notifiedPathRef = useRef<string | null>(null);

  useEffect(() => {
    if (notifiedPathRef.current !== location.pathname) {
      notifiedPathRef.current = location.pathname;
      addToast({
        type: 'error',
        title: "You don't have access to this page",
      });
    }
  }, [location.pathname, addToast]);

  return <Navigate to={targetPath} replace />;
}

function ProtectedRoute({
  pageKey,
  adminOnly = false,
  element,
}: {
  pageKey?: PageKey;
  adminOnly?: boolean;
  element: React.ReactElement;
}) {
  const { currentUser } = useLab();
  if (!currentUser) return null;

  const fallbackPath = getFirstAllowedPath(currentUser) || '/';

  if (adminOnly && !currentUser.isAdmin) {
    return <UnauthorizedRedirect targetPath={fallbackPath} />;
  }

  if (pageKey && !canViewPage(currentUser, pageKey)) {
    return <UnauthorizedRedirect targetPath={fallbackPath} />;
  }

  return element;
}

function WorkspaceLoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="fin-modal-panel max-w-sm w-full p-8 text-center space-y-4">
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto"
          style={{
            backgroundColor: 'var(--color-primary-soft)',
            color: 'var(--color-primary)',
          }}
        >
          <Loader2 className="w-6 h-6 animate-spin" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-base font-bold text-[var(--text-heading)]">
            Loading Competitor Sample Lab
          </h1>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Syncing laboratory records, masters, and user session...
          </p>
        </div>
      </div>
    </div>
  );
}

function NoPagesAssignedScreen() {
  const { currentUser, signOut } = useLab();
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="max-w-md w-full fin-modal-panel p-8 text-center space-y-5">
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto"
          style={{
            backgroundColor: 'var(--color-primary-soft)',
            color: 'var(--color-primary)',
          }}
        >
          <ShieldAlert className="w-6 h-6" aria-hidden="true" />
        </div>
        <div className="flex items-center justify-center gap-2 text-xs text-[var(--text-muted)] font-medium">
          <Microscope className="w-3.5 h-3.5 text-[var(--color-primary)]" aria-hidden="true" />
          <span>Competitor Sample Lab</span>
        </div>
        <h1 className="text-xl font-bold text-[var(--text-heading)]">
          No pages assigned, contact admin
        </h1>
        <p className="text-sm text-[var(--text-body)] leading-relaxed">
          Signed in as{' '}
          <span className="font-semibold text-[var(--text-heading)]">{currentUser?.name}</span> (@
          <span className="font-mono">{currentUser?.username}</span>). Your account currently has
          no workspace modules enabled.
        </p>
        <button
          type="button"
          onClick={() => void signOut()}
          className="fin-btn-primary inline-flex items-center gap-2 px-5 py-2.5 text-sm"
        >
          <LogOut className="w-4 h-4" aria-hidden="true" />
          Log out
        </button>
      </div>
    </div>
  );
}

function AppRoutes() {
  const { currentUser, initialLoading } = useLab();

  if (initialLoading) {
    return <WorkspaceLoadingScreen />;
  }

  if (!currentUser) {
    return <LoginScreen />;
  }

  const firstAllowedPath = getFirstAllowedPath(currentUser);
  if (!firstAllowedPath) {
    return <NoPagesAssignedScreen />;
  }

  return (
    <Layout>
      <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route
          path="/"
          element={<ProtectedRoute pageKey="dashboard" element={<DashboardPage />} />}
        />
        <Route
          path="/lost-orders"
          element={<ProtectedRoute pageKey="lostOrders" element={<LostOrdersPage />} />}
        />
        <Route
          path="/samples"
          element={<ProtectedRoute pageKey="samples" element={<SamplesPage />} />}
        />
        <Route
          path="/test-entry"
          element={<ProtectedRoute pageKey="testEntry" element={<TestEntryPage />} />}
        />
        <Route
          path="/test-2"
          element={<ProtectedRoute pageKey="testEntry" element={<Test2Page />} />}
        />
        <Route
          path="/management-action"
          element={<ProtectedRoute pageKey="management" element={<ManagementPage />} />}
        />
        <Route
          path="/users"
          element={<ProtectedRoute adminOnly element={<UsersPage />} />}
        />
        <Route path="*" element={<Navigate to={firstAllowedPath} replace />} />
      </Routes>
      </Suspense>
    </Layout>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <LabProvider>
          <AppRoutes />
        </LabProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
