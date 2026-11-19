import { CheckCircle2, Clock, FlaskConical, PackageCheck, XCircle, AlertTriangle, MinusCircle } from 'lucide-react';
import type { ApprovalStatus, CaseStatus } from '../types/lab';

export function SampleStatusBadge({ status }: { status: CaseStatus | string }) {
  const config: Record<string, { bg: string; fg: string; icon: React.ReactNode }> = {
    'No Sample': {
      bg: 'var(--status-neutral-bg)',
      fg: 'var(--text-muted)',
      icon: <MinusCircle className="w-3.5 h-3.5" aria-hidden="true" />,
    },
    Requested: {
      bg: 'var(--status-neutral-bg)',
      fg: 'var(--status-neutral-fg)',
      icon: <Clock className="w-3.5 h-3.5" aria-hidden="true" />,
    },
    Received: {
      bg: 'var(--status-info-bg)',
      fg: 'var(--status-info-fg)',
      icon: <PackageCheck className="w-3.5 h-3.5" aria-hidden="true" />,
    },
    Testing: {
      bg: 'var(--status-warning-bg)',
      fg: 'var(--status-warning-fg)',
      icon: <FlaskConical className="w-3.5 h-3.5" aria-hidden="true" />,
    },
    Completed: {
      bg: 'var(--status-success-bg)',
      fg: 'var(--status-success-fg)',
      icon: <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />,
    },
  };

  const matched = config[status] ?? config.Requested;
  return (
    <span
      style={{ backgroundColor: matched.bg, color: matched.fg }}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full whitespace-nowrap shrink-0"
    >
      {matched.icon}
      <span>{status}</span>
    </span>
  );
}

export function PassFailBadge({ passed }: { passed: boolean | null }) {
  if (passed === null) {
    return (
      <span
        style={{ backgroundColor: 'var(--status-neutral-bg)', color: 'var(--status-neutral-fg)' }}
        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-full whitespace-nowrap shrink-0"
      >
        Pending
      </span>
    );
  }
  if (passed) {
    return (
      <span
        style={{ backgroundColor: 'var(--status-success-bg)', color: 'var(--status-success-fg)' }}
        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-full whitespace-nowrap shrink-0"
      >
        <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
        <span>Pass</span>
      </span>
    );
  }
  return (
    <span
      style={{ backgroundColor: 'var(--status-danger-bg)', color: 'var(--status-danger-fg)' }}
      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-full whitespace-nowrap shrink-0"
    >
      <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
      <span>Fail</span>
    </span>
  );
}

export function ApprovalStatusBadge({ status }: { status: ApprovalStatus | string }) {
  const map: Record<string, { bg: string; fg: string; icon: React.ReactNode }> = {
    'Pending Approval': {
      bg: 'var(--status-warning-bg)',
      fg: 'var(--status-warning-fg)',
      icon: <Clock className="w-3.5 h-3.5" aria-hidden="true" />,
    },
    Approved: {
      bg: 'var(--status-success-bg)',
      fg: 'var(--status-success-fg)',
      icon: <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />,
    },
    'Revision Requested': {
      bg: 'var(--status-danger-bg)',
      fg: 'var(--status-danger-fg)',
      icon: <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />,
    },
  };
  const matched = map[status] ?? map['Pending Approval'];
  return (
    <span
      style={{ backgroundColor: matched.bg, color: matched.fg }}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full whitespace-nowrap shrink-0"
    >
      {matched.icon}
      <span>{status || 'Pending Approval'}</span>
    </span>
  );
}

export function OverdueChip({ delayDays }: { delayDays?: number | null }) {
  if (!delayDays || delayDays <= 0) return null;
  return (
    <span
      style={{
        backgroundColor: 'var(--status-danger-bg)',
        color: 'var(--status-danger-fg)',
      }}
      className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-bold rounded-full whitespace-nowrap shrink-0"
    >
      <AlertTriangle className="w-3 h-3" aria-hidden="true" />
      Overdue ({delayDays}d)
    </span>
  );
}

export function LossReasonText({ reason }: { reason: string }) {
  const normalized = (reason || 'other').trim().toLowerCase();
  const color =
    normalized === 'price'
      ? 'var(--status-warning-fg)'
      : normalized === 'quality'
        ? 'var(--status-danger-fg)'
        : normalized === 'delivery'
          ? 'var(--color-primary)'
          : 'var(--text-muted)';
  const label = reason ? reason.charAt(0).toUpperCase() + reason.slice(1) : 'Other';
  return (
    <span style={{ color }} className="text-xs font-semibold">
      {label}
    </span>
  );
}
