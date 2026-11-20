import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  CheckCircle2,
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
  X,
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
import { EmptyState, FeedCard, getCaseProgress, MobileBanner, PageHeader, SegmentedTabs } from '../components/ui';
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
    const ordered: LabCase[] = [];
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
  const [testModalCase, setTestModalCase] = useState<LabCase | null>(null);

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

  // Open modal if ?sample= query parameter is present in URL
  useEffect(() => {
    const queryId = searchParams.get('sample');
    if (queryId) {
      const matched = cases.find(
        (c) => c.caseId === queryId || c.sampleCode === queryId
      );
      if (matched && (!testModalCase || testModalCase.caseId !== matched.caseId)) {
        setTestModalCase(matched);
      }
    }
  }, [searchParams, cases, testModalCase]);

  // Keep testModalCase in sync with cases updates
  useEffect(() => {
    if (!testModalCase) return;
    const fresh = cases.find((c) => c.caseId === testModalCase.caseId);
    if (fresh && fresh !== testModalCase) {
      setTestModalCase(fresh);
    }
  }, [cases, testModalCase]);

  const modalCategoryParams = useMemo(
    () =>
      testModalCase
        ? masters.parameters.filter((p) => p.category === testModalCase.category)
        : [],
    [masters.parameters, testModalCase]
  );

  const modalCompetitor = useMemo(
    () =>
      testModalCase
        ? masters.competitors.find((c) => c.id === testModalCase.competitorId)
        : undefined,
    [masters.competitors, testModalCase]
  );

  const [drafts, setDrafts] = useState<Record<string, DraftEntry>>({});
  const [stagedAttachments, setStagedAttachments] = useState<StagedAttachment[]>([]);
  const [validationError, setValidationError] = useState('');
  const [savingMode, setSavingMode] = useState<'draft' | 'complete' | null>(null);

  // Initialize draft inputs when testModalCase changes
  useEffect(() => {
    if (!testModalCase) return;
    const nextDrafts: Record<string, DraftEntry> = {};
    modalCategoryParams.forEach((param) => {
      const existing = testModalCase.results?.find(
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
  }, [testModalCase?.caseId, modalCategoryParams]);

  const parsedResults = useMemo(() => {
    return modalCategoryParams.map((param) => {
      const raw = drafts[param.parameterId]?.measuredValue?.trim() ?? '';
      const num = raw === '' ? null : Number(raw);
      return {
        parameterId: param.parameterId,
        measuredValue: num !== null && Number.isFinite(num) ? num : null,
        notes: drafts[param.parameterId]?.notes?.trim() || undefined,
      };
    });
  }, [modalCategoryParams, drafts]);

  const totalParameterCount = modalCategoryParams.length;
  const measuredParameterCount = parsedResults.filter((r) => r.measuredValue !== null).length;
  const allParametersMeasured = areAllParametersMeasured(modalCategoryParams, parsedResults);

  const handleOpenTestModal = (item: LabCase) => {
    setTestModalCase(item);
    setSearchParams({ sample: item.caseId });
  };

  const handleCloseTestModal = () => {
    setTestModalCase(null);
    setStagedAttachments([]);
    setValidationError('');
    if (searchParams.get('sample')) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('sample');
      setSearchParams(nextParams, { replace: true });
    }
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
    if (!canEditTestEntry || !testModalCase) return;
    if (modalCategoryParams.length === 0) {
      if (markCompleted) {
        setValidationError(
          'Configure at least one template parameter in Test Templates before marking testing completed.'
        );
      }
      return;
    }

    if (markCompleted && !allParametersMeasured) {
      setValidationError(
        `Enter valid numeric measurements for all ${modalCategoryParams.length} parameters before marking testing completed.`
      );
      return;
    }

    setSavingMode(markCompleted ? 'complete' : 'draft');
    try {
      const nextSnap = await saveTest({
        caseId: testModalCase.caseId,
        results: parsedResults,
        attachments: stagedAttachments.map((a) => ({ name: a.name, dataUrl: a.dataUrl })),
        markCompleted,
      });

      if (nextSnap) {
        setStagedAttachments([]);
        if (markCompleted) {
          handleCloseTestModal();
          if (canViewComparison) {
            navigate(`/comparison?sample=${testModalCase.caseId}`);
          }
        } else {
          const fresh = nextSnap.cases.find((c) => c.caseId === testModalCase.caseId);
          if (fresh) {
            setTestModalCase(fresh);
          }
        }
      }
    } finally {
      setSavingMode(null);
    }
  };

  const viewOnly = !canEditTestEntry;
  const overdueTests = testableCases.filter((c) => isCaseOverdue(c)).length;
  const resultPassed = (c: LabCase) => (c.overallResult === 'Pass' ? true : c.overallResult === 'Fail' ? false : null);

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Laboratory" title="Test Entry" viewOnly={viewOnly} />

      <MobileBanner
        label={activeTab === 'entry' ? 'Samples ready to test' : 'Completed tests'}
        count={activeTab === 'entry' ? testableCases.length : completedTestCases.length}
        caption={
          activeTab === 'entry'
            ? overdueTests > 0
              ? `${overdueTests} overdue · ${completedTestCases.length} completed`
              : `${completedTestCases.length} completed so far`
            : `${testableCases.length} still in the queue`
        }
        icon={activeTab === 'entry' ? <History className="w-[18px] h-[18px]" /> : <FlaskConical className="w-[18px] h-[18px]" />}
        iconLabel={activeTab === 'entry' ? 'Show test history' : 'Show active queue'}
        onIconClick={() => setActiveTab(activeTab === 'entry' ? 'history' : 'entry')}
        viewOnly={viewOnly}
      />

      <div className="md:glass md:rounded-2xl md:p-3 flex items-center gap-3">
        <SegmentedTabs
          ariaLabel="Test entry view"
          value={activeTab}
          onChange={setActiveTab}
          options={[
            { value: 'entry', label: 'Active queue', count: testableCases.length, icon: <FileText className="w-3.5 h-3.5" /> },
            { value: 'history', label: 'History', count: completedTestCases.length, icon: <History className="w-3.5 h-3.5" /> },
          ]}
        />
        <p className="hidden lg:block text-xs text-[var(--text-muted)] ml-auto pr-2">
          {activeTab === 'entry'
            ? 'Samples received and ready for bench measurement (Stage 4)'
            : 'Cases with lab testing completed (Actual 4 stamped)'}
        </p>
      </div>

      {activeTab === 'history' ? (
        <>
          {/* Mobile history cards */}
          <div className="md:hidden space-y-3">
            {completedTestCases.length === 0 ? (
              <div className="feed-card">
                <EmptyState icon={<History className="w-5 h-5" />} title="No completed tests yet" />
              </div>
            ) : (
              paginatedCompletedCases.map((c) => (
                <FeedCard
                  key={c.caseId}
                  id={c.sampleCode ? `${c.caseId} · ${c.sampleCode}` : c.caseId}
                  title={c.customer}
                  subtitle={`${c.product} · ${c.category}`}
                  onOpen={() => setDetailCase(c)}
                  openLabel={`View details for ${c.caseId}`}
                  meta={[
                    { label: 'Tested by', value: c.testedBy || '—' },
                    {
                      label: 'Pass / Fail',
                      value: (
                        <span className="font-mono">
                          <span style={{ color: 'var(--status-success-fg)' }}>{c.passCount ?? 0}P</span> /{' '}
                          <span style={{ color: 'var(--status-danger-fg)' }}>{c.failCount ?? 0}F</span>
                        </span>
                      ),
                    },
                    { label: 'Completed', value: <span className="font-mono">{formatShortDate(c.actual4) || '—'}</span> },
                  ]}
                  progress={getCaseProgress(c)}
                  footerLeft={c.category}
                  footerRight={<PassFailBadge passed={resultPassed(c)} />}
                />
              ))
            )}
          </div>

          {/* Desktop history table */}
          <div className="hidden md:block fin-card p-4 lg:p-5">
            <div className="fin-table-wrap">
              <table className="w-full min-w-[860px] text-left border-collapse text-[13px]">
                <thead>
                  <tr className="fin-table-head text-[11px] uppercase">
                    <th className="py-3 px-3 rounded-l-xl whitespace-nowrap">Case ID</th>
                    <th className="py-3 px-3 whitespace-nowrap">Sample Code</th>
                    <th className="py-3 px-3 whitespace-nowrap">Customer &amp; Product</th>
                    <th className="py-3 px-3 whitespace-nowrap">Category</th>
                    <th className="py-3 px-3 whitespace-nowrap">Tested By</th>
                    <th className="py-3 px-3 whitespace-nowrap">Overall Result</th>
                    <th className="py-3 px-3 text-center whitespace-nowrap">Pass / Fail</th>
                    <th className="py-3 px-3 rounded-r-xl whitespace-nowrap">Completed (Actual 4)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {completedTestCases.length === 0 ? (
                    <tr>
                      <td colSpan={8}>
                        <EmptyState icon={<History className="w-5 h-5" />} title="No completed laboratory tests recorded yet" />
                      </td>
                    </tr>
                  ) : (
                    paginatedCompletedCases.map((c) => (
                      <tr key={c.caseId} className="fin-table-row cursor-pointer" onClick={() => setDetailCase(c)}>
                        <td className="py-3 px-3 font-mono font-bold text-xs text-[var(--color-primary)] whitespace-nowrap">{c.caseId}</td>
                        <td className="py-3 px-3 font-mono text-xs whitespace-nowrap">{c.sampleCode || '—'}</td>
                        <td className="py-3 px-3">
                          <p className="font-semibold text-[var(--text-heading)]">{c.customer}</p>
                          <p className="text-xs text-[var(--text-muted)]">{c.product}</p>
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">{c.category}</td>
                        <td className="py-3 px-3 whitespace-nowrap">{c.testedBy || '—'}</td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <PassFailBadge passed={resultPassed(c)} />
                        </td>
                        <td className="py-3 px-3 font-mono text-xs text-center whitespace-nowrap">
                          <span className="font-semibold" style={{ color: 'var(--status-success-fg)' }}>{c.passCount ?? 0}P</span> /{' '}
                          <span className="font-semibold" style={{ color: 'var(--status-danger-fg)' }}>{c.failCount ?? 0}F</span>
                        </td>
                        <td className="py-3 px-3 font-mono text-xs text-[var(--text-muted)] whitespace-nowrap">
                          {formatDateTime(c.actual4) || '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <Pagination
            currentPage={historyPage}
            totalItems={completedTestCases.length}
            pageSize={historyPageSize}
            onPageChange={setHistoryPage}
            onPageSizeChange={setHistoryPageSize}
          />
        </>
      ) : (
        <>
          {/* Mobile queue cards */}
          <div className="md:hidden space-y-3">
            {testableCases.length === 0 ? (
              <div className="feed-card">
                <EmptyState
                  icon={<FlaskConical className="w-5 h-5" />}
                  title="Nothing to test right now"
                  hint="A sample must be received on the Samples page before measurements can be entered."
                />
              </div>
            ) : (
              paginatedTestableCases.map((item) => {
                const overdue = isCaseOverdue(item);
                return (
                  <FeedCard
                    key={item.caseId}
                    id={item.sampleCode ? `${item.caseId} · ${item.sampleCode}` : item.caseId}
                    title={item.sampleName || item.product}
                    subtitle={item.customer}
                    onOpen={() => setDetailCase(item)}
                    openLabel={`View details for ${item.caseId}`}
                    highlight={overdue}
                    meta={[
                      { label: 'Category', value: item.category || '—' },
                      { label: 'Measured', value: <span className="font-mono">{item.results?.filter((r) => r.measuredValue !== null).length ?? 0}</span> },
                      {
                        label: overdue ? 'Overdue' : 'Due',
                        value: (
                          <span className="font-mono" style={overdue ? { color: 'var(--status-danger-fg)' } : undefined}>
                            {formatShortDate(item.pendingPlanned || item.expectedDate) || '—'}
                          </span>
                        ),
                      },
                    ]}
                    progress={getCaseProgress(item)}
                    progressTone={overdue ? 'danger' : 'brand'}
                    footerRight={<SampleStatusBadge status={item.status} />}
                    actions={
                      <button
                        type="button"
                        onClick={() => handleOpenTestModal(item)}
                        className={`${canEditTestEntry ? 'fin-btn-primary' : 'fin-btn-secondary'} h-11 inline-flex items-center justify-center gap-1.5 text-sm`}
                      >
                        <FlaskConical className="w-4 h-4" aria-hidden="true" />
                        {canEditTestEntry ? 'Enter Test Results' : 'View Test'}
                      </button>
                    }
                  />
                );
              })
            )}
          </div>

          {/* Desktop queue table */}
          <div className="hidden md:block fin-card p-4 lg:p-5">
            <div className="fin-table-wrap">
              <table className="min-w-[860px] w-full text-left border-collapse text-[13px]">
                <thead>
                  <tr className="fin-table-head text-[11px] uppercase">
                    <th className="py-3 px-3 rounded-l-xl whitespace-nowrap">Actions</th>
                    <th className="py-3 px-3 whitespace-nowrap">Case ID</th>
                    <th className="py-3 px-3 whitespace-nowrap">Sample Code</th>
                    <th className="py-3 px-3 whitespace-nowrap">Customer &amp; Product</th>
                    <th className="py-3 px-3 whitespace-nowrap">Category</th>
                    <th className="py-3 px-3 whitespace-nowrap">Planned / Expected</th>
                    <th className="py-3 px-3 rounded-r-xl whitespace-nowrap">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {testableCases.length === 0 ? (
                    <tr>
                      <td colSpan={7}>
                        <EmptyState
                          icon={<FlaskConical className="w-5 h-5" />}
                          title="No Received or Testing samples available"
                          hint="A sample must be received on the Samples page before test measurements can be entered."
                        />
                      </td>
                    </tr>
                  ) : (
                    paginatedTestableCases.map((item) => {
                      const overdue = isCaseOverdue(item);
                      return (
                        <tr
                          key={item.caseId}
                          className="fin-table-row"
                          style={overdue ? { backgroundColor: 'var(--status-danger-bg)' } : undefined}
                        >
                          <td className="py-3 px-3 whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleOpenTestModal(item)}
                                className={`${canEditTestEntry ? 'fin-btn-primary' : 'fin-btn-secondary'} !min-h-9 h-9 inline-flex items-center gap-1.5 px-3 text-xs !rounded-full`}
                              >
                                <FlaskConical className="w-3.5 h-3.5" aria-hidden="true" />
                                {canEditTestEntry ? 'Enter Test' : 'View Test'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setDetailCase(item)}
                                aria-label={`View details for ${item.caseId}`}
                                title="View case details"
                                className="w-9 h-9 rounded-full inline-flex items-center justify-center border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--color-primary)] hover:bg-[var(--mint)] transition-colors"
                              >
                                <Eye className="w-4 h-4" aria-hidden="true" />
                              </button>
                            </div>
                          </td>
                          <td className="py-3 px-3 font-mono font-bold text-xs text-[var(--color-primary)] whitespace-nowrap">{item.caseId}</td>
                          <td className="py-3 px-3 font-mono text-xs whitespace-nowrap">{item.sampleCode || '—'}</td>
                          <td className="py-3 px-3">
                            <p className="font-semibold text-[var(--text-heading)]">{item.customer}</p>
                            <p className="text-xs text-[var(--text-muted)]">{item.sampleName || item.product}</p>
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap">{item.category}</td>
                          <td
                            className="py-3 px-3 font-mono whitespace-nowrap text-xs"
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
                          <td className="py-3 px-3 whitespace-nowrap">
                            <SampleStatusBadge status={item.status} />
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <Pagination
            currentPage={entryPage}
            totalItems={testableCases.length}
            pageSize={entryPageSize}
            onPageChange={setEntryPage}
            onPageSizeChange={setEntryPageSize}
          />
        </>
      )}

      {/* Test Entry Modal (Dialog Popup) */}
      {testModalCase && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="test-entry-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center fin-modal-backdrop p-3 sm:p-5"
        >
          <div className="fin-modal-panel w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-[var(--border-subtle)] flex items-start justify-between gap-3 shrink-0">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="font-mono text-xs font-bold text-[var(--color-primary)] bg-[var(--color-primary-soft)] px-2 py-0.5 rounded">
                    {testModalCase.caseId}
                  </span>
                  {testModalCase.sampleCode && (
                    <span className="font-mono text-xs text-[var(--text-muted)]">
                      ({testModalCase.sampleCode})
                    </span>
                  )}
                  <SampleStatusBadge status={testModalCase.status} />
                  <OverdueChip delayDays={testModalCase.pendingDelay} />
                </div>
                <h2
                  id="test-entry-modal-title"
                  className="text-base sm:text-lg font-bold text-[var(--text-heading)] truncate"
                >
                  {testModalCase.sampleName || testModalCase.product} — Laboratory Test Measurements
                </h2>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--text-muted)] mt-1">
                  <span>Customer: <strong className="text-[var(--text-heading)]">{testModalCase.customer}</strong></span>
                  <span>Competitor: <strong className="text-[var(--text-heading)]">{modalCompetitor?.name || testModalCase.competitorName || '—'}</strong></span>
                  <span>Category: <strong className="text-[var(--text-heading)]">{testModalCase.category}</strong></span>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseTestModal}
                className="fin-icon-btn shrink-0"
                aria-label="Close test entry modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <div className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1 min-h-0">
              {/* Parameters Table Card */}
              <div className="sheet-section sm:p-5 overflow-hidden">
                <div className="pb-3 mb-3 border-b border-[var(--border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-[var(--text-heading)]">
                      Template Parameters · {testModalCase.category}
                    </h3>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">
                      {canEditTestEntry
                        ? 'Enter measured competitor values. Pass/Fail evaluates automatically against allowed specification limits.'
                        : 'Read-only view. Full access on Test Entry is required to record measurements.'}
                    </p>
                  </div>
                </div>

                {modalCategoryParams.length === 0 ? (
                  <div className="py-8 text-center text-sm text-[var(--text-muted)]">
                    No parameters configured for category &ldquo;{testModalCase.category}&rdquo;. Add parameters in Test Templates first.
                  </div>
                ) : (
                  <>
                  {/* Phone: one card per parameter */}
                  <div className="md:hidden space-y-3">
                    {modalCategoryParams.map((param) => {
                      const draft = drafts[param.parameterId] ?? { measuredValue: '', notes: '' };
                      const raw = draft.measuredValue.trim();
                      const num = raw === '' ? null : Number(raw);
                      const passed =
                        num !== null && !Number.isNaN(num)
                          ? isMeasurementWithinRange(num, param.minValue, param.maxValue)
                          : null;
                      return (
                        <div
                          key={param.parameterId}
                          className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-muted)] p-3.5"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-semibold text-sm text-[var(--text-heading)]">{param.name}</p>
                              <p className="text-[11px] text-[var(--text-muted)] font-mono mt-0.5">
                                {param.minValue} – {param.maxValue} {param.unit} · std{' '}
                                <span className="text-[var(--color-primary)] font-bold">{param.ourStandardValue}</span>
                              </p>
                            </div>
                            <PassFailBadge passed={passed} />
                          </div>
                          <div className="flex items-center gap-2 mt-3">
                            <input
                              type="number"
                              inputMode="decimal"
                              step="any"
                              disabled={!canEditTestEntry}
                              aria-label={`Measured value for ${param.name}`}
                              value={draft.measuredValue}
                              onChange={(e) => handleDraftChange(param.parameterId, 'measuredValue', e.target.value)}
                              placeholder="Measured value"
                              className="fin-input flex-1 min-w-0 px-3 font-mono tabular-nums"
                            />
                            <span className="text-xs font-mono text-[var(--text-muted)] shrink-0 w-10">{param.unit}</span>
                          </div>
                          <input
                            type="text"
                            disabled={!canEditTestEntry}
                            aria-label={`Lab notes for ${param.name}`}
                            value={draft.notes}
                            onChange={(e) => handleDraftChange(param.parameterId, 'notes', e.target.value)}
                            placeholder="Technician notes (optional)"
                            className="fin-input w-full px-3 mt-2"
                          />
                        </div>
                      );
                    })}
                  </div>

                  <div className="hidden md:block overflow-x-auto">
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
                        {modalCategoryParams.map((param) => {
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
                  </>
                )}
              </div>

              {/* Lab Photos & Instrument Files Section */}
              <div className="sheet-section space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-bold text-[var(--text-heading)]">
                      Lab Photos &amp; Instrument Files
                    </h4>
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

                {testModalCase.attachmentList.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-semibold text-[var(--text-muted)]">
                      Saved Attachments ({testModalCase.attachmentList.length})
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {testModalCase.attachmentList.map((att, idx) => (
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

                {testModalCase.attachmentList.length === 0 && stagedAttachments.length === 0 && (
                  <p className="text-xs text-[var(--text-muted)] flex items-center gap-1.5">
                    <Paperclip className="w-3.5 h-3.5" aria-hidden="true" />
                    No attachments uploaded for this sample yet.
                  </p>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 sm:p-5 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
              <div className="min-w-0">
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
                    {measuredParameterCount} of {totalParameterCount} parameters measured — complete all measurements to enable Submit &amp; Mark Completed.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 w-full sm:w-auto sm:flex sm:items-center sm:gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={handleCloseTestModal}
                  className="fin-btn-secondary hidden sm:inline-flex items-center gap-1.5 px-4 py-2.5 text-xs whitespace-nowrap"
                >
                  Close
                </button>
                {canEditTestEntry && (
                  <>
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
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {detailCase && (
        <CaseDetailModal labCase={detailCase} onClose={() => setDetailCase(null)} />
      )}
    </div>
  );
}
