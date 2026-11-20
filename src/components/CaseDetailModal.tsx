import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Circle, ExternalLink, Loader2, Pencil, Printer, Save, X } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useLab } from '../context/LabContext';
import { canFullAccessPage } from '../utils/auth';
import { formatCurrency, formatDateTime, formatShortDate, getDriveThumbnailUrl } from '../utils/fileHelpers';
import { getCaseExtraFieldValue, getExtraFmsSchemaFields } from '../utils/labCalculations';
import { ApprovalStatusBadge, OverdueChip, SampleStatusBadge } from './StatusBadge';
import type { LabCase } from '../types/lab';

interface CaseDetailModalProps {
  labCase: LabCase | null;
  onClose: () => void;
}

const STAGE_LABELS = [
  { no: 1, label: 'Order Logged' },
  { no: 2, label: 'Sample Requested' },
  { no: 3, label: 'Sample Received' },
  { no: 4, label: 'Lab Testing' },
  { no: 5, label: 'Manager Sign-Off' },
];

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-2 border-b border-[var(--border-subtle)] last:border-b-0">
      <span className="text-[var(--text-muted)] shrink-0">{label}</span>
      <span className="text-[var(--text-heading)] font-semibold text-right min-w-0 break-words">{children}</span>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-[0.12em] mb-2.5">{children}</h3>
  );
}

/**
 * Detail dossier: bottom sheet on phones, right-anchored slide-over from `sm`.
 * Rendered in a portal so printing can hide the app shell and print only this panel.
 */
export function CaseDetailModal({ labCase, onClose }: CaseDetailModalProps) {
  const { schema, currentUser, masters, updateCase, cases } = useLab();

  const liveCase = useMemo(
    () => (labCase ? cases.find((c) => c.caseId === labCase.caseId) ?? labCase : null),
    [cases, labCase]
  );

  const extraFields = useMemo(() => getExtraFmsSchemaFields(schema.fms), [schema.fms]);
  const canEditExtraData = useMemo(
    () =>
      canFullAccessPage(currentUser, 'lostOrders') ||
      canFullAccessPage(currentUser, 'samples') ||
      canFullAccessPage(currentUser, 'testEntry'),
    [currentUser]
  );

  const [extraDrafts, setExtraDrafts] = useState<Record<string, string>>({});
  const [savingExtra, setSavingExtra] = useState(false);
  const [editing, setEditing] = useState(false);
  const moreDetailsRef = useRef<HTMLFormElement | null>(null);

  useEffect(() => {
    if (!liveCase) return;
    const init: Record<string, string> = {};
    for (const f of extraFields) {
      if (f.role === 'data') init[f.key] = getCaseExtraFieldValue(liveCase, f.key);
    }
    setExtraDrafts(init);
  }, [liveCase, extraFields]);

  useEffect(() => {
    setEditing(false);
  }, [labCase?.caseId]);

  useEffect(() => {
    if (!labCase) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [labCase, onClose]);

  if (!liveCase) return null;

  const competitorName =
    masters.competitors.find((c) => c.id === liveCase.competitorId)?.name || liveCase.competitorName || '—';
  const sampleCode = liveCase.sampleCode || liveCase.caseId;
  const editableExtraFields = extraFields.filter((f) => f.role === 'data');
  const canEdit = canEditExtraData && editableExtraFields.length > 0;
  const hasSample = liveCase.status !== 'No Sample';

  const handleSaveExtra = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    setSavingExtra(true);
    try {
      await updateCase(liveCase.caseId, extraDrafts);
      setEditing(false);
    } finally {
      setSavingExtra(false);
    }
  };

  const startEdit = () => {
    setEditing(true);
    window.setTimeout(() => moreDetailsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  const iconBtn =
    'w-11 h-11 sm:w-10 sm:h-10 rounded-full inline-flex items-center justify-center border border-[var(--border-subtle)] text-[var(--color-primary)] hover:bg-[var(--bg-surface-muted)] transition-colors';

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-stretch sm:justify-end print-area"
      role="dialog"
      aria-modal="true"
      aria-labelledby="case-detail-title"
    >
      <div className="absolute inset-0 fin-modal-backdrop anim-fade no-print" onClick={onClose} aria-hidden="true" />

      <div className="relative w-full sm:max-w-2xl h-[92dvh] sm:h-full rounded-t-3xl sm:rounded-none bg-[#F4F9F9] dark:bg-[var(--bg-modal)] flex flex-col overflow-hidden shadow-[var(--shadow-shell)] anim-sheet print-area">
        {/* Sticky header */}
        <header className="shrink-0 bg-[var(--bg-surface)] border-b border-[var(--border-subtle)] px-4 sm:px-6 pt-3 sm:pt-5 pb-4">
          <div className="sm:hidden w-10 h-1.5 rounded-full bg-slate-300/80 mx-auto mb-3 no-print" aria-hidden="true" />
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-xs font-bold text-[var(--color-primary)] bg-[var(--mint)] px-2 py-1 rounded-md">
                  {liveCase.caseId}
                </span>
                {liveCase.sampleCode && (
                  <span className="font-mono text-xs text-[var(--text-muted)]">{liveCase.sampleCode}</span>
                )}
                <SampleStatusBadge status={liveCase.status} />
                <OverdueChip delayDays={liveCase.pendingDelay} />
              </div>
              <h2 id="case-detail-title" className="font-display text-lg sm:text-xl font-bold text-[var(--text-heading)] mt-2 leading-snug">
                {liveCase.customer} — {liveCase.product}
              </h2>
            </div>
            <div className="flex items-center gap-1.5 shrink-0 no-print">
              <button type="button" onClick={() => window.print()} aria-label="Print dossier" title="Print" className={iconBtn}>
                <Printer className="w-4 h-4" />
              </button>
              {canEdit && (
                <button
                  type="button"
                  onClick={startEdit}
                  aria-label="Edit more details"
                  title="Edit"
                  className={iconBtn}
                  aria-pressed={editing}
                >
                  <Pencil className="w-4 h-4" />
                </button>
              )}
              <button type="button" onClick={onClose} aria-label="Close case details" title="Close" className={iconBtn}>
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </header>

        {/* Scrollable body */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-4 sm:py-5 space-y-4 text-sm pb-safe">
          {/* Summary */}
          <section className="sheet-section">
            <div className="flex flex-col sm:flex-row gap-4 items-start">
              {hasSample && (
                <div className="p-2.5 bg-white border border-[var(--border-subtle)] rounded-2xl shrink-0 self-center sm:self-start">
                  <QRCodeSVG
                    value={JSON.stringify({
                      sampleCode,
                      caseId: liveCase.caseId,
                      product: liveCase.sampleName || liveCase.product,
                      competitor: competitorName,
                      status: liveCase.status,
                    })}
                    size={96}
                    level="M"
                  />
                </div>
              )}
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 flex-1 min-w-0 w-full">
                {[
                  ['Order Value', <span className="font-mono">{formatCurrency(liveCase.orderValue)}</span>],
                  ['Category', liveCase.category || '—'],
                  ['Competitor', competitorName],
                  ['Loss Reason', liveCase.lossReason || '—'],
                  ['Order Date', <span className="font-mono">{formatShortDate(liveCase.orderDate)}</span>],
                  ['Entered By', liveCase.enteredBy || '—'],
                ].map(([label, value]) => (
                  <div key={String(label)} className="min-w-0">
                    <dt className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">{label}</dt>
                    <dd className="text-[13px] font-semibold text-[var(--text-heading)] mt-0.5 truncate">{value}</dd>
                  </div>
                ))}
              </dl>
              {liveCase.photoLink && (
                <a
                  href={liveCase.photoLink}
                  target="_blank"
                  rel="noreferrer"
                  className="w-24 h-24 rounded-2xl border border-[var(--border-subtle)] overflow-hidden bg-[var(--bg-surface-muted)] shrink-0 block"
                  title="Open sample photo"
                >
                  <img
                    src={getDriveThumbnailUrl(liveCase.photoLink)}
                    alt={`Sample ${sampleCode}`}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                </a>
              )}
            </div>
            {liveCase.orderNotes && (
              <p className="mt-3 pt-3 border-t border-[var(--border-subtle)] text-[13px] text-[var(--text-body)]">
                {liveCase.orderNotes}
              </p>
            )}
          </section>

          {/* Timeline */}
          <section className="sheet-section">
            <div className="flex items-center justify-between gap-2 mb-1">
              <SectionTitle>FMS Stage Timeline</SectionTitle>
              <span className="font-mono text-[11px] text-[var(--text-muted)] mb-2.5">
                Delay <strong className="text-[var(--text-heading)]">{liveCase.totalDelay}d</strong>
              </span>
            </div>
            <ol className="space-y-0">
              {STAGE_LABELS.map((st, idx) => {
                const planned = liveCase[`planned${st.no}` as keyof LabCase] as string | undefined;
                const actual = liveCase[`actual${st.no}` as keyof LabCase] as string | undefined;
                const isPendingHere = Number(liveCase.pendingStageNo) === st.no;
                const done = Boolean(actual);
                return (
                  <li key={st.no} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      {done ? (
                        <CheckCircle2 className="w-5 h-5 text-[var(--color-primary)] shrink-0" aria-hidden="true" />
                      ) : (
                        <Circle
                          className={`w-5 h-5 shrink-0 ${isPendingHere ? 'text-[var(--status-warning-fg)]' : 'text-slate-300'}`}
                          aria-hidden="true"
                        />
                      )}
                      {idx < STAGE_LABELS.length - 1 && (
                        <span
                          className={`w-0.5 flex-1 min-h-4 my-1 rounded-full ${done ? 'bg-[var(--color-primary)]' : 'bg-slate-200 dark:bg-white/10'}`}
                          aria-hidden="true"
                        />
                      )}
                    </div>
                    <div className="pb-4 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[13px] font-semibold text-[var(--text-heading)]">
                          {st.no}. {st.label}
                        </span>
                        {isPendingHere && <OverdueChip delayDays={liveCase.pendingDelay} />}
                      </div>
                      <p className="font-mono text-[11px] text-[var(--text-muted)] mt-0.5">
                        Planned {formatDateTime(planned) || '—'} · Actual{' '}
                        <span className={done ? 'text-[var(--text-heading)]' : ''}>{formatDateTime(actual) || '—'}</span>
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>

          {/* Request & receipt */}
          {hasSample && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <section className="sheet-section text-[13px]">
                <SectionTitle>Request &amp; Collection</SectionTitle>
                <Row label="Sample">{liveCase.sampleName || liveCase.product}</Row>
                <Row label="Qty · Priority">
                  <span className="font-mono">{liveCase.qtyNeeded ?? 1}</span> · {liveCase.priority || '—'}
                </Row>
                <Row label="Source">
                  {liveCase.sourceType || '—'}
                  {liveCase.sourceLocation ? ` — ${liveCase.sourceLocation}` : ''}
                </Row>
                <Row label="Responsible">
                  {liveCase.responsiblePerson || '—'} ({liveCase.requestedBy || '—'})
                </Row>
                <Row label="Expected">
                  <span className="font-mono">{formatShortDate(liveCase.expectedDate)}</span>
                </Row>
                {liveCase.requestNotes && <p className="pt-2 text-[var(--text-body)]">{liveCase.requestNotes}</p>}
              </section>

              <section className="sheet-section text-[13px]">
                <SectionTitle>Lab Receipt &amp; Sign-Off</SectionTitle>
                <Row label="Received">
                  {liveCase.receivedBy || '—'} ·{' '}
                  <span className="font-mono">
                    {liveCase.receivedQty !== undefined ? `${liveCase.receivedQty} unit(s)` : '—'}
                  </span>
                </Row>
                <Row label="Condition">{liveCase.condition || '—'}</Row>
                <Row label="Tested By">{liveCase.testedBy || '—'}</Row>
                <div className="flex justify-between items-center gap-3 py-2">
                  <span className="text-[var(--text-muted)]">Approval</span>
                  <ApprovalStatusBadge status={liveCase.approvalStatus} />
                </div>
                {liveCase.conditionNotes && (
                  <p className="pt-2 text-[var(--text-body)]">Condition notes: {liveCase.conditionNotes}</p>
                )}
                {liveCase.receiveRemarks && <p className="text-[var(--text-body)]">Remarks: {liveCase.receiveRemarks}</p>}
              </section>
            </div>
          )}

          {/* Attachments */}
          {liveCase.attachmentList.length > 0 && (
            <section className="sheet-section">
              <SectionTitle>Lab Attachments</SectionTitle>
              <div className="flex flex-wrap gap-2">
                {liveCase.attachmentList.map((att, idx) => (
                  <a
                    key={`${att.name}-${idx}`}
                    href={att.url}
                    target="_blank"
                    rel="noreferrer"
                    className="fin-btn-secondary inline-flex items-center gap-1.5 px-3 text-xs"
                  >
                    <span className="truncate max-w-[14rem]">{att.name}</span>
                    <ExternalLink className="w-3 h-3 shrink-0" aria-hidden="true" />
                  </a>
                ))}
              </div>
            </section>
          )}

          {/* Dynamic extra columns */}
          {extraFields.length > 0 && (
            <form ref={moreDetailsRef} onSubmit={handleSaveExtra} className="sheet-section scroll-mt-4">
              <div className="flex items-center justify-between gap-2 mb-2.5">
                <h3 className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-[0.12em]">More details</h3>
                {canEdit && editing && (
                  <div className="flex items-center gap-2 no-print">
                    <button type="button" onClick={() => setEditing(false)} className="fin-btn-secondary px-3 text-xs">
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={savingExtra}
                      className="fin-btn-primary inline-flex items-center gap-1.5 px-3.5 text-xs"
                    >
                      {savingExtra ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        <Save className="w-3.5 h-3.5" aria-hidden="true" />
                      )}
                      {savingExtra ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {extraFields.map((field) => {
                  const isEditable = editing && field.role === 'data' && canEditExtraData;
                  const readOnlyValue = getCaseExtraFieldValue(liveCase, field.key);
                  return (
                    <div key={field.key}>
                      <label htmlFor={`extra-${field.key}`} className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
                        {field.label || field.key}
                        {field.role !== 'data' && <span className="ml-1.5 text-[10px] uppercase">({field.role})</span>}
                      </label>
                      {isEditable ? (
                        <input
                          id={`extra-${field.key}`}
                          type="text"
                          value={extraDrafts[field.key] ?? ''}
                          onChange={(e) => setExtraDrafts((prev) => ({ ...prev, [field.key]: e.target.value }))}
                          className="fin-input w-full px-3"
                        />
                      ) : (
                        <div className="px-3 py-2.5 rounded-xl bg-[var(--bg-surface-muted)] text-[13px] text-[var(--text-heading)] min-h-[40px]">
                          {readOnlyValue || '—'}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </form>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
