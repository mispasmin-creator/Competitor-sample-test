import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { FileText } from 'lucide-react';
import { useLab } from '../context/LabContext';
import { canViewPage } from '../utils/auth';
import { buildComparisonRows, computeSampleSummary } from '../utils/labCalculations';
import { PassFailBadge, SampleStatusBadge } from '../components/StatusBadge';

export function ComparisonPage() {
  const { cases, masters, currentUser } = useLab();
  const canViewReports = canViewPage(currentUser, 'reports');
  const [searchParams, setSearchParams] = useSearchParams();

  // Only show Completed samples
  const completedCases = useMemo(
    () => cases.filter((c) => c.status === 'Completed'),
    [cases]
  );

  const defaultCaseId = useMemo(() => {
    const paramId = searchParams.get('sample');
    if (paramId) {
      const found = completedCases.find(
        (c) => c.caseId === paramId || c.sampleCode === paramId
      );
      if (found) return found.caseId;
    }
    return completedCases[0]?.caseId ?? '';
  }, [searchParams, completedCases]);

  const [selectedCaseId, setSelectedCaseId] = useState(defaultCaseId);
  const [chartType, setChartType] = useState<'radar' | 'bar'>('radar');

  useEffect(() => {
    const paramId = searchParams.get('sample');
    if (paramId) {
      const found = completedCases.find(
        (c) => c.caseId === paramId || c.sampleCode === paramId
      );
      if (found && found.caseId !== selectedCaseId) {
        setSelectedCaseId(found.caseId);
        return;
      }
    }
    if (!completedCases.some((c) => c.caseId === selectedCaseId)) {
      setSelectedCaseId(completedCases[0]?.caseId ?? '');
    }
  }, [searchParams, completedCases, selectedCaseId]);

  const labCase = useMemo(
    () => completedCases.find((c) => c.caseId === selectedCaseId) ?? completedCases[0],
    [completedCases, selectedCaseId]
  );

  const competitor = useMemo(
    () =>
      labCase ? masters.competitors.find((c) => c.id === labCase.competitorId) : undefined,
    [masters.competitors, labCase]
  );

  const competitorName = competitor?.name || labCase?.competitorName || 'Competitor';

  const rows = useMemo(() => (labCase ? buildComparisonRows(labCase) : []), [labCase]);
  const summary = useMemo(() => (labCase ? computeSampleSummary(labCase) : null), [labCase]);

  const chartData = useMemo(
    () =>
      rows.map((r) => ({
        parameter: r.name,
        ourProduct: r.ourNormalizedScore,
        competitorSample: r.measuredValue !== null ? r.competitorNormalizedScore : 0,
      })),
    [rows]
  );

  if (!labCase) {
    return (
      <div className="fin-card p-10 text-center">
        <p className="text-sm font-semibold text-[var(--text-heading)]">
          No completed samples to compare
        </p>
        <p className="text-xs text-[var(--text-muted)] mt-1">
          Complete lab measurements on the Test Entry page to unlock parameter comparisons.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Selection Bar */}
      <div className="fin-card p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex-1 max-w-xl">
          <label
            htmlFor="compare-sample-select"
            className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5"
          >
            Select Completed Benchmarked Sample
          </label>
          <select
            id="compare-sample-select"
            value={labCase.caseId}
            onChange={(e) => {
              setSelectedCaseId(e.target.value);
              setSearchParams({ sample: e.target.value });
            }}
            className="fin-input w-full px-3.5 text-sm"
          >
            {completedCases.map((s) => (
              <option key={s.caseId} value={s.caseId}>
                {s.sampleCode || s.caseId} — {s.sampleName || s.product} ({s.customer})
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-6">
          <div>
            <span className="text-xs text-[var(--text-muted)] block">Competitor</span>
            <span className="text-sm font-bold text-[var(--text-heading)]">{competitorName}</span>
          </div>
          <div>
            <span className="text-xs text-[var(--text-muted)] block">Spec Compliance</span>
            <span className="text-sm font-mono font-bold text-[var(--color-primary)] tabular-nums">
              {summary?.passRate !== null ? `${summary?.passRate}%` : 'Pending'}
            </span>
          </div>
          <div>
            <span className="text-xs text-[var(--text-muted)] block">Sample Status</span>
            <div className="mt-0.5">
              <SampleStatusBadge status={labCase.status} />
            </div>
          </div>
          {canViewReports && (
            <Link
              to={`/reports?sample=${labCase.caseId}`}
              className="fin-btn-primary inline-flex items-center gap-1.5 px-4 py-2.5 text-xs whitespace-nowrap"
            >
              <FileText className="w-3.5 h-3.5" aria-hidden="true" />
              Open Full Report
            </Link>
          )}
        </div>
      </div>

      {/* Side-by-Side Comparison Table */}
      <div className="fin-card p-6 overflow-hidden">
        <div className="pb-4 mb-4 border-b border-[var(--border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-[var(--text-heading)]">
              Our Standard vs. {competitorName} Sample
            </h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Linked to {labCase.caseId} ({labCase.customer}) · Loss reason:{' '}
              {labCase.lossReason || '—'}
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="fin-table-head text-[11px] font-semibold uppercase tracking-wider">
                <th className="py-3 px-4 rounded-l-[12px]">Parameter</th>
                <th className="py-3 px-4">Allowed Spec</th>
                <th className="py-3 px-4 text-right">Our Product</th>
                <th className="py-3 px-4 text-right">Competitor Sample</th>
                <th className="py-3 px-4 text-right">Delta %</th>
                <th className="py-3 px-4">Competitive Standing</th>
                <th className="py-3 px-4 rounded-r-[12px]">Spec Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)] text-sm">
              {rows.map((row) => {
                const standingStyle = {
                  'competitor-ahead': {
                    label: 'Competitor Ahead',
                    bg: 'var(--status-danger-bg)',
                    fg: 'var(--status-danger-fg)',
                  },
                  'our-advantage': {
                    label: 'Our Advantage',
                    bg: 'var(--status-success-bg)',
                    fg: 'var(--status-success-fg)',
                  },
                  parity: {
                    label: 'Parity',
                    bg: 'var(--status-neutral-bg)',
                    fg: 'var(--status-neutral-fg)',
                  },
                  untested: {
                    label: 'Not Tested',
                    bg: 'var(--status-neutral-bg)',
                    fg: 'var(--text-muted)',
                  },
                }[row.performanceStatus];

                return (
                  <tr key={row.parameterId} className="fin-table-row transition-colors">
                    <td className="py-3.5 px-4">
                      <p className="font-semibold text-[var(--text-heading)]">{row.name}</p>
                      <p className="text-xs text-[var(--text-muted)]">
                        {row.higherIsBetter ? 'Higher is better' : 'Lower is better'}
                      </p>
                    </td>
                    <td className="py-3.5 px-4 font-mono tabular-nums text-xs text-[var(--text-muted)] whitespace-nowrap">
                      {row.minValue} – {row.maxValue} {row.unit}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums font-bold text-[var(--text-heading)] whitespace-nowrap">
                      {row.ourStandardValue} {row.unit}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums font-bold text-[var(--text-heading)] whitespace-nowrap">
                      {row.measuredValue !== null ? `${row.measuredValue} ${row.unit}` : 'Pending'}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums font-bold whitespace-nowrap">
                      {row.diffPercent !== null ? (
                        <span
                          style={{
                            color:
                              row.performanceStatus === 'our-advantage'
                                ? 'var(--status-success-fg)'
                                : row.performanceStatus === 'competitor-ahead'
                                  ? 'var(--status-danger-fg)'
                                  : 'var(--text-body)',
                          }}
                        >
                          {row.diffPercent > 0 ? '+' : ''}
                          {row.diffPercent}%
                        </span>
                      ) : (
                        <span className="text-[var(--text-muted)]">—</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <span
                        className="inline-flex items-center px-2.5 py-0.5 text-xs font-semibold rounded-full"
                        style={{
                          backgroundColor: standingStyle.bg,
                          color: standingStyle.fg,
                        }}
                      >
                        {standingStyle.label}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <PassFailBadge passed={row.passed} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Radar / Bar Visualization */}
      <div className="fin-card p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
          <div>
            <h2 className="text-base font-bold text-[var(--text-heading)]">
              Normalized Performance Profile (0–100 Index)
            </h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Outward / taller values represent stronger engineering performance regardless of unit
              direction.
            </p>
          </div>
          <div
            className="inline-flex items-center p-1 rounded-[12px] self-start"
            style={{ backgroundColor: 'var(--bg-surface-muted)' }}
          >
            <button
              type="button"
              onClick={() => setChartType('radar')}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-[9px] transition-colors ${
                chartType === 'radar'
                  ? 'bg-[var(--bg-surface)] text-[var(--text-heading)] shadow-xs'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-heading)]'
              }`}
            >
              Radar Chart
            </button>
            <button
              type="button"
              onClick={() => setChartType('bar')}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-[9px] transition-colors ${
                chartType === 'bar'
                  ? 'bg-[var(--bg-surface)] text-[var(--text-heading)] shadow-xs'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-heading)]'
              }`}
            >
              Grouped Bar Chart
            </button>
          </div>
        </div>

        <div className="h-80 w-full" data-testid="comparison-chart">
          <ResponsiveContainer width="100%" height="100%">
            {chartType === 'radar' ? (
              <RadarChart cx="50%" cy="50%" outerRadius="72%" data={chartData}>
                <PolarGrid stroke="var(--border-subtle)" />
                <PolarAngleAxis
                  dataKey="parameter"
                  tick={{ fontSize: 12, fill: 'var(--text-body)' }}
                />
                <PolarRadiusAxis
                  angle={30}
                  domain={[0, 100]}
                  tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                />
                <Radar
                  name="Our Product"
                  dataKey="ourProduct"
                  stroke="var(--chart-1)"
                  fill="var(--chart-1)"
                  fillOpacity={0.24}
                  isAnimationActive={false}
                />
                <Radar
                  name={competitorName}
                  dataKey="competitorSample"
                  stroke="var(--chart-danger)"
                  fill="var(--chart-danger)"
                  fillOpacity={0.2}
                  isAnimationActive={false}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
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
              </RadarChart>
            ) : (
              <BarChart data={chartData} margin={{ top: 12, right: 16, left: 0, bottom: 10 }}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--border-subtle)"
                  vertical={false}
                />
                <XAxis
                  dataKey="parameter"
                  tick={{ fontSize: 12, fill: 'var(--text-muted)' }}
                  axisLine={{ stroke: 'var(--border-subtle)' }}
                  tickLine={false}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 12, fill: 'var(--text-muted)' }}
                  axisLine={false}
                  tickLine={false}
                />
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
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Bar
                  dataKey="ourProduct"
                  name="Our Product"
                  fill="var(--chart-1)"
                  radius={[8, 8, 0, 0]}
                  maxBarSize={42}
                  isAnimationActive={false}
                />
                <Bar
                  dataKey="competitorSample"
                  name={competitorName}
                  fill="var(--chart-danger)"
                  radius={[8, 8, 0, 0]}
                  maxBarSize={42}
                  isAnimationActive={false}
                />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
