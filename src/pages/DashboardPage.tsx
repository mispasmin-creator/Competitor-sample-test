import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
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
  ClipboardList,
  Clock,
  Download,
  Eye,
  FileCheck2,
  FlaskConical,
  Package,
  Search,
} from 'lucide-react';
import { useLab } from '../context/LabContext';
import { formatCurrency, formatShortDate } from '../utils/fileHelpers';
import { getPendingCasesForStage, isCaseOverdue } from '../utils/labCalculations';
import { LossReasonText, OverdueChip, SampleStatusBadge } from '../components/StatusBadge';
import { Pagination } from '../components/Pagination';

const REASON_PALETTE = ['#E3A94A', '#D9707C', '#1F6B7F', '#5FA3B5', '#A8CBD6', '#1F8F6B'];

function getReasonColor(reason: string, index: number): string {
  const lower = reason.trim().toLowerCase();
  if (lower === 'price') return '#E3A94A';
  if (lower === 'quality') return '#D9707C';
  if (lower === 'delivery') return '#1F6B7F';
  if (lower === 'other') return '#A8CBD6';
  return REASON_PALETTE[index % REASON_PALETTE.length];
}

export function DashboardPage() {
  const { cases, masters } = useLab();
  const [orderSearch, setOrderSearch] = useState('');
  const [reasonFilter, setReasonFilter] = useState<string>('all');

  const competitorMap = useMemo(
    () => new Map(masters.competitors.map((c) => [c.id, c.name])),
    [masters.competitors]
  );

  const metrics = useMemo(() => {
    const sampleCases = cases.filter((c) => c.status !== 'No Sample');
    const totalLostOrders = cases.length;
    const totalLostValue = cases.reduce((sum, c) => sum + (Number(c.orderValue) || 0), 0);
    const samplesPending = sampleCases.filter(
      (c) => c.status === 'Requested' || c.status === 'Received'
    ).length;
    const testsInProgress = sampleCases.filter((c) => c.status === 'Testing').length;
    const reportsCompleted = sampleCases.filter((c) => c.status === 'Completed').length;
    const awaitingApproval = sampleCases.filter(
      (c) => c.status === 'Completed' && c.approvalStatus === 'Pending Approval'
    ).length;
    const totalSamples = sampleCases.length;
    const completionPct =
      totalSamples > 0 ? Math.round((reportsCompleted / totalSamples) * 1000) / 10 : 0;

    const avgTotalDelay =
      cases.length > 0
        ? Math.round(
            (cases.reduce((sum, c) => sum + (Number(c.totalDelay) || 0), 0) / cases.length) * 10
          ) / 10
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
      avgTotalDelay,
    };
  }, [cases]);

  const pendingStageCards = useMemo(() => {
    const stages = [
      { stageNo: 2, label: 'Sample Request Pending', path: '/lost-orders?pending=2' },
      { stageNo: 3, label: 'Receive Pending', path: '/samples?pending=3' },
      { stageNo: 4, label: 'Test Pending', path: '/test-entry' },
      { stageNo: 5, label: 'Approval Pending', path: '/reports?pending=5' },
    ];
    return stages.map((st) => {
      const stageCases = getPendingCasesForStage(cases, st.stageNo);
      const overdueCount = stageCases.filter((c) => isCaseOverdue(c)).length;
      return {
        ...st,
        count: stageCases.length,
        overdueCount,
      };
    });
  }, [cases]);

  const gaugeData = useMemo(
    () => [
      { name: 'Completed', value: metrics.completionPct },
      { name: 'Remaining', value: Math.max(0, 100 - metrics.completionPct) },
    ],
    [metrics.completionPct]
  );

  const competitorChartData = useMemo(() => {
    const byName = new Map<string, { name: string; orders: number; value: number }>();

    masters.competitors.forEach((comp) => {
      byName.set(comp.id, { name: comp.name, orders: 0, value: 0 });
    });

    cases.forEach((c) => {
      const key = c.competitorId || c.competitorName || 'unknown';
      const label = competitorMap.get(c.competitorId) || c.competitorName || 'Unknown';
      const existing = byName.get(key) ?? { name: label, orders: 0, value: 0 };
      existing.orders += 1;
      existing.value += Number(c.orderValue) || 0;
      byName.set(key, existing);
    });

    return Array.from(byName.values()).filter((entry) => entry.orders > 0 || masters.competitors.length <= 8);
  }, [masters.competitors, cases, competitorMap]);

  const availableLossReasons = useMemo(() => {
    const seen = new Map<string, string>();
    for (const item of masters.lossReasons) {
      if (item.value) seen.set(item.value.toLowerCase(), item.value);
    }
    for (const c of cases) {
      if (c.lossReason && !seen.has(c.lossReason.toLowerCase())) {
        seen.set(c.lossReason.toLowerCase(), c.lossReason);
      }
    }
    return Array.from(seen.values());
  }, [masters.lossReasons, cases]);

  const reasonChartData = useMemo(() => {
    const counts = new Map<string, { name: string; value: number }>();
    cases.forEach((c) => {
      const raw = (c.lossReason || 'Other').trim();
      const key = raw.toLowerCase();
      const existing = counts.get(key) ?? {
        name: raw.charAt(0).toUpperCase() + raw.slice(1),
        value: 0,
      };
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

  const recentSamples = useMemo(
    () => cases.filter((c) => c.status !== 'No Sample').slice(0, 5),
    [cases]
  );

  const [orderPage, setOrderPage] = useState(1);
  const [orderPageSize, setOrderPageSize] = useState(10);

  const filteredLatestOrders = useMemo(() => {
    const q = orderSearch.trim().toLowerCase();
    return cases.filter((c) => {
      if (
        reasonFilter !== 'all' &&
        (c.lossReason || '').trim().toLowerCase() !== reasonFilter.toLowerCase()
      ) {
        return false;
      }
      if (!q) return true;
      const comp = (competitorMap.get(c.competitorId) || c.competitorName || '').toLowerCase();
      return (
        c.caseId.toLowerCase().includes(q) ||
        c.customer.toLowerCase().includes(q) ||
        c.product.toLowerCase().includes(q) ||
        comp.includes(q)
      );
    });
  }, [cases, orderSearch, reasonFilter, competitorMap]);

  const paginatedLatestOrders = useMemo(() => {
    const start = (orderPage - 1) * orderPageSize;
    return filteredLatestOrders.slice(start, start + orderPageSize);
  }, [filteredLatestOrders, orderPage, orderPageSize]);

  const handleExportOrdersCsv = () => {
    const headers = ['Case ID', 'Date', 'Customer', 'Product', 'Competitor', 'Loss Reason', 'Value'];
    const rows = filteredLatestOrders.map((o) => [
      o.caseId,
      o.orderDate,
      `"${o.customer.replace(/"/g, '""')}"`,
      `"${o.product.replace(/"/g, '""')}"`,
      `"${(competitorMap.get(o.competitorId) || o.competitorName || '').replace(/"/g, '""')}"`,
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

  return (
    <div className="space-y-6">
      {/* KPI Bento Strip */}
      <section
        aria-label="Key laboratory metrics"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5"
      >
        <Link to="/lost-orders" className="fin-card-interactive p-5 block">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-[var(--text-muted)]">Total Lost Orders</p>
              <p className="mt-2.5 text-3xl font-bold font-mono tabular-nums text-[var(--text-heading)]">
                {metrics.totalLostOrders}
              </p>
            </div>
            <div
              className="w-10 h-10 rounded-[12px] flex items-center justify-center shrink-0"
              style={{
                backgroundColor: 'var(--color-primary-soft)',
                color: 'var(--color-primary)',
              }}
            >
              <ClipboardList className="w-5 h-5" aria-hidden="true" />
            </div>
          </div>
          <p className="mt-2.5 text-xs text-[var(--text-muted)] font-mono tabular-nums">
            {formatCurrency(metrics.totalLostValue)} total deal value
          </p>
        </Link>

        <Link to="/samples" className="fin-card-interactive p-5 block">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-[var(--text-muted)]">Samples Pending</p>
              <p className="mt-2.5 text-3xl font-bold font-mono tabular-nums text-[var(--text-heading)]">
                {metrics.samplesPending}
              </p>
            </div>
            <div
              className="w-10 h-10 rounded-[12px] flex items-center justify-center shrink-0"
              style={{
                backgroundColor: 'var(--status-info-bg)',
                color: 'var(--status-info-fg)',
              }}
            >
              <Package className="w-5 h-5" aria-hidden="true" />
            </div>
          </div>
          <p className="mt-2.5 text-xs text-[var(--text-muted)]">
            Requested or awaiting lab intake
          </p>
        </Link>

        <Link to="/test-entry" className="fin-card-interactive p-5 block">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-[var(--text-muted)]">Tests In Progress</p>
              <p
                className="mt-2.5 text-3xl font-bold font-mono tabular-nums"
                style={{ color: 'var(--status-warning-fg)' }}
              >
                {metrics.testsInProgress}
              </p>
            </div>
            <div
              className="w-10 h-10 rounded-[12px] flex items-center justify-center shrink-0"
              style={{
                backgroundColor: 'var(--status-warning-bg)',
                color: 'var(--status-warning-fg)',
              }}
            >
              <FlaskConical className="w-5 h-5" aria-hidden="true" />
            </div>
          </div>
          <p className="mt-2.5 text-xs text-[var(--text-muted)]">Active bench measurements</p>
        </Link>

        <Link to="/reports" className="fin-card-interactive p-5 block">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-[var(--text-muted)]">Reports Completed</p>
              <p
                className="mt-2.5 text-3xl font-bold font-mono tabular-nums"
                style={{ color: 'var(--status-success-fg)' }}
              >
                {metrics.reportsCompleted}
              </p>
            </div>
            <div
              className="w-10 h-10 rounded-[12px] flex items-center justify-center shrink-0"
              style={{
                backgroundColor: 'var(--status-success-bg)',
                color: 'var(--status-success-fg)',
              }}
            >
              <FileCheck2 className="w-5 h-5" aria-hidden="true" />
            </div>
          </div>
          <p className="mt-2.5 text-xs text-[var(--text-muted)]">
            {metrics.awaitingApproval > 0
              ? `${metrics.awaitingApproval} awaiting manager approval`
              : 'All completed reports reviewed'}
          </p>
        </Link>
      </section>

      {/* Pending FMS Stages & Average Delay Strip */}
      <section aria-label="Pending stage SLA queues" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {pendingStageCards.map((st) => (
          <Link key={st.stageNo} to={st.path} className="fin-card-interactive p-4 block">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-[var(--text-muted)]">
                Stage {st.stageNo}
              </span>
              {st.overdueCount > 0 && (
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full"
                  style={{
                    backgroundColor: 'var(--status-danger-bg)',
                    color: 'var(--status-danger-fg)',
                  }}
                >
                  <AlertTriangle className="w-3 h-3" aria-hidden="true" />
                  {st.overdueCount} overdue
                </span>
              )}
            </div>
            <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-[var(--text-heading)]">
              {st.count}
            </p>
            <p className="mt-1 text-xs font-semibold text-[var(--text-body)] truncate">{st.label}</p>
          </Link>
        ))}

        <div className="fin-card p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold text-[var(--text-muted)]">SLA Health</span>
            <Clock className="w-4 h-4 text-[var(--color-primary)]" aria-hidden="true" />
          </div>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-[var(--color-primary)]">
            {metrics.avgTotalDelay}d
          </p>
          <p className="mt-1 text-xs font-semibold text-[var(--text-body)]">Avg Total Delay</p>
        </div>
      </section>

      {/* Bento Row 1: Losses by Competitor + Tests Completed Gauge */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-7 fin-card p-6">
          <div className="flex items-center justify-between gap-4 mb-5">
            <div>
              <h2 className="text-base font-bold text-[var(--text-heading)]">
                Losses by Competitor
              </h2>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                Order count and cumulative lost contract value
              </p>
            </div>
            <Link
              to="/competitors"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--color-primary)] hover:text-[var(--color-primary-dark)] whitespace-nowrap"
            >
              View Competitors
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </Link>
          </div>

          {competitorChartData.length === 0 ? (
            <div className="h-56 sm:h-64 flex items-center justify-center text-sm text-[var(--text-muted)]">
              No competitor data recorded yet.
            </div>
          ) : (
            <div className="h-56 sm:h-64 w-full" data-testid="competitor-bar-chart">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={competitorChartData}
                  margin={{ top: 10, right: 4, left: -12, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 12, fill: 'var(--text-muted)' }}
                    axisLine={{ stroke: 'var(--border-subtle)' }}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="left"
                    allowDecimals={false}
                    tick={{ fontSize: 12, fill: 'var(--text-muted)' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tickFormatter={(v) => `$${Math.round(v / 1000)}k`}
                    tick={{ fontSize: 12, fill: 'var(--text-muted)' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    formatter={(value, name) =>
                      name === 'Lost Value ($)'
                        ? [formatCurrency(Number(value ?? 0)), String(name)]
                        : [value ?? 0, String(name ?? '')]
                    }
                    contentStyle={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-subtle)',
                      borderRadius: '14px',
                      color: 'var(--text-heading)',
                      fontSize: '12px',
                      boxShadow: 'var(--shadow-card)',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />
                  <Bar
                    yAxisId="left"
                    dataKey="orders"
                    name="Lost Orders"
                    fill="var(--chart-1)"
                    radius={[8, 8, 0, 0]}
                    maxBarSize={36}
                    isAnimationActive={false}
                  />
                  <Bar
                    yAxisId="right"
                    dataKey="value"
                    name="Lost Value ($)"
                    fill="var(--chart-2)"
                    radius={[8, 8, 0, 0]}
                    maxBarSize={36}
                    isAnimationActive={false}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Semi-circular Gauge Card */}
        <div className="lg:col-span-5 fin-card p-6 flex flex-col justify-between">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-[var(--text-heading)]">
                Tests Completed %
              </h2>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                Lab pipeline completion ratio
              </p>
            </div>
            <Link
              to="/reports"
              className="text-xs font-semibold text-[var(--color-primary)] hover:text-[var(--color-primary-dark)]"
            >
              Reports
            </Link>
          </div>

          <div className="relative h-52 w-full flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={gaugeData}
                  dataKey="value"
                  cx="50%"
                  cy="76%"
                  startAngle={180}
                  endAngle={0}
                  innerRadius={72}
                  outerRadius={98}
                  stroke="none"
                  cornerRadius={8}
                  isAnimationActive={false}
                >
                  <Cell fill="var(--chart-1)" />
                  <Cell fill="var(--border-subtle)" />
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-x-0 bottom-7 text-center pointer-events-none">
              <p className="text-3xl font-bold font-mono tabular-nums text-[var(--text-heading)]">
                {metrics.completionPct}%
              </p>
              <p className="text-xs font-semibold text-[var(--color-primary)] mt-1">
                {metrics.totalSamples === 0
                  ? 'No Active Samples'
                  : metrics.completionPct >= 75
                    ? 'High Throughput'
                    : 'Active Pipeline'}
              </p>
            </div>
          </div>

          <div className="flex justify-center">
            <div
              className="px-4 py-2 rounded-[12px] text-xs font-medium text-[var(--text-body)] font-mono tabular-nums"
              style={{ backgroundColor: 'var(--bg-surface-muted)' }}
            >
              Completed:{' '}
              <span className="font-bold text-[var(--color-primary)]">
                {metrics.reportsCompleted} / {metrics.totalSamples}
              </span>{' '}
              samples
            </div>
          </div>
        </div>
      </section>

      {/* Bento Row 2: Loss Reasons Donut + Recent Samples */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-5 fin-card p-6 flex flex-col">
          <div className="mb-4">
            <h2 className="text-base font-bold text-[var(--text-heading)]">
              Loss Reasons Breakdown
            </h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Distribution across commercial &amp; technical drivers
            </p>
          </div>

          {reasonChartData.length === 0 ? (
            <div className="flex-1 min-h-56 flex items-center justify-center text-sm text-[var(--text-muted)]">
              No lost orders logged.
            </div>
          ) : (
            <div className="flex-1 flex flex-col sm:flex-row lg:flex-col xl:flex-row items-center gap-5">
              <div className="w-full sm:w-52 h-56 shrink-0" data-testid="loss-reason-pie-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={reasonChartData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={52}
                      outerRadius={82}
                      paddingAngle={3}
                      stroke="none"
                      isAnimationActive={false}
                    >
                      {reasonChartData.map((entry) => (
                        <Cell key={entry.reason} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--border-subtle)',
                        borderRadius: '14px',
                        color: 'var(--text-heading)',
                        fontSize: '12px',
                        boxShadow: 'var(--shadow-card)',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="w-full sm:w-44 lg:w-full xl:w-44 space-y-2.5 shrink-0">
                {reasonChartData.map((item) => {
                  const pct =
                    metrics.totalLostOrders > 0
                      ? Math.round((item.value / metrics.totalLostOrders) * 100)
                      : 0;
                  return (
                    <div
                      key={item.reason}
                      className="flex items-center justify-between text-xs pb-2 border-b border-[var(--border-subtle)] last:border-b-0"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: item.color }}
                          aria-hidden="true"
                        />
                        <span className="font-medium text-[var(--text-body)]">{item.name}</span>
                      </div>
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

        {/* Recent Samples List Card */}
        <div className="lg:col-span-7 fin-card p-6 flex flex-col">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <h2 className="text-base font-bold text-[var(--text-heading)]">Recent Samples</h2>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                Latest laboratory queue &amp; custody milestones
              </p>
            </div>
            <Link
              to="/samples"
              className="text-xs font-semibold text-[var(--color-primary)] hover:text-[var(--color-primary-dark)] whitespace-nowrap"
            >
              Open Pipeline
            </Link>
          </div>

          {recentSamples.length === 0 ? (
            <div className="flex-1 min-h-56 flex items-center justify-center text-xs text-[var(--text-muted)] text-center px-4">
              No samples in queue yet. Request a sample from Lost Orders or Samples.
            </div>
          ) : (
            <div className="space-y-2">
              {recentSamples.map((sample) => (
                <div
                  key={sample.caseId}
                  className="flex items-center justify-between gap-4 p-3 rounded-[14px] hover:bg-[var(--bg-row-hover)] transition-colors"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div
                      className="w-10 h-10 rounded-[12px] flex items-center justify-center shrink-0"
                      style={{
                        backgroundColor: 'var(--color-primary-soft)',
                        color: 'var(--color-primary)',
                      }}
                    >
                      <FlaskConical className="w-4 h-4" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-xs flex-wrap">
                        <span className="font-mono font-bold text-[var(--text-heading)] whitespace-nowrap shrink-0">
                          {sample.sampleCode || sample.caseId}
                        </span>
                        <span className="text-[var(--text-muted)] truncate">
                          {sample.sampleName || sample.product}
                        </span>
                        <OverdueChip delayDays={sample.pendingDelay} />
                      </div>
                      <p className="text-[11px] text-[var(--text-muted)] truncate mt-0.5">
                        {competitorMap.get(sample.competitorId) || sample.competitorName || 'Unknown'} ·{' '}
                        {sample.customer} · {formatShortDate(sample.actual2 || sample.expectedDate || sample.orderDate)}
                      </p>
                    </div>
                  </div>
                  <SampleStatusBadge status={sample.status} />
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Bottom Full-Width Table Card: Latest Lost Orders */}
      <section className="fin-card p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5">
          <div>
            <h2 className="text-base font-bold text-[var(--text-heading)]">Latest Lost Orders</h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Recent commercial losses linked to competitor benchmarks
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative">
              <Search
                className="w-4 h-4 text-[var(--text-muted)] absolute left-3.5 top-1/2 -translate-y-1/2"
                aria-hidden="true"
              />
              <input
                type="search"
                value={orderSearch}
                onChange={(e) => setOrderSearch(e.target.value)}
                placeholder="Search orders..."
                aria-label="Search latest lost orders"
                className="fin-input pl-9 pr-3.5 text-xs w-full sm:w-48"
              />
            </div>

            <select
              value={reasonFilter}
              onChange={(e) => setReasonFilter(e.target.value)}
              aria-label="Filter latest lost orders by reason"
              className="fin-input px-3 text-xs"
            >
              <option value="all">All Reasons</option>
              {availableLossReasons.map((reason) => (
                <option key={reason} value={reason}>
                  {reason}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={handleExportOrdersCsv}
              disabled={filteredLatestOrders.length === 0}
              className="fin-btn-secondary inline-flex items-center gap-1.5 px-3.5 h-[42px] text-xs"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              Export
            </button>

            <Link
              to="/lost-orders"
              className="fin-btn-primary inline-flex items-center gap-1.5 px-4 h-[42px] text-xs w-full sm:w-auto justify-center"
            >
              View All Orders
            </Link>
          </div>
        </div>

        <div className="overflow-x-auto">
          <div className="fin-table-wrap">
            <table className="fin-table min-w-[700px] w-full text-left border-collapse">
              <thead>
                <tr className="fin-table-head text-[11px] font-semibold uppercase tracking-wider">
                  <th className="py-3 px-4 rounded-l-[12px] text-left whitespace-nowrap">Actions</th>
                  <th className="py-3 px-4 text-left whitespace-nowrap">Case ID</th>
                  <th className="py-3 px-4 text-left whitespace-nowrap">Date</th>
                  <th className="py-3 px-4 text-left whitespace-nowrap">Customer &amp; Product</th>
                  <th className="py-3 px-4 text-left whitespace-nowrap">Competitor</th>
                  <th className="py-3 px-4 text-left whitespace-nowrap">Loss Reason</th>
                  <th className="py-3 px-4 text-left whitespace-nowrap">Sample Status</th>
                  <th className="py-3 px-4 rounded-r-[12px] text-right whitespace-nowrap">Order Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)] text-sm">
                {filteredLatestOrders.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-xs text-[var(--text-muted)]">
                      {cases.length === 0 ? 'No lost orders logged yet.' : 'No lost orders match your search or filter.'}
                    </td>
                  </tr>
                ) : (
                  paginatedLatestOrders.map((order) => (
                    <tr key={order.caseId} className="fin-table-row transition-colors">
                      <td className="py-3.5 px-4 rounded-l-[12px] whitespace-nowrap align-middle">
                        <Link
                          to={`/lost-orders?pending=2`}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg border border-[var(--border-subtle)] bg-[var(--color-surface)] text-[var(--text-body)] hover:text-[var(--color-primary)] hover:border-[var(--color-primary)] transition-all"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>View</span>
                        </Link>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-xs font-bold text-[var(--text-heading)] whitespace-nowrap align-middle">
                        {order.caseId}
                      </td>
                      <td className="py-3.5 px-4 text-xs font-mono text-[var(--text-muted)] whitespace-nowrap align-middle">
                        {formatShortDate(order.orderDate)}
                      </td>
                      <td className="py-3.5 px-4 align-middle">
                        <p className="font-semibold text-[var(--text-heading)] text-xs">
                          {order.customer}
                        </p>
                        <p className="text-[11px] text-[var(--text-muted)] truncate max-w-xs">
                          {order.product}
                        </p>
                      </td>
                      <td className="py-3.5 px-4 text-xs text-[var(--text-body)] whitespace-nowrap align-middle">
                        {competitorMap.get(order.competitorId) || order.competitorName || 'Unknown'}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap align-middle">
                        <LossReasonText reason={order.lossReason} />
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap align-middle">
                        <div className="inline-flex items-center gap-1.5">
                          <SampleStatusBadge status={order.status} />
                          <OverdueChip delayDays={order.pendingDelay} />
                        </div>
                      </td>
                      <td className="py-3.5 px-4 rounded-r-[12px] text-right font-mono tabular-nums text-xs font-bold text-[var(--text-heading)] whitespace-nowrap align-middle">
                        {formatCurrency(order.orderValue)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
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
  );
}
