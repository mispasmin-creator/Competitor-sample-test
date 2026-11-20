import { createPortal } from 'react-dom';
import { QRCodeSVG } from 'qrcode.react';
import { Printer, X } from 'lucide-react';
import type { Competitor, LabCase } from '../types/lab';
import { formatShortDate } from '../utils/fileHelpers';

interface SampleQrModalProps {
  labCase: LabCase | null;
  competitor?: Competitor;
  onClose: () => void;
}

export function SampleQrModal({ labCase, competitor, onClose }: SampleQrModalProps) {
  if (!labCase) return null;

  const sampleCode = labCase.sampleCode || labCase.caseId;
  const productName = labCase.sampleName || labCase.product;
  const displayQty = labCase.receivedQty ?? labCase.qtyNeeded ?? 1;
  const displayDate = labCase.actual3 || labCase.actual2 || labCase.orderDate;
  const compName = competitor?.name || labCase.competitorName || '—';

  const qrPayload = JSON.stringify({
    sampleCode,
    caseId: labCase.caseId,
    product: productName,
    competitor: compName,
    category: labCase.category,
    status: labCase.status,
    condition: labCase.condition,
    receivedDate: labCase.actual3,
  });

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 fin-modal-backdrop print-area"
      role="dialog"
      aria-modal="true"
      aria-labelledby="qr-modal-title"
    >
      <div className="fin-modal-panel max-w-[min(92vw,440px)] w-full max-h-[90dvh] flex flex-col overflow-hidden">
        <div
          className="flex items-center justify-between px-5 sm:px-6 py-4 border-b shrink-0"
          style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--bg-surface-muted)' }}
        >
          <div>
            <h2 id="qr-modal-title" className="text-base font-bold text-[var(--text-heading)]">
              Sample Identification Label
            </h2>
            <p className="text-xs text-[var(--text-muted)] font-mono">{sampleCode}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close QR label modal"
            className="p-2 rounded-[10px] text-[var(--text-muted)] hover:text-[var(--text-heading)] hover:bg-[var(--bg-surface)] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 sm:p-6 flex flex-col items-center text-center overflow-y-auto flex-1 min-h-0">
          <div className="p-4 bg-white rounded-[16px] border border-[#E3EAF0]">
            <QRCodeSVG value={qrPayload} size={168} level="M" />
          </div>

          <div
            className="mt-5 w-full text-left rounded-[16px] p-4 space-y-2 text-xs"
            style={{ backgroundColor: 'var(--bg-surface-muted)', border: '1px solid var(--border-subtle)' }}
          >
            <div className="flex justify-between gap-4">
              <span className="text-[var(--text-muted)]">Sample ID</span>
              <span className="font-mono font-semibold text-[var(--text-heading)]">{sampleCode}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-[var(--text-muted)]">Product</span>
              <span className="font-semibold text-[var(--text-heading)] text-right">{productName}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-[var(--text-muted)]">Competitor</span>
              <span className="font-semibold text-[var(--text-heading)]">{compName}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-[var(--text-muted)]">Linked Order</span>
              <span className="font-mono text-[var(--text-heading)]">
                {labCase.caseId} · {labCase.customer}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-[var(--text-muted)]">Qty / Date</span>
              <span className="font-mono text-[var(--text-heading)]">
                {displayQty} unit(s) · {formatShortDate(displayDate)}
              </span>
            </div>
            {labCase.condition && (
              <div className="flex justify-between gap-4">
                <span className="text-[var(--text-muted)]">Intake Condition</span>
                <span className="font-semibold text-[var(--text-heading)]">{labCase.condition}</span>
              </div>
            )}
          </div>
        </div>

        <div
          className="flex items-center justify-end gap-2.5 px-6 py-4 border-t shrink-0 no-print pb-safe"
          style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--bg-surface-muted)' }}
        >
          <button
            type="button"
            onClick={() => window.print()}
            className="fin-btn-secondary inline-flex items-center gap-1.5 px-4 py-2 text-xs"
          >
            <Printer className="w-3.5 h-3.5" aria-hidden="true" />
            Print Label
          </button>
          <button
            type="button"
            onClick={onClose}
            className="fin-btn-primary px-5 py-2 text-xs"
          >
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
