import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Moon,
  Sun,
  User as UserIcon,
} from 'lucide-react';
import { useLab } from '../context/LabContext';
import { useTheme } from '../context/ThemeContext';

export function LoginScreen() {
  const { signIn } = useLab();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ username?: string; password?: string }>({});
  const [authError, setAuthError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: { username?: string; password?: string } = {};
    if (!username.trim()) {
      errors.username = 'Username is required.';
    }
    if (!password) {
      errors.password = 'Password is required.';
    }
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setAuthError('');
      return;
    }

    setSubmitting(true);
    setAuthError('');
    try {
      const res = await signIn(username, password);
      if (!res.ok) {
        setAuthError(res.error || 'Invalid username or password');
      } else {
        navigate(res.firstAllowedPath || '/', { replace: true });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[100dvh] overflow-y-auto flex flex-col justify-between items-center px-3 sm:px-6 py-6 sm:py-8 relative">
      <button
        type="button"
        onClick={toggleTheme}
        aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        className="fin-icon-btn fixed top-3 right-3 sm:top-5 sm:right-5 z-20"
      >
        {isDark ? (
          <Sun className="w-[18px] h-[18px]" aria-hidden="true" />
        ) : (
          <Moon className="w-[18px] h-[18px]" aria-hidden="true" />
        )}
      </button>

      <div className="flex-1 flex items-center justify-center w-full my-auto">
        <div
          className="max-w-4xl w-full bg-[var(--bg-surface)] rounded-[20px] sm:rounded-[28px] overflow-hidden grid grid-cols-1 md:grid-cols-12 border-2 sm:border-[6px]"
          style={{
            borderColor: 'var(--shell-ring)',
            boxShadow: 'var(--shadow-shell)',
          }}
        >
        {/* Decorative Teal Benchmark Panel */}
        <div
          className="hidden md:flex md:col-span-5 p-8 flex-col justify-center items-center text-center text-white relative overflow-hidden"
          style={{
            background: 'linear-gradient(155deg, #1F6B7F 0%, #165566 65%, #114350 100%)',
          }}
        >
          <div
            className="absolute -right-14 -top-14 w-48 h-48 rounded-full opacity-15 pointer-events-none"
            style={{ backgroundColor: '#A8CBD6' }}
            aria-hidden="true"
          />
          <div
            className="absolute -left-10 -bottom-12 w-40 h-40 rounded-full opacity-10 pointer-events-none"
            style={{ backgroundColor: '#5FA3B5' }}
            aria-hidden="true"
          />

          <div className="relative z-10 flex flex-col items-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-xs flex items-center justify-center shrink-0 p-2 border border-white/25 shadow-lg">
              <img src="/image.png" alt="Logo" className="w-full h-full object-contain" />
            </div>
            <div>
              <h1 className="font-display text-xl font-bold tracking-tight text-white">
                Competitor Sample Lab
              </h1>
              <p className="text-xs text-white/75 mt-1 font-medium">Benchmarking &amp; QA Workspace</p>
            </div>
          </div>
        </div>

        {/* Sign-in Form */}
        <form
          onSubmit={handleSubmit}
          noValidate
          className="col-span-1 md:col-span-7 p-6 sm:p-8 md:p-10 flex flex-col justify-center space-y-5"
        >
          {/* Mobile Brand Header */}
          <div className="md:hidden flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 p-1.5 border border-[var(--border-subtle)] bg-[var(--bg-surface-muted)] shadow-xs">
              <img src="/image.png" alt="Logo" className="w-full h-full object-contain" />
            </div>
            <div>
              <h1 className="font-display text-base font-bold text-[var(--text-heading)]">
                Competitor Sample Lab
              </h1>
              <p className="text-xs text-[var(--text-muted)]">Benchmarking &amp; QA Workspace</p>
            </div>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-[var(--text-heading)] tracking-tight">
              Sign In
            </h2>
          </div>

          {authError && (
            <div
              role="alert"
              className="px-4 py-3 text-xs font-semibold rounded-[12px]"
              style={{
                backgroundColor: 'var(--status-danger-bg)',
                color: 'var(--status-danger-fg)',
              }}
            >
              {authError}
            </div>
          )}

          <div>
            <label
              htmlFor="login-username"
              className="block text-xs font-semibold text-[var(--text-body)] mb-1.5"
            >
              Username
            </label>
            <div className="relative">
              <UserIcon
                className="w-4 h-4 text-[var(--text-muted)] absolute left-3.5 top-1/2 -translate-y-1/2"
                aria-hidden="true"
              />
              <input
                id="login-username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  if (fieldErrors.username) {
                    setFieldErrors((prev) => ({ ...prev, username: undefined }));
                  }
                  if (authError) setAuthError('');
                }}
                placeholder="Enter username"
                className="fin-input w-full h-[44px] pl-10 pr-3.5 text-sm"
              />
            </div>
            {fieldErrors.username && (
              <p className="text-xs mt-1" style={{ color: 'var(--status-danger-fg)' }} role="alert">
                {fieldErrors.username}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="login-password"
              className="block text-xs font-semibold text-[var(--text-body)] mb-1.5"
            >
              Password
            </label>
            <div className="relative">
              <Lock
                className="w-4 h-4 text-[var(--text-muted)] absolute left-3.5 top-1/2 -translate-y-1/2"
                aria-hidden="true"
              />
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (fieldErrors.password) {
                    setFieldErrors((prev) => ({ ...prev, password: undefined }));
                  }
                  if (authError) setAuthError('');
                }}
                placeholder="Enter password"
                className="fin-input w-full h-[44px] pl-10 pr-10 text-sm"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-[var(--text-muted)] hover:text-[var(--text-heading)]"
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" aria-hidden="true" />
                ) : (
                  <Eye className="w-4 h-4" aria-hidden="true" />
                )}
              </button>
            </div>
            {fieldErrors.password && (
              <p className="text-xs mt-1" style={{ color: 'var(--status-danger-fg)' }} role="alert">
                {fieldErrors.password}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="fin-btn-primary w-full py-3 px-4 text-sm inline-flex items-center justify-center gap-2"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
            {submitting ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
      </div>

      <footer className="w-full text-center py-3 shrink-0 mt-auto">
        <p
          style={{ fontFamily: 'Calibri, Candara, Segoe, "Segoe UI", Arial, sans-serif' }}
          className="text-[11px] font-bold tracking-wider text-[var(--text-heading)] uppercase select-none"
        >
          &copy; ALL RIGHT RESERVED BY MD MLAUDDIN . 2026
        </p>
      </footer>
    </div>
  );
}
