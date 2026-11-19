import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, ExternalLink, Loader2, Pencil, Plus, X } from 'lucide-react';
import { useLab } from '../context/LabContext';
import { canFullAccessPage, canViewPage } from '../utils/auth';
import { formatCurrency, formatShortDate } from '../utils/fileHelpers';
import { computeCompetitorStats, validateCompetitorForm } from '../utils/labCalculations';
import { LossReasonText, SampleStatusBadge } from '../components/StatusBadge';
import type { Competitor } from '../types/lab';

export function CompetitorsPage() {
  const { cases, masters, currentUser, saveCompetitor } = useLab();

  const canEditCompetitors = canFullAccessPage(currentUser, 'competitors');
  const canViewComparison = canViewPage(currentUser, 'comparison');

  const [selectedId, setSelectedId] = useState(masters.competitors[0]?.id ?? '');
  const [showModal, setShowModal] = useState(false);
  const [editingComp, setEditingComp] = useState<Competitor | null>(null);
  const [savingComp, setSavingComp] = useState(false);

  // Competitor form state
  const [name, setName] = useState('');
  const [headquarters, setHeadquarters] = useState('');
  const [marketSegment, setMarketSegment] = useState('');
  const [website, setWebsite] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const competitorWithStats = useMemo(() => {
    return masters.competitors.map((comp) => ({
      competitor: comp,
      stats: computeCompetitorStats(comp, cases),
    }));
  }, [masters.competitors, cases]);

  const activeEntry =
    competitorWithStats.find((c) => c.competitor.id === selectedId) ??
    competitorWithStats[0];

  const activeOrders = useMemo(
    () =>
      activeEntry
        ? cases.filter(
            (o) =>
              o.competitorId === activeEntry.competitor.id ||
              (!o.competitorId &&
                o.competitorName?.toLowerCase() === activeEntry.competitor.name.toLowerCase())
          )
        : [],
    [cases, activeEntry]
  );

  const activeSamples = useMemo(
    () => activeOrders.filter((s) => s.status !== 'No Sample'),
    [activeOrders]
  );

  const openAddModal = () => {
    setEditingComp(null);
    setName('');
    setHeadquarters('');
    setMarketSegment('');
    setWebsite('');
    setNotes('');
    setErrors({});
    setShowModal(true);
  };

  const openEditModal = (comp: Competitor) => {
    setEditingComp(comp);
    setName(comp.name);
    setHeadquarters(comp.headquarters || '');
    setMarketSegment(comp.marketSegment || '');
    setWebsite(comp.website || '');
    setNotes(comp.notes || '');
    setErrors({});
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validation = validateCompetitorForm({
      name,
      headquarters,
      marketSegment,
    });
    if (!validation.valid) {
      setErrors(validation.errors);
      return;
    }

    setSavingComp(true);
    try {
      const existingIds = new Set(masters.competitors.map((c) => c.id));
      const cleanName = name.trim();
      const nextSnap = await saveCompetitor({
        ...(editingComp ? { id: editingComp.id } : {}),
        name: cleanName,
        headquarters: headquarters.trim(),
        marketSegment: marketSegment.trim(),
        website: website.trim(),
        notes: notes.trim(),
      });
      if (nextSnap) {
        if (editingComp) {
          setSelectedId(editingComp.id);
        } else {
          const added =
            nextSnap.masters.competitors.find((c) => !existingIds.has(c.id)) ??
            nextSnap.masters.competitors.find(
              (c) => c.name.toLowerCase() === cleanName.toLowerCase()
            );
          if (added) setSelectedId(added.id);
        }
        setShowModal(false);
      }
    } finally {
      setSavingComp(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="fin-card p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-[var(--text-heading)]">
            Tracked Competitors ({masters.competitors.length})
          </h2>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Historical lost order counts, revenue impact, and average lab benchmark pass rates
          </p>
        </div>
        {canEditCompetitors && (
          <button
            type="button"
            onClick={openAddModal}
            className="fin-btn-primary inline-flex items-center justify-center gap-1.5 px-4 h-[42px] text-xs whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            Add Competitor
          </button>
        )}
      </div>

      {/* Competitor Directory Cards */}
      {competitorWithStats.length === 0 ? (
        <div className="fin-card p-10 text-center">
          <p className="text-sm font-semibold text-[var(--text-heading)]">
            No competitors tracked yet
          </p>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Add a competitor profile to track lost orders and benchmark scores.
          </p>
          {canEditCompetitors && (
            <button
              type="button"
              onClick={openAddModal}
              className="fin-btn-primary mt-4 inline-flex items-center gap-1.5 px-4 py-2.5 text-xs"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              Add First Competitor
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {competitorWithStats.map(({ competitor, stats }) => {
            const active = activeEntry?.competitor.id === competitor.id;
            return (
              <button
                key={competitor.id}
                type="button"
                onClick={() => setSelectedId(competitor.id)}
                className="fin-card-interactive text-left p-5 border-2 transition-colors"
                style={{
                  borderColor: active ? 'var(--color-primary)' : 'transparent',
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-bold text-[var(--text-heading)]">
                      {competitor.name}
                    </h3>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">
                      {competitor.headquarters || '—'} · {competitor.marketSegment || '—'}
                    </p>
                  </div>
                  <div
                    className="w-9 h-9 rounded-[11px] flex items-center justify-center shrink-0"
                    style={{
                      backgroundColor: active
                        ? 'var(--color-primary)'
                        : 'var(--color-primary-soft)',
                      color: active ? 'var(--color-primary-fg)' : 'var(--color-primary)',
                    }}
                  >
                    <Building2 className="w-4 h-4" aria-hidden="true" />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 mt-5 pt-4 border-t border-[var(--border-subtle)]">
                  <div>
                    <span className="text-xs text-[var(--text-muted)] block">Lost Orders</span>
                    <span className="text-lg font-bold font-mono tabular-nums text-[var(--text-heading)]">
                      {stats.lostOrderCount}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-[var(--text-muted)] block">Lost Value</span>
                    <span className="text-lg font-bold font-mono tabular-nums text-[var(--text-heading)]">
                      {formatCurrency(stats.totalLostValue)}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-[var(--text-muted)] block">Avg Lab Score</span>
                    <span className="text-lg font-bold font-mono tabular-nums text-[var(--color-primary)]">
                      {stats.averageTestScore !== null ? `${stats.averageTestScore}%` : '—'}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Selected Competitor Detail History */}
      {activeEntry && (
        <div className="fin-card p-6 overflow-hidden">
          <div className="pb-4 mb-5 border-b border-[var(--border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h3 className="text-base font-bold text-[var(--text-heading)]">
                  {activeEntry.competitor.name} — Competitive History
                </h3>
                {activeEntry.competitor.website && (
                  <a
                    href={
                      activeEntry.competitor.website.startsWith('http')
                        ? activeEntry.competitor.website
                        : `https://${activeEntry.competitor.website}`
                    }
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-primary)] hover:underline"
                  >
                    <span>Website</span>
                    <ExternalLink className="w-3 h-3" aria-hidden="true" />
                  </a>
                )}
              </div>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                {activeEntry.competitor.notes || activeEntry.competitor.marketSegment}
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {activeEntry.stats.topLossReason && (
                <div className="text-xs text-[var(--text-muted)]">
                  Primary Loss Driver:{' '}
                  <LossReasonText reason={activeEntry.stats.topLossReason} />
                </div>
              )}
              {canEditCompetitors && (
                <button
                  type="button"
                  onClick={() => openEditModal(activeEntry.competitor)}
                  className="fin-btn-secondary inline-flex items-center gap-1.5 px-3 py-1.5 text-xs"
                >
                  <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                  Edit
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <h4 className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-3">
                Lost Orders ({activeOrders.length})
              </h4>
              {activeOrders.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)]">
                  No lost orders recorded against this competitor.
                </p>
              ) : (
                <div className="space-y-3">
                  {activeOrders.map((o) => (
                    <div
                      key={o.caseId}
                      className="p-3.5 border border-[var(--border-subtle)] rounded-[14px] flex items-center justify-between gap-3"
                      style={{ backgroundColor: 'var(--bg-surface-muted)' }}
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-mono font-bold text-[var(--text-heading)]">
                          {o.caseId} · {formatShortDate(o.orderDate)}
                        </p>
                        <p className="text-sm font-semibold text-[var(--text-heading)] truncate mt-0.5">
                          {o.customer} — {o.product}
                        </p>
                        <p className="text-xs text-[var(--text-muted)] mt-0.5">
                          Driver: <LossReasonText reason={o.lossReason} />
                        </p>
                      </div>
                      <span className="font-mono tabular-nums text-sm font-bold text-[var(--text-heading)] shrink-0">
                        {formatCurrency(o.orderValue)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h4 className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-3">
                Lab Samples &amp; Benchmarks ({activeSamples.length})
              </h4>
              {activeSamples.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)]">
                  No samples collected for this competitor yet.
                </p>
              ) : (
                <div className="space-y-3">
                  {activeSamples.map((s) => (
                    <div
                      key={s.caseId}
                      className="p-3.5 border border-[var(--border-subtle)] rounded-[14px] flex items-center justify-between gap-3"
                      style={{ backgroundColor: 'var(--bg-surface-muted)' }}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-[var(--color-primary)]">
                            {s.sampleCode || s.caseId}
                          </span>
                          <SampleStatusBadge status={s.status} />
                        </div>
                        <p className="text-sm font-semibold text-[var(--text-heading)] truncate mt-1">
                          {s.sampleName || s.product}
                        </p>
                      </div>
                      {canViewComparison && s.status === 'Completed' && (
                        <Link
                          to={`/comparison?sample=${s.caseId}`}
                          className="text-xs font-semibold text-[var(--color-primary)] hover:underline shrink-0"
                        >
                          View Comparison
                        </Link>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Competitor Modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center fin-modal-backdrop p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-comp-title"
        >
          <div className="fin-modal-panel max-w-md w-full overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-subtle)]">
              <h2 id="add-comp-title" className="text-base font-bold text-[var(--text-heading)]">
                {editingComp ? `Edit Competitor · ${editingComp.name}` : 'Add Competitor Profile'}
              </h2>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                aria-label="Close competitor modal"
                className="p-1.5 rounded-[10px] text-[var(--text-muted)] hover:text-[var(--text-heading)] hover:bg-[var(--bg-surface-muted)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSubmit} noValidate className="p-6 space-y-4">
              <div>
                <label
                  htmlFor="comp-name"
                  className="block text-xs font-semibold text-[var(--text-body)] mb-1.5"
                >
                  Competitor Name *
                </label>
                <input
                  id="comp-name"
                  type="text"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setErrors((prev) => ({ ...prev, name: '' }));
                  }}
                  placeholder="e.g. Precision Dynamics AG"
                  className="fin-input w-full px-3.5 text-sm"
                />
                {errors.name && (
                  <p
                    className="text-xs mt-1"
                    style={{ color: 'var(--status-danger-fg)' }}
                    role="alert"
                  >
                    {errors.name}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="comp-hq"
                  className="block text-xs font-semibold text-[var(--text-body)] mb-1.5"
                >
                  Headquarters *
                </label>
                <input
                  id="comp-hq"
                  type="text"
                  value={headquarters}
                  onChange={(e) => {
                    setHeadquarters(e.target.value);
                    setErrors((prev) => ({ ...prev, headquarters: '' }));
                  }}
                  placeholder="e.g. Munich, Germany"
                  className="fin-input w-full px-3.5 text-sm"
                />
                {errors.headquarters && (
                  <p
                    className="text-xs mt-1"
                    style={{ color: 'var(--status-danger-fg)' }}
                    role="alert"
                  >
                    {errors.headquarters}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="comp-seg"
                  className="block text-xs font-semibold text-[var(--text-body)] mb-1.5"
                >
                  Market Segment *
                </label>
                <input
                  id="comp-seg"
                  type="text"
                  value={marketSegment}
                  onChange={(e) => {
                    setMarketSegment(e.target.value);
                    setErrors((prev) => ({ ...prev, marketSegment: '' }));
                  }}
                  placeholder="e.g. OEM Hydraulic Actuation"
                  className="fin-input w-full px-3.5 text-sm"
                />
                {errors.marketSegment && (
                  <p
                    className="text-xs mt-1"
                    style={{ color: 'var(--status-danger-fg)' }}
                    role="alert"
                  >
                    {errors.marketSegment}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="comp-website"
                  className="block text-xs font-semibold text-[var(--text-body)] mb-1.5"
                >
                  Website (Optional)
                </label>
                <input
                  id="comp-website"
                  type="url"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://example.com"
                  className="fin-input w-full px-3.5 text-sm"
                />
              </div>

              <div>
                <label
                  htmlFor="comp-notes"
                  className="block text-xs font-semibold text-[var(--text-body)] mb-1.5"
                >
                  Positioning Notes
                </label>
                <textarea
                  id="comp-notes"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Pricing posture, known material specs, lead times..."
                  className="fin-textarea w-full p-3.5 text-sm"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-4 border-t border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="fin-btn-secondary px-4 py-2 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingComp}
                  className="fin-btn-primary px-4 py-2 text-xs inline-flex items-center gap-1.5"
                >
                  {savingComp && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
                  {savingComp
                    ? 'Saving...'
                    : editingComp
                      ? 'Save Changes'
                      : 'Add Competitor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
