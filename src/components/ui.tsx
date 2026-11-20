import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowUpRight, CheckCircle2, Loader2, Plus } from 'lucide-react';
import type { LabCase } from '../types/lab';

/* ----------------------------------------------------------------
   Helpers
---------------------------------------------------------------- */

/** Fraction (0..1) of the 5 FMS stages that have an actual timestamp. */
export function getCaseProgress(c: LabCase): number {
  const done = [c.actual1, c.actual2, c.actual3, c.actual4, c.actual5].filter(Boolean).length;
  return done / 5;
}

export type Tone = 'brand' | 'info' | 'warning' | 'success' | 'danger' | 'neutral';

const TONE_STYLES: Record<Tone, { bg: string; fg: string }> = {
  brand: { bg: 'var(--mint)', fg: 'var(--color-primary)' },
  info: { bg: 'var(--status-info-bg)', fg: 'var(--status-info-fg)' },
  warning: { bg: 'var(--status-warning-bg)', fg: 'var(--status-warning-fg)' },
  success: { bg: 'var(--status-success-bg)', fg: 'var(--status-success-fg)' },
  danger: { bg: 'var(--status-danger-bg)', fg: 'var(--status-danger-fg)' },
  neutral: { bg: 'var(--status-neutral-bg)', fg: 'var(--status-neutral-fg)' },
};

export function toneStyle(tone: Tone) {
  return { backgroundColor: TONE_STYLES[tone].bg, color: TONE_STYLES[tone].fg };
}

/* ----------------------------------------------------------------
   Desktop page header (hidden on phones)
---------------------------------------------------------------- */

export function PageHeader({
  eyebrow,
  title,
  actions,
  viewOnly = false,
}: {
  eyebrow: string;
  title: string;
  actions?: React.ReactNode;
  viewOnly?: boolean;
}) {
  return (
    <div className="hidden md:flex items-end justify-between gap-4 flex-wrap">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
          {eyebrow}
        </p>
        <div className="flex items-center gap-2.5 mt-1">
          <h1 className="font-display text-[clamp(1.5rem,2.2vw,2rem)] font-bold tracking-tight text-[var(--text-heading)] truncate">
            {title}
          </h1>
          {viewOnly && <ViewOnlyChip />}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2.5 flex-wrap">{actions}</div>}
    </div>
  );
}

export function ViewOnlyChip() {
  return (
    <span
      className="inline-flex items-center px-2.5 py-1 text-[11px] font-semibold rounded-full whitespace-nowrap"
      style={toneStyle('brand')}
    >
      View only
    </span>
  );
}

/* ----------------------------------------------------------------
   Mobile emerald summary banner (Directory screens)
---------------------------------------------------------------- */

export function MobileBanner({
  label,
  count,
  caption,
  icon,
  iconLabel,
  onIconClick,
  onNew,
  newLabel = 'New',
  viewOnly = false,
}: {
  label: string;
  count: number;
  caption?: string;
  icon?: React.ReactNode;
  iconLabel?: string;
  onIconClick?: () => void;
  onNew?: () => void;
  newLabel?: string;
  viewOnly?: boolean;
}) {
  return (
    <section className="md:hidden hero-emerald rounded-3xl p-5 relative overflow-hidden" aria-label={label}>
      <div
        className="absolute -right-10 -top-12 w-40 h-40 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(163,240,70,0.22), transparent 70%)' }}
        aria-hidden="true"
      />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-white/70 flex items-center gap-2">
            {label}
            {viewOnly && (
              <span className="px-2 py-0.5 rounded-full bg-white/15 text-[10px] text-white">View only</span>
            )}
          </p>
          <p className="font-mono text-4xl font-bold tabular-nums mt-1 leading-none">{count}</p>
          {caption && <p className="text-xs text-white/70 mt-2">{caption}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {icon && onIconClick && (
            <button
              type="button"
              onClick={onIconClick}
              aria-label={iconLabel}
              className="w-11 h-11 rounded-full bg-white/12 border border-white/20 flex items-center justify-center text-white hover:bg-white/20 transition-colors"
            >
              {icon}
            </button>
          )}
          {onNew && (
            <button
              type="button"
              onClick={onNew}
              className="fin-btn-lime inline-flex items-center gap-1.5 px-4 h-11 text-sm"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              {newLabel}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------
   Segmented tabs
---------------------------------------------------------------- */

export function SegmentedTabs<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className = '',
}: {
  options: Array<{ value: T; label: string; count?: number; icon?: React.ReactNode }>;
  value: T;
  onChange: (v: T) => void;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div className={`segmented max-w-full overflow-x-auto scrollbar-none ${className}`} role="group" aria-label={ariaLabel}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          aria-pressed={value === opt.value}
          onClick={() => onChange(opt.value)}
          className="segmented-item"
        >
          {opt.icon}
          <span>{opt.label}</span>
          {opt.count !== undefined && (
            <span className="font-mono text-[11px] opacity-80 tabular-nums">{opt.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

/* ----------------------------------------------------------------
   KPI card (desktop strip)
---------------------------------------------------------------- */

export function KpiCard({
  icon,
  tone = 'brand',
  label,
  value,
  caption,
  to,
}: {
  icon: React.ReactNode;
  tone?: Tone;
  label: string;
  value: React.ReactNode;
  caption?: React.ReactNode;
  to?: string;
}) {
  const body = (
    <>
      <div className="flex items-center gap-3">
        <span
          className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
          style={toneStyle(tone)}
        >
          {icon}
        </span>
        <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--text-muted)] leading-tight">
          {label}
        </p>
      </div>
      <p className="mt-4 font-mono text-3xl font-bold tabular-nums text-[var(--text-heading)] leading-none">
        {value}
      </p>
      {caption && <p className="mt-2 text-xs text-[var(--text-muted)]">{caption}</p>}
    </>
  );
  return to ? (
    <Link to={to} className="fin-card-interactive p-5 block">
      {body}
    </Link>
  ) : (
    <div className="fin-card p-5">{body}</div>
  );
}

/* ----------------------------------------------------------------
   Progress bar
---------------------------------------------------------------- */

export function ProgressBar({ value, tone = 'brand' }: { value: number; tone?: Tone }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  const fill =
    tone === 'danger' ? 'var(--status-danger-fg)' : tone === 'success' ? 'var(--status-success-fg)' : 'var(--color-primary)';
  return (
    <div
      className="h-1.5 w-full rounded-full overflow-hidden"
      style={{ backgroundColor: 'var(--mint)' }}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
    >
      <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${pct}%`, backgroundColor: fill }} />
    </div>
  );
}

/* ----------------------------------------------------------------
   Mobile feed card
---------------------------------------------------------------- */

export function FeedCard({
  id,
  title,
  subtitle,
  meta,
  progress,
  progressTone,
  footerLeft,
  footerRight,
  actions,
  onOpen,
  openLabel,
  highlight,
}: {
  id: string;
  title: string;
  subtitle?: string;
  meta: Array<{ label: string; value: React.ReactNode }>;
  progress?: number;
  progressTone?: Tone;
  footerLeft?: React.ReactNode;
  footerRight?: React.ReactNode;
  actions?: React.ReactNode;
  onOpen?: () => void;
  openLabel?: string;
  highlight?: boolean;
}) {
  return (
    <article
      className="feed-card p-4"
      style={highlight ? { borderColor: 'color-mix(in srgb, var(--status-danger-fg) 45%, transparent)' } : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <button type="button" onClick={onOpen} className="min-w-0 text-left flex-1" aria-label={openLabel}>
          <p className="font-mono text-[11px] font-bold text-[var(--color-primary)] tracking-wide">{id}</p>
          <p className="font-display text-[15px] font-bold text-[var(--text-heading)] truncate mt-0.5">{title}</p>
          {subtitle && <p className="text-xs text-[var(--text-muted)] truncate mt-0.5">{subtitle}</p>}
        </button>
        {onOpen && (
          <button
            type="button"
            onClick={onOpen}
            aria-label={openLabel ?? `Open ${id}`}
            className="w-11 h-11 -mr-1 -mt-1 rounded-full flex items-center justify-center shrink-0"
            style={toneStyle('brand')}
          >
            <ArrowUpRight className="w-4 h-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {meta.length > 0 && (
        <dl className="grid grid-cols-3 gap-2 mt-3">
          {meta.map((m) => (
            <div key={m.label} className="min-w-0">
              <dt className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">{m.label}</dt>
              <dd className="text-xs font-semibold text-[var(--text-heading)] truncate mt-0.5">{m.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {progress !== undefined && (
        <div className="mt-3">
          <ProgressBar value={progress} tone={progressTone} />
        </div>
      )}

      {(footerLeft || footerRight) && (
        <div className="flex items-center justify-between gap-2 mt-3">
          <div className="text-[11px] text-[var(--text-muted)] font-mono tabular-nums truncate min-w-0">{footerLeft}</div>
          <div className="shrink-0">{footerRight}</div>
        </div>
      )}

      {actions && <div className="grid grid-cols-2 gap-2 mt-3 [&>*:only-child]:col-span-2">{actions}</div>}
    </article>
  );
}

/* ----------------------------------------------------------------
   Empty state
---------------------------------------------------------------- */

export function EmptyState({ icon, title, hint }: { icon?: React.ReactNode; title: string; hint?: string }) {
  return (
    <div className="py-10 px-4 text-center">
      {icon && (
        <div className="w-12 h-12 rounded-full mx-auto flex items-center justify-center mb-3" style={toneStyle('brand')}>
          {icon}
        </div>
      )}
      <p className="text-sm font-semibold text-[var(--text-heading)]">{title}</p>
      {hint && <p className="text-xs text-[var(--text-muted)] mt-1 max-w-xs mx-auto">{hint}</p>}
    </div>
  );
}

/* ----------------------------------------------------------------
   Confirmation dialog: bottom sheet on phones, centered from sm
---------------------------------------------------------------- */

export function ConfirmDialog({
  open,
  tone = 'primary',
  title,
  message,
  details = [],
  confirmLabel,
  busyLabel = 'Working...',
  onConfirm,
  onCancel,
}: {
  open: boolean;
  tone?: 'primary' | 'danger';
  title: string;
  message?: React.ReactNode;
  details?: React.ReactNode[];
  confirmLabel: string;
  busyLabel?: string;
  onConfirm: () => Promise<unknown> | unknown;
  onCancel: () => void;
}) {
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  const isDanger = tone === 'danger';
  const handleConfirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center fin-modal-backdrop sm:p-4 anim-fade"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div className="w-full sm:max-w-md bg-[var(--bg-surface)] rounded-t-3xl sm:rounded-2xl p-5 sm:p-6 pb-safe shadow-[var(--shadow-shell)] anim-pop">
        <div className="flex items-start gap-3.5">
          <span
            className="w-11 h-11 rounded-full flex items-center justify-center shrink-0"
            style={isDanger ? toneStyle('danger') : toneStyle('brand')}
          >
            {isDanger ? (
              <AlertTriangle className="w-5 h-5" aria-hidden="true" />
            ) : (
              <CheckCircle2 className="w-5 h-5" aria-hidden="true" />
            )}
          </span>
          <div className="min-w-0 pt-0.5">
            <h2 id="confirm-dialog-title" className="text-base font-bold text-[var(--text-heading)]">
              {title}
            </h2>
            {message && <div className="text-sm text-[var(--text-body)] mt-1">{message}</div>}
          </div>
        </div>

        {details.length > 0 && (
          <ul
            className="mt-4 rounded-xl p-3.5 space-y-1.5 text-xs text-[var(--text-body)] list-disc pl-7"
            style={{ backgroundColor: 'var(--bg-surface-muted)' }}
          >
            {details.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        )}

        <div className="grid grid-cols-2 gap-2.5 mt-5">
          <button type="button" onClick={onCancel} disabled={busy} className="fin-btn-secondary h-11 text-sm">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={busy}
            className={`h-11 text-sm inline-flex items-center justify-center gap-1.5 ${
              isDanger ? 'rounded-xl font-semibold text-white disabled:opacity-60' : 'fin-btn-primary'
            }`}
            style={isDanger ? { backgroundColor: '#E11D48' } : undefined}
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
            {busy ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
