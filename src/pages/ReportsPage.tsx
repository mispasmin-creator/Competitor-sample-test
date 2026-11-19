import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Download, Eye, Loader2 } from 'lucide-react';
import { useLab } from '../context/LabContext';
import { canFullAccessPage } from '../utils/auth';
import { formatCurrency, formatShortDate } from '../utils/fileHelpers';
import {
  buildComparisonRows,
  computeSampleSummary,
  generateAutoVerdict,
} from '../utils/labCalculations';
import { downloadLabReportPdf } from '../utils/pdfExport';
import { CaseDetailModal } from '../components/CaseDetailModal';
import {
  ApprovalStatusBadge,
  OverdueChip,
  PassFailBadge,
  SampleStatusBadge,
} from '../components/StatusBadge';
import type { LabCase } from '../types/lab';

export function ReportsPage() {
  const { cases, masters, currentUser, approveReport, addToast } = useLab();
  const [searchParams, setSearchParams] = useSearchParams();

  const [approvalPendingOnly, setApprovalPendingOnly] = useState(
    () => searchParams.get('pending') === '5'
  );
  const [detailCase, setDetailCase] = useState<LabCase | null>(null);
  const [approvingAction, setApprovingAction] = useState<'Approved' | 'Revision Requested' | null>(
    null
  );

  useEffect(() => {
    if (searchParams.get('pending') === '5') {
      setApprovalPendingOnly(true);
    }
  }, [searchParams]);

  // Reports are shown ONLY for Completed samples
  const completedCases = useMemo(
    () => cases.filter((c) => c.status === 'Completed'),
    [cases]
  );

  const stage5PendingCount = useMemo(
    () => cases.filter((c) => Number(c.pendingStageNo) === 5).length,
    [cases]
  );

  const visibleCases = useMemo(() => {
    const base = approvalPendingOnly
      ? cases.filter((c) => Number(c.pendingStageNo) === 5)
      : completedCases;

    return [...base].sort((a, b) => {
      if (approvalPendingOnly) {
        return String(a.pendingPlanned || '9999-12-31').localeCompare(
          String(b.pendingPlanned || '9999-12-31')
        );
      }
      if (Number(a.pendingStageNo) === 5 && Number(b.pendingStageNo) !== 5) return -1;
      if (Number(a.pendingStageNo) !== 5 && Number(b.pendingStageNo) === 5) return 1;
      return String(b.actual4 || b.orderDate).localeCompare(String(a.actual4 || a.orderDate));
    });
  }, [cases, completedCases, approvalPendingOnly]);

  const initialId = useMemo(() => {
    const paramId = searchParams.get('sample');
    if (paramId) {
      const matched = visibleCases.find(
        (c) => c.caseId === paramId || c.sampleCode === paramId
      );
      if (matched) return matched.caseId;
    }
    return visibleCases[0]?.caseId ?? '';
  }, [searchParams, visibleCases]);

  const [selectedCaseId, setSelectedCaseId] = useState(initialId);

  useEffect(() => {
    const paramId = searchParams.get('sample');
    if (paramId) {
      const matched = visibleCases.find(
        (c) => c.caseId === paramId || c.sampleCode === paramId
      );
      if (matched && matched.caseId !== selectedCaseId) {
        setSelectedCaseId(matched.caseId);
        return;
      }
    }
    if (!visibleCases.some((c) => c.caseId === selectedCaseId)) {
      setSelectedCaseId(visibleCases[0]?.caseId ?? '');
    }
  }, [searchParams, visibleCases, selectedCaseId]);

  const labCase = useMemo(
    () => visibleCases.find((c) => c.caseId === selectedCaseId) ?? visibleCases[0],
    [visibleCases, selectedCaseId]
  );

  const competitor = useMemo(
    () =>
      labCase ? masters.competitors.find((c) => c.id === labCase.competitorId) : undefined,
    [masters.competitors, labCase]
  );
  const competitorName = competitor?.name || labCase?.competitorName || 'Competitor';

  const rows = useMemo(() => (labCase ? buildComparisonRows(labCase) : []), [labCase]);
  const summary = useMemo(() => (labCase ? computeSampleSummary(labCase) : null), [labCase]);

  const autoVerdict = useMemo(() => {
    if (!labCase || !summary) return '';
    return generateAutoVerdict(labCase, competitorName, rows, summary);
  }, [labCase, competitorName, rows, summary]);

  const [verdictDraft, setVerdictDraft] = useState('');
  const [managerComment, setManagerComment] = useState('');

  useEffect(() => {
    if (!labCase) return;
    setVerdictDraft(labCase.verdictOverride || autoVerdict);
    setManagerComment(labCase.managerComment || '');
  }, [labCase, autoVerdict]);

  const canApproveReports = canFullAccessPage(currentUser, 'reports');

  const togglePendingOnly = () => {
    const next = !approvalPendingOnly;
    setApprovalPendingOnly(next);
    if (next) {
      setSearchParams({ pending: '5' });
    } else {
      setSearchParams({});
    }
  };

  const handleDownloadPdf = () => {
    if (!labCase || !summary) return;
    downloadLabReportPdf({
      labCase,
      competitor,
      rows,
      summary,
      verdict: verdictDraft.trim() || autoVerdict,
    });
    addToast({
      type: 'success',
      title: `Downloaded ${labCase.sampleCode || labCase.caseId}_Benchmark_Report.pdf`,
    });
  };

  const handleApproveAction = async (
    approvalStatus: 'Approved' | 'Revision Requested'
  ) => {
    if (!labCase) return;
    setApprovingAction(approvalStatus);
    try {
      await approveReport({
        caseId: labCase.caseId,
        approvalStatus,
        managerComment: managerComment.trim(),
        verdictOverride: verdictDraft.trim(),
      });
    } finally {
      setApprovingAction(null);
    }
  };

  if (!labCase || !summary) {
    return (
      <div className="fin-card p-10 text-center space-y-3">
        <p className="text-sm font-semibold text-[var(--text-heading)]">
          {approvalPendingOnly ? 'No reports pending approval' : 'No completed reports available'}
        </p>
        <p className="text-xs text-[var(--text-muted)]">
          {approvalPendingOnly
            ? 'All completed lab reports have been reviewed.'
            : 'Complete testing on the Test Entry page to generate benchmark reports.'}
        </p>
        {approvalPendingOnly && completedCases.length > 0 && (
          <button
            type="button"
            onClick={togglePendingOnly}
            className="fin-btn-secondary px-4 py-2 text-xs"
          >
            Show All Completed Reports
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
      {/* Report Selector List */}
      <aside className="lg:col-span-4 fin-card p-5 overflow-hidden">
        <div className="pb-3.5 mb-3 border-b border-[var(--border-subtle)] space-y-2.5">
          <div>
            <h2 className="text-sm font-bold text-[var(--text-heading)]">
              Completed Sample Reports ({visibleCases.length})
            </h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Select a completed sample to review verdict &amp; export PDF
            </p>
          </div>

          <button
            type="button"
            onClick={togglePendingOnly}
            aria-pressed={approvalPendingOnly}
            className="w-full inline-flex items-center justify-between px-3 py-2 text-xs font-semibold rounded-[10px] border transition-colors"
            style={
              approvalPendingOnly
                ? {
                    backgroundColor: 'var(--color-primary-soft)',
                    color: 'var(--color-primary)',
                    borderColor: 'var(--color-primary)',
                  }
                : {
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--text-body)',
                    borderColor: 'var(--border-subtle)',
                  }
            }
          >
            <span>Approval Pending (Stage 5)</span>
            <span className="font-mono font-bold">({stage5PendingCount})</span>
          </button>
        </div>

        <div className="space-y-1.5">
          {visibleCases.map((s) => {
            const active = s.caseId === labCase.caseId;
            return (
              <button
                key={s.caseId}
                type="button"
                onClick={() => {
                  setSelectedCaseId(s.caseId);
                  setSearchParams(
                    approvalPendingOnly ? { sample: s.caseId, pending: '5' } : { sample: s.caseId }
                  );
                }}
                className="w-full text-left px-3.5 py-3 rounded-[14px] transition-colors"
                style={
                  active
                    ? { backgroundColor: 'var(--color-primary-soft)' }
                    : undefined
                }
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-bold text-[var(--color-primary)]">
                    {s.sampleCode || s.caseId}
                  </span>
                  <ApprovalStatusBadge status={s.approvalStatus} />
                </div>
                <p className="text-sm font-bold text-[var(--text-heading)] mt-1">
                  {s.sampleName || s.product}
                </p>
                <div className="flex items-center justify-between gap-2 mt-1">
                  <p className="text-xs text-[var(--text-muted)] truncate">
                    {masters.competitors.find((c) => c.id === s.competitorId)?.name ||
                      s.competitorName ||
                      '—'}
                  </p>
                  <OverdueChip delayDays={s.pendingDelay} />
                </div>
                {Number(s.pendingStageNo) === 5 && s.pendingPlanned && (
                  <p className="text-[11px] font-mono text-[var(--text-muted)] mt-1">
                    Planned Sign-Off: {formatShortDate(s.pendingPlanned)}
                  </p>
                )}
              </button>
            );
          })}
        </div>
      </aside>

      {/* Main Report Document */}
      <section className="lg:col-span-8 fin-card p-6 overflow-hidden space-y-6">
        <div className="pb-5 border-b border-[var(--border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs font-bold text-[var(--text-muted)]">
                {labCase.sampleCode || labCase.caseId}
              </span>
              <SampleStatusBadge status={labCase.status} />
              <ApprovalStatusBadge status={labCase.approvalStatus} />
              <OverdueChip delayDays={labCase.pendingDelay} />
            </div>
            <h2 className="text-lg font-bold text-[var(--text-heading)] mt-1.5">
              {labCase.sampleName || labCase.product} Benchmark Report
            </h2>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setDetailCase(labCase)}
              className="fin-btn-secondary inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs whitespace-nowrap"
            >
              <Eye className="w-3.5 h-3.5" aria-hidden="true" />
              Case Details
            </button>
            <button
              type="button"
              onClick={handleDownloadPdf}
              className="fin-btn-primary inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              Download PDF
            </button>
          </div>
        </div>

        {/* Executive Summary Metadata Grid */}
        <div
          className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-[16px] border border-[var(--border-subtle)] text-xs"
          style={{ backgroundColor: 'var(--bg-surface-muted)' }}
        >
          <div>
            <span className="text-[var(--text-muted)] block">Competitor</span>
            <span className="font-bold text-[var(--text-heading)] mt-0.5 block">
              {competitorName}
            </span>
          </div>
          <div>
            <span className="text-[var(--text-muted)] block">Customer &amp; Value</span>
            <span className="font-bold text-[var(--text-heading)] mt-0.5 block">
              {labCase.customer} ({formatCurrency(labCase.orderValue)})
            </span>
          </div>
          <div>
            <span className="text-[var(--text-muted)] block">Loss Driver</span>
            <span className="font-bold text-[var(--text-heading)] capitalize mt-0.5 block">
              {labCase.lossReason || '—'}
            </span>
          </div>
          <div>
            <span className="text-[var(--text-muted)] block">Spec Compliance</span>
            <span className="font-mono font-bold text-[var(--color-primary)] mt-0.5 block tabular-nums">
              {summary.passRate !== null
                ? `${summary.passRate}% (${summary.passedCount}/${summary.measuredCount})`
                : 'Pending Testing'}
            </span>
          </div>
        </div>

        {/* Engineering Verdict */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label
              htmlFor="report-verdict"
              className="text-xs font-bold text-[var(--text-body)]"
            >
              Engineering Verdict Summary
            </label>
            {canApproveReports && (
              <button
                type="button"
                onClick={() => setVerdictDraft(autoVerdict)}
                className="text-xs font-semibold text-[var(--color-primary)] hover:underline"
              >
                Reset to Auto-Generated Verdict
              </button>
            )}
          </div>
          <textarea
            id="report-verdict"
            rows={4}
            readOnly={!canApproveReports}
            value={verdictDraft}
            onChange={(e) => setVerdictDraft(e.target.value)}
            className="fin-textarea w-full p-3.5 text-sm leading-relaxed"
          />
        </div>

        {/* Comparison Table */}
        <div>
          <h3 className="text-sm font-bold text-[var(--text-heading)] mb-3">
            Measured Comparison Breakdown
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="fin-table-head text-[11px] font-semibold uppercase tracking-wider">
                  <th className="py-3 px-3.5 rounded-l-[12px]">Parameter</th>
                  <th className="py-3 px-3.5">Allowed</th>
                  <th className="py-3 px-3.5 text-right">Our Std</th>
                  <th className="py-3 px-3.5 text-right">Competitor</th>
                  <th className="py-3 px-3.5 text-right">Diff %</th>
                  <th className="py-3 px-3.5 rounded-r-[12px]">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)] text-xs">
                {rows.map((row) => (
                  <tr key={row.parameterId} className="fin-table-row transition-colors">
                    <td className="py-3 px-3.5 font-semibold text-[var(--text-heading)]">
                      {row.name}
                    </td>
                    <td className="py-3 px-3.5 font-mono tabular-nums text-[var(--text-muted)]">
                      {row.minValue}–{row.maxValue} {row.unit}
                    </td>
                    <td className="py-3 px-3.5 text-right font-mono tabular-nums text-[var(--text-body)]">
                      {row.ourStandardValue} {row.unit}
                    </td>
                    <td className="py-3 px-3.5 text-right font-mono tabular-nums font-bold text-[var(--text-heading)]">
                      {row.measuredValue !== null ? `${row.measuredValue} ${row.unit}` : 'Pending'}
                    </td>
                    <td className="py-3 px-3.5 text-right font-mono tabular-nums font-bold text-[var(--text-heading)]">
                      {row.diffPercent !== null
                        ? `${row.diffPercent > 0 ? '+' : ''}${row.diffPercent}%`
                        : '—'}
                    </td>
                    <td className="py-3 px-3.5">
                      <PassFailBadge passed={row.passed} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Manager Approval Controls */}
        <div
          className="p-5 rounded-[16px] border border-[var(--border-subtle)] space-y-3"
          style={{ backgroundColor: 'var(--bg-surface-muted)' }}
        >
          <div>
            <h3 className="text-sm font-bold text-[var(--text-heading)]">
              Manager Review &amp; Sign-Off
            </h3>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              {labCase.approvedBy
                ? `Reviewed by ${labCase.approvedBy}${
                    labCase.actual5 ? ` on ${formatShortDate(labCase.actual5)}` : ''
                  }`
                : canApproveReports
                  ? 'Verify technical conclusions before publishing to Sales & R&D teams.'
                  : 'Full access on Reports is required to approve or request revisions on benchmark reports.'}
            </p>
          </div>

          {canApproveReports ? (
            <>
              <div>
                <label
                  htmlFor="manager-comment"
                  className="block text-xs font-semibold text-[var(--text-body)] mb-1.5"
                >
                  Manager Sign-Off Note
                </label>
                <input
                  id="manager-comment"
                  type="text"
                  value={managerComment}
                  onChange={(e) => setManagerComment(e.target.value)}
                  placeholder="Action items for R&D or Sales engineering..."
                  className="fin-input w-full px-3.5 text-xs bg-[var(--bg-surface)]"
                />
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2.5 pt-1">
                <button
                  type="button"
                  disabled={approvingAction !== null}
                  onClick={() => void handleApproveAction('Revision Requested')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-[12px] border transition-opacity hover:opacity-90 disabled:opacity-60"
                  style={{
                    backgroundColor: 'var(--status-danger-bg)',
                    color: 'var(--status-danger-fg)',
                    borderColor: 'color-mix(in srgb, var(--status-danger-fg) 25%, transparent)',
                  }}
                >
                  {approvingAction === 'Revision Requested' ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                  )}
                  {approvingAction === 'Revision Requested' ? 'Saving...' : 'Request Revision'}
                </button>
                <button
                  type="button"
                  disabled={approvingAction !== null}
                  onClick={() => void handleApproveAction('Approved')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-[12px] text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                  style={{ backgroundColor: 'var(--status-success-fg)' }}
                >
                  {approvingAction === 'Approved' ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                  )}
                  {approvingAction === 'Approved' ? 'Approving...' : 'Approve Report'}
                </button>
              </div>
            </>
          ) : (
            labCase.managerComment && (
              <p className="text-xs text-[var(--text-body)] bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-[12px] px-3.5 py-2.5">
                <span className="font-bold text-[var(--text-heading)]">Manager Note:</span>{' '}
                {labCase.managerComment}
              </p>
            )
          )}
        </div>
      </section>

      <CaseDetailModal labCase={detailCase} onClose={() => setDetailCase(null)} />
    </div>
  );
}
