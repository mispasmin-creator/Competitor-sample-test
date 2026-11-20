import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  ClipboardList,
  Download,
  FileCheck2,
  FlaskConical,
  Inbox,
  Package,
  PackageCheck,
  Plus,
  Search,
  Send,
  Users,
} from 'lucide-react';
import { useLab } from '../context/LabContext';
import { canFullAccessPage, canViewPage } from '../utils/auth';
import { formatCurrency, formatDateTime, formatShortDate, parseAnyDate } from '../utils/fileHelpers';
import { getPendingCasesForStage, isCaseOverdue } from '../utils/labCalculations';
import { LossReasonText, OverdueChip, SampleStatusBadge } from '../components/StatusBadge';
import { Pagination } from '../components/Pagination';
import { CaseDetailModal } from '../components/CaseDetailModal';
import { EmptyState, FeedCard, getCaseProgress, KpiCard, toneStyle } from '../components/ui';
import type { LabCase } from '../types/lab';

const REASON_PALETTE = ['#E3A94A', '#D9707C', '#0D4F3C', '#4C9A7E', '#A3F046', '#94A3B8'];

function getReasonColor(reason: string, index: number): string {
  const lower = reason.trim().toLowerCase();
  if (lower === 'price') return '#E3A94A';
  if (lower === 'quality') return '#D9707C';
  if (lower === 'delivery') return '#0D4F3C';
  if (lower === 'other') return '#94A3B8';
  return REASON_PALETTE[index % REASON_PALETTE.length];
}

const PIPELINE = [
  { status: 'No Sample', label: 'No sample', color: '#CBD5E1' },
  { status: 'Requested', label: 'Requested', color: '#94D2B5' },
  { status: 'Received', label: 'Received', color: '#4C9A7E' },
  { status: 'Testing', label: 'Testing', color: '#E3A94A' },
  { status: 'Completed', label: 'Completed', color: '#0D4F3C' },
] as const;

const STAGE_EVENT_LABELS: Record<number, string> = {
  1: 'Lost order logged',
  2: 'Sample requested',
  3: 'Sample received',
  4: 'Lab testing completed',
  5: 'Manager sign-off',
};

const tooltipStyle = {
  backgroundColor: 'var(--bg-surface)',
  borderColor: 'var(--border-subtle)',
  borderRadius: '14px',
  color: 'var(--text-heading)',
  fontSize: '12px',
  boxShadow: 'var(--shadow-card)',
};

export function DashboardPage() {
  const { cases, masters, currentUser } = useLab();
  const navigate = useNavigate();
  const [orderSearch, setOrderSearch] = useState('');
  const [reasonFilter, setReasonFilter] = useState<string>('all');
  const [detailCase, setDetailCase] = useState<LabCase | null>(null);

  const canLogOrder = canFullAccessPage(currentUser, 'lostOrders');
  const canSeeOrders = canViewPage(currentUser, 'lostOrders');
  const canSeeSamples = canViewPage(currentUser, 'samples');
  const canSeeTests = canViewPage(currentUser, 'testEntry');

  const competitorMap = useMemo(
    () => new Map(masters.competitors.map((c) => [c.id, c.name])),
    [masters.competitors]
  );
  const compName = (c: LabCase) => competitorMap.get(c.competitorId) || c.competitorName || 'Unknown';

  /* ---------------- Metrics ---------------- */

  const metrics = useMemo(() => {
    const sampleCases = cases.filter((c) => c.status !== 'No Sample');
    const totalLostOrders = cases.length;
    const totalLostValue = cases.reduce((sum, c) => sum + (Number(c.orderValue) || 0), 0);
    const samplesPending = sampleCases.filter((c) => c.status === 'Requested' || c.status === 'Received').length;
    const testsInProgress = sampleCases.filter((c) => c.status === 'Testing').length;
    const reportsCompleted = sampleCases.filter((c) => c.status === 'Completed').length;
    const awaitingApproval = sampleCases.filter(
      (c) => c.status === 'Completed' && c.approvalStatus === 'Pending Approval'
    ).length;
    const totalSamples = sampleCases.length;
    const completionPct = totalSamples > 0 ? Math.round((reportsCompleted / totalSamples) * 1000) / 10 : 0;
    const overdue = cases.filter((c) => isCaseOverdue(c)).length;
    const avgTotalDelay =
      cases.length > 0
        ? Math.round((cases.reduce((sum, c) => sum + (Number(c.totalDelay) || 0), 0) / cases.length) * 10) / 10
        : 0;
    return {
      totalLostOrders,
      totalLostValue,
      samplesPending,
      testsInProgress,
      reportsCompleted,
      awaitingApproval,
      totalSamples,
      completionPct,
      overdue,
      avgTotalDelay,
    };
  }, [cases]);

  const stageCounts = useMemo(
    () => ({
      request: getPendingCasesForStage(cases, 2),
      receive: getPendingCasesForStage(cases, 3),
      test: getPendingCasesForStage(cases, 4),
      approve: getPendingCasesForStage(cases, 5),
    }),
    [cases]
  );

  const pipelineCounts = useMemo(
    () => PIPELINE.map((p) => ({ ...p, count: cases.filter((c) => c.status === p.status).length })),
    [cases]
  );

  /* ---------------- Charts ---------------- */

  const competitorChartData = useMemo(() => {
    const byName = new Map<string, { name: string; orders: number; value: number }>();
    masters.competitors.forEach((comp) => byName.set(comp.id, { name: comp.name, orders: 0, value: 0 }));
    cases.forEach((c) => {
      const key = c.competitorId || c.competitorName || 'unknown';
      const existing = byName.get(key) ?? { name: compName(c), orders: 0, value: 0 };
      existing.orders += 1;
      existing.value += Number(c.orderValue) || 0;
      byName.set(key, existing);
    });
    return Array.from(byName.values()).filter((e) => e.orders > 0 || masters.competitors.length <= 8);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [masters.competitors, cases, competitorMap]);

  const reasonChartData = useMemo(() => {
    const counts = new Map<string, { name: string; value: number }>();
    cases.forEach((c) => {
      const raw = (c.lossReason || 'Other').trim();
      const key = raw.toLowerCase();
      const existing = counts.get(key) ?? { name: raw.charAt(0).toUpperCase() + raw.slice(1), value: 0 };
      existing.value += 1;
      counts.set(key, existing);
    });
    return Array.from(counts.entries()).map(([key, entry], idx) => ({
      reason: key,
      name: entry.name,
      value: entry.value,
      color: getReasonColor(entry.name, idx),
    }));
  }, [cases]);

  const availableLossReasons = useMemo(() => {
    const seen = new Map<string, string>();
    for (const item of masters.lossReasons) if (item.value) seen.set(item.value.toLowerCase(), item.value);
    for (const c of cases) {
      if (c.lossReason && !seen.has(c.lossReason.toLowerCase())) seen.set(c.lossReason.toLowerCase(), c.lossReason);
    }
    return Array.from(seen.values());
  }, [masters.lossReasons, cases]);

  /* ---------------- Recent & activity ---------------- */

  const recentRecords = useMemo(() => cases.slice(0, 6), [cases]);

  const activityFeed = useMemo(() => {
    const events: Array<{ key: string; when: Date; raw: string; stage: number; labCase: LabCase }> = [];
    for (const c of cases) {
      for (let s = 1; s <= 5; s++) {
        const raw = c[`actual${s}` as keyof LabCase] as string | undefined;
        const when = parseAnyDate(raw);
        if (raw && when) events.push({ key: `${c.caseId}-${s}`, when, raw, stage: s, labCase: c });
      }
    }
    return events.sort((a, b) => b.when.getTime() - a.when.getTime()).slice(0, 6);
  }, [cases]);

  /* ---------------- Latest orders table ---------------- */

  const [orderPage, setOrderPage] = useState(1);
  const [orderPageSize, setOrderPageSize] = useState(10);

  const filteredLatestOrders = useMemo(() => {
    const q = orderSearch.trim().toLowerCase();
    return cases.filter((c) => {
      if (reasonFilter !== 'all' && (c.lossReason || '').trim().toLowerCase() !== reasonFilter.toLowerCase()) {
        return false;
      }
      if (!q) return true;
      return (
        c.caseId.toLowerCase().includes(q) ||
        c.customer.toLowerCase().includes(q) ||
        c.product.toLowerCase().includes(q) ||
        compName(c).toLowerCase().includes(q)
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cases, orderSearch, reasonFilter, competitorMap]);

  const paginatedLatestOrders = useMemo(() => {
    const start = (orderPage - 1) * orderPageSize;
    return filteredLatestOrders.slice(start, start + orderPageSize);
  }, [filteredLatestOrders, orderPage, orderPageSize]);

  const handleExportOrdersCsv = () => {
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const headers = ['Case ID', 'Date', 'Customer', 'Product', 'Competitor', 'Loss Reason', 'Value'];
    const rows = filteredLatestOrders.map((o) => [
      o.caseId,
      o.orderDate,
      esc(o.customer),
      esc(o.product),
      esc(compName(o)),
      o.lossReason || '',
      String(o.orderValue),
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'latest-lost-orders.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  /* ---------------- Mobile quick tiles ---------------- */

  const quickTiles = [
    canSeeOrders && { label: 'Orders', icon: ClipboardList, to: '/lost-orders', count: metrics.totalLostOrders },
    canSeeSamples && { label: 'Samples', icon: Package, to: '/samples', count: metrics.totalSamples },
    canSeeTests && { label: 'Tests', icon: FlaskConical, to: '/test-entry', count: stageCounts.test.length },
    canSeeOrders && { label: 'To request', icon: Send, to: '/lost-orders?pending=2', count: stageCounts.request.length },
    canSeeSamples && { label: 'To receive', icon: PackageCheck, to: '/samples?pending=3', count: stageCounts.receive.length },
    canSeeSamples && { label: 'Overdue', icon: AlertTriangle, to: '/samples', count: metrics.overdue },
    canSeeSamples && { label: 'Completed', icon: FileCheck2, to: '/samples', count: metrics.reportsCompleted },
    currentUser?.isAdmin && { label: 'Users', icon: Users, to: '/users' },
  ].filter(Boolean) as Array<{ label: string; icon: React.ComponentType<{ className?: string }>; to: string; count?: number }>;

  const firstName = currentUser?.name?.split(/\s+/)[0] || 'there';

  return (
    <div>
      {/* =========================== MOBILE =========================== */}
      <div className="md:hidden space-y-5">
        {/* Hero */}
        <section className="hero-emerald rounded-3xl p-5 pb-11 relative overflow-hidden" aria-label="Overview">
          <div
            className="absolute -right-14 -top-16 w-52 h-52 rounded-full pointer-events-none"
            style={{ background: 'radial-gradient(circle, rgba(163,240,70,0.22), transparent 70%)' }}
            aria-hidden="true"
          />
          <div className="relative flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white p-1.5 shrink-0">
              <img src="/image.png" alt="" className="w-full h-full object-contain" />
            </div>
            <div className="min-w-0">
              <p className="text-[13px] font-bold leading-tight truncate">Competitor Sample Lab</p>
              <p className="text-[11px] text-white/65 truncate">Hi {firstName}, welcome back</p>
            </div>
          </div>

          <p className="relative text-xs text-white/65 mt-6">Total lost deal value</p>
          <p className="relative font-mono text-4xl font-bold tabular-nums mt-1 leading-none">
            {formatCurrency(metrics.totalLostValue)}
          </p>
          <span className="relative inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 rounded-full bg-white/12 border border-white/15 text-xs font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-[#A3F046]" aria-hidden="true" />
            <span className="font-mono tabular-nums">{metrics.totalLostOrders}</span> lost orders ·{' '}
            <span className="font-mono tabular-nums">{metrics.completionPct}%</span> tested
          </span>

          <div className="relative grid grid-cols-2 gap-2.5 mt-5">
            <button
              type="button"
              onClick={() => navigate(canSeeSamples ? '/samples' : canSeeOrders ? '/lost-orders' : '/')}
              className="h-11 rounded-full bg-white/12 border border-white/20 text-sm font-semibold hover:bg-white/20 transition-colors"
            >
              {canSeeSamples ? 'View Samples' : 'View Orders'}
            </button>
            {canLogOrder ? (
              <button
                type="button"
                onClick={() => navigate('/lost-orders?new=1')}
                className="fin-btn-lime h-11 text-sm inline-flex items-center justify-center gap-1.5"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
                Log Order
              </button>
            ) : (
              <button
                type="button"
                onClick={() => navigate(canSeeTests ? '/test-entry' : '/')}
                className="fin-btn-lime h-11 text-sm"
              >
                {canSeeTests ? 'Test Queue' : 'Overview'}
              </button>
            )}
          </div>
        </section>

        {/* Overlapping quick categories */}
        {quickTiles.length > 0 && (
          <section className="-mt-11 mx-1 rounded-3xl bg-[var(--bg-surface)] p-4 shadow-[0_10px_30px_rgba(13,79,60,0.12)] relative" aria-label="Quick actions">
            <div className="grid grid-cols-4 gap-y-4 gap-x-2">
              {quickTiles.slice(0, 8).map((tile) => {
                const Icon = tile.icon;
                return (
                  <Link key={tile.label} to={tile.to} className="flex flex-col items-center gap-1.5 text-center min-h-[44px]">
                    <span className="relative w-12 h-12 rounded-full flex items-center justify-center" style={toneStyle('brand')}>
                      <Icon className="w-5 h-5" />
                      {tile.count !== undefined && tile.count > 0 && (
                        <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-[#0D4F3C] text-[#A3F046] text-[10px] font-mono font-bold flex items-center justify-center">
                          {tile.count > 99 ? '99+' : tile.count}
                        </span>
                      )}
                    </span>
                    <span className="text-[11px] font-semibold text-[var(--text-body)] leading-tight">{tile.label}</span>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* Recent feed */}
        <section aria-label="Recent records">
          <div className="flex items-center justify-between mb-3 px-1">
            <h2 className="font-display text-base font-bold text-[var(--text-heading)]">Recent Records</h2>
            {canSeeOrders && (
              <Link to="/lost-orders" className="text-sm font-semibold text-[var(--color-primary)] min-h-[44px] inline-flex items-center">
                View All
              </Link>
            )}
          </div>
          {recentRecords.length === 0 ? (
            <div className="feed-card">
              <EmptyState icon={<Inbox className="w-5 h-5" />} title="No lost orders yet" hint="Logged orders will appear here." />
            </div>
          ) : (
            <div className="space-y-3">
              {recentRecords.slice(0, 5).map((c) => (
                <FeedCard
                  key={c.caseId}
                  id={c.sampleCode ? `${c.caseId} · ${c.sampleCode}` : c.caseId}
                  title={c.customer}
                  subtitle={c.product}
                  onOpen={() => setDetailCase(c)}
                  openLabel={`Open ${c.caseId}`}
                  highlight={isCaseOverdue(c)}
                  meta={[
                    { label: 'Value', value: <span className="font-mono">{formatCurrency(c.orderValue)}</span> },
                    { label: 'Competitor', value: compName(c) },
                    { label: 'Reason', value: <LossReasonText reason={c.lossReason} /> },
                  ]}
                  progress={getCaseProgress(c)}
                  progressTone={isCaseOverdue(c) ? 'danger' : 'brand'}
                  footerLeft={formatShortDate(c.dateLost || c.orderDate)}
                  footerRight={<SampleStatusBadge status={c.status} />}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {/* =========================== DESKTOP =========================== */}
      <div className="hidden md:block space-y-6">
        {/* Header row */}
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
              Welcome back, {firstName}
            </p>
            <h1 className="font-display text-[clamp(1.5rem,2.2vw,2rem)] font-bold tracking-tight text-[var(--text-heading)] mt-1">
              Executive Overview
            </h1>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleExportOrdersCsv}
              disabled={filteredLatestOrders.length === 0}
              className="fin-btn-secondary inline-flex items-center gap-2 px-4 text-sm"
            >
              <Download className="w-4 h-4" aria-hidden="true" />
              Export CSV
            </button>
            {canLogOrder && (
              <button
                type="button"
                onClick={() => navigate('/lost-orders?new=1')}
                className="fin-btn-primary inline-flex items-center gap-2 px-4 text-sm"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
                Log Lost Order
              </button>
            )}
          </div>
        </div>

        {/* KPI strip */}
        <section aria-label="Key laboratory metrics" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <KpiCard
            icon={<ClipboardList className="w-5 h-5" />}
            label="Total Lost Orders"
            value={metrics.totalLostOrders}
            caption={<span className="font-mono">{formatCurrency(metrics.totalLostValue)} total deal value</span>}
            to={canSeeOrders ? '/lost-orders' : undefined}
          />
          <KpiCard
            icon={<Package className="w-5 h-5" />}
            tone="info"
            label="Samples Pending"
            value={metrics.samplesPending}
            caption="Requested or awaiting lab intake"
            to={canSeeSamples ? '/samples' : undefined}
          />
          <KpiCard
            icon={<FlaskConical className="w-5 h-5" />}
            tone="warning"
            label="Tests In Progress"
            value={metrics.testsInProgress}
            caption="Active bench measurements"
            to={canSeeTests ? '/test-entry' : undefined}
          />
          <KpiCard
            icon={<FileCheck2 className="w-5 h-5" />}
            tone="success"
            label="Reports Completed"
            value={metrics.reportsCompleted}
            caption={
              metrics.awaitingApproval > 0
                ? `${metrics.awaitingApproval} awaiting manager approval`
                : 'All completed reports reviewed'
            }
          />
        </section>

        {/* Pipeline breakdown */}
        <section className="fin-card p-6" aria-label="Sample pipeline breakdown">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-base font-bold text-[var(--text-heading)]">Sample Pipeline Breakdown</h2>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                Where every lost order sits today · avg delay{' '}
                <span className="font-mono font-semibold text-[var(--text-heading)]">{metrics.avgTotalDelay}d</span>
              </p>
            </div>
            {canSeeSamples && (
              <Link
                to="/samples"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--color-primary)] hover:underline whitespace-nowrap"
              >
                Open Full Directory
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </Link>
            )}
          </div>

          <div className="mt-5 h-3.5 w-full rounded-full overflow-hidden flex bg-[var(--mint)]" role="img" aria-label="Pipeline distribution">
            {cases.length > 0 &&
              pipelineCounts
                .filter((p) => p.count > 0)
                .map((p) => (
                  <div
                    key={p.status}
                    title={`${p.label}: ${p.count}`}
                    style={{ width: `${(p.count / cases.length) * 100}%`, backgroundColor: p.color }}
                    className="h-full first:rounded-l-full last:rounded-r-full border-r-2 border-white/70 last:border-r-0"
                  />
                ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-3">
            {pipelineCounts.map((p) => (
              <div key={p.status} className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }} aria-hidden="true" />
                <span className="text-xs text-[var(--text-muted)]">{p.label}</span>
                <span className="font-mono text-sm font-bold tabular-nums text-[var(--text-heading)]">{p.count}</span>
              </div>
            ))}
            <div className="flex items-center gap-2 ml-auto">
              {[
                { label: 'To request', n: stageCounts.request },
                { label: 'To receive', n: stageCounts.receive },
                { label: 'To test', n: stageCounts.test },
                { label: 'To approve', n: stageCounts.approve },
              ].map((s) => {
                const od = s.n.filter((c) => isCaseOverdue(c)).length;
                return (
                  <span
                    key={s.label}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold"
                    style={od > 0 ? toneStyle('danger') : toneStyle('neutral')}
                    title={od > 0 ? `${od} overdue` : undefined}
                  >
                    {s.label}
                    <span className="font-mono">{s.n.length}</span>
                  </span>
                );
              })}
            </div>
          </div>
        </section>

        {/* 7 / 5 split */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-7 fin-card p-6 flex flex-col">
            <div className="flex items-center justify-between gap-4 mb-3">
              <div>
                <h2 className="font-display text-base font-bold text-[var(--text-heading)]">Recent Records</h2>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">Latest lost orders and their sample status</p>
              </div>
              {canSeeOrders && (
                <Link to="/lost-orders" className="text-sm font-semibold text-[var(--color-primary)] hover:underline whitespace-nowrap">
                  View all
                </Link>
              )}
            </div>
            {recentRecords.length === 0 ? (
              <EmptyState icon={<Inbox className="w-5 h-5" />} title="No lost orders yet" />
            ) : (
              <ul className="space-y-1">
                {recentRecords.map((c) => (
                  <li key={c.caseId}>
                    <button
                      type="button"
                      onClick={() => setDetailCase(c)}
                      className="w-full text-left flex items-center gap-3.5 p-3 rounded-2xl hover:bg-white/65 dark:hover:bg-white/5 transition-colors"
                    >
                      <span className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={toneStyle('brand')}>
                        <FlaskConical className="w-4 h-4" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-[var(--color-primary)]">{c.caseId}</span>
                          <span className="text-sm font-semibold text-[var(--text-heading)] truncate">{c.customer}</span>
                          <OverdueChip delayDays={c.pendingDelay} />
                        </span>
                        <span className="block text-xs text-[var(--text-muted)] truncate mt-0.5">
                          {c.product} · {compName(c)} · {formatShortDate(c.dateLost || c.orderDate)}
                        </span>
                      </span>
                      <span className="font-mono text-sm font-bold tabular-nums text-[var(--text-heading)] hidden xl:inline">
                        {formatCurrency(c.orderValue)}
                      </span>
                      <SampleStatusBadge status={c.status} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="lg:col-span-5 fin-card p-6 flex flex-col">
            <h2 className="font-display text-base font-bold text-[var(--text-heading)]">Activity Feed</h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5 mb-4">Latest FMS stage completions</p>
            {activityFeed.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)] py-6 text-center flex-1">No activity recorded yet.</p>
            ) : (
              <ol className="space-y-3.5 flex-1">
                {activityFeed.map((ev) => (
                  <li key={ev.key} className="flex items-start gap-3">
                    <span
                      className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                      style={ev.stage === 5 ? toneStyle('success') : toneStyle('brand')}
                    >
                      <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                    </span>
                    <button type="button" onClick={() => setDetailCase(ev.labCase)} className="min-w-0 text-left">
                      <span className="block text-[13px] font-semibold text-[var(--text-heading)]">
                        {STAGE_EVENT_LABELS[ev.stage]}{' '}
                        <span className="font-mono text-[var(--color-primary)]">{ev.labCase.caseId}</span>
                      </span>
                      <span className="block text-xs text-[var(--text-muted)] truncate">
                        {ev.labCase.customer} · <span className="font-mono">{formatDateTime(ev.raw)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            )}

            {canSeeTests && (
              <div className="hero-emerald rounded-2xl p-4 mt-5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-2xl font-bold tabular-nums leading-none">{stageCounts.test.length}</p>
                  <p className="text-xs text-white/70 mt-1">samples waiting for bench testing</p>
                </div>
                <Link to="/test-entry" className="fin-btn-lime inline-flex items-center gap-1.5 px-4 h-10 text-sm shrink-0">
                  Open queue
                  <ArrowUpRight className="w-4 h-4" aria-hidden="true" />
                </Link>
              </div>
            )}
          </div>
        </section>

        {/* Analytics */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-7 fin-card p-6">
            <h2 className="font-display text-base font-bold text-[var(--text-heading)]">Losses by Competitor</h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5 mb-5">Order count and cumulative lost contract value</p>
            {competitorChartData.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-sm text-[var(--text-muted)]">
                No competitor data recorded yet.
              </div>
            ) : (
              <div className="h-64 w-full" data-testid="competitor-bar-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={competitorChartData} margin={{ top: 10, right: 4, left: -12, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 12, fill: 'var(--text-muted)' }}
                      axisLine={{ stroke: 'var(--border-subtle)' }}
                      tickLine={false}
                    />
                    <YAxis yAxisId="left" allowDecimals={false} tick={{ fontSize: 12, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      tickFormatter={(v) => `${Math.round(v / 1000)}k`}
                      tick={{ fontSize: 12, fill: 'var(--text-muted)' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      formatter={(value, name) =>
                        name === 'Lost Value'
                          ? [formatCurrency(Number(value ?? 0)), String(name)]
                          : [value ?? 0, String(name ?? '')]
                      }
                      contentStyle={tooltipStyle}
                      cursor={{ fill: 'rgba(13,79,60,0.05)' }}
                    />
                    <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />
                    <Bar yAxisId="left" dataKey="orders" name="Lost Orders" fill="var(--chart-1)" radius={[8, 8, 0, 0]} maxBarSize={32} isAnimationActive={false} />
                    <Bar yAxisId="right" dataKey="value" name="Lost Value" fill="var(--chart-3)" radius={[8, 8, 0, 0]} maxBarSize={32} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="lg:col-span-5 fin-card p-6 flex flex-col">
            <h2 className="font-display text-base font-bold text-[var(--text-heading)]">Loss Reasons</h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5 mb-4">Commercial &amp; technical drivers</p>
            {reasonChartData.length === 0 ? (
              <div className="flex-1 min-h-56 flex items-center justify-center text-sm text-[var(--text-muted)]">
                No lost orders logged.
              </div>
            ) : (
              <div className="flex-1 flex flex-col xl:flex-row items-center gap-5">
                <div className="w-full xl:w-48 h-52 shrink-0" data-testid="loss-reason-pie-chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={reasonChartData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={52}
                        outerRadius={80}
                        paddingAngle={3}
                        stroke="none"
                        isAnimationActive={false}
                      >
                        {reasonChartData.map((entry) => (
                          <Cell key={entry.reason} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="w-full space-y-2">
                  {reasonChartData.map((item) => {
                    const pct = metrics.totalLostOrders > 0 ? Math.round((item.value / metrics.totalLostOrders) * 100) : 0;
                    return (
                      <div
                        key={item.reason}
                        className="flex items-center justify-between text-xs pb-2 border-b border-[var(--border-subtle)] last:border-b-0"
                      >
                        <span className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} aria-hidden="true" />
                          <span className="font-medium text-[var(--text-body)]">{item.name}</span>
                        </span>
                        <span className="font-mono tabular-nums text-[var(--text-heading)] font-semibold">
                          {item.value} ({pct}%)
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Latest lost orders */}
        <section className="fin-card p-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-5">
            <div>
              <h2 className="font-display text-base font-bold text-[var(--text-heading)]">Latest Lost Orders</h2>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">Recent commercial losses linked to competitor benchmarks</p>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="relative">
                <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
                <input
                  type="search"
                  value={orderSearch}
                  onChange={(e) => {
                    setOrderSearch(e.target.value);
                    setOrderPage(1);
                  }}
                  placeholder="Search orders..."
                  aria-label="Search latest lost orders"
                  className="fin-input pl-10 pr-3.5 w-56"
                />
              </div>
              <select
                value={reasonFilter}
                onChange={(e) => {
                  setReasonFilter(e.target.value);
                  setOrderPage(1);
                }}
                aria-label="Filter latest lost orders by reason"
                className="fin-input px-3"
              >
                <option value="all">All Reasons</option>
                {availableLossReasons.map((reason) => (
                  <option key={reason} value={reason}>
                    {reason}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="fin-table-wrap">
            <table className="fin-table min-w-[760px] w-full text-left">
              <thead>
                <tr className="fin-table-head text-[11px] uppercase">
                  <th className="py-3 px-4 rounded-l-xl whitespace-nowrap">Case ID</th>
                  <th className="py-3 px-4 whitespace-nowrap">Date</th>
                  <th className="py-3 px-4 whitespace-nowrap">Customer &amp; Product</th>
                  <th className="py-3 px-4 whitespace-nowrap">Competitor</th>
                  <th className="py-3 px-4 whitespace-nowrap">Loss Reason</th>
                  <th className="py-3 px-4 whitespace-nowrap">Sample Status</th>
                  <th className="py-3 px-4 rounded-r-xl text-right whitespace-nowrap">Order Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)] text-sm">
                {filteredLatestOrders.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-xs text-[var(--text-muted)]">
                      {cases.length === 0 ? 'No lost orders logged yet.' : 'No lost orders match your search or filter.'}
                    </td>
                  </tr>
                ) : (
                  paginatedLatestOrders.map((order) => (
                    <tr key={order.caseId} className="fin-table-row cursor-pointer" onClick={() => setDetailCase(order)}>
                      <td className="py-3.5 px-4 font-mono text-xs font-bold text-[var(--color-primary)] whitespace-nowrap">
                        {order.caseId}
                      </td>
                      <td className="py-3.5 px-4 text-xs font-mono text-[var(--text-muted)] whitespace-nowrap">
                        {formatShortDate(order.orderDate)}
                      </td>
                      <td className="py-3.5 px-4">
                        <p className="font-semibold text-[var(--text-heading)] text-[13px]">{order.customer}</p>
                        <p className="text-xs text-[var(--text-muted)] truncate max-w-xs">{order.product}</p>
                      </td>
                      <td className="py-3.5 px-4 text-[13px] text-[var(--text-body)] whitespace-nowrap">{compName(order)}</td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <LossReasonText reason={order.lossReason} />
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5">
                          <SampleStatusBadge status={order.status} />
                          <OverdueChip delayDays={order.pendingDelay} />
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums text-[13px] font-bold text-[var(--text-heading)] whitespace-nowrap">
                        {formatCurrency(order.orderValue)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <Pagination
            currentPage={orderPage}
            totalItems={filteredLatestOrders.length}
            pageSize={orderPageSize}
            onPageChange={setOrderPage}
            onPageSizeChange={setOrderPageSize}
          />
        </section>
      </div>

      <CaseDetailModal labCase={detailCase} onClose={() => setDetailCase(null)} />
    </div>
  );
}
