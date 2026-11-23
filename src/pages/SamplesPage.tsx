import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  Clock,
  Eye,
  FileText,
  FlaskConical,
  History,
  Image as ImageIcon,
  Loader2,
  Package,
  PackageCheck,
  Plus,
  QrCode,
  Search,
  Upload,
  X,
} from 'lucide-react';
import { useLab } from '../context/LabContext';
import { canFullAccessPage, canViewPage } from '../utils/auth';
import { formatShortDate, readFileAsPersistableDataUrl } from '../utils/fileHelpers';
import {
  isCaseOverdue,
  validateSampleReceiveForm,
  validateSampleRequestForm,
} from '../utils/labCalculations';
import { CaseDetailModal } from '../components/CaseDetailModal';
import { SampleQrModal } from '../components/SampleQrModal';
import { OverdueChip, SampleStatusBadge } from '../components/StatusBadge';
import { Pagination } from '../components/Pagination';
import { EmptyState, FeedCard, getCaseProgress, MobileBanner, PageHeader, SegmentedTabs } from '../components/ui';
import type { LabCase } from '../types/lab';

const DEFAULT_SOURCE_TYPES = ['Customer', 'Market-Retail Shop', 'Dealer-Distributor', 'Online', 'Other'];
const DEFAULT_PRIORITIES = ['Low', 'Medium', 'High'];
const DEFAULT_CONDITIONS = ['Sealed', 'Opened', 'Damaged', 'Expired'];

export function SamplesPage() {
  const { cases, masters, currentUser, requestSample, receiveSample, addToast } = useLab();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const canEditSamples = canFullAccessPage(currentUser, 'samples');
  const canViewTestEntry = canViewPage(currentUser, 'testEntry');
  const canViewComparison = canViewPage(currentUser, 'comparison');
  const canViewReports = canViewPage(currentUser, 'reports');
  const todayIso = new Date().toISOString().slice(0, 10);

  const [activeTab, setActiveTab] = useState<'active' | 'history'>('active');
  const [receivePendingOnly, setReceivePendingOnly] = useState(
    () => searchParams.get('pending') === '3'
  );
  const [qrCase, setQrCase] = useState<LabCase | null>(null);
  const [detailCase, setDetailCase] = useState<LabCase | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    if (searchParams.get('pending') === '3') {
      setActiveTab('active');
      setReceivePendingOnly(true);
    }
  }, [searchParams]);

  const sourceTypeOptions = useMemo(() => {
    const vals = masters.sourceTypes.map((m) => m.value).filter(Boolean);
    return vals.length > 0 ? vals : DEFAULT_SOURCE_TYPES;
  }, [masters.sourceTypes]);

  const priorityOptions = useMemo(() => {
    const vals = masters.priorities.map((m) => m.value).filter(Boolean);
    return vals.length > 0 ? vals : DEFAULT_PRIORITIES;
  }, [masters.priorities]);

  const conditionOptions = useMemo(() => {
    const vals = masters.conditions.map((m) => m.value).filter(Boolean);
    return vals.length > 0 ? vals : DEFAULT_CONDITIONS;
  }, [masters.conditions]);

  // Request Sample form state
  const [selectedCaseId, setSelectedCaseId] = useState('');
  const [sampleName, setSampleName] = useState('');
  const [qtyNeeded, setQtyNeeded] = useState('');
  const [sourceType, setSourceType] = useState('');
  const [sourceLocation, setSourceLocation] = useState('');
  const [responsiblePerson, setResponsiblePerson] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [priority, setPriority] = useState('');
  const [requestNotes, setRequestNotes] = useState('');
  const [requestErrors, setRequestErrors] = useState<Record<string, string>>({});
  const [submittingRequest, setSubmittingRequest] = useState(false);

  // Receive Sample modal state
  const [receivingCase, setReceivingCase] = useState<LabCase | null>(null);
  const [receivedChoice, setReceivedChoice] = useState<'yes' | 'no'>('yes');
  const [receivedBy, setReceivedBy] = useState('');
  const [receivedQty, setReceivedQty] = useState('');
  const [receiveCondition, setReceiveCondition] = useState('');
  const [conditionNotes, setConditionNotes] = useState('');
  const [receiveRemarks, setReceiveRemarks] = useState('');
  const [receiptPhotoUrl, setReceiptPhotoUrl] = useState<string | undefined>(undefined);
  const [receiveErrors, setReceiveErrors] = useState<Record<string, string>>({});
  const [submittingReceive, setSubmittingReceive] = useState(false);

  const competitorMap = useMemo(
    () => new Map(masters.competitors.map((c) => [c.id, c])),
    [masters.competitors]
  );

  const allSamples = useMemo(
    () => cases.filter((c) => c.status !== 'No Sample'),
    [cases]
  );

  // Samples page owns Step 3 (receipt). Active = requested but not yet received;
  // once a sample is received (Actual 3 stamped) it moves to History.
  const isReceived = (c: LabCase) => Boolean(c.actual3) || c.status !== 'Requested';

  const activeSamples = useMemo(
    () =>
      allSamples
        .filter((c) => !isReceived(c))
        .sort((a, b) =>
          String(a.pendingPlanned || '9999-12-31').localeCompare(String(b.pendingPlanned || '9999-12-31'))
        ),
    [allSamples]
  );

  const historySamples = useMemo(() => allSamples.filter((c) => isReceived(c)), [allSamples]);

  const visibleSamples = activeTab === 'active' ? activeSamples : historySamples;

  const [sampleSearch, setSampleSearch] = useState('');

  const searchedSamples = useMemo(() => {
    const q = sampleSearch.trim().toLowerCase();
    if (!q) return visibleSamples;
    return visibleSamples.filter((c) => {
      const comp = (competitorMap.get(c.competitorId)?.name || c.competitorName || '').toLowerCase();
      return (
        c.caseId.toLowerCase().includes(q) ||
        (c.sampleCode || '').toLowerCase().includes(q) ||
        (c.sampleName || '').toLowerCase().includes(q) ||
        c.customer.toLowerCase().includes(q) ||
        c.product.toLowerCase().includes(q) ||
        comp.includes(q)
      );
    });
  }, [visibleSamples, sampleSearch, competitorMap]);

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, receivePendingOnly, sampleSearch]);

  const paginatedSamples = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return searchedSamples.slice(start, start + pageSize);
  }, [searchedSamples, currentPage, pageSize]);

  const unrequestedOrders = useMemo(
    () => cases.filter((c) => c.status === 'No Sample'),
    [cases]
  );

  const toggleReceivePending = () => {
    const next = !receivePendingOnly;
    setReceivePendingOnly(next);
    if (next) {
      setSearchParams({ pending: '3' });
    } else {
      setSearchParams({});
    }
  };

  const openRequestModal = () => {
    const firstOrder = unrequestedOrders[0];
    setSelectedCaseId(firstOrder?.caseId ?? '');
    setSampleName(firstOrder?.product ?? '');
    setQtyNeeded('');
    setSourceType('');
    setSourceLocation('');
    setResponsiblePerson('');
    setExpectedDate('');
    setPriority('');
    setRequestNotes('');
    setRequestErrors({});
    setShowAddModal(true);
  };

  // Global "+ New Entry" / FAB lands here with ?new=1
  useEffect(() => {
    if (searchParams.get('new') !== '1') return;
    if (canEditSamples && unrequestedOrders.length > 0) openRequestModal();
    const next = new URLSearchParams(searchParams);
    next.delete('new');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleRequestOrderChange = (caseId: string) => {
    setSelectedCaseId(caseId);
    const matched = unrequestedOrders.find((o) => o.caseId === caseId);
    if (matched) {
      setSampleName(matched.product);
    }
    setRequestErrors((prev) => ({ ...prev, caseId: '', sampleName: '' }));
  };

  const handleRequestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validation = validateSampleRequestForm({
      caseId: selectedCaseId,
      sampleName,
      qtyNeeded,
      sourceType,
      sourceLocation,
      responsiblePerson,
      expectedDate,
      priority,
    });
    if (!validation.valid) {
      setRequestErrors(validation.errors);
      return;
    }

    setSubmittingRequest(true);
    try {
      const nextSnap = await requestSample({
        caseId: selectedCaseId,
        sampleName: sampleName.trim(),
        qtyNeeded: Number(qtyNeeded),
        sourceType,
        sourceLocation: sourceLocation.trim(),
        responsiblePerson: responsiblePerson.trim(),
        expectedDate,
        priority,
        requestNotes: requestNotes.trim(),
      });
      if (nextSnap) {
        setShowAddModal(false);
      }
    } finally {
      setSubmittingRequest(false);
    }
  };

  const openReceiveModal = (labCase: LabCase) => {
    setReceivingCase(labCase);
    setReceivedChoice('yes');
    setReceivedBy(currentUser?.name ?? '');
    setReceivedQty('');
    setReceiveCondition('');
    setConditionNotes(labCase.conditionNotes || '');
    setReceiveRemarks('');
    setReceiptPhotoUrl(undefined);
    setReceiveErrors({});
  };

  const handleReceiptPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      addToast({ type: 'error', title: 'Please select an image file (PNG, JPG, WebP).' });
      return;
    }
    try {
      const compressed = await readFileAsPersistableDataUrl(file);
      setReceiptPhotoUrl(compressed);
    } catch (err) {
      addToast({
        type: 'error',
        title: err instanceof Error ? err.message : 'Failed to process image',
      });
    }
  };

  const handleReceiveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!receivingCase) return;

    const receivedBool = receivedChoice === 'yes';
    const validation = validateSampleReceiveForm({
      received: receivedBool,
      remarks: receiveRemarks,
      receivedBy,
      receivedQty,
      condition: receiveCondition,
    });
    if (!validation.valid) {
      setReceiveErrors(validation.errors);
      return;
    }

    setSubmittingReceive(true);
    try {
      const targetId = receivingCase.caseId;
      const nextSnap = await receiveSample({
        caseId: targetId,
        received: receivedBool,
        receivedBy: receivedBy.trim(),
        receivedQty: Number(receivedQty) || 0,
        condition: receiveCondition,
        conditionNotes: conditionNotes.trim(),
        remarks: receiveRemarks.trim(),
        photoDataUrl: receiptPhotoUrl,
      });

      if (nextSnap) {
        setReceivingCase(null);
        if (receivedBool && canViewTestEntry) {
          navigate(`/test-entry?sample=${targetId}`);
        }
      }
    } finally {
      setSubmittingReceive(false);
    }
  };

  const viewOnly = !canEditSamples;
  // Actions only exist on the Active tab (Receive Sample) and only for users who can edit.
  const showActions = activeTab === 'active' && canEditSamples;

  const receiveButton = (sample: LabCase, mobile = false) => (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        openReceiveModal(sample);
      }}
      className={
        mobile
          ? 'fin-btn-primary h-11 inline-flex items-center justify-center gap-1.5 text-sm'
          : 'fin-btn-primary !min-h-9 h-9 inline-flex items-center gap-1.5 px-3.5 text-xs !rounded-full whitespace-nowrap'
      }
    >
      <PackageCheck className={mobile ? 'w-4 h-4' : 'w-3.5 h-3.5'} aria-hidden="true" />
      Receive Sample
    </button>
  );

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Directory" title="Sample Tracking Pipeline" viewOnly={viewOnly} />

      <MobileBanner
        label={activeTab === 'active' ? 'Awaiting receipt' : 'Received samples'}
        count={searchedSamples.length}
        caption={`${activeSamples.length} awaiting receipt · ${historySamples.length} received`}
        icon={activeTab === 'active' ? <History className="w-[18px] h-[18px]" /> : <Clock className="w-[18px] h-[18px]" />}
        iconLabel={activeTab === 'active' ? 'Show received samples' : 'Show samples awaiting receipt'}
        onIconClick={() => setActiveTab(activeTab === 'active' ? 'history' : 'active')}
        viewOnly={viewOnly}
      />

      {/* Filter toolbar */}
      <div className="md:glass md:rounded-2xl md:p-3 flex flex-col lg:flex-row lg:items-center gap-3">
        <SegmentedTabs
          ariaLabel="Sample view"
          value={activeTab}
          onChange={setActiveTab}
          options={[
            { value: 'active', label: 'Active', count: activeSamples.length, icon: <Clock className="w-3.5 h-3.5" /> },
            { value: 'history', label: 'History', count: historySamples.length, icon: <History className="w-3.5 h-3.5" /> },
          ]}
          className="self-start"
        />

        <div className="relative flex-1 min-w-0 lg:max-w-sm">
          <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
          <input
            type="search"
            value={sampleSearch}
            onChange={(e) => setSampleSearch(e.target.value)}
            placeholder="Search sample ID, case, customer..."
            aria-label="Search samples"
            className="fin-input w-full pl-10 pr-3.5"
          />
        </div>

        {sampleSearch && (
          <button
            type="button"
            onClick={() => setSampleSearch('')}
            className="inline-flex items-center gap-1 px-3 h-11 text-xs font-semibold text-[var(--color-primary)] whitespace-nowrap hover:underline self-start lg:self-auto"
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
            Clear search
          </button>
        )}
      </div>

      {/* Mobile: stacked detail cards (tap a card to open the full record) */}
      <div className="md:hidden space-y-3">
        {searchedSamples.length === 0 ? (
          <div className="feed-card">
            <EmptyState
              icon={<Package className="w-5 h-5" />}
              title={
                sampleSearch
                  ? 'No matching samples'
                  : activeTab === 'active'
                    ? 'No samples awaiting receipt'
                    : 'No received samples yet'
              }
              hint={
                !sampleSearch && activeTab === 'active'
                  ? 'Samples are requested from the Lost Orders page.'
                  : undefined
              }
            />
          </div>
        ) : (
          paginatedSamples.map((sample) => {
            const comp = competitorMap.get(sample.competitorId);
            const overdue = activeTab === 'active' && isCaseOverdue(sample);
            return (
              <FeedCard
                key={sample.caseId}
                id={sample.sampleCode || sample.caseId}
                title={sample.sampleName || sample.product}
                subtitle={`${sample.caseId} · ${sample.customer}`}
                onOpen={() => setDetailCase(sample)}
                openLabel={`View details for ${sample.caseId}`}
                highlight={overdue}
                meta={[
                  { label: 'Competitor', value: comp?.name || sample.competitorName || '—' },
                  { label: 'Source', value: sample.sourceType || '—' },
                  activeTab === 'active'
                    ? {
                        label: overdue ? 'Overdue' : 'Due',
                        value: (
                          <span className="font-mono" style={overdue ? { color: 'var(--status-danger-fg)' } : undefined}>
                            {formatShortDate(sample.pendingPlanned || sample.expectedDate) || '—'}
                          </span>
                        ),
                      }
                    : {
                        label: 'Received',
                        value: <span className="font-mono">{formatShortDate(sample.actual3) || '—'}</span>,
                      },
                ]}
                progress={getCaseProgress(sample)}
                progressTone={overdue ? 'danger' : 'brand'}
                footerLeft={sample.responsiblePerson || sample.sourceLocation || '—'}
                footerRight={<SampleStatusBadge status={sample.status} />}
                actions={showActions ? receiveButton(sample, true) : undefined}
              />
            );
          })
        )}
      </div>

      {/* Desktop: glass table */}
      <div className="hidden md:block fin-card p-4 lg:p-5">
        <div className="fin-table-wrap">
          <table className="w-full min-w-[760px] text-left border-collapse">
            <thead>
              <tr className="fin-table-head text-[11px] uppercase">
                {showActions && <th className="py-3 px-4 rounded-l-xl whitespace-nowrap">Actions</th>}
                <th className={`py-3 px-4 whitespace-nowrap ${showActions ? '' : 'rounded-l-xl'}`}>Sample ID</th>
                <th className="py-3 px-4 whitespace-nowrap">Sample &amp; Case</th>
                <th className="py-3 px-4 whitespace-nowrap">Competitor</th>
                <th className="py-3 px-4 whitespace-nowrap">Source &amp; Collector</th>
                <th className="py-3 px-4 whitespace-nowrap">{activeTab === 'active' ? 'Planned / Expected' : 'Received On'}</th>
                <th className="py-3 px-4 rounded-r-xl whitespace-nowrap">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)] text-sm">
              {searchedSamples.length === 0 ? (
                <tr>
                  <td colSpan={showActions ? 7 : 6}>
                    <EmptyState
                      icon={<Package className="w-5 h-5" />}
                      title={
                        sampleSearch
                          ? 'No matching samples'
                          : activeTab === 'active'
                            ? 'No samples awaiting receipt'
                            : 'No received samples yet'
                      }
                      hint={!sampleSearch && activeTab === 'active' ? 'Samples are requested from the Lost Orders page.' : undefined}
                    />
                  </td>
                </tr>
              ) : (
                paginatedSamples.map((sample) => {
                  const comp = competitorMap.get(sample.competitorId);
                  const overdue = activeTab === 'active' && isCaseOverdue(sample);
                  return (
                    <tr
                      key={sample.caseId}
                      onClick={() => setDetailCase(sample)}
                      title="Open case details"
                      className="cursor-pointer fin-table-row"
                      style={overdue ? { backgroundColor: 'var(--status-danger-bg)' } : undefined}
                    >
                      {showActions && (
                        <td className="py-3 px-4 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          {receiveButton(sample)}
                        </td>
                      )}
                      <td className="py-3 px-4 font-mono text-xs font-bold text-[var(--color-primary)] whitespace-nowrap">
                        {sample.sampleCode || sample.caseId}
                      </td>
                      <td className="py-3 px-4">
                        <p className="font-semibold text-[var(--text-heading)] text-[13px]">{sample.sampleName || sample.product}</p>
                        <p className="text-xs text-[var(--text-muted)] font-mono">
                          {sample.caseId} · {sample.customer}
                        </p>
                      </td>
                      <td className="py-3 px-4 text-[13px] text-[var(--text-body)] whitespace-nowrap">
                        {comp?.name || sample.competitorName || '—'}
                      </td>
                      <td className="py-3 px-4 text-xs text-[var(--text-muted)] max-w-xs">
                        <p className="font-semibold text-[var(--text-heading)]">{sample.sourceType || '—'}</p>
                        <p className="truncate">
                          {sample.sourceLocation || '—'}
                          {sample.responsiblePerson ? ` · ${sample.responsiblePerson}` : ''}
                        </p>
                      </td>
                      {activeTab === 'active' ? (
                        <td
                          className="py-3 px-4 text-xs font-mono whitespace-nowrap"
                          style={{
                            color: overdue ? 'var(--status-danger-fg)' : 'var(--text-muted)',
                            fontWeight: overdue ? 700 : 500,
                          }}
                        >
                          <div>{formatShortDate(sample.pendingPlanned || sample.expectedDate)}</div>
                          <div className="mt-1">
                            <OverdueChip delayDays={sample.pendingDelay} />
                          </div>
                        </td>
                      ) : (
                        <td className="py-3 px-4 text-xs font-mono whitespace-nowrap text-[var(--text-muted)]">
                          {formatShortDate(sample.actual3) || '—'}
                        </td>
                      )}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <SampleStatusBadge status={sample.status} />
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
        currentPage={currentPage}
        totalItems={searchedSamples.length}
        pageSize={pageSize}
        onPageChange={setCurrentPage}
        onPageSizeChange={setPageSize}
      />

      {/* Request Competitor Sample Modal */}
      {showAddModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center fin-modal-backdrop p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-sample-title"
        >
          <div className="fin-modal-panel max-w-[min(92vw,640px)] w-full max-h-[90dvh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-[var(--border-subtle)] shrink-0">
              <h2 id="add-sample-title" className="text-base font-bold text-[var(--text-heading)]">
                Request Competitor Sample
              </h2>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                aria-label="Close sample request form"
                className="p-1.5 rounded-[10px] text-[var(--text-muted)] hover:text-[var(--text-heading)] hover:bg-[var(--bg-surface-muted)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleRequestSubmit} noValidate className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
              <div>
                <label
                  htmlFor="smp-order"
                  className="block text-xs font-semibold text-[var(--text-body)] mb-1.5"
                >
                  Linked Lost Order *
                </label>
                <select
                  id="smp-order"
                  value={selectedCaseId}
                  onChange={(e) => handleRequestOrderChange(e.target.value)}
                  className="fin-input w-full px-3.5 text-sm"
                >
                  <option value="">Select a lost order without a sample...</option>
                  {unrequestedOrders.map((o) => (
                    <option key={o.caseId} value={o.caseId}>
                      {o.caseId} — {o.customer} ({o.product})
                    </option>
                  ))}
                </select>
                {requestErrors.caseId && (
                  <p
                    className="text-xs mt-1"
                    style={{ color: 'var(--status-danger-fg)' }}
                    role="alert"
                  >
                    {requestErrors.caseId}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="smp-name"
                    className="block text-xs font-semibold text-[var(--text-body)] mb-1.5"
                  >
                    Sample Name / Product to Collect *
                  </label>
                  <input
                    id="smp-name"
                    type="text"
                    value={sampleName}
                    onChange={(e) => {
                      setSampleName(e.target.value);
                      setRequestErrors((prev) => ({ ...prev, sampleName: '' }));
                    }}
                    className="fin-input w-full px-3.5 text-sm"
                  />
                  {requestErrors.sampleName && (
                    <p
                      className="text-xs mt-1"
                      style={{ color: 'var(--status-danger-fg)' }}
                      role="alert"
                    >
                      {requestErrors.sampleName}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="smp-qty"
                    className="block text-xs font-semibold text-[var(--text-body)] mb-1.5"
                  >
                    Quantity Needed *
                  </label>
                  <input
                    id="smp-qty"
                    type="number"
                    min="1"
                    max="500"
                    value={qtyNeeded}
                    onChange={(e) => {
                      setQtyNeeded(e.target.value);
                      setRequestErrors((prev) => ({ ...prev, qtyNeeded: '' }));
                    }}
                    className="fin-input w-full px-3.5 text-sm font-mono"
                  />
                  {requestErrors.qtyNeeded && (
                    <p
                      className="text-xs mt-1"
                      style={{ color: 'var(--status-danger-fg)' }}
                      role="alert"
                    >
                      {requestErrors.qtyNeeded}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="smp-source-type"
                    className="block text-xs font-semibold text-[var(--text-body)] mb-1.5"
                  >
                    Source Type *
                  </label>
                  <select
                    id="smp-source-type"
                    value={sourceType}
                    onChange={(e) => setSourceType(e.target.value)}
                    className="fin-input w-full px-3.5 text-sm"
                  >
                    <option value="">Choose...</option>
                    {sourceTypeOptions.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="smp-priority"
                    className="block text-xs font-semibold text-[var(--text-body)] mb-1.5"
                  >
                    Priority
                  </label>
                  <select
                    id="smp-priority"
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                    className="fin-input w-full px-3.5 text-sm"
                  >
                    <option value="">Choose...</option>
                    {priorityOptions.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="smp-source-loc"
                    className="block text-xs font-semibold text-[var(--text-body)] mb-1.5"
                  >
                    Exact Shop / Location / Address *
                  </label>
                  <input
                    id="smp-source-loc"
                    type="text"
                    value={sourceLocation}
                    onChange={(e) => {
                      setSourceLocation(e.target.value);
                      setRequestErrors((prev) => ({ ...prev, sourceLocation: '' }));
                    }}
                    className="fin-input w-full px-3.5 text-sm"
                  />
                  {requestErrors.sourceLocation && (
                    <p
                      className="text-xs mt-1"
                      style={{ color: 'var(--status-danger-fg)' }}
                      role="alert"
                    >
                      {requestErrors.sourceLocation}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="smp-responsible"
                    className="block text-xs font-semibold text-[var(--text-body)] mb-1.5"
                  >
                    Responsible Person *
                  </label>
                  <input
                    id="smp-responsible"
                    type="text"
                    value={responsiblePerson}
                    onChange={(e) => {
                      setResponsiblePerson(e.target.value);
                      setRequestErrors((prev) => ({ ...prev, responsiblePerson: '' }));
                    }}
                    className="fin-input w-full px-3.5 text-sm"
                  />
                  {requestErrors.responsiblePerson && (
                    <p
                      className="text-xs mt-1"
                      style={{ color: 'var(--status-danger-fg)' }}
                      role="alert"
                    >
                      {requestErrors.responsiblePerson}
                    </p>
                  )}
                </div>
              </div>

              <div>
                <label
                  htmlFor="smp-exp-date"
                  className="block text-xs font-semibold text-[var(--text-body)] mb-1.5"
                >
                  Expected Arrival Date / Deadline *
                </label>
                <input
                  id="smp-exp-date"
                  type="date"
                  min={todayIso}
                  value={expectedDate}
                  onChange={(e) => {
                    setExpectedDate(e.target.value);
                    setRequestErrors((prev) => ({ ...prev, expectedDate: '' }));
                  }}
                  className="fin-input w-full px-3.5 text-sm font-mono"
                />
                {requestErrors.expectedDate && (
                  <p
                    className="text-xs mt-1"
                    style={{ color: 'var(--status-danger-fg)' }}
                    role="alert"
                  >
                    {requestErrors.expectedDate}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="smp-req-notes"
                  className="block text-xs font-semibold text-[var(--text-body)] mb-1.5"
                >
                  Notes / Instructions
                </label>
                <textarea
                  id="smp-req-notes"
                  rows={2}
                  value={requestNotes}
                  onChange={(e) => setRequestNotes(e.target.value)}
                  className="fin-textarea w-full p-3.5 text-sm"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="fin-btn-secondary px-4 py-2 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingRequest}
                  className="fin-btn-primary px-5 py-2 text-xs inline-flex items-center gap-1.5"
                >
                  {submittingRequest && (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                  )}
                  {submittingRequest ? 'Submitting...' : 'Submit Sample Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Receive Sample Modal */}
      {receivingCase && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center fin-modal-backdrop p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="receive-sample-title"
        >
          <div className="fin-modal-panel max-w-[min(92vw,640px)] w-full max-h-[90dvh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-[var(--border-subtle)] shrink-0">
              <div>
                <h2
                  id="receive-sample-title"
                  className="text-base font-bold text-[var(--text-heading)]"
                >
                  Receive Sample
                </h2>
                <p className="text-xs text-[var(--text-muted)] font-mono">
                  {receivingCase.sampleCode || receivingCase.caseId} ·{' '}
                  {receivingCase.sampleName || receivingCase.product}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReceivingCase(null)}
                aria-label="Close sample receipt modal"
                className="p-1.5 rounded-[10px] text-[var(--text-muted)] hover:text-[var(--text-heading)] hover:bg-[var(--bg-surface-muted)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleReceiveSubmit} noValidate className="p-5 sm:p-6 space-y-5 overflow-y-auto flex-1 min-h-0">
              {/* Read-Only Request Summary */}
              <div
                className="p-4 rounded-[14px] border border-[var(--border-subtle)] space-y-2.5 text-xs"
                style={{ backgroundColor: 'var(--bg-surface-muted)' }}
              >
                <p className="font-bold text-[var(--text-muted)] uppercase tracking-wider text-[11px]">
                  Original Sample Request Details
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div>
                    <span className="text-[var(--text-muted)] block">Linked Case</span>
                    <span className="font-mono font-bold text-[var(--text-heading)]">
                      {receivingCase.caseId}
                    </span>
                  </div>
                  <div>
                    <span className="text-[var(--text-muted)] block">Competitor</span>
                    <span className="font-semibold text-[var(--text-heading)]">
                      {competitorMap.get(receivingCase.competitorId)?.name ||
                        receivingCase.competitorName ||
                        '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[var(--text-muted)] block">
                      Requested Qty &amp; Priority
                    </span>
                    <span className="font-mono text-[var(--text-heading)]">
                      {receivingCase.qtyNeeded ?? 1} unit(s) · {receivingCase.priority || '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[var(--text-muted)] block">Source</span>
                    <span className="text-[var(--text-heading)]">
                      {receivingCase.sourceType || '—'}
                      {receivingCase.sourceLocation
                        ? ` — ${receivingCase.sourceLocation}`
                        : ''}
                    </span>
                  </div>
                  <div>
                    <span className="text-[var(--text-muted)] block">Responsible Person</span>
                    <span className="text-[var(--text-heading)]">
                      {receivingCase.responsiblePerson || '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[var(--text-muted)] block">Expected Arrival</span>
                    <span className="font-mono text-[var(--text-heading)]">
                      {formatShortDate(receivingCase.expectedDate)}
                    </span>
                  </div>
                </div>
                {receivingCase.requestNotes && (
                  <p className="text-[var(--text-body)] pt-2 border-t border-[var(--border-subtle)]">
                    <span className="font-semibold text-[var(--text-heading)]">Instructions:</span>{' '}
                    {receivingCase.requestNotes}
                  </p>
                )}
              </div>

              {/* Sample Received? Yes / No */}
              <div>
                <span className="block text-xs font-semibold text-[var(--text-body)] mb-2">
                  Sample received? *
                </span>
                <div className="grid grid-cols-2 gap-2.5 max-w-xs">
                  <button
                    type="button"
                    aria-pressed={receivedChoice === 'yes'}
                    onClick={() => {
                      setReceivedChoice('yes');
                      setReceiveErrors({});
                    }}
                    className="py-2.5 px-3 text-xs font-semibold rounded-[12px] border transition-colors"
                    style={
                      receivedChoice === 'yes'
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
                    Yes — Received
                  </button>
                  <button
                    type="button"
                    aria-pressed={receivedChoice === 'no'}
                    onClick={() => {
                      setReceivedChoice('no');
                      setReceiveErrors({});
                    }}
                    className="py-2.5 px-3 text-xs font-semibold rounded-[12px] border transition-colors"
                    style={
                      receivedChoice === 'no'
                        ? {
                            backgroundColor: 'var(--status-danger-bg)',
                            color: 'var(--status-danger-fg)',
                            borderColor: 'var(--status-danger-fg)',
                          }
                        : {
                            backgroundColor: 'var(--bg-surface)',
                            color: 'var(--text-body)',
                            borderColor: 'var(--border-subtle)',
                          }
                    }
                  >
                    No — Not Received
                  </button>
                </div>
              </div>

              {receivedChoice === 'no' ? (
                <div>
                  <label
                    htmlFor="recv-not-reason"
                    className="block text-xs font-semibold text-[var(--text-body)] mb-1.5"
                  >
                    Remarks / Reason Not Received *
                  </label>
                  <textarea
                    id="recv-not-reason"
                    rows={3}
                    value={receiveRemarks}
                    onChange={(e) => {
                      setReceiveRemarks(e.target.value);
                      setReceiveErrors((prev) => ({ ...prev, remarks: '' }));
                    }}
                    className="fin-textarea w-full p-3.5 text-sm"
                  />
                  {receiveErrors.remarks && (
                    <p
                      className="text-xs mt-1"
                      style={{ color: 'var(--status-danger-fg)' }}
                      role="alert"
                    >
                      {receiveErrors.remarks}
                    </p>
                  )}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label
                        htmlFor="recv-by"
                        className="block text-xs font-semibold text-[var(--text-body)] mb-1.5"
                      >
                        Received By *
                      </label>
                      <input
                        id="recv-by"
                        type="text"
                        value={receivedBy}
                        onChange={(e) => {
                          setReceivedBy(e.target.value);
                          setReceiveErrors((prev) => ({ ...prev, receivedBy: '' }));
                        }}
                        className="fin-input w-full px-3.5 text-sm"
                      />
                      {receiveErrors.receivedBy && (
                        <p
                          className="text-xs mt-1"
                          style={{ color: 'var(--status-danger-fg)' }}
                          role="alert"
                        >
                          {receiveErrors.receivedBy}
                        </p>
                      )}
                    </div>

                    <div>
                      <label
                        htmlFor="recv-qty"
                        className="block text-xs font-semibold text-[var(--text-body)] mb-1.5"
                      >
                        Actual Quantity Received *
                      </label>
                      <input
                        id="recv-qty"
                        type="number"
                        min="1"
                        max="500"
                        value={receivedQty}
                        onChange={(e) => {
                          setReceivedQty(e.target.value);
                          setReceiveErrors((prev) => ({ ...prev, receivedQty: '' }));
                        }}
                        className="fin-input w-full px-3.5 text-sm font-mono"
                      />
                      {receiveErrors.receivedQty && (
                        <p
                          className="text-xs mt-1"
                          style={{ color: 'var(--status-danger-fg)' }}
                          role="alert"
                        >
                          {receiveErrors.receivedQty}
                        </p>
                      )}
                    </div>

                    <div>
                      <label
                        htmlFor="recv-condition"
                        className="block text-xs font-semibold text-[var(--text-body)] mb-1.5"
                      >
                        Condition *
                      </label>
                      <select
                        id="recv-condition"
                        value={receiveCondition}
                        onChange={(e) => {
                          setReceiveCondition(e.target.value);
                          setReceiveErrors((prev) => ({ ...prev, condition: '' }));
                        }}
                        className="fin-input w-full px-3.5 text-sm"
                      >
                        <option value="">Choose...</option>
                        {conditionOptions.map((cond) => (
                          <option key={cond} value={cond}>
                            {cond}
                          </option>
                        ))}
                      </select>
                      {receiveErrors.condition && (
                        <p
                          className="text-xs mt-1"
                          style={{ color: 'var(--status-danger-fg)' }}
                          role="alert"
                        >
                          {receiveErrors.condition}
                        </p>
                      )}
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="recv-cond-notes"
                      className="block text-xs font-semibold text-[var(--text-body)] mb-1.5"
                    >
                      Condition Notes
                    </label>
                    <textarea
                      id="recv-cond-notes"
                      rows={2}
                      value={conditionNotes}
                      onChange={(e) => setConditionNotes(e.target.value)}
                      className="fin-textarea w-full p-3.5 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-body)] mb-1.5">
                      Photo Upload (Optional, auto-compressed max 1200px)
                    </label>
                    <div className="flex items-center gap-4">
                      <label className="fin-btn-secondary inline-flex items-center gap-2 px-3.5 py-2 text-xs cursor-pointer">
                        <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                        Upload Photo
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleReceiptPhotoUpload}
                          className="sr-only"
                        />
                      </label>
                      {receiptPhotoUrl ? (
                        <div className="flex items-center gap-2">
                          <img
                            src={receiptPhotoUrl}
                            alt="Received sample preview"
                            className="w-10 h-10 object-cover rounded-[10px] border border-[var(--border-subtle)]"
                          />
                          <button
                            type="button"
                            onClick={() => setReceiptPhotoUrl(undefined)}
                            className="text-xs font-semibold hover:underline"
                            style={{ color: 'var(--status-danger-fg)' }}
                          >
                            Remove
                          </button>
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)]">
                          <ImageIcon className="w-3.5 h-3.5" aria-hidden="true" />
                          Capture parcel or sample condition
                        </span>
                      )}
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="recv-remarks"
                      className="block text-xs font-semibold text-[var(--text-body)] mb-1.5"
                    >
                      Remarks
                    </label>
                    <textarea
                      id="recv-remarks"
                      rows={2}
                      value={receiveRemarks}
                      onChange={(e) => setReceiveRemarks(e.target.value)}
                      className="fin-textarea w-full p-3.5 text-sm"
                    />
                  </div>
                </>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => setReceivingCase(null)}
                  className="fin-btn-secondary px-4 py-2 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingReceive}
                  className="fin-btn-primary px-5 py-2 text-xs inline-flex items-center gap-1.5"
                >
                  {submittingReceive && (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                  )}
                  {submittingReceive
                    ? 'Saving...'
                    : receivedChoice === 'yes'
                      ? canViewTestEntry
                        ? 'Confirm Receipt & Open Test 1'
                        : 'Confirm Receipt'
                      : 'Save Not Received Status'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Unified Case Detail Modal */}
      <CaseDetailModal labCase={detailCase} onClose={() => setDetailCase(null)} />

      {/* QR Label Modal */}
      <SampleQrModal
        labCase={qrCase}
        competitor={qrCase ? competitorMap.get(qrCase.competitorId) : undefined}
        onClose={() => setQrCase(null)}
      />
    </div>
  );
}
