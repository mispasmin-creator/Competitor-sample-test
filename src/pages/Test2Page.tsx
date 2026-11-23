import { useMemo, useState } from 'react';
import { FileText, FlaskRound, History } from 'lucide-react';
import { useLab } from '../context/LabContext';
import { canFullAccessPage } from '../utils/auth';
import { formatDateTime, formatShortDate } from '../utils/fileHelpers';
import { isCaseOverdue } from '../utils/labCalculations';
import { CaseDetailModal } from '../components/CaseDetailModal';
import { Test2Dialog } from '../components/Test2Dialog';
import { OverdueChip } from '../components/StatusBadge';
import { Pagination } from '../components/Pagination';
import { EmptyState, FeedCard, getCaseProgress, MobileBanner, PageHeader, SegmentedTabs } from '../components/ui';
import type { LabCase } from '../types/lab';

/** Step 5: Test 2. A case is pending here while Planned 5 is filled and Actual 5 is empty. */
export function Test2Page() {
  const { cases, currentUser } = useLab();
  // Same permission as Test 1 (no separate Users column needed).
  const canEdit = canFullAccessPage(currentUser, 'testEntry');

  const [activeTab, setActiveTab] = useState<'entry' | 'history'>('entry');
  const [detailCase, setDetailCase] = useState<LabCase | null>(null);
  const [dialogCase, setDialogCase] = useState<LabCase | null>(null);
  const [entryPage, setEntryPage] = useState(1);
  const [entryPageSize, setEntryPageSize] = useState(10);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState(10);

  // Pending = Planned 5 filled and Actual 5 empty (Planned 5 is the sheet formula off Actual 4).
  const pendingCases = useMemo(
    () =>
      cases
        .filter((c) => Boolean(String(c.planned5 ?? '').trim()) && !String(c.actual5 ?? '').trim())
        .sort((a, b) => String(a.planned5).localeCompare(String(b.planned5))),
    [cases]
  );
  const doneCases = useMemo(
    () => cases.filter((c) => Boolean(String(c.actual5 ?? '').trim())).sort((a, b) => String(b.actual5).localeCompare(String(a.actual5))),
    [cases]
  );

  const pagedPending = pendingCases.slice((entryPage - 1) * entryPageSize, entryPage * entryPageSize);
  const pagedDone = doneCases.slice((historyPage - 1) * historyPageSize, historyPage * historyPageSize);
  const overdue = (c: LabCase) => c.pendingStageNo === 5 && isCaseOverdue(c);
  const overdueCount = pendingCases.filter(overdue).length;

  const actionButton = (c: LabCase, size: 'sm' | 'lg') => (
    <button
      type="button"
      onClick={() => setDialogCase(c)}
      className={
        size === 'sm'
          ? `${canEdit ? 'fin-btn-primary' : 'fin-btn-secondary'} !min-h-9 h-9 inline-flex items-center gap-1.5 px-3 text-xs !rounded-full`
          : `${canEdit ? 'fin-btn-primary' : 'fin-btn-secondary'} h-11 inline-flex items-center justify-center gap-1.5 text-sm`
      }
    >
      <FlaskRound className={size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'} aria-hidden="true" />
      {canEdit ? 'Enter Test 2' : 'View'}
    </button>
  );

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Laboratory" title="Test 2" viewOnly={!canEdit} />

      <MobileBanner
        label={activeTab === 'entry' ? 'Ready for Test 2' : 'Test 2 completed'}
        count={activeTab === 'entry' ? pendingCases.length : doneCases.length}
        caption={
          activeTab === 'entry'
            ? overdueCount > 0
              ? `${overdueCount} overdue · ${doneCases.length} completed`
              : `${doneCases.length} completed so far`
            : `${pendingCases.length} still in the queue`
        }
        icon={activeTab === 'entry' ? <History className="w-[18px] h-[18px]" /> : <FlaskRound className="w-[18px] h-[18px]" />}
        iconLabel={activeTab === 'entry' ? 'Show history' : 'Show active queue'}
        onIconClick={() => setActiveTab(activeTab === 'entry' ? 'history' : 'entry')}
        viewOnly={!canEdit}
      />

      <div className="md:glass md:rounded-2xl md:p-3 flex items-center gap-3">
        <SegmentedTabs
          ariaLabel="Test 2 view"
          value={activeTab}
          onChange={setActiveTab}
          options={[
            { value: 'entry', label: 'Active queue', count: pendingCases.length, icon: <FileText className="w-3.5 h-3.5" /> },
            { value: 'history', label: 'History', count: doneCases.length, icon: <History className="w-3.5 h-3.5" /> },
          ]}
        />
        <p className="hidden lg:block text-xs text-[var(--text-muted)] ml-auto pr-2">
          {activeTab === 'entry' ? 'Test 1 done, waiting for physical Test 2 (Stage 5)' : 'Cases with Test 2 completed (Actual 5 stamped)'}
        </p>
      </div>

      {activeTab === 'entry' ? (
        <>
          <div className="md:hidden space-y-3">
            {pendingCases.length === 0 ? (
              <div className="feed-card">
                <EmptyState icon={<FlaskRound className="w-5 h-5" />} title="Nothing waiting for Test 2" hint="A case comes here after Test 1 is saved." />
              </div>
            ) : (
              pagedPending.map((c) => (
                <FeedCard
                  key={c.caseId}
                  id={c.sampleCode ? `${c.caseId} · ${c.sampleCode}` : c.caseId}
                  title={c.sampleName || c.product}
                  subtitle={c.customer}
                  onOpen={() => setDetailCase(c)}
                  openLabel={`View details for ${c.caseId}`}
                  highlight={overdue(c)}
                  meta={[
                    { label: 'Category', value: c.category || '—' },
                    { label: 'Test 1', value: c.testStatus || '—' },
                    { label: 'Due', value: <span className="font-mono">{formatShortDate(c.planned5) || '—'}</span> },
                  ]}
                  progress={getCaseProgress(c)}
                  progressTone={overdue(c) ? 'danger' : 'brand'}
                  actions={actionButton(c, 'lg')}
                />
              ))
            )}
          </div>

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
                    <th className="py-3 px-3 whitespace-nowrap">Test 1 Status</th>
                    <th className="py-3 px-3 rounded-r-xl whitespace-nowrap">Planned (Stage 5)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {pendingCases.length === 0 ? (
                    <tr>
                      <td colSpan={7}>
                        <EmptyState icon={<FlaskRound className="w-5 h-5" />} title="Nothing waiting for Test 2" hint="A case comes here after Test 1 is saved." />
                      </td>
                    </tr>
                  ) : (
                    pagedPending.map((c) => (
                      <tr
                        key={c.caseId}
                        onClick={() => setDetailCase(c)}
                        title="Open case details"
                        className="fin-table-row cursor-pointer"
                        style={overdue(c) ? { backgroundColor: 'var(--status-danger-bg)' } : undefined}
                      >
                        <td className="py-3 px-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          {actionButton(c, 'sm')}
                        </td>
                        <td className="py-3 px-3 font-mono font-bold text-xs text-[var(--color-primary)] whitespace-nowrap">{c.caseId}</td>
                        <td className="py-3 px-3 font-mono text-xs whitespace-nowrap">{c.sampleCode || '—'}</td>
                        <td className="py-3 px-3">
                          <p className="font-semibold text-[var(--text-heading)]">{c.customer}</p>
                          <p className="text-xs text-[var(--text-muted)]">{c.sampleName || c.product}</p>
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">{c.category}</td>
                        <td className="py-3 px-3 whitespace-nowrap">{c.testStatus || '—'}</td>
                        <td className="py-3 px-3 font-mono text-xs whitespace-nowrap">
                          <div>{formatShortDate(c.planned5) || '—'}</div>
                          {c.pendingStageNo === 5 && (
                            <div className="mt-0.5">
                              <OverdueChip delayDays={c.pendingDelay} />
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <Pagination currentPage={entryPage} totalItems={pendingCases.length} pageSize={entryPageSize} onPageChange={setEntryPage} onPageSizeChange={setEntryPageSize} />
        </>
      ) : (
        <>
          <div className="md:hidden space-y-3">
            {doneCases.length === 0 ? (
              <div className="feed-card">
                <EmptyState icon={<History className="w-5 h-5" />} title="No Test 2 completed yet" />
              </div>
            ) : (
              pagedDone.map((c) => (
                <FeedCard
                  key={c.caseId}
                  id={c.sampleCode ? `${c.caseId} · ${c.sampleCode}` : c.caseId}
                  title={c.customer}
                  subtitle={`${c.product} · ${c.category}`}
                  onOpen={() => setDetailCase(c)}
                  openLabel={`View details for ${c.caseId}`}
                  meta={[
                    { label: 'Status', value: c.test2Status || '—' },
                    { label: 'Tested by', value: c.testedBy2 || '—' },
                    { label: 'Completed', value: <span className="font-mono">{formatShortDate(c.actual5) || '—'}</span> },
                  ]}
                  progress={getCaseProgress(c)}
                  footerLeft={c.category}
                />
              ))
            )}
          </div>

          <div className="hidden md:block fin-card p-4 lg:p-5">
            <div className="fin-table-wrap">
              <table className="w-full min-w-[860px] text-left border-collapse text-[13px]">
                <thead>
                  <tr className="fin-table-head text-[11px] uppercase">
                    <th className="py-3 px-3 rounded-l-xl whitespace-nowrap">Case ID</th>
                    <th className="py-3 px-3 whitespace-nowrap">Sample Code</th>
                    <th className="py-3 px-3 whitespace-nowrap">Customer &amp; Product</th>
                    <th className="py-3 px-3 whitespace-nowrap">Test 2 Status</th>
                    <th className="py-3 px-3 whitespace-nowrap">Tested By</th>
                    <th className="py-3 px-3 whitespace-nowrap">BD 110 / CCS 100</th>
                    <th className="py-3 px-3 whitespace-nowrap">BD 1100 / CCS 1100 / PLC 1100</th>
                    <th className="py-3 px-3 rounded-r-xl whitespace-nowrap">Completed (Actual 5)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {doneCases.length === 0 ? (
                    <tr>
                      <td colSpan={8}>
                        <EmptyState icon={<History className="w-5 h-5" />} title="No Test 2 completed yet" />
                      </td>
                    </tr>
                  ) : (
                    pagedDone.map((c) => {
                      const r = c as unknown as Record<string, unknown>;
                      const v = (k: string) => (r[k] !== undefined && r[k] !== null && String(r[k]) !== '' ? String(r[k]) : '—');
                      return (
                        <tr key={c.caseId} className="fin-table-row cursor-pointer" onClick={() => setDetailCase(c)}>
                          <td className="py-3 px-3 font-mono font-bold text-xs text-[var(--color-primary)] whitespace-nowrap">{c.caseId}</td>
                          <td className="py-3 px-3 font-mono text-xs whitespace-nowrap">{c.sampleCode || '—'}</td>
                          <td className="py-3 px-3">
                            <p className="font-semibold text-[var(--text-heading)]">{c.customer}</p>
                            <p className="text-xs text-[var(--text-muted)]">{c.product}</p>
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap">{c.test2Status || '—'}</td>
                          <td className="py-3 px-3 whitespace-nowrap">{c.testedBy2 || '—'}</td>
                          <td className="py-3 px-3 font-mono text-xs whitespace-nowrap">{v('bdAt110C')} / {v('ccsAt100C')}</td>
                          <td className="py-3 px-3 font-mono text-xs whitespace-nowrap">{v('bdAt1100C')} / {v('ccsAt1100C')} / {v('plcAt1100C')}</td>
                          <td className="py-3 px-3 font-mono text-xs text-[var(--text-muted)] whitespace-nowrap">{formatDateTime(c.actual5) || '—'}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <Pagination currentPage={historyPage} totalItems={doneCases.length} pageSize={historyPageSize} onPageChange={setHistoryPage} onPageSizeChange={setHistoryPageSize} />
        </>
      )}

      {dialogCase && <Test2Dialog labCase={dialogCase} canEdit={canEdit} onClose={() => setDialogCase(null)} />}
      {detailCase && <CaseDetailModal labCase={detailCase} onClose={() => setDetailCase(null)} />}
    </div>
  );
}
