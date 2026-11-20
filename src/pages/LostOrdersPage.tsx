import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Clock, Download, Eye, FlaskConical, History, Inbox, Loader2, Plus, Search, Trash2, X } from 'lucide-react';
import { useLab } from '../context/LabContext';
import { canFullAccessPage } from '../utils/auth';
import { formatCurrency, formatDateTime, formatShortDate } from '../utils/fileHelpers';
import {
  getLocalTodayIsoDate,
  isCaseOverdue,
  validateLostOrderForm,
  validateSampleRequestForm,
} from '../utils/labCalculations';
import { CaseDetailModal } from '../components/CaseDetailModal';
import { LossReasonText, OverdueChip, SampleStatusBadge } from '../components/StatusBadge';
import { Pagination } from '../components/Pagination';
import {
  ConfirmDialog,
  EmptyState,
  FeedCard,
  getCaseProgress,
  MobileBanner,
  PageHeader,
  SegmentedTabs,
} from '../components/ui';
import type { LabCase } from '../types/lab';

const DEFAULT_LOSS_REASONS = ['Price', 'Quality', 'Delivery', 'Other'];
const DEFAULT_SOURCE_TYPES = ['Customer', 'Market-Retail Shop', 'Dealer-Distributor', 'Online', 'Other'];
const DEFAULT_PRIORITIES = ['Low', 'Medium', 'High'];

export function LostOrdersPage() {
  const {
    cases,
    masters,
    currentUser,
    addLostOrder,
    deleteLostOrder,
    requestSample,
    saveCompetitor,
    saveCategory,
  } = useLab();
  const [searchParams, setSearchParams] = useSearchParams();

  const canEditLostOrders = canFullAccessPage(currentUser, 'lostOrders');
  const todayIso = getLocalTodayIsoDate();

  const [activeTab, setActiveTab] = useState<'active' | 'history'>('active');
  const [search, setSearch] = useState('');
  const [competitorFilter, setCompetitorFilter] = useState('all');
  const [reasonFilter, setReasonFilter] = useState('all');
  const [pendingOnly, setPendingOnly] = useState(() => searchParams.get('pending') === '2');
  const [showAddModal, setShowAddModal] = useState(false);
  const [detailCase, setDetailCase] = useState<LabCase | null>(null);

  useEffect(() => {
    if (searchParams.get('pending') === '2') {
      setActiveTab('active');
      setPendingOnly(true);
    }
  }, [searchParams]);

  const lossReasonOptions = useMemo(() => {
    const vals = masters.lossReasons.map((m) => m.value).filter(Boolean);
    return vals.length > 0 ? vals : DEFAULT_LOSS_REASONS;
  }, [masters.lossReasons]);

  const sourceTypeOptions = useMemo(() => {
    const vals = masters.sourceTypes.map((m) => m.value).filter(Boolean);
    return vals.length > 0 ? vals : DEFAULT_SOURCE_TYPES;
  }, [masters.sourceTypes]);

  const priorityOptions = useMemo(() => {
    const vals = masters.priorities.map((m) => m.value).filter(Boolean);
    return vals.length > 0 ? vals : DEFAULT_PRIORITIES;
  }, [masters.priorities]);

  // Add Lost Order form state
  const [customer, setCustomer] = useState('');
  const [product, setProduct] = useState('');
  const [category, setCategory] = useState('');
  const [orderValue, setOrderValue] = useState('');
  const [competitorId, setCompetitorId] = useState('');
  const [newCompetitorName, setNewCompetitorName] = useState('');
  const [lossReason, setLossReason] = useState('');
  const [orderDate, setOrderDate] = useState(todayIso);
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [deletingCaseId, setDeletingCaseId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LabCase | null>(null);

  // Request Sample modal state
  const [requestOrder, setRequestOrder] = useState<LabCase | null>(null);
  const [sampleName, setSampleName] = useState('');
  const [qtyNeeded, setQtyNeeded] = useState('2');
  const [sourceType, setSourceType] = useState('');
  const [sourceLocation, setSourceLocation] = useState('');
  const [responsiblePerson, setResponsiblePerson] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [priority, setPriority] = useState('');
  const [requestNotes, setRequestNotes] = useState('');
  const [requestErrors, setRequestErrors] = useState<Record<string, string>>({});
  const [submittingRequest, setSubmittingRequest] = useState(false);

  const competitorMap = useMemo(
    () => new Map(masters.competitors.map((c) => [c.id, c.name])),
    [masters.competitors]
  );

  const isOrderProcessed = (c: LabCase) =>
    c.status !== 'No Sample' || Boolean(c.sampleCode || c.actual2);

  const activeOrdersCount = useMemo(
    () => cases.filter((c) => !isOrderProcessed(c)).length,
    [cases]
  );

  const historyOrdersCount = useMemo(
    () => cases.filter((c) => isOrderProcessed(c)).length,
    [cases]
  );

  const stage2PendingCount = useMemo(
    () => cases.filter((c) => !isOrderProcessed(c) || Number(c.pendingStageNo) === 2).length,
    [cases]
  );

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = cases.filter((order) => {
      const processed = isOrderProcessed(order);
      if (activeTab === 'active' && processed) {
        return false;
      }
      if (activeTab === 'history' && !processed) {
        return false;
      }
      if (activeTab === 'active' && pendingOnly && Number(order.pendingStageNo) !== 2) {
        return false;
      }
      if (
        competitorFilter !== 'all' &&
        order.competitorId !== competitorFilter &&
        order.competitor !== competitorFilter
      ) {
        return false;
      }
      if (
        reasonFilter !== 'all' &&
        (order.lossReason || '').trim().toLowerCase() !== reasonFilter.toLowerCase()
      ) {
        return false;
      }
      if (!q) return true;
      const compName = (
        competitorMap.get(order.competitorId) ||
        order.competitorName ||
        ''
      ).toLowerCase();
      return (
        order.caseId.toLowerCase().includes(q) ||
        order.customer.toLowerCase().includes(q) ||
        order.product.toLowerCase().includes(q) ||
        order.category.toLowerCase().includes(q) ||
        compName.includes(q)
      );
    });

    if (activeTab === 'active' && pendingOnly) {
      return [...list].sort((a, b) =>
        String(a.pendingPlanned || '9999-12-31').localeCompare(
          String(b.pendingPlanned || '9999-12-31')
        )
      );
    }
    return list;
  }, [cases, activeTab, pendingOnly, search, competitorFilter, reasonFilter, competitorMap]);

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, competitorFilter, reasonFilter, pendingOnly, activeTab]);

  const paginatedOrders = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredOrders.slice(start, start + pageSize);
  }, [filteredOrders, currentPage, pageSize]);

  const togglePendingOnly = () => {
    const next = !pendingOnly;
    setPendingOnly(next);
    if (next) {
      setSearchParams({ pending: '2' });
    } else {
      setSearchParams({});
    }
  };

  const openModal = () => {
    setCustomer('');
    setProduct('');
    setCategory(masters.categories[0]?.category ?? '');
    setOrderValue('');
    setCompetitorId(masters.competitors[0]?.id ?? '__new__');
    setNewCompetitorName('');
    setLossReason(lossReasonOptions[0] ?? 'Price');
    setOrderDate(getLocalTodayIsoDate());
    setNotes('');
    setErrors({});
    setShowAddModal(true);
  };

  // Global "+ New Entry" / FAB lands here with ?new=1
  useEffect(() => {
    if (searchParams.get('new') !== '1') return;
    if (canEditLostOrders) openModal();
    const next = new URLSearchParams(searchParams);
    next.delete('new');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const openRequestSampleModal = (order: LabCase) => {
    setRequestOrder(order);
    setSampleName(order.product);
    setQtyNeeded('2');
    setSourceType(sourceTypeOptions[0] ?? 'Customer');
    setSourceLocation('');
    setResponsiblePerson('');
    setExpectedDate('');
    setPriority(priorityOptions.includes('Medium') ? 'Medium' : priorityOptions[0] ?? 'Medium');
    setRequestNotes('');
    setRequestErrors({});
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const isNewCompetitor = competitorId === '__new__' || masters.competitors.length === 0;
    const effectiveCompetitorId = isNewCompetitor ? 'pending-new' : competitorId;

    const validation = validateLostOrderForm({
      customer,
      product,
      category,
      orderValue,
      competitorId: effectiveCompetitorId,
      lossReason,
      orderDate,
    });

    const nextErrors = { ...validation.errors };
    if (isNewCompetitor && !newCompetitorName.trim()) {
      nextErrors.competitorId = 'Enter the competitor name.';
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setSubmittingOrder(true);
    try {
      const cleanCategory = category.trim();
      if (
        cleanCategory &&
        !masters.categories.some((c) => c.category.toLowerCase() === cleanCategory.toLowerCase())
      ) {
        await saveCategory(cleanCategory, `Benchmark test parameters for ${cleanCategory}.`);
      }

      let finalCompetitorId = competitorId;
      if (isNewCompetitor) {
        const cleanCompName = newCompetitorName.trim();
        const existingIds = new Set(masters.competitors.map((c) => c.id));
        const compSnap = await saveCompetitor({
          name: cleanCompName,
          headquarters: 'Unspecified',
          marketSegment: cleanCategory || 'General',
          website: '',
          notes: 'Added via Lost Orders entry.',
        });
        if (!compSnap) return;
        const createdComp =
          compSnap.masters.competitors.find((c) => !existingIds.has(c.id)) ??
          compSnap.masters.competitors.find(
            (c) => c.name.toLowerCase() === cleanCompName.toLowerCase()
          );
        if (!createdComp) return;
        finalCompetitorId = createdComp.id;
      }

      const nextSnap = await addLostOrder({
        customer: customer.trim(),
        product: product.trim(),
        category: cleanCategory,
        orderValue: Number(orderValue),
        competitorId: finalCompetitorId,
        lossReason,
        orderDate,
        notes: notes.trim(),
      });

      if (nextSnap) {
        setShowAddModal(false);
      }
    } finally {
      setSubmittingOrder(false);
    }
  };

  const handleRequestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestOrder) return;

    const validation = validateSampleRequestForm({
      caseId: requestOrder.caseId,
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
        caseId: requestOrder.caseId,
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
        setRequestOrder(null);
      }
    } finally {
      setSubmittingRequest(false);
    }
  };

  const handleDeleteOrder = async (caseId: string) => {
    setDeletingCaseId(caseId);
    try {
      await deleteLostOrder(caseId);
    } finally {
      setDeletingCaseId(null);
    }
  };

  const viewOnly = !canEditLostOrders;
  const hasFilters = Boolean(search || competitorFilter !== 'all' || reasonFilter !== 'all' || pendingOnly);

  const clearFilters = () => {
    setSearch('');
    setCompetitorFilter('all');
    setReasonFilter('all');
    if (pendingOnly) {
      setPendingOnly(false);
      setSearchParams({});
    }
  };

  const compLabel = (order: LabCase) =>
    competitorMap.get(order.competitorId) ||
    order.competitorName ||
    (typeof order.competitor === 'string' ? order.competitor : '') ||
    '—';

  const handleExportCsv = () => {
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const headers = ['Case ID', 'Date Lost', 'Customer', 'Product', 'Category', 'Order Value', 'Competitor', 'Loss Reason', 'Status', 'Notes'];
    const rows = filteredOrders.map((o) =>
      [o.caseId, o.dateLost || o.orderDate, o.customer, o.product, o.category, o.orderValue, compLabel(o), o.lossReason, o.status, o.orderNotes]
        .map(esc)
        .join(',')
    );
    const blob = new Blob([[headers.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lost-orders-${activeTab}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Directory"
        title="Lost Orders Registry"
        viewOnly={viewOnly}
        actions={
          <>
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={filteredOrders.length === 0}
              className="fin-btn-secondary inline-flex items-center gap-2 px-4 text-sm"
            >
              <Download className="w-4 h-4" aria-hidden="true" />
              Export
            </button>
            {canEditLostOrders && (
              <button type="button" onClick={openModal} className="fin-btn-primary inline-flex items-center gap-2 px-4 text-sm">
                <Plus className="w-4 h-4" aria-hidden="true" />
                New Lost Order
              </button>
            )}
          </>
        }
      />

      <MobileBanner
        label={activeTab === 'active' ? 'Active lost orders' : 'Processed orders'}
        count={filteredOrders.length}
        caption={`${activeOrdersCount} active · ${historyOrdersCount} with samples`}
        icon={<Download className="w-[18px] h-[18px]" />}
        iconLabel="Export CSV"
        onIconClick={handleExportCsv}
        onNew={canEditLostOrders ? openModal : undefined}
        viewOnly={viewOnly}
      />

      {/* Filter toolbar */}
      <div className="md:glass md:rounded-2xl md:p-3 flex flex-col xl:flex-row xl:items-center gap-3">
        <SegmentedTabs
          ariaLabel="Order view"
          value={activeTab}
          onChange={(v) => {
            setActiveTab(v);
            if (v === 'history') setPendingOnly(false);
          }}
          options={[
            { value: 'active', label: 'Active', count: activeOrdersCount, icon: <Clock className="w-3.5 h-3.5" /> },
            { value: 'history', label: 'History', count: historyOrdersCount, icon: <History className="w-3.5 h-3.5" /> },
          ]}
          className="self-start"
        />

        <div className="relative flex-1 min-w-0 xl:max-w-xs">
          <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search customer, product, case ID..."
            aria-label="Search lost orders"
            className="fin-input w-full pl-10 pr-3.5"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto scrollbar-none -mx-4 px-4 md:mx-0 md:px-0">
          <select
            value={competitorFilter}
            onChange={(e) => setCompetitorFilter(e.target.value)}
            aria-label="Filter by competitor"
            className="fin-input px-3 shrink-0 max-w-[12rem]"
          >
            <option value="all">All Competitors</option>
            {masters.competitors.map((c) => (
              <option key={c.id || c.name} value={c.name || c.id}>
                {c.name || c.id}
              </option>
            ))}
          </select>

          <select
            value={reasonFilter}
            onChange={(e) => setReasonFilter(e.target.value)}
            aria-label="Filter by loss reason"
            className="fin-input px-3 shrink-0"
          >
            <option value="all">All Reasons</option>
            {lossReasonOptions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>

          {activeTab === 'active' && (
            <button
              type="button"
              onClick={togglePendingOnly}
              aria-pressed={pendingOnly}
              className="inline-flex items-center gap-1.5 px-3.5 h-11 text-xs font-semibold rounded-full border transition-colors whitespace-nowrap shrink-0"
              style={
                pendingOnly
                  ? { backgroundColor: 'var(--brand)', color: '#FFFFFF', borderColor: 'var(--brand)' }
                  : { backgroundColor: 'var(--bg-surface)', color: 'var(--text-body)', borderColor: 'var(--border-subtle)' }
              }
            >
              Request pending
              <span className="font-mono">{stage2PendingCount}</span>
            </button>
          )}

          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center gap-1 px-3 h-11 text-xs font-semibold text-[var(--color-primary)] whitespace-nowrap shrink-0 hover:underline"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Mobile: stacked detail cards */}
      <div className="md:hidden space-y-3">
        {filteredOrders.length === 0 ? (
          <div className="feed-card">
            <EmptyState
              icon={<Inbox className="w-5 h-5" />}
              title={pendingOnly ? 'No sample requests pending' : 'No matching lost orders'}
              hint={hasFilters ? 'Try clearing the filters.' : undefined}
            />
          </div>
        ) : (
          paginatedOrders.map((order) => {
            const hasSample = order.status !== 'No Sample';
            return (
              <FeedCard
                key={order.caseId}
                id={order.caseId}
                title={order.customer}
                subtitle={`${order.product}${order.category ? ` · ${order.category}` : ''}`}
                onOpen={() => setDetailCase(order)}
                openLabel={`View details for ${order.caseId}`}
                highlight={isCaseOverdue(order)}
                meta={[
                  { label: 'Value', value: <span className="font-mono">{formatCurrency(order.orderValue)}</span> },
                  { label: 'Competitor', value: compLabel(order) },
                  { label: 'Reason', value: <LossReasonText reason={order.lossReason} /> },
                ]}
                progress={getCaseProgress(order)}
                progressTone={isCaseOverdue(order) ? 'danger' : 'brand'}
                footerLeft={formatShortDate(order.dateLost || order.orderDate) || '—'}
                footerRight={hasSample ? <SampleStatusBadge status={order.status} /> : <SampleStatusBadge status="No Sample" />}
                actions={
                  canEditLostOrders ? (
                    <>
                      {!hasSample && (
                        <button
                          type="button"
                          onClick={() => openRequestSampleModal(order)}
                          className="fin-btn-primary h-11 inline-flex items-center justify-center gap-1.5 text-sm"
                        >
                          <FlaskConical className="w-4 h-4" aria-hidden="true" />
                          Request
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(order)}
                        className="fin-btn-secondary h-11 inline-flex items-center justify-center gap-1.5 text-sm !text-[var(--status-danger-fg)]"
                      >
                        <Trash2 className="w-4 h-4" aria-hidden="true" />
                        Delete
                      </button>
                    </>
                  ) : undefined
                }
              />
            );
          })
        )}
      </div>

      {/* Desktop: glass table */}
      <div className="hidden md:block fin-card p-4 lg:p-5">
        <div className="fin-table-wrap">
          <table className="min-w-[1180px] w-full text-left border-collapse">
            <thead>
              <tr className="fin-table-head text-[11px] uppercase">
                <th className="py-3 px-3 rounded-l-xl whitespace-nowrap">Actions</th>
                <th className="py-3 px-3 whitespace-nowrap">Case ID</th>
                <th className="py-3 px-3 whitespace-nowrap">Customer</th>
                <th className="py-3 px-3 whitespace-nowrap">Product</th>
                <th className="py-3 px-3 whitespace-nowrap">Category</th>
                <th className="py-3 px-3 text-right whitespace-nowrap">Order Value</th>
                <th className="py-3 px-3 whitespace-nowrap">Competitor</th>
                <th className="py-3 px-3 whitespace-nowrap">Loss Reason</th>
                <th className="py-3 px-3 whitespace-nowrap">Notes</th>
                <th className="py-3 px-3 whitespace-nowrap">Date Lost</th>
                <th className="py-3 px-3 rounded-r-xl whitespace-nowrap">Logged</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)] text-[13px]">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={11}>
                    <EmptyState
                      icon={<Inbox className="w-5 h-5" />}
                      title={pendingOnly ? 'No sample requests pending' : 'No matching lost orders'}
                      hint={hasFilters ? 'Try clearing the filters.' : undefined}
                    />
                  </td>
                </tr>
              ) : (
                paginatedOrders.map((order) => {
                  const hasSample = order.status !== 'No Sample';
                  return (
                    <tr key={order.caseId} onClick={() => setDetailCase(order)} className="fin-table-row cursor-pointer">
                      <td className="py-3 px-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setDetailCase(order)}
                            aria-label={`View details for ${order.caseId}`}
                            title="View case details"
                            className="w-9 h-9 rounded-full inline-flex items-center justify-center border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--color-primary)] hover:bg-[var(--mint)] transition-colors"
                          >
                            <Eye className="w-4 h-4" aria-hidden="true" />
                          </button>
                          {hasSample ? (
                            <SampleStatusBadge status={order.status} />
                          ) : canEditLostOrders ? (
                            <button
                              type="button"
                              onClick={() => openRequestSampleModal(order)}
                              title="Request competitor sample for benchmarking"
                              className="fin-btn-primary !min-h-9 h-9 inline-flex items-center gap-1.5 px-3 text-xs !rounded-full"
                            >
                              <FlaskConical className="w-3.5 h-3.5" aria-hidden="true" />
                              Request Sample
                            </button>
                          ) : (
                            <span className="text-xs text-[var(--text-muted)] px-2">No sample</span>
                          )}
                          {canEditLostOrders && (
                            <button
                              type="button"
                              disabled={deletingCaseId === order.caseId}
                              onClick={() => setDeleteTarget(order)}
                              aria-label={`Delete lost order ${order.caseId}`}
                              title="Delete order"
                              className="w-9 h-9 rounded-full inline-flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--status-danger-fg)] hover:bg-[var(--status-danger-bg)] disabled:opacity-50 transition-colors"
                            >
                              {deletingCaseId === order.caseId ? (
                                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                              ) : (
                                <Trash2 className="w-4 h-4" aria-hidden="true" />
                              )}
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-3 font-mono font-bold text-xs text-[var(--color-primary)] whitespace-nowrap">
                        {order.caseId}
                      </td>
                      <td className="py-3 px-3 max-w-[170px]">
                        <p className="font-semibold text-[var(--text-heading)] truncate" title={order.customer}>
                          {order.customer}
                        </p>
                      </td>
                      <td className="py-3 px-3 max-w-[170px]">
                        <p className="text-[var(--text-heading)] truncate" title={order.product}>
                          {order.product}
                        </p>
                      </td>
                      <td className="py-3 px-3 text-xs text-[var(--text-muted)] max-w-[140px] truncate" title={order.category}>
                        {order.category || '—'}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums font-bold text-[var(--text-heading)] whitespace-nowrap">
                        {formatCurrency(order.orderValue)}
                      </td>
                      <td className="py-3 px-3 text-[var(--text-body)] max-w-[140px] truncate" title={compLabel(order)}>
                        {compLabel(order)}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <LossReasonText reason={order.lossReason} />
                      </td>
                      <td className="py-3 px-3 max-w-[180px]">
                        <p className="text-xs text-[var(--text-muted)] line-clamp-1" title={order.orderNotes}>
                          {order.orderNotes || '—'}
                        </p>
                      </td>
                      <td className="py-3 px-3 text-xs font-mono text-[var(--text-muted)] whitespace-nowrap">
                        {formatShortDate(order.dateLost || order.orderDate) || '—'}
                      </td>
                      <td className="py-3 px-3 font-mono text-xs text-[var(--text-muted)] whitespace-nowrap">
                        {order.timestamp ? formatDateTime(order.timestamp) : '—'}
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
        totalItems={filteredOrders.length}
        pageSize={pageSize}
        onPageChange={setCurrentPage}
        onPageSizeChange={setPageSize}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        tone="danger"
        title="Delete this lost order?"
        message={
          deleteTarget ? (
            <>
              <span className="font-mono font-semibold">{deleteTarget.caseId}</span> will be removed from the sheet.
            </>
          ) : undefined
        }
        details={
          deleteTarget
            ? [
                `${deleteTarget.customer} — ${deleteTarget.product}`,
                `Order value: ${formatCurrency(deleteTarget.orderValue)}`,
                `Competitor: ${compLabel(deleteTarget)}`,
                'This cannot be undone.',
              ]
            : []
        }
        confirmLabel="Delete Order"
        busyLabel="Deleting..."
        onCancel={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return;
          await handleDeleteOrder(deleteTarget.caseId);
          setDeleteTarget(null);
        }}
      />

      {/* Add Lost Order Modal */}
      {showAddModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center fin-modal-backdrop p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-order-title"
        >
          <div className="fin-modal-panel max-w-[min(92vw,640px)] w-full max-h-[90dvh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-[var(--border-subtle)] shrink-0">
              <h2 id="add-order-title" className="text-base font-bold text-[var(--text-heading)]">
                Log Lost Sales Order
              </h2>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                aria-label="Close lost order form"
                className="p-1.5 rounded-[10px] text-[var(--text-muted)] hover:text-[var(--text-heading)] hover:bg-[var(--bg-surface-muted)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} noValidate className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="lo-customer"
                    className="block text-xs font-semibold text-[var(--text-body)] mb-1.5"
                  >
                    Customer Name *
                  </label>
                  <input
                    id="lo-customer"
                    type="text"
                    value={customer}
                    onChange={(e) => {
                      setCustomer(e.target.value);
                      setErrors((prev) => ({ ...prev, customer: '' }));
                    }}
                    placeholder="e.g. Titan Heavy Works"
                    className="fin-input w-full px-3.5 text-sm"
                  />
                  {errors.customer && (
                    <p
                      className="text-xs mt-1"
                      style={{ color: 'var(--status-danger-fg)' }}
                      role="alert"
                    >
                      {errors.customer}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="lo-product"
                    className="block text-xs font-semibold text-[var(--text-body)] mb-1.5"
                  >
                    Product Model *
                  </label>
                  <input
                    id="lo-product"
                    type="text"
                    value={product}
                    onChange={(e) => {
                      setProduct(e.target.value);
                      setErrors((prev) => ({ ...prev, product: '' }));
                    }}
                    placeholder="e.g. Check Valve HV-60"
                    className="fin-input w-full px-3.5 text-sm"
                  />
                  {errors.product && (
                    <p
                      className="text-xs mt-1"
                      style={{ color: 'var(--status-danger-fg)' }}
                      role="alert"
                    >
                      {errors.product}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="lo-category"
                    className="block text-xs font-semibold text-[var(--text-body)] mb-1.5"
                  >
                    Product Category *
                  </label>
                  <input
                    id="lo-category"
                    type="text"
                    list="lo-category-list"
                    value={category}
                    onChange={(e) => {
                      setCategory(e.target.value);
                      setErrors((prev) => ({ ...prev, category: '' }));
                    }}
                    placeholder="e.g. Hydraulic Check Valves"
                    className="fin-input w-full px-3.5 text-sm"
                  />
                  <datalist id="lo-category-list">
                    {masters.categories.map((cat) => (
                      <option key={cat.category} value={cat.category} />
                    ))}
                  </datalist>
                  {errors.category && (
                    <p
                      className="text-xs mt-1"
                      style={{ color: 'var(--status-danger-fg)' }}
                      role="alert"
                    >
                      {errors.category}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="lo-competitor"
                    className="block text-xs font-semibold text-[var(--text-body)] mb-1.5"
                  >
                    Lost To Competitor *
                  </label>
                  <select
                    id="lo-competitor"
                    value={competitorId}
                    onChange={(e) => {
                      setCompetitorId(e.target.value);
                      setErrors((prev) => ({ ...prev, competitorId: '' }));
                    }}
                    className="fin-input w-full px-3.5 text-sm"
                  >
                    {masters.competitors.length > 0 && <option value="">Select competitor...</option>}
                    {masters.competitors.map((c) => (
                      <option key={c.id || c.name} value={c.name || c.id}>
                        {c.name || c.id}
                      </option>
                    ))}
                    <option value="__new__">+ Add New Competitor</option>
                  </select>
                  {(competitorId === '__new__' || masters.competitors.length === 0) && (
                    <input
                      type="text"
                      aria-label="New competitor name"
                      value={newCompetitorName}
                      onChange={(e) => {
                        setNewCompetitorName(e.target.value);
                        setErrors((prev) => ({ ...prev, competitorId: '' }));
                      }}
                      placeholder="Enter competitor name..."
                      className="fin-input mt-2 w-full px-3.5 text-sm"
                    />
                  )}
                  {errors.competitorId && (
                    <p
                      className="text-xs mt-1"
                      style={{ color: 'var(--status-danger-fg)' }}
                      role="alert"
                    >
                      {errors.competitorId}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label
                    htmlFor="lo-value"
                    className="block text-xs font-semibold text-[var(--text-body)] mb-1.5"
                  >
                    Order Value *
                  </label>
                  <input
                    id="lo-value"
                    type="number"
                    min="1"
                    step="100"
                    value={orderValue}
                    onChange={(e) => {
                      setOrderValue(e.target.value);
                      setErrors((prev) => ({ ...prev, orderValue: '' }));
                    }}
                    placeholder="45000"
                    className="fin-input w-full px-3.5 text-sm font-mono"
                  />
                  {errors.orderValue && (
                    <p
                      className="text-xs mt-1"
                      style={{ color: 'var(--status-danger-fg)' }}
                      role="alert"
                    >
                      {errors.orderValue}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="lo-reason"
                    className="block text-xs font-semibold text-[var(--text-body)] mb-1.5"
                  >
                    Loss Reason *
                  </label>
                  <select
                    id="lo-reason"
                    value={lossReason}
                    onChange={(e) => {
                      setLossReason(e.target.value);
                      setErrors((prev) => ({ ...prev, lossReason: '' }));
                    }}
                    className="fin-input w-full px-3.5 text-sm"
                  >
                    {lossReasonOptions.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="lo-date"
                    className="block text-xs font-semibold text-[var(--text-body)] mb-1.5"
                  >
                    Date Lost *
                  </label>
                  <input
                    id="lo-date"
                    type="date"
                    value={orderDate}
                    onChange={(e) => {
                      setOrderDate(e.target.value);
                      setErrors((prev) => ({ ...prev, orderDate: '' }));
                    }}
                    className="fin-input w-full px-3.5 text-sm font-mono"
                  />
                  {errors.orderDate && (
                    <p
                      className="text-xs mt-1"
                      style={{ color: 'var(--status-danger-fg)' }}
                      role="alert"
                    >
                      {errors.orderDate}
                    </p>
                  )}
                </div>
              </div>

              <div>
                <label
                  htmlFor="lo-notes"
                  className="block text-xs font-semibold text-[var(--text-body)] mb-1.5"
                >
                  Sales &amp; Field Notes
                </label>
                <textarea
                  id="lo-notes"
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Context from buyer feedback, pricing gap, or technical objections..."
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
                  disabled={submittingOrder}
                  className="fin-btn-primary px-5 py-2 text-xs inline-flex items-center gap-1.5"
                >
                  {submittingOrder && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
                  {submittingOrder ? 'Saving...' : 'Save Lost Order'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Request Competitor Sample Modal */}
      {requestOrder && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center fin-modal-backdrop p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="request-sample-title"
        >
          <div className="fin-modal-panel max-w-[min(92vw,640px)] w-full max-h-[90dvh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-[var(--border-subtle)] shrink-0">
              <div>
                <h2
                  id="request-sample-title"
                  className="text-base font-bold text-[var(--text-heading)]"
                >
                  Request Competitor Sample
                </h2>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  Log collection details for lab intake tracking
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRequestOrder(null)}
                aria-label="Close request sample modal"
                className="p-1.5 rounded-[10px] text-[var(--text-muted)] hover:text-[var(--text-heading)] hover:bg-[var(--bg-surface-muted)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleRequestSubmit} noValidate className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
              {/* Read-only Lost Order Summary */}
              <div
                className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-[14px] border border-[var(--border-subtle)] text-xs"
                style={{ backgroundColor: 'var(--bg-surface-muted)' }}
              >
                <div>
                  <span className="text-[var(--text-muted)] block">Case ID</span>
                  <span className="font-mono font-bold text-[var(--text-heading)] mt-0.5 block">
                    {requestOrder.caseId}
                  </span>
                </div>
                <div>
                  <span className="text-[var(--text-muted)] block">Customer</span>
                  <span className="font-semibold text-[var(--text-heading)] mt-0.5 block">
                    {requestOrder.customer}
                  </span>
                </div>
                <div>
                  <span className="text-[var(--text-muted)] block">Product</span>
                  <span className="font-semibold text-[var(--text-heading)] mt-0.5 block">
                    {requestOrder.product}
                  </span>
                </div>
                <div>
                  <span className="text-[var(--text-muted)] block">Competitor</span>
                  <span className="font-semibold text-[var(--text-heading)] mt-0.5 block">
                    {competitorMap.get(requestOrder.competitorId) ||
                      requestOrder.competitorName ||
                      'Unknown'}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="req-sample-name"
                    className="block text-xs font-semibold text-[var(--text-body)] mb-1.5"
                  >
                    Sample Name / Product to Collect *
                  </label>
                  <input
                    id="req-sample-name"
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
                    htmlFor="req-competitor-ro"
                    className="block text-xs font-semibold text-[var(--text-body)] mb-1.5"
                  >
                    Competitor
                  </label>
                  <input
                    id="req-competitor-ro"
                    type="text"
                    readOnly
                    value={
                      competitorMap.get(requestOrder.competitorId) ||
                      requestOrder.competitorName ||
                      'Unknown'
                    }
                    className="fin-input w-full px-3.5 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label
                    htmlFor="req-qty"
                    className="block text-xs font-semibold text-[var(--text-body)] mb-1.5"
                  >
                    Quantity Needed *
                  </label>
                  <input
                    id="req-qty"
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

                <div>
                  <label
                    htmlFor="req-source-type"
                    className="block text-xs font-semibold text-[var(--text-body)] mb-1.5"
                  >
                    Source Type *
                  </label>
                  <select
                    id="req-source-type"
                    value={sourceType}
                    onChange={(e) => {
                      setSourceType(e.target.value);
                      setRequestErrors((prev) => ({ ...prev, sourceType: '' }));
                    }}
                    className="fin-input w-full px-3.5 text-sm"
                  >
                    {sourceTypeOptions.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                  {requestErrors.sourceType && (
                    <p
                      className="text-xs mt-1"
                      style={{ color: 'var(--status-danger-fg)' }}
                      role="alert"
                    >
                      {requestErrors.sourceType}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="req-priority"
                    className="block text-xs font-semibold text-[var(--text-body)] mb-1.5"
                  >
                    Priority *
                  </label>
                  <select
                    id="req-priority"
                    value={priority}
                    onChange={(e) => {
                      setPriority(e.target.value);
                      setRequestErrors((prev) => ({ ...prev, priority: '' }));
                    }}
                    className="fin-input w-full px-3.5 text-sm"
                  >
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
                    htmlFor="req-source-location"
                    className="block text-xs font-semibold text-[var(--text-body)] mb-1.5"
                  >
                    Exact Shop / Location / Address *
                  </label>
                  <input
                    id="req-source-location"
                    type="text"
                    value={sourceLocation}
                    onChange={(e) => {
                      setSourceLocation(e.target.value);
                      setRequestErrors((prev) => ({ ...prev, sourceLocation: '' }));
                    }}
                    placeholder="e.g. Apex Hardware, 410 Industrial Blvd, Chicago"
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
                    htmlFor="req-responsible"
                    className="block text-xs font-semibold text-[var(--text-body)] mb-1.5"
                  >
                    Responsible Person *
                  </label>
                  <input
                    id="req-responsible"
                    type="text"
                    value={responsiblePerson}
                    onChange={(e) => {
                      setResponsiblePerson(e.target.value);
                      setRequestErrors((prev) => ({ ...prev, responsiblePerson: '' }));
                    }}
                    placeholder="Who will procure & deliver the sample"
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
                  htmlFor="req-expected-date"
                  className="block text-xs font-semibold text-[var(--text-body)] mb-1.5"
                >
                  Expected Arrival Date / Deadline *
                </label>
                <input
                  id="req-expected-date"
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
                  htmlFor="req-notes"
                  className="block text-xs font-semibold text-[var(--text-body)] mb-1.5"
                >
                  Notes / Instructions
                </label>
                <textarea
                  id="req-notes"
                  rows={3}
                  value={requestNotes}
                  onChange={(e) => setRequestNotes(e.target.value)}
                  placeholder="Batch/lot preference, sealed-pack instructions, or courier handling notes..."
                  className="fin-textarea w-full p-3.5 text-sm"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => setRequestOrder(null)}
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

      {/* Unified Case Detail Modal (with FMS timeline & More details) */}
      <CaseDetailModal labCase={detailCase} onClose={() => setDetailCase(null)} />
    </div>
  );
}
