import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Eye, EyeOff, FlaskConical, Loader2, Lock, Moon, ShieldCheck, Sun, User as UserIcon } from 'lucide-react';
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
    if (!username.trim()) errors.username = 'Username is required.';
    if (!password) errors.password = 'Password is required.';
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
    <div className="min-h-dvh flex flex-col items-center px-4 py-6 sm:py-10 relative">
      <button
        type="button"
        onClick={toggleTheme}
        aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        className="fin-icon-btn fixed top-4 right-4 z-20"
      >
        {isDark ? <Sun className="w-[18px] h-[18px]" aria-hidden="true" /> : <Moon className="w-[18px] h-[18px]" aria-hidden="true" />}
      </button>

      <div className="flex-1 flex items-center justify-center w-full">
        <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-12 gap-4 md:gap-0 md:glass md:rounded-[2rem] md:overflow-hidden md:p-2">
          {/* Emerald hero panel */}
          <div className="md:col-span-5 hero-emerald rounded-3xl md:rounded-[1.6rem] p-6 sm:p-8 relative overflow-hidden flex flex-col justify-between min-h-[13rem] md:min-h-[30rem]">
            <div
              className="absolute -right-16 -top-16 w-56 h-56 rounded-full pointer-events-none"
              style={{ background: 'radial-gradient(circle, rgba(163,240,70,0.25), transparent 70%)' }}
              aria-hidden="true"
            />
            <div
              className="absolute -left-12 -bottom-16 w-48 h-48 rounded-full pointer-events-none"
              style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.12), transparent 70%)' }}
              aria-hidden="true"
            />

            <div className="relative flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-white p-2 shrink-0 shadow-lg">
                <img src="/image.png" alt="" className="w-full h-full object-contain" />
              </div>
              <div>
                <p className="font-display font-bold text-lg leading-tight">Competitor Sample Lab</p>
                <p className="text-xs text-white/70">Benchmarking &amp; QA Workspace</p>
              </div>
            </div>

            <div className="relative mt-6 md:mt-0">
              <p className="font-display text-2xl sm:text-[1.75rem] font-bold leading-tight">
                Every lost order,
                <br />
                <span className="text-[#A3F046]">benchmarked.</span>
              </p>
              <ul className="hidden md:block mt-6 space-y-3 text-sm text-white/80">
                <li className="flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                    <FlaskConical className="w-4 h-4 text-[#A3F046]" aria-hidden="true" />
                  </span>
                  Track samples from request to lab sign-off
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                    <ShieldCheck className="w-4 h-4 text-[#A3F046]" aria-hidden="true" />
                  </span>
                  Page-level access for every team member
                </li>
              </ul>
            </div>
          </div>

          {/* Sign-in form */}
          <form
            onSubmit={handleSubmit}
            noValidate
            className="md:col-span-7 feed-card md:!border-0 md:!shadow-none md:!bg-transparent rounded-3xl p-6 sm:p-8 md:p-12 flex flex-col justify-center space-y-5"
          >
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Welcome back</p>
              <h1 className="font-display text-2xl sm:text-3xl font-bold text-[var(--text-heading)] tracking-tight mt-1">Sign in</h1>
            </div>

            {authError && (
              <div
                role="alert"
                className="px-4 py-3 text-sm font-semibold rounded-xl"
                style={{ backgroundColor: 'var(--status-danger-bg)', color: 'var(--status-danger-fg)' }}
              >
                {authError}
              </div>
            )}

            <div>
              <label htmlFor="login-username" className="block text-xs font-semibold text-[var(--text-body)] mb-1.5">
                Username
              </label>
              <div className="relative">
                <UserIcon className="w-4 h-4 text-[var(--text-muted)] absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
                <input
                  id="login-username"
                  type="text"
                  autoComplete="username"
                  autoCapitalize="none"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    if (fieldErrors.username) setFieldErrors((prev) => ({ ...prev, username: undefined }));
                    if (authError) setAuthError('');
                  }}
                  placeholder="Enter username"
                  className="fin-input w-full !h-12 pl-10 pr-3.5"
                />
              </div>
              {fieldErrors.username && (
                <p className="text-xs mt-1" style={{ color: 'var(--status-danger-fg)' }} role="alert">
                  {fieldErrors.username}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="login-password" className="block text-xs font-semibold text-[var(--text-body)] mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-[var(--text-muted)] absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: undefined }));
                    if (authError) setAuthError('');
                  }}
                  placeholder="Enter password"
                  className="fin-input w-full !h-12 pl-10 pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-1 top-1/2 -translate-y-1/2 w-11 h-11 inline-flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-heading)]"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
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
              className="fin-btn-primary w-full h-12 px-4 text-sm inline-flex items-center justify-center gap-2 !rounded-full"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              ) : (
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              )}
              {submitting ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>

      <footer className="w-full text-center pt-6">
        <p className="text-[10.5px] tracking-wider text-[var(--text-muted)] uppercase select-none opacity-75">
          &copy; ALL RIGHT RESERVED BY MD MLAUDDIN . 2026
        </p>
      </footer>
    </div>
  );
}
