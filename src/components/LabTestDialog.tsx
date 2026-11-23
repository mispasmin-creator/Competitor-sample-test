import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ExternalLink, FileText, Loader2, Paperclip, Trash2, Upload, X } from 'lucide-react';
import { useLab } from '../context/LabContext';
import { formatFileSize, formatShortDate, readFileAsPersistableDataUrl } from '../utils/fileHelpers';
import { getLocalTodayIsoDate, isMeasurementWithinRange } from '../utils/labCalculations';
import { PassFailBadge } from './StatusBadge';
import type { LabCase } from '../types/lab';

/** Lab test fields (Lab Test 1 + Lab Test 2). Keys match the FMS headings Code.gs writes. */
const LAB_TEST_1: Array<{ id: string; label: string; required: boolean }> = [
  { id: 'wcPercentage', label: 'WC Percentage %', required: true },
  { id: 'initialSettingTime', label: 'Initial Setting Time', required: false },
  { id: 'finalSettingTime', label: 'Final Setting Time', required: false },
  { id: 'flowOfMaterial', label: 'Flow Of Material', required: true },
  { id: 'whatToBeMixed', label: 'What To Be Mixed', required: false },
  { id: 'sieveAnalysis', label: 'Sieve Analysis', required: false },
];
// Physical Test 2 fields live on the Test 2 page (Test2Dialog), not here.
const ALL_LAB_FIELDS = LAB_TEST_1;
export const DEFAULT_TEST_STATUSES = ['Tested', 'Non Tested', 'Direct supply'];
const DEFAULT_STATUSES = DEFAULT_TEST_STATUSES;
export const isSkipStatus = (s: string) => /^(non tested|direct supply)$/i.test(s.trim());

interface StagedAttachment {
  id: string;
  name: string;
  type: string;
  sizeLabel: string;
  dataUrl: string;
}

type FormData = Record<string, string>;

const initialFormData = (): FormData => ({
  testStatus: '',
  dateOfTest: getLocalTodayIsoDate(),
  testedBy: '',
  testRemarks: '',
  ...Object.fromEntries(ALL_LAB_FIELDS.map((f) => [f.id, ''])),
});

/** Distinct, trimmed option values from a Masters block (skips header-like "Value"/"Name"). */
export function masterOptions(list?: Array<{ value?: string; name?: string }>, extra: string[] = []): string[] {
  const seen = new Map<string, string>();
  [...(list || []).map((o) => String(o.value || o.name || '')), ...extra].forEach((v) => {
    const s = v.trim();
    if (s && !/^(value|name)$/i.test(s) && !seen.has(s.toLowerCase())) seen.set(s.toLowerCase(), s);
  });
  return Array.from(seen.values());
}

export function LabTestDialog({
  labCase,
  canEdit,
  onClose,
}: {
  labCase: LabCase;
  canEdit: boolean;
  onClose: () => void;
}) {
  const { masters, cases, currentUser, saveTest, addToast } = useLab();
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [formErrors, setFormErrors] = useState<Record<string, string | null>>({});
  const [drafts, setDrafts] = useState<Record<string, { measuredValue: string; notes: string }>>({});
  const [stagedAttachments, setStagedAttachments] = useState<StagedAttachment[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const params = useMemo(
    () => masters.parameters.filter((p) => p.category === labCase.category),
    [masters.parameters, labCase.category]
  );

  const statusOptions = useMemo(() => masterOptions(masters.testStatus, DEFAULT_STATUSES), [masters.testStatus]);
  // Tested By: Masters "Tested By" block; until it is filled, technicians already used + current user.
  const testerOptions = useMemo(() => {
    const fromMasters = masterOptions(masters.testedBy);
    if (fromMasters.length) return fromMasters;
    return masterOptions(
      cases.map((c) => ({ value: c.testedBy })),
      currentUser?.name ? [currentUser.name] : []
    );
  }, [masters.testedBy, cases, currentUser?.name]);
  const flowOptions = useMemo(() => masterOptions(masters.flowOfMaterial), [masters.flowOfMaterial]);

  // Every open: reset to the initial state and clear old errors.
  useEffect(() => {
    setFormData(initialFormData());
    setFormErrors({});
    setStagedAttachments([]);
    setDrafts(Object.fromEntries(params.map((p) => [p.parameterId, { measuredValue: '', notes: '' }])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labCase.caseId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, submitting]);

  const skip = isSkipStatus(formData.testStatus);
  const showTestFields = Boolean(formData.testStatus) && !skip;

  const handleFormChange = (id: string, value: string) => {
    setFormData((prev) => ({ ...prev, [id]: value }));
    setFormErrors((prev) => (prev[id] ? { ...prev, [id]: null } : prev));
  };

  const handleDraftChange = (paramId: string, field: 'measuredValue' | 'notes', value: string) => {
    setDrafts((prev) => ({
      ...prev,
      [paramId]: { ...(prev[paramId] ?? { measuredValue: '', notes: '' }), [field]: value },
    }));
    if (field === 'measuredValue') setFormErrors((prev) => (prev[`param:${paramId}`] ? { ...prev, [`param:${paramId}`]: null } : prev));
  };

  const validateForm = (): boolean => {
    const errs: Record<string, string | null> = {};
    if (!formData.testStatus.trim()) errs.testStatus = 'Status is required.';
    else if (skip) {
      if (!formData.testRemarks.trim()) errs.testRemarks = 'Remark is required.';
    } else {
      if (!formData.dateOfTest) errs.dateOfTest = 'Date of Test is required.';
      if (!formData.testedBy.trim()) errs.testedBy = 'Tested By is required.';
      ALL_LAB_FIELDS.forEach((f) => {
        if (f.required && !formData[f.id].trim()) errs[f.id] = `${f.label.replace(/ %$/, '')} is required.`;
      });
      params.forEach((p) => {
        const raw = drafts[p.parameterId]?.measuredValue?.trim() ?? '';
        if (!raw) errs[`param:${p.parameterId}`] = `${p.name} is required.`;
        else if (!Number.isFinite(Number(raw))) errs[`param:${p.parameterId}`] = `${p.name} must be a number.`;
      });
    }
    setFormErrors(errs);
    const bad = Object.keys(errs).filter((k) => errs[k]);
    if (bad.length) {
      const first = bad[0].startsWith('param:') ? `lt-param-${bad[0].slice(6)}` : `lt-${bad[0]}`;
      document.getElementById(first)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      addToast({ type: 'error', title: bad.length === 1 ? String(errs[bad[0]]) : `Please fill ${bad.length} required fields.` });
    }
    return bad.length === 0;
  };

  const handleAttachmentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    for (const file of files) {
      try {
        const dataUrl = await readFileAsPersistableDataUrl(file);
        setStagedAttachments((prev) => [
          ...prev,
          {
            id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            name: file.name,
            type: file.type || 'application/octet-stream',
            sizeLabel: formatFileSize(file.size),
            dataUrl,
          },
        ]);
      } catch (err) {
        addToast({ type: 'error', title: err instanceof Error ? err.message : `Failed to attach ${file.name}` });
      }
    }
    e.target.value = '';
  };

  const handleSave = async () => {
    if (!canEdit || submitting || !validateForm()) return;
    setSubmitting(true);
    try {
      const lab = Object.fromEntries(ALL_LAB_FIELDS.map((f) => [f.id, skip ? '' : formData[f.id].trim()]));
      const next = await saveTest({
        caseId: labCase.caseId,
        testStatus: formData.testStatus.trim(),
        testRemarks: skip ? formData.testRemarks.trim() : '',
        dateOfTest: skip ? '' : formData.dateOfTest,
        testedBy: skip ? '' : formData.testedBy.trim(),
        lab,
        results: skip
          ? []
          : params.map((p) => ({
              parameterId: p.parameterId,
              measuredValue: Number(drafts[p.parameterId]?.measuredValue),
              notes: drafts[p.parameterId]?.notes?.trim() || undefined,
            })),
        attachments: stagedAttachments.map((a) => ({ name: a.name, dataUrl: a.dataUrl })),
        markCompleted: true,
      });
      if (next) onClose(); // errors show as a toast and keep the dialog open
    } finally {
      setSubmitting(false);
    }
  };

  const labelCls = 'block text-xs font-semibold text-[var(--text-body)]';
  const inputCls = (id: string) =>
    `fin-input w-full px-3.5 ${formErrors[id] ? '!border-red-500 focus:!ring-red-500/30' : ''}`;
  const errorNode = (id: string) =>
    formErrors[id] ? <p className="text-xs text-red-500 mt-1" role="alert">{formErrors[id]}</p> : null;
  const req = <span className="text-red-500"> *</span>;

  const textField = (f: { id: string; label: string; required: boolean }) => (
    <div className="space-y-2" key={f.id}>
      <label htmlFor={`lt-${f.id}`} className={labelCls}>
        {f.label}
        {f.required && req}
      </label>
      <input
        id={`lt-${f.id}`}
        type="text"
        autoComplete="off"
        placeholder="Enter value"
        value={formData[f.id]}
        disabled={!canEdit}
        onChange={(e) => handleFormChange(f.id, e.target.value)}
        className={inputCls(f.id)}
      />
      {errorNode(f.id)}
    </div>
  );

  const flowField = (
    <div className="space-y-2">
      <label htmlFor="lt-flowOfMaterial" className={labelCls}>Flow Of Material{req}</label>
      {flowOptions.length ? (
        <select
          id="lt-flowOfMaterial"
          value={formData.flowOfMaterial}
          disabled={!canEdit}
          onChange={(e) => handleFormChange('flowOfMaterial', e.target.value)}
          className={`${inputCls('flowOfMaterial')} ${formData.flowOfMaterial ? '' : 'text-[var(--text-muted)]'}`}
        >
          <option value="">Select flow</option>
          {flowOptions.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      ) : (
        // Masters "Flow Of Material" block is empty: allow typing until options are added.
        <input
          id="lt-flowOfMaterial"
          type="text"
          autoComplete="off"
          placeholder="Enter value"
          value={formData.flowOfMaterial}
          disabled={!canEdit}
          onChange={(e) => handleFormChange('flowOfMaterial', e.target.value)}
          className={inputCls('flowOfMaterial')}
        />
      )}
      {errorNode('flowOfMaterial')}
    </div>
  );

  const plannedDate = labCase.planned4 || labCase.pendingPlanned;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="lab-test-title"
      aria-describedby="lab-test-desc"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center fin-modal-backdrop sm:p-4 anim-fade"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div className="fin-modal-panel w-full max-w-4xl max-h-[92dvh] sm:max-h-[90vh] anim-pop">
        {/* Header (fixed) */}
        <div className="shrink-0 bg-[var(--bg-surface)] border-b border-[var(--border-subtle)] px-4 sm:px-6 py-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="lab-test-title" className="text-base sm:text-lg font-bold text-[var(--text-heading)]">
              Lab Test Details for Case: <span className="font-mono text-[var(--brand)] dark:text-[#A3F046]">{labCase.caseId}</span>
            </h2>
            <p id="lab-test-desc" className="text-xs text-[var(--text-muted)] mt-1">
              Fill out the test results below. Fields with * are required.
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={submitting} className="fin-icon-btn shrink-0" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable form body */}
        <form
          id="lab-test-form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void handleSave();
          }}
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain space-y-4 px-4 sm:px-6 pt-4 pb-6"
        >
          {/* Read-only info */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 p-4 border border-[var(--border-subtle)] rounded-xl bg-[var(--bg-surface-muted)] text-xs">
            <div>
              <p className="text-[10px] text-[var(--text-muted)] uppercase font-bold">Case / Sample No.</p>
              <p className="font-semibold font-mono text-[var(--text-heading)] break-all">
                {labCase.caseId}
                {labCase.sampleCode ? ` / ${labCase.sampleCode}` : ''}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-[var(--text-muted)] uppercase font-bold">Product</p>
              <p className="font-semibold text-[var(--text-heading)]">
                {labCase.sampleName || labCase.product || '—'}
                {labCase.category ? <span className="text-[var(--text-muted)] font-normal"> · {labCase.category}</span> : null}
              </p>
            </div>
            <div className="col-span-2 md:col-span-1">
              <p className="text-[10px] text-[var(--text-muted)] uppercase font-bold">Planned Date</p>
              <p className="font-semibold font-mono text-[var(--text-heading)]">{formatShortDate(plannedDate) || '—'}</p>
            </div>
          </div>

          {/* Row 1: Status + (Remarks | Date of Test + WC %) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label htmlFor="lt-testStatus" className={labelCls}>Test Status{req}</label>
              <select
                id="lt-testStatus"
                value={formData.testStatus}
                disabled={!canEdit}
                onChange={(e) => handleFormChange('testStatus', e.target.value)}
                className={`${inputCls('testStatus')} ${formData.testStatus ? '' : 'text-[var(--text-muted)]'}`}
              >
                <option value="">Select status</option>
                {statusOptions.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              {errorNode('testStatus')}
            </div>

            {skip ? (
              <div className="space-y-2 md:col-span-2">
                <label htmlFor="lt-testRemarks" className={labelCls}>Remarks{req}</label>
                <input
                  id="lt-testRemarks"
                  type="text"
                  autoComplete="off"
                  placeholder={/^direct supply$/i.test(formData.testStatus.trim()) ? 'Enter remarks for direct supply...' : 'Enter reason for not testing...'}
                  value={formData.testRemarks}
                  disabled={!canEdit}
                  onChange={(e) => handleFormChange('testRemarks', e.target.value)}
                  className={inputCls('testRemarks')}
                />
                {errorNode('testRemarks')}
              </div>
            ) : (
              showTestFields && (
                <>
                  <div className="space-y-2">
                    <label htmlFor="lt-dateOfTest" className={labelCls}>Date of Test{req}</label>
                    <input
                      id="lt-dateOfTest"
                      type="date"
                      value={formData.dateOfTest}
                      disabled={!canEdit}
                      onChange={(e) => handleFormChange('dateOfTest', e.target.value)}
                      className={`${inputCls('dateOfTest')} font-mono`}
                    />
                    {errorNode('dateOfTest')}
                  </div>
                  {textField(LAB_TEST_1[0])}
                </>
              )
            )}
          </div>

          {showTestFields && (
            <>
              {/* Row 2: Tested By */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label htmlFor="lt-testedBy" className={labelCls}>Tested By{req}</label>
                  <select
                    id="lt-testedBy"
                    value={formData.testedBy}
                    disabled={!canEdit}
                    onChange={(e) => handleFormChange('testedBy', e.target.value)}
                    className={`${inputCls('testedBy')} ${formData.testedBy ? '' : 'text-[var(--text-muted)]'}`}
                  >
                    <option value="">Select technician</option>
                    {testerOptions.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                  {errorNode('testedBy')}
                </div>
              </div>

              {/* Row 3: setting times */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {textField(LAB_TEST_1[1])}
                {textField(LAB_TEST_1[2])}
              </div>

              {/* Row 4: flow + mix */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {flowField}
                {textField(LAB_TEST_1[4])}
              </div>

              {/* Row 5: sieve analysis */}
              <div className="space-y-2">
                <label htmlFor="lt-sieveAnalysis" className={labelCls}>Sieve Analysis</label>
                <textarea
                  id="lt-sieveAnalysis"
                  rows={3}
                  placeholder="Enter value"
                  value={formData.sieveAnalysis}
                  disabled={!canEdit}
                  onChange={(e) => handleFormChange('sieveAnalysis', e.target.value)}
                  className={`fin-textarea w-full p-3.5 ${formErrors.sieveAnalysis ? '!border-red-500' : ''}`}
                />
              </div>

              {/* Category template parameters (existing fields, Pass/Fail) */}
              {params.length > 0 && (
                <div className="border-t border-[var(--border-subtle)] pt-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] mb-3">
                    Template Parameters · {labCase.category}
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {params.map((p) => {
                      const key = `param:${p.parameterId}`;
                      const draft = drafts[p.parameterId] ?? { measuredValue: '', notes: '' };
                      const raw = draft.measuredValue.trim();
                      const num = raw === '' ? null : Number(raw);
                      const passed = num !== null && Number.isFinite(num) ? isMeasurementWithinRange(num, p.minValue, p.maxValue) : null;
                      return (
                        <div className="space-y-2" key={p.parameterId}>
                          <div className="flex items-center justify-between gap-2">
                            <label htmlFor={`lt-param-${p.parameterId}`} className={labelCls}>
                              {p.name}
                              {p.unit ? ` (${p.unit})` : ''}
                              {req}
                            </label>
                            <PassFailBadge passed={passed} />
                          </div>
                          <input
                            id={`lt-param-${p.parameterId}`}
                            type="text"
                            inputMode="decimal"
                            autoComplete="off"
                            placeholder="Enter value"
                            value={draft.measuredValue}
                            disabled={!canEdit}
                            onChange={(e) => handleDraftChange(p.parameterId, 'measuredValue', e.target.value)}
                            className={`${inputCls(key)} font-mono`}
                          />
                          <p className="text-[11px] text-[var(--text-muted)] font-mono">
                            Range {p.minValue} – {p.maxValue} · Std {p.ourStandardValue}
                          </p>
                          {errorNode(key)}
                          <input
                            type="text"
                            aria-label={`Lab notes for ${p.name}`}
                            placeholder="Notes (optional)"
                            value={draft.notes}
                            disabled={!canEdit}
                            onChange={(e) => handleDraftChange(p.parameterId, 'notes', e.target.value)}
                            className="fin-input w-full px-3.5 text-xs"
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Attachments (existing) */}
          <div className="border-t border-[var(--border-subtle)] pt-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Lab Photos &amp; Files</h3>
              {canEdit && (
                <label className="fin-btn-secondary inline-flex items-center gap-1.5 px-3.5 py-2 text-xs cursor-pointer self-start">
                  <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                  Attach Files
                  <input type="file" multiple accept="image/*,.pdf,.csv,.txt" onChange={handleAttachmentUpload} className="sr-only" />
                </label>
              )}
            </div>
            {labCase.attachmentList.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {labCase.attachmentList.map((att, idx) => (
                  <a key={`${att.name}-${idx}`} href={att.url} target="_blank" rel="noreferrer" className="fin-btn-secondary inline-flex items-center gap-1.5 px-3 py-1.5 text-xs">
                    <span>{att.name}</span>
                    <ExternalLink className="w-3 h-3" aria-hidden="true" />
                  </a>
                ))}
              </div>
            )}
            {stagedAttachments.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {stagedAttachments.map((att) => (
                  <div key={att.id} className="flex items-center justify-between gap-2 p-3 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {att.type.startsWith('image/') ? (
                        <img src={att.dataUrl} alt={att.name} className="w-8 h-8 rounded-[8px] object-cover border border-[var(--border-subtle)] shrink-0" />
                      ) : (
                        <FileText className="w-5 h-5 text-[var(--text-muted)] shrink-0" aria-hidden="true" />
                      )}
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-[var(--text-heading)] truncate">{att.name}</p>
                        <p className="text-xs text-[var(--text-muted)] font-mono">{att.sizeLabel}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setStagedAttachments((prev) => prev.filter((a) => a.id !== att.id))}
                      aria-label={`Remove ${att.name}`}
                      className="p-1.5 rounded-[8px] text-[var(--text-muted)] hover:text-[var(--status-danger-fg)] hover:bg-[var(--status-danger-bg)]"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {labCase.attachmentList.length === 0 && stagedAttachments.length === 0 && (
              <p className="text-xs text-[var(--text-muted)] flex items-center gap-1.5">
                <Paperclip className="w-3.5 h-3.5" aria-hidden="true" />
                No attachments yet.
              </p>
            )}
          </div>

        </form>

        {/* Footer (fixed) */}
        <div className="shrink-0 bg-[var(--bg-surface)] border-t border-[var(--border-subtle)] px-4 sm:px-6 py-3 pb-safe sm:pb-3 flex justify-end gap-3">
          <button type="button" onClick={onClose} disabled={submitting} className="fin-btn-secondary h-11 px-5 text-sm flex-1 sm:flex-none">
            Cancel
          </button>
          {canEdit && (
            <button
              type="submit"
              form="lab-test-form"
              disabled={submitting}
              className="fin-btn-primary h-11 px-5 text-sm inline-flex items-center justify-center flex-1 sm:flex-none"
            >
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              {submitting ? 'Saving...' : 'Save Test Results'}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
