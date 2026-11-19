import { useEffect, useMemo, useState } from 'react';
import { Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useLab } from '../context/LabContext';
import { canFullAccessPage } from '../utils/auth';
import { validateParameterForm } from '../utils/labCalculations';
import type { TestParameter } from '../types/lab';

export function TemplatesPage() {
  const {
    masters,
    currentUser,
    saveCategory,
    saveParameter,
    deleteParameter,
  } = useLab();

  const canEditTemplates = canFullAccessPage(currentUser, 'templates');

  // Combine explicit categories + any category referenced by parameters
  const categoryList = useMemo(() => {
    const map = new Map<string, { category: string; description: string }>();
    for (const c of masters.categories) {
      map.set(c.category, { category: c.category, description: c.description || '' });
    }
    for (const p of masters.parameters) {
      if (p.category && !map.has(p.category)) {
        map.set(p.category, { category: p.category, description: '' });
      }
    }
    return Array.from(map.values());
  }, [masters.categories, masters.parameters]);

  const [selectedCategory, setSelectedCategory] = useState(
    categoryList[0]?.category ?? ''
  );

  useEffect(() => {
    if (!selectedCategory && categoryList.length > 0) {
      setSelectedCategory(categoryList[0].category);
    } else if (
      selectedCategory &&
      categoryList.length > 0 &&
      !categoryList.some((c) => c.category === selectedCategory)
    ) {
      setSelectedCategory(categoryList[0].category);
    }
  }, [categoryList, selectedCategory]);

  const [showParamModal, setShowParamModal] = useState(false);
  const [editingParam, setEditingParam] = useState<TestParameter | null>(null);
  const [savingParam, setSavingParam] = useState(false);
  const [deletingParamId, setDeletingParamId] = useState<string | null>(null);

  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryDesc, setNewCategoryDesc] = useState('');
  const [categoryError, setCategoryError] = useState('');
  const [savingCategory, setSavingCategory] = useState(false);

  // Parameter form state
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('');
  const [minValue, setMinValue] = useState('');
  const [maxValue, setMaxValue] = useState('');
  const [ourStandardValue, setOurStandardValue] = useState('');
  const [higherIsBetter, setHigherIsBetter] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const activeCategory =
    categoryList.find((c) => c.category === selectedCategory) ?? categoryList[0];

  const activeParameters = useMemo(
    () =>
      activeCategory
        ? masters.parameters.filter((p) => p.category === activeCategory.category)
        : [],
    [masters.parameters, activeCategory]
  );

  const paramCountByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of masters.parameters) {
      map.set(p.category, (map.get(p.category) ?? 0) + 1);
    }
    return map;
  }, [masters.parameters]);

  const openNewParamModal = () => {
    setEditingParam(null);
    setName('');
    setUnit('');
    setMinValue('');
    setMaxValue('');
    setOurStandardValue('');
    setHigherIsBetter(true);
    setErrors({});
    setShowParamModal(true);
  };

  const openEditParamModal = (param: TestParameter) => {
    setEditingParam(param);
    setName(param.name);
    setUnit(param.unit);
    setMinValue(String(param.minValue));
    setMaxValue(String(param.maxValue));
    setOurStandardValue(String(param.ourStandardValue));
    setHigherIsBetter(param.higherIsBetter);
    setErrors({});
    setShowParamModal(true);
  };

  const handleSaveParameter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCategory) return;

    const validation = validateParameterForm({
      name,
      unit,
      minValue,
      maxValue,
      ourStandardValue,
    });
    if (!validation.valid) {
      setErrors(validation.errors);
      return;
    }

    setSavingParam(true);
    try {
      const ok = await saveParameter({
        category: activeCategory.category,
        ...(editingParam ? { parameterId: editingParam.parameterId } : {}),
        name: name.trim(),
        unit: unit.trim(),
        minValue: Number(minValue),
        maxValue: Number(maxValue),
        ourStandardValue: Number(ourStandardValue),
        higherIsBetter,
      });
      if (ok) {
        setShowParamModal(false);
      }
    } finally {
      setSavingParam(false);
    }
  };

  const handleDeleteParam = async (parameterId: string) => {
    setDeletingParamId(parameterId);
    try {
      await deleteParameter(parameterId);
    } finally {
      setDeletingParamId(null);
    }
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim()) {
      setCategoryError('Category name is required.');
      return;
    }
    setSavingCategory(true);
    try {
      const cleanName = newCategoryName.trim();
      const ok = await saveCategory(cleanName, newCategoryDesc.trim());
      if (ok) {
        setSelectedCategory(cleanName);
        setNewCategoryName('');
        setNewCategoryDesc('');
        setCategoryError('');
        setShowCategoryModal(false);
      }
    } finally {
      setSavingCategory(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
      {/* Category Selector Column */}
      <aside className="lg:col-span-4 fin-card p-5 overflow-hidden">
        <div className="pb-3.5 mb-3 border-b border-[var(--border-subtle)] flex items-center justify-between">
          <h2 className="text-sm font-bold text-[var(--text-heading)]">Product Categories</h2>
          {canEditTemplates && (
            <button
              type="button"
              onClick={() => setShowCategoryModal(true)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-primary)] hover:text-[var(--color-primary-dark)]"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              New Category
            </button>
          )}
        </div>

        <div className="space-y-1.5">
          {categoryList.length === 0 ? (
            <div className="py-8 text-center text-xs text-[var(--text-muted)]">
              No product categories configured yet. Click &ldquo;New Category&rdquo; to create your
              first test template.
            </div>
          ) : (
            categoryList.map((cat) => {
              const active = activeCategory?.category === cat.category;
              const paramCount = paramCountByCategory.get(cat.category) ?? 0;
              return (
                <button
                  key={cat.category}
                  type="button"
                  onClick={() => setSelectedCategory(cat.category)}
                  className="w-full text-left px-3.5 py-3 rounded-[14px] transition-colors"
                  style={
                    active
                      ? {
                          backgroundColor: 'var(--color-primary-soft)',
                        }
                      : undefined
                  }
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="text-sm font-semibold"
                      style={{
                        color: active ? 'var(--color-primary)' : 'var(--text-heading)',
                      }}
                    >
                      {cat.category}
                    </span>
                    <span className="text-xs font-mono tabular-nums text-[var(--text-muted)]">
                      {paramCount} params
                    </span>
                  </div>
                  {cat.description && (
                    <p className="text-xs text-[var(--text-muted)] mt-1 line-clamp-2">
                      {cat.description}
                    </p>
                  )}
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* Parameters Table */}
      <section className="lg:col-span-8 fin-card p-6 overflow-hidden">
        {activeCategory ? (
          <>
            <div className="pb-4 mb-4 border-b border-[var(--border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-[var(--text-heading)]">
                  {activeCategory.category}
                </h2>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  {activeCategory.description || 'Laboratory specification parameters & tolerances'}
                </p>
              </div>
              {canEditTemplates && (
                <button
                  type="button"
                  onClick={openNewParamModal}
                  className="fin-btn-primary inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs whitespace-nowrap shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                  Add Parameter
                </button>
              )}
            </div>

            {activeParameters.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-sm font-semibold text-[var(--text-heading)]">
                  No parameters configured yet
                </p>
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  Add measurable specification tolerances and our internal standard benchmark.
                </p>
                {canEditTemplates && (
                  <button
                    type="button"
                    onClick={openNewParamModal}
                    className="fin-btn-primary mt-4 inline-flex items-center gap-1.5 px-4 py-2.5 text-xs"
                  >
                    <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                    Add First Parameter
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="fin-table-head text-[11px] font-semibold uppercase tracking-wider">
                      <th className="py-3 px-4 rounded-l-[12px]">Parameter Name</th>
                      <th className="py-3 px-4">Unit</th>
                      <th className="py-3 px-4 text-right">Min Spec</th>
                      <th className="py-3 px-4 text-right">Max Spec</th>
                      <th className="py-3 px-4 text-right">Our Standard</th>
                      <th className={`py-3 px-4 ${!canEditTemplates ? 'rounded-r-[12px]' : ''}`}>
                        Direction
                      </th>
                      {canEditTemplates && (
                        <th className="py-3 px-4 rounded-r-[12px] text-right">Actions</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)] text-sm">
                    {activeParameters.map((param) => (
                      <tr key={param.parameterId} className="fin-table-row transition-colors">
                        <td className="py-3.5 px-4 font-semibold text-[var(--text-heading)]">
                          {param.name}
                        </td>
                        <td className="py-3.5 px-4 font-mono text-xs text-[var(--text-muted)]">
                          {param.unit}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums text-[var(--text-body)]">
                          {param.minValue}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums text-[var(--text-body)]">
                          {param.maxValue}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums font-bold text-[var(--color-primary)]">
                          {param.ourStandardValue}
                        </td>
                        <td className="py-3.5 px-4 text-xs text-[var(--text-muted)] whitespace-nowrap">
                          {param.higherIsBetter ? 'Higher is better' : 'Lower is better'}
                        </td>
                        {canEditTemplates && (
                          <td className="py-3.5 px-4 text-right whitespace-nowrap space-x-1">
                            <button
                              type="button"
                              onClick={() => openEditParamModal(param)}
                              aria-label={`Edit ${param.name}`}
                              className="p-2 rounded-[10px] text-[var(--text-muted)] hover:text-[var(--text-heading)] hover:bg-[var(--bg-surface-muted)]"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={deletingParamId === param.parameterId}
                              onClick={() => void handleDeleteParam(param.parameterId)}
                              aria-label={`Delete ${param.name}`}
                              className="p-2 rounded-[10px] text-[var(--text-muted)] hover:text-[var(--status-danger-fg)] hover:bg-[var(--status-danger-bg)] disabled:opacity-50"
                            >
                              {deletingParamId === param.parameterId ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                              ) : (
                                <Trash2 className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : (
          <div className="py-10 text-center text-sm text-[var(--text-muted)]">
            Select or create a product category to manage test parameters.
          </div>
        )}
      </section>

      {/* Parameter Add/Edit Modal */}
      {showParamModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center fin-modal-backdrop p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="param-modal-title"
        >
          <div className="fin-modal-panel max-w-md w-full overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-subtle)]">
              <h2
                id="param-modal-title"
                className="text-base font-bold text-[var(--text-heading)]"
              >
                {editingParam ? 'Edit Test Parameter' : 'Add Test Parameter'}
              </h2>
              <button
                type="button"
                onClick={() => setShowParamModal(false)}
                aria-label="Close parameter modal"
                className="p-1.5 rounded-[10px] text-[var(--text-muted)] hover:text-[var(--text-heading)] hover:bg-[var(--bg-surface-muted)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveParameter} noValidate className="p-6 space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label
                    htmlFor="param-name"
                    className="block text-xs font-semibold text-[var(--text-body)] mb-1.5"
                  >
                    Parameter Name *
                  </label>
                  <input
                    id="param-name"
                    type="text"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      setErrors((prev) => ({ ...prev, name: '' }));
                    }}
                    placeholder="e.g. Burst Pressure"
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
                    htmlFor="param-unit"
                    className="block text-xs font-semibold text-[var(--text-body)] mb-1.5"
                  >
                    Unit *
                  </label>
                  <input
                    id="param-unit"
                    type="text"
                    value={unit}
                    onChange={(e) => {
                      setUnit(e.target.value);
                      setErrors((prev) => ({ ...prev, unit: '' }));
                    }}
                    placeholder="bar"
                    className="fin-input w-full px-3.5 text-sm font-mono"
                  />
                  {errors.unit && (
                    <p
                      className="text-xs mt-1"
                      style={{ color: 'var(--status-danger-fg)' }}
                      role="alert"
                    >
                      {errors.unit}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label
                    htmlFor="param-min"
                    className="block text-xs font-semibold text-[var(--text-body)] mb-1.5"
                  >
                    Min Spec *
                  </label>
                  <input
                    id="param-min"
                    type="number"
                    step="any"
                    value={minValue}
                    onChange={(e) => {
                      setMinValue(e.target.value);
                      setErrors((prev) => ({ ...prev, minValue: '' }));
                    }}
                    className="fin-input w-full px-3 text-sm font-mono"
                  />
                  {errors.minValue && (
                    <p
                      className="text-xs mt-1"
                      style={{ color: 'var(--status-danger-fg)' }}
                      role="alert"
                    >
                      {errors.minValue}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="param-max"
                    className="block text-xs font-semibold text-[var(--text-body)] mb-1.5"
                  >
                    Max Spec *
                  </label>
                  <input
                    id="param-max"
                    type="number"
                    step="any"
                    value={maxValue}
                    onChange={(e) => {
                      setMaxValue(e.target.value);
                      setErrors((prev) => ({ ...prev, maxValue: '' }));
                    }}
                    className="fin-input w-full px-3 text-sm font-mono"
                  />
                  {errors.maxValue && (
                    <p
                      className="text-xs mt-1"
                      style={{ color: 'var(--status-danger-fg)' }}
                      role="alert"
                    >
                      {errors.maxValue}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="param-std"
                    className="block text-xs font-semibold text-[var(--text-body)] mb-1.5"
                  >
                    Our Standard *
                  </label>
                  <input
                    id="param-std"
                    type="number"
                    step="any"
                    value={ourStandardValue}
                    onChange={(e) => {
                      setOurStandardValue(e.target.value);
                      setErrors((prev) => ({ ...prev, ourStandardValue: '' }));
                    }}
                    className="fin-input w-full px-3 text-sm font-mono"
                  />
                  {errors.ourStandardValue && (
                    <p
                      className="text-xs mt-1"
                      style={{ color: 'var(--status-danger-fg)' }}
                      role="alert"
                    >
                      {errors.ourStandardValue}
                    </p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-body)] mb-1.5">
                  Performance Polarity
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setHigherIsBetter(true)}
                    className="py-2.5 px-3 text-xs font-semibold rounded-[12px] border transition-colors"
                    style={
                      higherIsBetter
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
                    Higher is better
                  </button>
                  <button
                    type="button"
                    onClick={() => setHigherIsBetter(false)}
                    className="py-2.5 px-3 text-xs font-semibold rounded-[12px] border transition-colors"
                    style={
                      !higherIsBetter
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
                    Lower is better
                  </button>
                </div>
              </div>

              <div className="flex justify-end gap-2.5 pt-4 border-t border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => setShowParamModal(false)}
                  className="fin-btn-secondary px-4 py-2 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingParam}
                  className="fin-btn-primary px-4 py-2 text-xs inline-flex items-center gap-1.5"
                >
                  {savingParam && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
                  {savingParam ? 'Saving...' : editingParam ? 'Update Parameter' : 'Add Parameter'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Category Modal */}
      {showCategoryModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center fin-modal-backdrop p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-cat-title"
        >
          <div className="fin-modal-panel max-w-md w-full overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-subtle)]">
              <h2 id="new-cat-title" className="text-base font-bold text-[var(--text-heading)]">
                New Product Category Template
              </h2>
              <button
                type="button"
                onClick={() => setShowCategoryModal(false)}
                aria-label="Close category modal"
                className="p-1.5 rounded-[10px] text-[var(--text-muted)] hover:text-[var(--text-heading)] hover:bg-[var(--bg-surface-muted)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateCategory} className="p-6 space-y-4">
              <div>
                <label
                  htmlFor="cat-name"
                  className="block text-xs font-semibold text-[var(--text-body)] mb-1.5"
                >
                  Category Name *
                </label>
                <input
                  id="cat-name"
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => {
                    setNewCategoryName(e.target.value);
                    setCategoryError('');
                  }}
                  placeholder="e.g. Pneumatic Solenoid Manifolds"
                  className="fin-input w-full px-3.5 text-sm"
                />
                {categoryError && (
                  <p
                    className="text-xs mt-1"
                    style={{ color: 'var(--status-danger-fg)' }}
                    role="alert"
                  >
                    {categoryError}
                  </p>
                )}
              </div>
              <div>
                <label
                  htmlFor="cat-desc"
                  className="block text-xs font-semibold text-[var(--text-body)] mb-1.5"
                >
                  Test Protocol Description
                </label>
                <textarea
                  id="cat-desc"
                  rows={2}
                  value={newCategoryDesc}
                  onChange={(e) => setNewCategoryDesc(e.target.value)}
                  placeholder="Scope of laboratory measurements for this category..."
                  className="fin-textarea w-full p-3.5 text-sm"
                />
              </div>
              <div className="flex justify-end gap-2.5 pt-3 border-t border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => setShowCategoryModal(false)}
                  className="fin-btn-secondary px-4 py-2 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingCategory}
                  className="fin-btn-primary px-4 py-2 text-xs inline-flex items-center gap-1.5"
                >
                  {savingCategory && (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                  )}
                  {savingCategory ? 'Creating...' : 'Create Category'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
