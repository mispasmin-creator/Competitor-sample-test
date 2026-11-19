import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Loader2, Printer, Save, X } from 'lucide-react';
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

export function CaseDetailModal({ labCase, onClose }: CaseDetailModalProps) {
  const { schema, currentUser, masters, updateCase } = useLab();

  // Keep reference fresh from latest snapshot cases if updated
  const { cases } = useLab();
  const liveCase = useMemo(
    () => (labCase ? cases.find((c) => c.caseId === labCase.caseId) ?? labCase : null),
    [cases, labCase]
  );

  const extraFields = useMemo(() => getExtraFmsSchemaFields(schema.fms), [schema.fms]);
  const canEditExtraData = useMemo(
    () =>
      canFullAccessPage(currentUser, 'lostOrders') ||
      canFullAccessPage(currentUser, 'samples') ||
      canFullAccessPage(currentUser, 'testEntry') ||
      canFullAccessPage(currentUser, 'reports'),
    [currentUser]
  );

  const [extraDrafts, setExtraDrafts] = useState<Record<string, string>>({});
  const [savingExtra, setSavingExtra] = useState(false);

  useEffect(() => {
    if (!liveCase) return;
    const init: Record<string, string> = {};
    for (const f of extraFields) {
      if (f.role === 'data') {
        init[f.key] = getCaseExtraFieldValue(liveCase, f.key);
      }
    }
    setExtraDrafts(init);
  }, [liveCase, extraFields]);

  if (!liveCase) return null;

  const competitorName =
    masters.competitors.find((c) => c.id === liveCase.competitorId)?.name ||
    liveCase.competitorName ||
    '—';
  const sampleCode = liveCase.sampleCode || liveCase.caseId;
  const editableExtraFields = extraFields.filter((f) => f.role === 'data');

  const handleSaveExtra = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEditExtraData || editableExtraFields.length === 0) return;
    setSavingExtra(true);
    try {
      await updateCase(liveCase.caseId, extraDrafts);
    } finally {
      setSavingExtra(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center fin-modal-backdrop p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="case-detail-title"
    >
      <div className="fin-modal-panel max-w-[min(92vw,720px)] w-full max-h-[90dvh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-[var(--border-subtle)] shrink-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2 id="case-detail-title" className="text-base font-bold text-[var(--text-heading)]">
              Case Record · {liveCase.caseId}
              {liveCase.sampleCode ? ` (${liveCase.sampleCode})` : ''}
            </h2>
            <SampleStatusBadge status={liveCase.status} />
            <OverdueChip delayDays={liveCase.pendingDelay} />
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close case details modal"
            className="p-1.5 rounded-[10px] text-[var(--text-muted)] hover:text-[var(--text-heading)] hover:bg-[var(--bg-surface-muted)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 sm:p-6 space-y-5 text-xs overflow-y-auto flex-1 min-h-0">
          {/* Header QR + Photo + Core Info */}
          <div
            className="flex flex-col sm:flex-row gap-5 items-start p-4 rounded-[16px] border border-[var(--border-subtle)]"
            style={{ backgroundColor: 'var(--bg-surface-muted)' }}
          >
            {liveCase.status !== 'No Sample' && (
              <div className="p-3 bg-white border border-[var(--border-subtle)] rounded-[14px] shrink-0 self-center sm:self-start">
                <QRCodeSVG
                  value={JSON.stringify({
                    sampleCode,
                    caseId: liveCase.caseId,
                    product: liveCase.sampleName || liveCase.product,
                    competitor: competitorName,
                    status: liveCase.status,
                  })}
                  size={104}
                  level="M"
                />
              </div>
            )}

            <div className="flex-1 space-y-1.5 min-w-0">
              <p className="text-sm font-bold text-[var(--text-heading)]">
                {liveCase.customer} — {liveCase.product}
              </p>
              <p className="text-[var(--text-body)]">
                Category:{' '}
                <span className="font-semibold text-[var(--text-heading)]">{liveCase.category}</span>{' '}
                · Value:{' '}
                <span className="font-mono font-bold text-[var(--text-heading)]">
                  {formatCurrency(liveCase.orderValue)}
                </span>
              </p>
              <p className="text-[var(--text-body)]">
                Competitor:{' '}
                <span className="font-semibold text-[var(--text-heading)]">{competitorName}</span>{' '}
                · Loss Reason:{' '}
                <span className="font-semibold text-[var(--text-heading)]">
                  {liveCase.lossReason || '—'}
                </span>
              </p>
              <p className="text-[var(--text-muted)]">
                Order Date: {formatShortDate(liveCase.orderDate)} · Entered by:{' '}
                {liveCase.enteredBy || '—'}
              </p>
              {liveCase.orderNotes && (
                <p className="text-[var(--text-body)] pt-1">{liveCase.orderNotes}</p>
              )}
              {liveCase.status !== 'No Sample' && (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="fin-btn-secondary inline-flex items-center gap-1.5 px-3 py-1.5 text-xs"
                  >
                    <Printer className="w-3.5 h-3.5" aria-hidden="true" />
                    Print Label
                  </button>
                </div>
              )}
            </div>

            {liveCase.photoLink && (
              <a
                href={liveCase.photoLink}
                target="_blank"
                rel="noreferrer"
                className="w-28 h-28 rounded-[14px] border border-[var(--border-subtle)] overflow-hidden bg-[var(--bg-surface)] shrink-0 block"
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

          {/* Sample Request & Receipt Details */}
          {liveCase.status !== 'No Sample' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <h3 className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
                  Request &amp; Collection
                </h3>
                <div className="p-4 border border-[var(--border-subtle)] rounded-[14px] space-y-2">
                  <div className="flex justify-between gap-2">
                    <span className="text-[var(--text-muted)]">Sample Name</span>
                    <span className="font-semibold text-[var(--text-heading)] text-right">
                      {liveCase.sampleName || liveCase.product}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-[var(--text-muted)]">Qty Needed / Priority</span>
                    <span className="font-mono text-[var(--text-heading)]">
                      {liveCase.qtyNeeded ?? 1} · {liveCase.priority || '—'}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-[var(--text-muted)]">Source</span>
                    <span className="text-[var(--text-heading)] text-right">
                      {liveCase.sourceType || '—'}
                      {liveCase.sourceLocation ? ` — ${liveCase.sourceLocation}` : ''}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-[var(--text-muted)]">Responsible / By</span>
                    <span className="text-[var(--text-heading)] text-right">
                      {liveCase.responsiblePerson || '—'} ({liveCase.requestedBy || '—'})
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-[var(--text-muted)]">Expected Date</span>
                    <span className="font-mono text-[var(--text-heading)]">
                      {formatShortDate(liveCase.expectedDate)}
                    </span>
                  </div>
                  {liveCase.requestNotes && (
                    <p className="pt-2 border-t border-[var(--border-subtle)] text-[var(--text-body)]">
                      {liveCase.requestNotes}
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
                  Lab Receipt &amp; Sign-Off
                </h3>
                <div className="p-4 border border-[var(--border-subtle)] rounded-[14px] space-y-2">
                  <div className="flex justify-between gap-2">
                    <span className="text-[var(--text-muted)]">Received By / Qty</span>
                    <span className="text-[var(--text-heading)]">
                      {liveCase.receivedBy || '—'} ·{' '}
                      {liveCase.receivedQty !== undefined ? `${liveCase.receivedQty} unit(s)` : '—'}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-[var(--text-muted)]">Condition</span>
                    <span className="font-semibold text-[var(--text-heading)]">
                      {liveCase.condition || '—'}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-[var(--text-muted)]">Tested By</span>
                    <span className="text-[var(--text-heading)]">{liveCase.testedBy || '—'}</span>
                  </div>
                  <div className="flex justify-between gap-2 items-center">
                    <span className="text-[var(--text-muted)]">Approval</span>
                    <ApprovalStatusBadge status={liveCase.approvalStatus} />
                  </div>
                  {liveCase.conditionNotes && (
                    <p className="pt-2 border-t border-[var(--border-subtle)] text-[var(--text-body)]">
                      Condition notes: {liveCase.conditionNotes}
                    </p>
                  )}
                  {liveCase.receiveRemarks && (
                    <p className="text-[var(--text-body)]">Remarks: {liveCase.receiveRemarks}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Attachments */}
          {liveCase.attachmentList.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
                Lab Attachments
              </h3>
              <div className="flex flex-wrap gap-2">
                {liveCase.attachmentList.map((att, idx) => (
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

          {/* Read-Only FMS Stage Timeline */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
                FMS Stage Timeline (Read-only)
              </h3>
              <span className="font-mono text-[11px] text-[var(--text-muted)]">
                Total Delay: <strong className="text-[var(--text-heading)]">{liveCase.totalDelay}d</strong>
                {liveCase.pendingStage ? ` · Pending: ${liveCase.pendingStage}` : ''}
              </span>
            </div>
            <div className="overflow-x-auto border border-[var(--border-subtle)] rounded-[14px]">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="fin-table-head text-[10px] font-semibold uppercase tracking-wider">
                    <th className="py-2 px-3">Stage</th>
                    <th className="py-2 px-3">Planned</th>
                    <th className="py-2 px-3">Actual</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {STAGE_LABELS.map((st) => {
                    const planned = liveCase[`planned${st.no}` as keyof LabCase] as string | undefined;
                    const actual = liveCase[`actual${st.no}` as keyof LabCase] as string | undefined;
                    const isPendingHere = Number(liveCase.pendingStageNo) === st.no;
                    return (
                      <tr key={st.no} className="fin-table-row">
                        <td className="py-2 px-3 font-semibold text-[var(--text-heading)]">
                          <span className="inline-flex items-center gap-2">
                            <span>
                              {st.no}. {st.label}
                            </span>
                            {isPendingHere && <OverdueChip delayDays={liveCase.pendingDelay} />}
                          </span>
                        </td>
                        <td className="py-2 px-3 font-mono text-[var(--text-muted)]">
                          {formatDateTime(planned)}
                        </td>
                        <td className="py-2 px-3 font-mono text-[var(--text-heading)]">
                          {formatDateTime(actual)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* PART 6: Dynamic Extra Columns ("More details") */}
          {extraFields.length > 0 && (
            <form onSubmit={handleSaveExtra} className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
                  More details
                </h3>
                {canEditExtraData && editableExtraFields.length > 0 && (
                  <button
                    type="submit"
                    disabled={savingExtra}
                    className="fin-btn-primary inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs"
                  >
                    {savingExtra ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <Save className="w-3.5 h-3.5" aria-hidden="true" />
                    )}
                    {savingExtra ? 'Saving...' : 'Save Details'}
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 border border-[var(--border-subtle)] rounded-[14px]">
                {extraFields.map((field) => {
                  const isEditable = field.role === 'data' && canEditExtraData;
                  const readOnlyValue = getCaseExtraFieldValue(liveCase, field.key);
                  return (
                    <div key={field.key}>
                      <label
                        htmlFor={`extra-${field.key}`}
                        className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1"
                      >
                        {field.label || field.key}
                        {!isEditable && field.role !== 'data' && (
                          <span className="ml-1.5 text-[10px] uppercase">({field.role})</span>
                        )}
                      </label>
                      {isEditable ? (
                        <input
                          id={`extra-${field.key}`}
                          type="text"
                          value={extraDrafts[field.key] ?? ''}
                          onChange={(e) =>
                            setExtraDrafts((prev) => ({ ...prev, [field.key]: e.target.value }))
                          }
                          className="fin-input w-full px-3 text-xs !h-9"
                        />
                      ) : (
                        <div className="px-3 py-2 rounded-[10px] bg-[var(--bg-surface-muted)] text-xs text-[var(--text-heading)] min-h-[34px]">
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

        <div className="flex justify-end px-5 sm:px-6 py-4 border-t border-[var(--border-subtle)] shrink-0">
          <button type="button" onClick={onClose} className="fin-btn-primary px-4 py-2 text-xs">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
