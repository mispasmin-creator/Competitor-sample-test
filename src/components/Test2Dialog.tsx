import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, X } from 'lucide-react';
import { useLab } from '../context/LabContext';
import { getLocalTodayIsoDate } from '../utils/labCalculations';
import { DEFAULT_TEST_STATUSES, isSkipStatus, masterOptions } from './LabTestDialog';
import type { LabCase } from '../types/lab';

/** Physical Test 2 fields. Keys match the FMS headings Code.gs writes (BD at 110°C -> bdAt110C ...). */
export const TEST_2_FIELDS: Array<{ id: string; label: string; required: boolean }> = [
  { id: 'bdAt110C', label: 'BD at 110°C', required: true },
  { id: 'ccsAt100C', label: 'CCS at 100°C', required: true },
  { id: 'bdAt1100C', label: 'BD at 1100°C', required: true },
  { id: 'ccsAt1100C', label: 'CCS at 1100°C', required: true },
  { id: 'plcAt1100C', label: 'PLC at 1100°C', required: true },
];

type FormData = Record<string, string>;
const initialFormData = (): FormData => ({
  testStatus: '',
  dateOfTest: getLocalTodayIsoDate(),
  testedBy: '',
  testRemarks: '',
  ...Object.fromEntries(TEST_2_FIELDS.map((f) => [f.id, ''])),
});

export function Test2Dialog({ labCase, canEdit, onClose }: { labCase: LabCase; canEdit: boolean; onClose: () => void }) {
  const { masters, cases, currentUser, saveTest2, addToast } = useLab();
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [formErrors, setFormErrors] = useState<Record<string, string | null>>({});
  const [submitting, setSubmitting] = useState(false);

  const statusOptions = useMemo(() => masterOptions(masters.testStatus, DEFAULT_TEST_STATUSES), [masters.testStatus]);
  const testerOptions = useMemo(() => {
    const fromMasters = masterOptions(masters.testedBy);
    if (fromMasters.length) return fromMasters;
    return masterOptions(
      cases.flatMap((c) => [{ value: c.testedBy }, { value: c.testedBy2 }]),
      currentUser?.name ? [currentUser.name] : []
    );
  }, [masters.testedBy, cases, currentUser?.name]);

  // Every open: reset to the initial state and clear old errors.
  useEffect(() => {
    setFormData(initialFormData());
    setFormErrors({});
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

  const validateForm = (): boolean => {
    const errs: Record<string, string | null> = {};
    if (!formData.testStatus.trim()) errs.testStatus = 'Status is required.';
    else if (skip) {
      if (!formData.testRemarks.trim()) errs.testRemarks = 'Remark is required.';
    } else {
      if (!formData.dateOfTest) errs.dateOfTest = 'Date of Test is required.';
      if (!formData.testedBy.trim()) errs.testedBy = 'Tested By is required.';
      TEST_2_FIELDS.forEach((f) => {
        if (f.required && !formData[f.id].trim()) errs[f.id] = `${f.label} is required.`;
      });
    }
    setFormErrors(errs);
    const bad = Object.keys(errs).filter((k) => errs[k]);
    if (bad.length) {
      document.getElementById(`t2-${bad[0]}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      addToast({ type: 'error', title: bad.length === 1 ? String(errs[bad[0]]) : `Please fill ${bad.length} required fields.` });
    }
    return bad.length === 0;
  };

  const handleSave = async () => {
    if (!canEdit || submitting || !validateForm()) return;
    setSubmitting(true);
    try {
      const next = await saveTest2({
        caseId: labCase.caseId,
        testStatus: formData.testStatus.trim(),
        testRemarks: formData.testRemarks.trim(), // required for Non Tested / Direct supply, optional when Tested
        dateOfTest: skip ? '' : formData.dateOfTest,
        testedBy: skip ? '' : formData.testedBy.trim(),
        lab: Object.fromEntries(TEST_2_FIELDS.map((f) => [f.id, skip ? '' : formData[f.id].trim()])),
      });
      if (next) onClose(); // errors show as a toast and keep the dialog open
    } finally {
      setSubmitting(false);
    }
  };

  const labelCls = 'block text-xs font-semibold text-[var(--text-body)]';
  const inputCls = (id: string) => `fin-input w-full px-3.5 ${formErrors[id] ? '!border-red-500 focus:!ring-red-500/30' : ''}`;
  const errorNode = (id: string) =>
    formErrors[id] ? <p className="text-xs text-red-500 mt-1" role="alert">{formErrors[id]}</p> : null;
  const req = <span className="text-red-500"> *</span>;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="test2-title"
      aria-describedby="test2-desc"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center fin-modal-backdrop sm:p-4 anim-fade"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div className="fin-modal-panel w-full max-w-4xl max-h-[92dvh] sm:max-h-[90vh] anim-pop">
        {/* Header (fixed) */}
        <div className="shrink-0 bg-[var(--bg-surface)] border-b border-[var(--border-subtle)] px-4 sm:px-6 py-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="test2-title" className="text-base sm:text-lg font-bold text-[var(--text-heading)]">
              Physical Test 2 Details for Case: <span className="font-mono text-[var(--brand)] dark:text-[#A3F046]">{labCase.caseId}</span>
            </h2>
            <p id="test2-desc" className="text-xs text-[var(--text-muted)] mt-1">
              Fill out the test results below. Fields with * are required.
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={submitting} className="fin-icon-btn shrink-0" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable form body */}
        <form
          id="test2-form"
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
              <p className="text-[10px] text-[var(--text-muted)] uppercase font-bold">Test 1 Status</p>
              <p className="font-semibold text-[var(--text-heading)]">{labCase.testStatus || '—'}</p>
            </div>
          </div>

          {/* Row 1: Status + (Remarks | Date of Test + Tested By) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label htmlFor="t2-testStatus" className={labelCls}>Test Status{req}</label>
              <select
                id="t2-testStatus"
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
                <label htmlFor="t2-testRemarks" className={labelCls}>Remarks{req}</label>
                <input
                  id="t2-testRemarks"
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
                    <label htmlFor="t2-dateOfTest" className={labelCls}>Date of Test{req}</label>
                    <input
                      id="t2-dateOfTest"
                      type="date"
                      value={formData.dateOfTest}
                      disabled={!canEdit}
                      onChange={(e) => handleFormChange('dateOfTest', e.target.value)}
                      className={`${inputCls('dateOfTest')} font-mono`}
                    />
                    {errorNode('dateOfTest')}
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="t2-testedBy" className={labelCls}>Tested By{req}</label>
                    <select
                      id="t2-testedBy"
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
                </>
              )
            )}
          </div>

          {showTestFields && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 border-t border-[var(--border-subtle)] pt-4">
              {TEST_2_FIELDS.map((f) => (
                <div className="space-y-2" key={f.id}>
                  <label htmlFor={`t2-${f.id}`} className={labelCls}>
                    {f.label}
                    {f.required && req}
                  </label>
                  <input
                    id={`t2-${f.id}`}
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
              ))}
              {/* Optional remark when Tested (saved to "Test Remark") */}
              <div className="space-y-2 md:col-span-2 lg:col-span-3">
                <label htmlFor="t2-testRemarksTested" className={labelCls}>Remarks</label>
                <textarea
                  id="t2-testRemarksTested"
                  rows={2}
                  placeholder="Enter remarks (optional)"
                  value={formData.testRemarks}
                  disabled={!canEdit}
                  onChange={(e) => handleFormChange('testRemarks', e.target.value)}
                  className="fin-textarea w-full p-3.5"
                />
              </div>
            </div>
          )}
        </form>

        {/* Footer (fixed) */}
        <div className="shrink-0 bg-[var(--bg-surface)] border-t border-[var(--border-subtle)] px-4 sm:px-6 py-3 pb-safe sm:pb-3 flex justify-end gap-3">
          <button type="button" onClick={onClose} disabled={submitting} className="fin-btn-secondary h-11 px-5 text-sm flex-1 sm:flex-none">
            Cancel
          </button>
          {canEdit && (
            <button
              type="submit"
              form="test2-form"
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
