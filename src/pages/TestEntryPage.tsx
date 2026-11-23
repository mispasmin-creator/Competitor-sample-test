import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FileText, FlaskConical, History } from 'lucide-react';
import { useLab } from '../context/LabContext';
import { canFullAccessPage } from '../utils/auth';
import { formatDateTime, formatShortDate } from '../utils/fileHelpers';
import { getPendingCasesForStage, isCaseOverdue } from '../utils/labCalculations';
import { CaseDetailModal } from '../components/CaseDetailModal';
import { LabTestDialog } from '../components/LabTestDialog';
import { OverdueChip, PassFailBadge, SampleStatusBadge } from '../components/StatusBadge';
import { Pagination } from '../components/Pagination';
import { EmptyState, FeedCard, getCaseProgress, MobileBanner, PageHeader, SegmentedTabs } from '../components/ui';
import type { LabCase } from '../types/lab';

export function TestEntryPage() {
  const { cases, currentUser } = useLab();
  const [searchParams, setSearchParams] = useSearchParams();

  const canEditTestEntry = canFullAccessPage(currentUser, 'testEntry');

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

  // Open the dialog when the URL carries ?sample=<id> (e.g. from the Samples page).
  // Runs only when the URL changes: closing the dialog must not reopen it while the URL update is still pending
  // (that was the "close needs two clicks" bug).
  const sampleParam = searchParams.get('sample');
  useEffect(() => {
    if (!sampleParam) return;
    const matched = cases.find((c) => c.caseId === sampleParam || c.sampleCode === sampleParam);
    if (matched) setTestModalCase(matched);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sampleParam, cases.length]);

  // Keep testModalCase in sync with cases updates
  useEffect(() => {
    if (!testModalCase) return;
    const fresh = cases.find((c) => c.caseId === testModalCase.caseId);
    if (fresh && fresh !== testModalCase) {
      setTestModalCase(fresh);
    }
  }, [cases, testModalCase]);

  // Opening from the table doesn't touch the URL; only the ?sample= deep link does.
  const handleOpenTestModal = (item: LabCase) => setTestModalCase(item);

  const handleCloseTestModal = () => {
    setTestModalCase(null);
    if (sampleParam) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('sample');
      setSearchParams(nextParams, { replace: true });
    }
  };

  const viewOnly = !canEditTestEntry;
  const overdueTests = testableCases.filter((c) => isCaseOverdue(c)).length;
  const resultPassed = (c: LabCase) => (c.overallResult === 'Pass' ? true : c.overallResult === 'Fail' ? false : null);

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Laboratory" title="Test 1" viewOnly={viewOnly} />

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
          ariaLabel="Test 1 view"
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
                          onClick={() => setDetailCase(item)}
                          title="Open case details"
                          className="fin-table-row cursor-pointer"
                          style={overdue ? { backgroundColor: 'var(--status-danger-bg)' } : undefined}
                        >
                          <td className="py-3 px-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleOpenTestModal(item)}
                                className={`${canEditTestEntry ? 'fin-btn-primary' : 'fin-btn-secondary'} !min-h-9 h-9 inline-flex items-center gap-1.5 px-3 text-xs !rounded-full`}
                              >
                                <FlaskConical className="w-3.5 h-3.5" aria-hidden="true" />
                                {canEditTestEntry ? 'Enter Test' : 'View Test'}
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

      {/* Enter Test dialog */}
      {testModalCase && (
        <LabTestDialog labCase={testModalCase} canEdit={canEditTestEntry} onClose={handleCloseTestModal} />
      )}

      {detailCase && (
        <CaseDetailModal labCase={detailCase} onClose={() => setDetailCase(null)} />
      )}
    </div>
  );
}
