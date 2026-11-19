import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  CheckCircle2,
  Clock,
  ExternalLink,
  Eye,
  FileText,
  FlaskConical,
  History,
  Loader2,
  Paperclip,
  Save,
  Trash2,
  Upload,
} from 'lucide-react';
import { useLab } from '../context/LabContext';
import { canFullAccessPage, canViewPage } from '../utils/auth';
import { formatDateTime, formatFileSize, formatShortDate, readFileAsPersistableDataUrl } from '../utils/fileHelpers';
import {
  areAllParametersMeasured,
  getPendingCasesForStage,
  isCaseOverdue,
  isMeasurementWithinRange,
} from '../utils/labCalculations';
import { CaseDetailModal } from '../components/CaseDetailModal';
import { OverdueChip, PassFailBadge, SampleStatusBadge } from '../components/StatusBadge';
import { Pagination } from '../components/Pagination';
import type { LabCase } from '../types/lab';

interface DraftEntry {
  measuredValue: string;
  notes: string;
}

interface StagedAttachment {
  id: string;
  name: string;
  type: string;
  sizeLabel: string;
  dataUrl: string;
}

export function TestEntryPage() {
  const { cases, masters, currentUser, saveTest, addToast } = useLab();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const canEditTestEntry = canFullAccessPage(currentUser, 'testEntry');
  const canViewComparison = canViewPage(currentUser, 'comparison');

  // Test Pending queue: Stage 4 sorted by pendingPlanned asc
  const testPendingCases = useMemo(() => getPendingCasesForStage(cases, 4), [cases]);

  // Selectable samples for bench test entry (pendingStageNo === 4 or Received/Testing)
  const testableCases = useMemo(() => {
    const seen = new Set<string>();
    const ordered = [];
    for (const c of testPendingCases) {
      seen.add(c.caseId);
      ordered.push(c);
    }
    for (const c of cases) {
      if (!seen.has(c.caseId) && (c.status === 'Received' || c.status === 'Testing')) {
        seen.add(c.caseId);
        ordered.push(c);
      }
    }
    return ordered;
  }, [testPendingCases, cases]);

  const [activeTab, setActiveTab] = useState<'entry' | 'history'>('entry');
  const [detailCase, setDetailCase] = useState<LabCase | null>(null);

  const [entryPage, setEntryPage] = useState(1);
  const [entryPageSize, setEntryPageSize] = useState(10);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState(10);

  const completedTestCases = useMemo(() => {
    return cases.filter(
      (c) =>
        Boolean(c.actual4) ||
        c.status === 'Completed' ||
        (c.results && c.results.length > 0 && c.overallResult && c.overallResult !== 'In Progress')
    );
  }, [cases]);

  const paginatedTestableCases = useMemo(() => {
    const start = (entryPage - 1) * entryPageSize;
    return testableCases.slice(start, start + entryPageSize);
  }, [testableCases, entryPage, entryPageSize]);

  const paginatedCompletedCases = useMemo(() => {
    const start = (historyPage - 1) * historyPageSize;
    return completedTestCases.slice(start, start + historyPageSize);
  }, [completedTestCases, historyPage, historyPageSize]);

  const defaultCaseId = useMemo(() => {
    const queryId = searchParams.get('sample');
    if (queryId) {
      const matched = testableCases.find(
        (c) => c.caseId === queryId || c.sampleCode === queryId
      );
      if (matched) return matched.caseId;
    }
    return testableCases[0]?.caseId ?? '';
  }, [searchParams, testableCases]);

  const [selectedCaseId, setSelectedCaseId] = useState(defaultCaseId);

  useEffect(() => {
    const queryId = searchParams.get('sample');
    if (queryId) {
      const matched = testableCases.find(
        (c) => c.caseId === queryId || c.sampleCode === queryId
      );
      if (matched && matched.caseId !== selectedCaseId) {
        setSelectedCaseId(matched.caseId);
        return;
      }
    }
    if (!testableCases.some((c) => c.caseId === selectedCaseId)) {
      setSelectedCaseId(testableCases[0]?.caseId ?? '');
    }
  }, [searchParams, testableCases, selectedCaseId]);

  const selectedCase = useMemo(
    () => testableCases.find((c) => c.caseId === selectedCaseId) ?? testableCases[0],
    [testableCases, selectedCaseId]
  );

  const categoryParameters = useMemo(
    () =>
      selectedCase
        ? masters.parameters.filter((p) => p.category === selectedCase.category)
        : [],
    [masters.parameters, selectedCase]
  );

  const competitor = useMemo(
    () =>
      selectedCase
        ? masters.competitors.find((c) => c.id === selectedCase.competitorId)
        : undefined,
    [masters.competitors, selectedCase]
  );

  const [drafts, setDrafts] = useState<Record<string, DraftEntry>>({});
  const [stagedAttachments, setStagedAttachments] = useState<StagedAttachment[]>([]);
  const [validationError, setValidationError] = useState('');
  const [savingMode, setSavingMode] = useState<'draft' | 'complete' | null>(null);

  useEffect(() => {
    if (!selectedCase) return;
    const nextDrafts: Record<string, DraftEntry> = {};
    categoryParameters.forEach((param) => {
      const existing = selectedCase.results.find(
        (r) => r.parameterId === param.parameterId
      );
      nextDrafts[param.parameterId] = {
        measuredValue:
          existing && existing.measuredValue !== null && existing.measuredValue !== undefined
            ? String(existing.measuredValue)
            : '',
        notes: existing?.notes ?? '',
      };
    });
    setDrafts(nextDrafts);
    setStagedAttachments([]);
    setValidationError('');
  }, [selectedCase, categoryParameters]);

  const parsedResults = useMemo(() => {
    return categoryParameters.map((param) => {
      const raw = drafts[param.parameterId]?.measuredValue?.trim() ?? '';
      const num = raw === '' ? null : Number(raw);
      return {
        parameterId: param.parameterId,
        measuredValue: num !== null && Number.isFinite(num) ? num : null,
        notes: drafts[param.parameterId]?.notes?.trim() || undefined,
      };
    });
  }, [categoryParameters, drafts]);

  const totalParameterCount = categoryParameters.length;
  const measuredParameterCount = parsedResults.filter((r) => r.measuredValue !== null).length;
  const allParametersMeasured = areAllParametersMeasured(categoryParameters, parsedResults);

  const handleSampleChange = (caseId: string) => {
    setSelectedCaseId(caseId);
    setSearchParams({ sample: caseId });
  };

  const handleDraftChange = (
    paramId: string,
    field: keyof DraftEntry,
    value: string
  ) => {
    setDrafts((prev) => ({
      ...prev,
      [paramId]: {
        ...(prev[paramId] ?? { measuredValue: '', notes: '' }),
        [field]: value,
      },
    }));
    setValidationError('');
  };

  const handleAttachmentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    for (const file of files) {
      try {
        const dataUrl = await readFileAsPersistableDataUrl(file);
        const item: StagedAttachment = {
          id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: file.name,
          type: file.type || 'application/octet-stream',
          sizeLabel: formatFileSize(file.size),
          dataUrl,
        };
        setStagedAttachments((prev) => [...prev, item]);
      } catch (err) {
        addToast({
          type: 'error',
          title: err instanceof Error ? err.message : `Failed to attach ${file.name}`,
        });
      }
    }
    e.target.value = '';
  };

  const handleSave = async (markCompleted: boolean) => {
    if (!canEditTestEntry) return;
    if (!selectedCase || categoryParameters.length === 0) {
      if (markCompleted) {
        setValidationError(
          'Configure at least one template parameter in Test Templates before marking testing completed.'
        );
      }
      return;
    }

    if (markCompleted && !allParametersMeasured) {
      setValidationError(
        `Enter valid numeric measurements for all ${categoryParameters.length} parameters before marking testing completed.`
      );
      return;
    }

    setSavingMode(markCompleted ? 'complete' : 'draft');
    try {
      const nextSnap = await saveTest({
        caseId: selectedCase.caseId,
        results: parsedResults,
        attachments: stagedAttachments.map((a) => ({ name: a.name, dataUrl: a.dataUrl })),
        markCompleted,
      });

      if (nextSnap) {
        setStagedAttachments([]);
        if (markCompleted && canViewComparison) {
          navigate(`/comparison?sample=${selectedCase.caseId}`);
        }
      }
    } finally {
      setSavingMode(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* Page Tabs: Active Test Entry vs History */}
      <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] pb-2 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab('entry')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
            activeTab === 'entry'
              ? 'bg-[var(--color-primary)] text-white shadow-sm'
              : 'text-[var(--text-muted)] hover:text-[var(--text-heading)] hover:bg-[var(--color-surface-hover)]'
          }`}
        >
          <FileText className="w-4 h-4" />
          Active Test Entry ({testableCases.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('history')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
            activeTab === 'history'
              ? 'bg-[var(--color-primary)] text-white shadow-sm'
              : 'text-[var(--text-muted)] hover:text-[var(--text-heading)] hover:bg-[var(--color-surface-hover)]'
          }`}
        >
          <History className="w-4 h-4" />
          Test History ({completedTestCases.length})
        </button>
      </div>

      {activeTab === 'history' ? (
        <div className="space-y-4">
          <div className="fin-card p-5 overflow-hidden">
            <div className="pb-4 mb-3 border-b border-[var(--border-subtle)] flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-[var(--text-heading)]">Completed Tests History</h3>
                <p className="text-xs text-[var(--text-muted)]">
                  All cases where laboratory testing has been completed and stamped in Stage 4 (Actual 4)
                </p>
              </div>
              <span className="text-xs font-mono text-[var(--text-muted)]">
                {completedTestCases.length} records
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="fin-table-head text-[11px] font-semibold uppercase tracking-wider">
                    <th className="p-3 rounded-l-[12px] text-left whitespace-nowrap">Actions</th>
                    <th className="p-3 text-left whitespace-nowrap">Case ID</th>
                    <th className="p-3 text-left whitespace-nowrap">Sample Code</th>
                    <th className="p-3 text-left whitespace-nowrap">Customer &amp; Product</th>
                    <th className="p-3 text-left whitespace-nowrap">Category</th>
                    <th className="p-3 text-left whitespace-nowrap">Tested By</th>
                    <th className="p-3 text-left whitespace-nowrap">Overall Result</th>
                    <th className="p-3 text-center whitespace-nowrap">Pass / Fail</th>
                    <th className="p-3 rounded-r-[12px] text-left whitespace-nowrap">Actual 4 (Completed)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {completedTestCases.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-10 text-center text-xs text-[var(--text-muted)]">
                        No completed laboratory tests recorded yet.
                      </td>
                    </tr>
                  ) : (
                    paginatedCompletedCases.map((c) => (
                      <tr key={c.caseId} className="hover:bg-[var(--bg-row-hover)] transition-colors">
                        <td className="p-3 rounded-l-[12px] align-middle whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => setDetailCase(c)}
                            aria-label={`View details for ${c.caseId}`}
                            className="fin-btn-secondary inline-flex items-center gap-1.5 px-3 py-1.5 text-xs"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>View</span>
                          </button>
                        </td>
                        <td className="p-3 font-mono font-bold text-[var(--color-primary)] align-middle whitespace-nowrap">
                          {c.caseId}
                        </td>
                        <td className="p-3 font-mono align-middle whitespace-nowrap">{c.sampleCode || '—'}</td>
                        <td className="p-3 align-middle">
                          <p className="font-semibold text-[var(--text-heading)]">{c.customer}</p>
                          <p className="text-[var(--text-muted)]">{c.product}</p>
                        </td>
                        <td className="p-3 align-middle whitespace-nowrap">{c.category}</td>
                        <td className="p-3 align-middle whitespace-nowrap">{c.testedBy || '—'}</td>
                        <td className="p-3 align-middle whitespace-nowrap">
                          <PassFailBadge
                            passed={
                              c.overallResult === 'Pass'
                                ? true
                                : c.overallResult === 'Fail'
                                  ? false
                                  : null
                            }
                          />
                        </td>
                        <td className="p-3 font-mono text-center align-middle whitespace-nowrap">
                          <span className="text-emerald-600 font-semibold">{c.passCount ?? 0}P</span> /{' '}
                          <span className="text-rose-600 font-semibold">{c.failCount ?? 0}F</span>
                        </td>
                        <td className="p-3 font-mono rounded-r-[12px] text-[var(--text-muted)] align-middle whitespace-nowrap">
                          {formatDateTime(c.actual4) || '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <Pagination
              currentPage={historyPage}
              totalItems={completedTestCases.length}
              pageSize={historyPageSize}
              onPageChange={setHistoryPage}
              onPageSizeChange={setHistoryPageSize}
            />
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Active Testing Queue Table */}
          <div className="fin-card p-5 overflow-hidden">
            <div className="pb-3 mb-3 border-b border-[var(--border-subtle)] flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-[var(--text-heading)]">Active Testing Queue</h3>
                <p className="text-xs text-[var(--text-muted)]">
                  Samples received and ready for bench measurement entry (Pending Stage 4)
                </p>
              </div>
              <span className="text-xs font-mono text-[var(--text-muted)]">
                {testableCases.length} testable
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-[850px] w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="fin-table-head text-[11px] font-semibold uppercase tracking-wider">
                    <th className="py-3 px-3 rounded-l-[12px] text-left whitespace-nowrap">Actions</th>
                    <th className="py-3 px-3 text-left whitespace-nowrap">Case ID</th>
                    <th className="py-3 px-3 text-left whitespace-nowrap">Sample Code</th>
                    <th className="py-3 px-3 text-left whitespace-nowrap">Customer &amp; Product</th>
                    <th className="py-3 px-3 text-left whitespace-nowrap">Category</th>
                    <th className="py-3 px-3 text-left whitespace-nowrap">Planned / Expected</th>
                    <th className="py-3 px-3 rounded-r-[12px] text-left whitespace-nowrap">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {testableCases.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-xs text-[var(--text-muted)]">
                        No Received or Testing samples available. A sample must be received on the Samples page before test measurements can be entered.
                      </td>
                    </tr>
                  ) : (
                    paginatedTestableCases.map((item) => {
                      const active = item.caseId === selectedCase?.caseId;
                      const overdue = isCaseOverdue(item);

                      return (
                        <tr
                          key={item.caseId}
                          className="hover:bg-[var(--bg-row-hover)] transition-colors cursor-pointer"
                          style={
                            active
                              ? { backgroundColor: 'var(--color-primary-soft)' }
                              : overdue
                                ? { backgroundColor: 'var(--status-danger-bg)' }
                                : undefined
                          }
                          onClick={() => handleSampleChange(item.caseId)}
                        >
                          <td
                            className="py-3 px-3 rounded-l-[12px] whitespace-nowrap align-middle"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleSampleChange(item.caseId)}
                                className={
                                  active
                                    ? 'fin-btn-primary inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg shadow-xs'
                                    : 'fin-btn-secondary inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-[var(--border-subtle)] hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-soft)]'
                                }
                              >
                                <FlaskConical className="w-3.5 h-3.5" />
                                <span>{active ? 'Selected' : 'Enter Test'}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setDetailCase(item)}
                                aria-label={`View details for ${item.caseId}`}
                                className="fin-btn-secondary inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-[var(--border-subtle)]"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>View</span>
                              </button>
                            </div>
                          </td>
                          <td className="py-3 px-3 font-mono font-bold text-[var(--color-primary)] whitespace-nowrap align-middle">
                            {item.caseId}
                          </td>
                          <td className="py-3 px-3 font-mono whitespace-nowrap align-middle">
                            {item.sampleCode || '—'}
                          </td>
                          <td className="py-3 px-3 align-middle">
                            <p className="font-semibold text-[var(--text-heading)]">{item.customer}</p>
                            <p className="text-[var(--text-muted)]">{item.sampleName || item.product}</p>
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap align-middle">{item.category}</td>
                          <td
                            className="py-3 px-3 font-mono whitespace-nowrap align-middle text-xs"
                            style={{
                              color: overdue ? 'var(--status-danger-fg)' : 'var(--text-muted)',
                              fontWeight: overdue ? 700 : 500,
                            }}
                          >
                            <div>{formatShortDate(item.pendingPlanned || item.expectedDate)}</div>
                            <div className="mt-0.5">
                              <OverdueChip delayDays={item.pendingDelay} />
                            </div>
                          </td>
                          <td className="py-3 px-3 rounded-r-[12px] whitespace-nowrap align-middle">
                            <SampleStatusBadge status={item.status} />
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <Pagination
              currentPage={entryPage}
              totalItems={testableCases.length}
              pageSize={entryPageSize}
              onPageChange={setEntryPage}
              onPageSizeChange={setEntryPageSize}
            />
          </div>

          {selectedCase && (
            <div className="space-y-5">
              {/* Sample Quick Summary Strip */}
              <div className="fin-card p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div>
                  <span className="text-xs font-semibold text-[var(--text-muted)] block">Currently Editing Test</span>
                  <h2 className="text-base font-bold text-[var(--text-heading)] mt-0.5">
                    {selectedCase.sampleCode || selectedCase.caseId} — {selectedCase.sampleName || selectedCase.product}
                  </h2>
                </div>

                <div className="flex flex-wrap items-center gap-5 text-xs text-[var(--text-body)]">
                  <div>
                    <span className="text-[var(--text-muted)] block">Competitor</span>
                    <span className="font-bold text-[var(--text-heading)]">
                      {competitor?.name || selectedCase.competitorName || '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[var(--text-muted)] block">Category Template</span>
                    <span className="font-bold text-[var(--text-heading)]">{selectedCase.category}</span>
                  </div>
                  <div>
                    <span className="text-[var(--text-muted)] block">Pipeline Stage</span>
                    <div className="mt-0.5 flex items-center gap-2">
                      <SampleStatusBadge status={selectedCase.status} />
                      <OverdueChip delayDays={selectedCase.pendingDelay} />
                    </div>
                  </div>
                </div>
              </div>

      {/* Parameter Measurement Form */}
      <div className="fin-card p-6 overflow-hidden">
        <div className="pb-4 mb-4 border-b border-[var(--border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-[var(--text-heading)]">
              Template Parameters · {selectedCase.category}
            </h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              {canEditTestEntry
                ? 'Enter measured competitor values. Pass/Fail evaluates automatically against allowed specification limits.'
                : 'Read-only view. Full access on Test Entry is required to record measurements and complete testing.'}
            </p>
          </div>
        </div>

        {categoryParameters.length === 0 ? (
          <div className="py-10 text-center text-sm text-[var(--text-muted)]">
            No parameters configured for &ldquo;{selectedCase.category}&rdquo;. Add parameters in
            Test Templates first.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left border-collapse">
              <thead>
                <tr className="fin-table-head text-[11px] font-semibold uppercase tracking-wider">
                  <th className="py-3 px-4 rounded-l-[12px]">Parameter</th>
                  <th className="py-3 px-4">Allowed Range</th>
                  <th className="py-3 px-4 text-right">Our Standard</th>
                  <th className="py-3 px-4">Measured Value</th>
                  <th className="py-3 px-4">Auto Evaluation</th>
                  <th className="py-3 px-4 rounded-r-[12px]">Technician Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)] text-sm">
                {categoryParameters.map((param) => {
                  const draft = drafts[param.parameterId] ?? { measuredValue: '', notes: '' };
                  const raw = draft.measuredValue.trim();
                  const num = raw === '' ? null : Number(raw);
                  const validNum = num !== null && !Number.isNaN(num);
                  const passed = validNum
                    ? isMeasurementWithinRange(num, param.minValue, param.maxValue)
                    : null;

                  return (
                    <tr key={param.parameterId} className="fin-table-row transition-colors">
                      <td className="py-3.5 px-4">
                        <p className="font-semibold text-[var(--text-heading)]">{param.name}</p>
                        <p className="text-xs text-[var(--text-muted)]">
                          {param.higherIsBetter ? 'Higher is better' : 'Lower is better'}
                        </p>
                      </td>
                      <td className="py-3.5 px-4 font-mono tabular-nums text-xs text-[var(--text-body)] whitespace-nowrap">
                        {param.minValue} – {param.maxValue} {param.unit}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums text-xs font-bold text-[var(--color-primary)] whitespace-nowrap">
                        {param.ourStandardValue} {param.unit}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            step="any"
                            disabled={!canEditTestEntry}
                            aria-label={`Measured value for ${param.name}`}
                            value={draft.measuredValue}
                            onChange={(e) =>
                              handleDraftChange(param.parameterId, 'measuredValue', e.target.value)
                            }
                            placeholder="0.00"
                            className="fin-input w-28 px-3 text-sm font-mono tabular-nums"
                          />
                          <span className="text-xs font-mono text-[var(--text-muted)]">
                            {param.unit}
                          </span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <PassFailBadge passed={passed} />
                      </td>
                      <td className="py-3.5 px-4">
                        <input
                          type="text"
                          disabled={!canEditTestEntry}
                          aria-label={`Lab notes for ${param.name}`}
                          value={draft.notes}
                          onChange={(e) =>
                            handleDraftChange(param.parameterId, 'notes', e.target.value)
                          }
                          placeholder="Observation..."
                          className="fin-input w-full min-w-[180px] px-3 text-xs"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Attachments Section */}
        <div
          className="mt-5 p-5 rounded-[16px] border border-[var(--border-subtle)] space-y-3"
          style={{ backgroundColor: 'var(--bg-surface-muted)' }}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-bold text-[var(--text-heading)]">
                Lab Photos &amp; Instrument Files
              </h3>
              <p className="text-xs text-[var(--text-muted)]">
                Attach teardown photos, microscope captures, or raw calibration logs.
              </p>
            </div>
            {canEditTestEntry && (
              <label className="fin-btn-secondary inline-flex items-center gap-1.5 px-3.5 py-2 text-xs cursor-pointer self-start">
                <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                Attach Files
                <input
                  type="file"
                  multiple
                  accept="image/*,.pdf,.csv,.txt"
                  onChange={handleAttachmentUpload}
                  className="sr-only"
                />
              </label>
            )}
          </div>

          {selectedCase.attachmentList.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold text-[var(--text-muted)]">
                Saved Attachments ({selectedCase.attachmentList.length})
              </p>
              <div className="flex flex-wrap gap-2">
                {selectedCase.attachmentList.map((att, idx) => (
                  <a
                    key={`${att.name}-${idx}`}
                    href={att.url}
                    target="_blank"
                    rel="noreferrer"
                    className="fin-btn-secondary inline-flex items-center gap-1.5 px-3 py-1.5 text-xs"
                  >
                    <span>{att.name}</span>
                    <ExternalLink className="w-3 h-3" aria-hidden="true" />
                  </a>
                ))}
              </div>
            </div>
          )}

          {stagedAttachments.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {stagedAttachments.map((att) => (
                <div
                  key={att.id}
                  className="flex items-center justify-between gap-2 p-3 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-surface)]"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {att.type.startsWith('image/') ? (
                      <img
                        src={att.dataUrl}
                        alt={att.name}
                        className="w-8 h-8 rounded-[8px] object-cover border border-[var(--border-subtle)] shrink-0"
                      />
                    ) : (
                      <FileText
                        className="w-5 h-5 text-[var(--text-muted)] shrink-0"
                        aria-hidden="true"
                      />
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-[var(--text-heading)] truncate">
                        {att.name}
                      </p>
                      <p className="text-xs text-[var(--text-muted)] font-mono">{att.sizeLabel}</p>
                    </div>
                  </div>
                  {canEditTestEntry && (
                    <button
                      type="button"
                      onClick={() =>
                        setStagedAttachments((prev) => prev.filter((a) => a.id !== att.id))
                      }
                      aria-label={`Remove ${att.name}`}
                      className="p-1.5 rounded-[8px] text-[var(--text-muted)] hover:text-[var(--status-danger-fg)] hover:bg-[var(--status-danger-bg)]"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {selectedCase.attachmentList.length === 0 && stagedAttachments.length === 0 && (
            <p className="text-xs text-[var(--text-muted)] flex items-center gap-1.5">
              <Paperclip className="w-3.5 h-3.5" aria-hidden="true" />
              No attachments uploaded for this sample yet.
            </p>
          )}
        </div>

        {/* Footer Actions */}
        <div className="pt-5 mt-5 border-t border-[var(--border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            {validationError ? (
              <p
                className="text-xs font-semibold"
                style={{ color: 'var(--status-danger-fg)' }}
                role="alert"
              >
                {validationError}
              </p>
            ) : totalParameterCount === 0 ? (
              <p className="text-xs text-[var(--text-muted)]">
                Add at least one parameter in Test Templates before completing testing.
              </p>
            ) : allParametersMeasured ? (
              <p
                className="text-xs font-semibold font-mono tabular-nums"
                style={{ color: 'var(--status-success-fg)' }}
              >
                All {totalParameterCount} template parameters measured — ready to submit.
              </p>
            ) : (
              <p className="text-xs text-[var(--text-muted)] font-mono tabular-nums">
                {measuredParameterCount} of {totalParameterCount} parameters measured — complete all
                measurements to enable Submit &amp; Mark Completed.
              </p>
            )}
          </div>
          {canEditTestEntry && (
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => void handleSave(false)}
                disabled={savingMode !== null || totalParameterCount === 0}
                className="fin-btn-secondary inline-flex items-center gap-1.5 px-4 py-2.5 text-xs whitespace-nowrap"
              >
                {savingMode === 'draft' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Save className="w-3.5 h-3.5" aria-hidden="true" />
                )}
                {savingMode === 'draft' ? 'Saving...' : 'Save Draft'}
              </button>
              <button
                type="button"
                onClick={() => void handleSave(true)}
                disabled={savingMode !== null || !allParametersMeasured}
                title={
                  allParametersMeasured
                    ? 'Submit measurements, mark sample completed, and open comparison view'
                    : 'Enter measured values for all template parameters first'
                }
                className="fin-btn-primary inline-flex items-center gap-1.5 px-5 py-2.5 text-xs whitespace-nowrap"
              >
                {savingMode === 'complete' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                )}
                {savingMode === 'complete' ? 'Submitting...' : 'Submit & Mark Completed'}
              </button>
            </div>
          )}
        </div>
      </div>
          </div>
        )}
        </div>
      )}

      {detailCase && (
        <CaseDetailModal labCase={detailCase} onClose={() => setDetailCase(null)} />
      )}
    </div>
  );
}
