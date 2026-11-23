import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ClipboardCheck, FileText, History, Loader2, X } from 'lucide-react';
import { useLab } from '../context/LabContext';
import { canFullAccessPage } from '../utils/auth';
import { formatDateTime, formatShortDate } from '../utils/fileHelpers';
import { isCaseOverdue } from '../utils/labCalculations';
import { CaseDetailModal } from '../components/CaseDetailModal';
import { OverdueChip } from '../components/StatusBadge';
import { Pagination } from '../components/Pagination';
import { EmptyState, FeedCard, getCaseProgress, MobileBanner, PageHeader, SegmentedTabs } from '../components/ui';
import type { LabCase } from '../types/lab';

const filled = (v: unknown) => String(v ?? '').trim() !== '';

/** Step 6: Management Action. Pending while Planned 6 (sheet formula) is filled and Actual 6 is empty. */
export function ManagementPage() {
  const { cases, currentUser } = useLab();
  const canEdit = canFullAccessPage(currentUser, 'management');

  const [activeTab, setActiveTab] = useState<'entry' | 'history'>('entry');
  const [detailCase, setDetailCase] = useState<LabCase | null>(null);
  const [dialogCase, setDialogCase] = useState<LabCase | null>(null);
  const [entryPage, setEntryPage] = useState(1);
  const [entryPageSize, setEntryPageSize] = useState(10);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState(10);

  const pendingCases = useMemo(
    () => cases.filter((c) => filled(c.planned6) && !filled(c.actual6)).sort((a, b) => String(a.planned6).localeCompare(String(b.planned6))),
    [cases]
  );
  const doneCases = useMemo(
    () => cases.filter((c) => filled(c.actual6)).sort((a, b) => String(b.actual6).localeCompare(String(a.actual6))),
    [cases]
  );
  const pagedPending = pendingCases.slice((entryPage - 1) * entryPageSize, entryPage * entryPageSize);
  const pagedDone = doneCases.slice((historyPage - 1) * historyPageSize, historyPage * historyPageSize);
  const overdue = (c: LabCase) => c.pendingStageNo === 6 && isCaseOverdue(c);
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
      <ClipboardCheck className={size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'} aria-hidden="true" />
      {canEdit ? 'Take Action' : 'View'}
    </button>
  );

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Workflow" title="Management Action" viewOnly={!canEdit} />

      <MobileBanner
        label={activeTab === 'entry' ? 'Waiting for management' : 'Actions completed'}
        count={activeTab === 'entry' ? pendingCases.length : doneCases.length}
        caption={
          activeTab === 'entry'
            ? overdueCount > 0
              ? `${overdueCount} overdue · ${doneCases.length} completed`
              : `${doneCases.length} completed so far`
            : `${pendingCases.length} still pending`
        }
        icon={activeTab === 'entry' ? <History className="w-[18px] h-[18px]" /> : <ClipboardCheck className="w-[18px] h-[18px]" />}
        iconLabel={activeTab === 'entry' ? 'Show history' : 'Show pending'}
        onIconClick={() => setActiveTab(activeTab === 'entry' ? 'history' : 'entry')}
        viewOnly={!canEdit}
      />

      <div className="md:glass md:rounded-2xl md:p-3 flex items-center gap-3">
        <SegmentedTabs
          ariaLabel="Management action view"
          value={activeTab}
          onChange={setActiveTab}
          options={[
            { value: 'entry', label: 'Pending', count: pendingCases.length, icon: <FileText className="w-3.5 h-3.5" /> },
            { value: 'history', label: 'History', count: doneCases.length, icon: <History className="w-3.5 h-3.5" /> },
          ]}
        />
        <p className="hidden lg:block text-xs text-[var(--text-muted)] ml-auto pr-2">
          {activeTab === 'entry' ? 'Planned 6 filled, Actual 6 empty (Stage 6)' : 'Management action completed (Actual 6 stamped)'}
        </p>
      </div>

      {activeTab === 'entry' ? (
        <>
          <div className="md:hidden space-y-3">
            {pendingCases.length === 0 ? (
              <div className="feed-card">
                <EmptyState icon={<ClipboardCheck className="w-5 h-5" />} title="Nothing waiting for management" hint="A case comes here when its Planned 6 date is set in the sheet." />
              </div>
            ) : (
              pagedPending.map((c) => (
                <FeedCard
                  key={c.caseId}
                  id={c.sampleCode ? `${c.caseId} · ${c.sampleCode}` : c.caseId}
                  title={c.customer}
                  subtitle={`${c.product} · ${c.category}`}
                  onOpen={() => setDetailCase(c)}
                  openLabel={`View details for ${c.caseId}`}
                  highlight={overdue(c)}
                  meta={[
                    { label: 'Test 1', value: c.testStatus || '—' },
                    { label: 'Test 2', value: c.test2Status || '—' },
                    { label: 'Planned', value: <span className="font-mono">{formatShortDate(c.planned6) || '—'}</span> },
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
              <table className="min-w-[900px] w-full text-left border-collapse text-[13px]">
                <thead>
                  <tr className="fin-table-head text-[11px] uppercase">
                    <th className="py-3 px-3 rounded-l-xl whitespace-nowrap">Actions</th>
                    <th className="py-3 px-3 whitespace-nowrap">Case ID</th>
                    <th className="py-3 px-3 whitespace-nowrap">Enquiry No</th>
                    <th className="py-3 px-3 whitespace-nowrap">Company &amp; Product</th>
                    <th className="py-3 px-3 whitespace-nowrap">Given To</th>
                    <th className="py-3 px-3 whitespace-nowrap">Test 1</th>
                    <th className="py-3 px-3 whitespace-nowrap">Test 2</th>
                    <th className="py-3 px-3 rounded-r-xl whitespace-nowrap">Planned 6</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {pendingCases.length === 0 ? (
                    <tr>
                      <td colSpan={8}>
                        <EmptyState icon={<ClipboardCheck className="w-5 h-5" />} title="Nothing waiting for management" hint="A case comes here when its Planned 6 date is set in the sheet." />
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
                        <td className="py-3 px-3 font-mono text-xs whitespace-nowrap">{c.enquiryNo || '—'}</td>
                        <td className="py-3 px-3">
                          <p className="font-semibold text-[var(--text-heading)]">{c.customer}</p>
                          <p className="text-xs text-[var(--text-muted)]">{c.product}</p>
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">{c.competitorName || c.competitor || '—'}</td>
                        <td className="py-3 px-3 whitespace-nowrap">{c.testStatus || '—'}</td>
                        <td className="py-3 px-3 whitespace-nowrap">{c.test2Status || '—'}</td>
                        <td className="py-3 px-3 font-mono text-xs whitespace-nowrap">
                          <div>{formatShortDate(c.planned6) || '—'}</div>
                          {c.pendingStageNo === 6 && (
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
                <EmptyState icon={<History className="w-5 h-5" />} title="No management actions yet" />
              </div>
            ) : (
              pagedDone.map((c) => (
                <FeedCard
                  key={c.caseId}
                  id={c.caseId}
                  title={c.customer}
                  subtitle={c.remark6 || '—'}
                  onOpen={() => setDetailCase(c)}
                  openLabel={`View details for ${c.caseId}`}
                  meta={[
                    { label: 'Planned', value: <span className="font-mono">{formatShortDate(c.planned6) || '—'}</span> },
                    { label: 'Done', value: <span className="font-mono">{formatShortDate(c.actual6) || '—'}</span> },
                    { label: 'Delay', value: <span className="font-mono">{filled(c.delay6) ? `${c.delay6}d` : '—'}</span> },
                  ]}
                  progress={getCaseProgress(c)}
                />
              ))
            )}
          </div>

          <div className="hidden md:block fin-card p-4 lg:p-5">
            <div className="fin-table-wrap">
              <table className="w-full min-w-[820px] text-left border-collapse text-[13px]">
                <thead>
                  <tr className="fin-table-head text-[11px] uppercase">
                    <th className="py-3 px-3 rounded-l-xl whitespace-nowrap">Case ID</th>
                    <th className="py-3 px-3 whitespace-nowrap">Company &amp; Product</th>
                    <th className="py-3 px-3">Remark</th>
                    <th className="py-3 px-3 whitespace-nowrap">Planned 6</th>
                    <th className="py-3 px-3 whitespace-nowrap">Actual 6</th>
                    <th className="py-3 px-3 rounded-r-xl whitespace-nowrap text-right">Delay 6</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {doneCases.length === 0 ? (
                    <tr>
                      <td colSpan={6}>
                        <EmptyState icon={<History className="w-5 h-5" />} title="No management actions yet" />
                      </td>
                    </tr>
                  ) : (
                    pagedDone.map((c) => (
                      <tr key={c.caseId} className="fin-table-row cursor-pointer" onClick={() => setDetailCase(c)}>
                        <td className="py-3 px-3 font-mono font-bold text-xs text-[var(--color-primary)] whitespace-nowrap">{c.caseId}</td>
                        <td className="py-3 px-3">
                          <p className="font-semibold text-[var(--text-heading)]">{c.customer}</p>
                          <p className="text-xs text-[var(--text-muted)]">{c.product}</p>
                        </td>
                        <td className="py-3 px-3 max-w-[320px]"><p className="line-clamp-2">{c.remark6 || '—'}</p></td>
                        <td className="py-3 px-3 font-mono text-xs whitespace-nowrap">{formatShortDate(c.planned6) || '—'}</td>
                        <td className="py-3 px-3 font-mono text-xs text-[var(--text-muted)] whitespace-nowrap">{formatDateTime(c.actual6) || '—'}</td>
                        <td className="py-3 px-3 font-mono text-xs whitespace-nowrap text-right">{filled(c.delay6) ? `${c.delay6}d` : '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <Pagination currentPage={historyPage} totalItems={doneCases.length} pageSize={historyPageSize} onPageChange={setHistoryPage} onPageSizeChange={setHistoryPageSize} />
        </>
      )}

      {dialogCase && <ManagementDialog labCase={dialogCase} canEdit={canEdit} onClose={() => setDialogCase(null)} />}
      {detailCase && <CaseDetailModal labCase={detailCase} onClose={() => setDetailCase(null)} />}
    </div>
  );
}

function ManagementDialog({ labCase, canEdit, onClose }: { labCase: LabCase; canEdit: boolean; onClose: () => void }) {
  const { saveManagement, addToast } = useLab();
  const [remark, setRemark] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setRemark('');
    setError(null);
  }, [labCase.caseId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, submitting]);

  const handleSave = async () => {
    if (!canEdit || submitting) return;
    if (!remark.trim()) {
      setError('Remark is required.');
      addToast({ type: 'error', title: 'Remark is required.' });
      return;
    }
    setSubmitting(true);
    try {
      const next = await saveManagement({ caseId: labCase.caseId, remark6: remark.trim() });
      if (next) onClose(); // errors show as a toast and keep the dialog open
    } finally {
      setSubmitting(false);
    }
  };

  const info: Array<[string, string]> = [
    ['Case / Enquiry No.', `${labCase.caseId}${labCase.enquiryNo ? ` / ${labCase.enquiryNo}` : ''}`],
    ['Company · Product', `${labCase.customer || '—'} · ${labCase.product || '—'}`],
    ['Given To · Rate', `${labCase.competitorName || labCase.competitor || '—'} · ${labCase.competitorRate ?? '—'}`],
    ['Test 1 Status', labCase.testStatus || '—'],
    ['Test 2 Status', labCase.test2Status || '—'],
    ['Planned 6', formatShortDate(labCase.planned6) || '—'],
  ];

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="mgmt-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center fin-modal-backdrop sm:p-4 anim-fade"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div className="fin-modal-panel w-full max-w-3xl max-h-[92dvh] sm:max-h-[90vh] anim-pop">
        <div className="shrink-0 bg-[var(--bg-surface)] border-b border-[var(--border-subtle)] px-4 sm:px-6 py-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="mgmt-title" className="text-base sm:text-lg font-bold text-[var(--text-heading)]">
              Management Action for Case: <span className="font-mono text-[var(--brand)] dark:text-[#A3F046]">{labCase.caseId}</span>
            </h2>
            <p className="text-xs text-[var(--text-muted)] mt-1">Fields with * are required.</p>
          </div>
          <button type="button" onClick={onClose} disabled={submitting} className="fin-icon-btn shrink-0" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form
          id="mgmt-form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void handleSave();
          }}
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain space-y-4 px-4 sm:px-6 pt-4 pb-6"
        >
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 p-4 border border-[var(--border-subtle)] rounded-xl bg-[var(--bg-surface-muted)] text-xs">
            {info.map(([label, value]) => (
              <div key={label} className="min-w-0">
                <p className="text-[10px] text-[var(--text-muted)] uppercase font-bold">{label}</p>
                <p className="font-semibold text-[var(--text-heading)] break-words">{value}</p>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <label htmlFor="mgmt-remark" className="block text-xs font-semibold text-[var(--text-body)]">
              Remark<span className="text-red-500"> *</span>
            </label>
            <textarea
              id="mgmt-remark"
              rows={4}
              placeholder="Enter management action / decision..."
              value={remark}
              disabled={!canEdit}
              onChange={(e) => {
                setRemark(e.target.value);
                if (error) setError(null);
              }}
              className={`fin-textarea w-full p-3.5 ${error ? '!border-red-500' : ''}`}
            />
            {error && <p className="text-xs text-red-500" role="alert">{error}</p>}
          </div>
        </form>

        <div className="shrink-0 bg-[var(--bg-surface)] border-t border-[var(--border-subtle)] px-4 sm:px-6 py-3 pb-safe sm:pb-3 flex justify-end gap-3">
          <button type="button" onClick={onClose} disabled={submitting} className="fin-btn-secondary h-11 px-5 text-sm flex-1 sm:flex-none">
            Cancel
          </button>
          {canEdit && (
            <button type="submit" form="mgmt-form" disabled={submitting} className="fin-btn-primary h-11 px-5 text-sm inline-flex items-center justify-center flex-1 sm:flex-none">
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              {submitting ? 'Saving...' : 'Save Action'}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
