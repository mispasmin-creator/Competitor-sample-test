import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  call,
  getToken,
  loginRequest,
  purgeLegacyBusinessLocalStorage,
  saveToken,
  SessionAuthError,
  setApiErrorObserver,
} from '../data/sheetApi';
import type {
  ApprovalStatus,
  HolidayRow,
  LabCase,
  LabSchema,
  LabSnapshot,
  MastersData,
  TatSettingRow,
  ToastMessage,
  User,
  UserPermissions,
} from '../types/lab';
import { getFirstAllowedPath } from '../utils/auth';

export interface RequestSampleInput {
  caseId: string;
  sampleName: string;
  qtyNeeded: number;
  sourceType: string;
  sourceLocation: string;
  responsiblePerson: string;
  expectedDate: string;
  priority: string;
  requestNotes: string;
}

export interface ReceiveSampleInput {
  caseId: string;
  received: boolean;
  receivedBy: string;
  receivedQty: number;
  condition: string;
  conditionNotes: string;
  remarks: string;
  photoDataUrl?: string;
}

export interface UserFormPayload {
  id?: string;
  name: string;
  username: string;
  password?: string;
  isAdmin: boolean;
  isActive: boolean;
  permissions: UserPermissions;
}

const EMPTY_MASTERS: MastersData = {
  competitors: [],
  categories: [],
  parameters: [],
  lossReasons: [],
  sourceTypes: [],
  conditions: [],
  priorities: [],
  tat: [],
  holidays: [],
};

const EMPTY_SCHEMA: LabSchema = {
  fms: [],
  stages: [1, 2, 3, 4, 5],
  users: [],
  pages: [],
  masters: {},
};

function normalizeCaseRecord(raw: LabCase): LabCase {
  return {
    ...raw,
    orderValue: Number(raw.orderValue) || 0,
    qtyNeeded:
      raw.qtyNeeded !== undefined && raw.qtyNeeded !== null && String(raw.qtyNeeded) !== ''
        ? Number(raw.qtyNeeded)
        : undefined,
    receivedQty:
      raw.receivedQty !== undefined && raw.receivedQty !== null && String(raw.receivedQty) !== ''
        ? Number(raw.receivedQty)
        : undefined,
    pendingStageNo:
      raw.pendingStageNo !== undefined &&
      raw.pendingStageNo !== null &&
      String(raw.pendingStageNo) !== ''
        ? Number(raw.pendingStageNo)
        : null,
    pendingDelay: Number(raw.pendingDelay) || 0,
    totalDelay: Number(raw.totalDelay) || 0,
    results: Array.isArray(raw.results) ? raw.results : [],
    attachmentList: Array.isArray(raw.attachmentList) ? raw.attachmentList : [],
    status: raw.status || 'No Sample',
    approvalStatus: raw.approvalStatus || 'Pending Approval',
  };
}

function normalizeSnapshot(raw: LabSnapshot): LabSnapshot {
  const rawMasters: Partial<MastersData> = raw.masters || {};
  const rawSchema: Partial<LabSchema> = raw.schema || {};
  return {
    user: raw.user,
    cases: Array.isArray(raw.cases) ? raw.cases.map(normalizeCaseRecord) : [],
    masters: {
      competitors: Array.isArray(rawMasters.competitors) ? rawMasters.competitors : [],
      categories: Array.isArray(rawMasters.categories) ? rawMasters.categories : [],
      parameters: Array.isArray(rawMasters.parameters)
        ? rawMasters.parameters.map((p) => ({
            ...p,
            minValue: Number(p.minValue),
            maxValue: Number(p.maxValue),
            ourStandardValue: Number(p.ourStandardValue),
            higherIsBetter: Boolean(p.higherIsBetter),
          }))
        : [],
      lossReasons: Array.isArray(rawMasters.lossReasons) ? rawMasters.lossReasons : [],
      sourceTypes: Array.isArray(rawMasters.sourceTypes) ? rawMasters.sourceTypes : [],
      conditions: Array.isArray(rawMasters.conditions) ? rawMasters.conditions : [],
      priorities: Array.isArray(rawMasters.priorities) ? rawMasters.priorities : [],
      tat: Array.isArray(rawMasters.tat)
        ? rawMasters.tat.map((t) => ({
            ...t,
            stage: Number(t.stage),
            tatDays: Number(t.tatDays),
          }))
        : [],
      holidays: Array.isArray(rawMasters.holidays) ? rawMasters.holidays : [],
    },
    users: Array.isArray(raw.users) ? raw.users : [],
    schema: {
      fms: Array.isArray(rawSchema.fms) ? rawSchema.fms : EMPTY_SCHEMA.fms,
      stages: Array.isArray(rawSchema.stages) ? rawSchema.stages : EMPTY_SCHEMA.stages,
      users: Array.isArray(rawSchema.users) ? rawSchema.users : [],
      pages: Array.isArray(rawSchema.pages) ? rawSchema.pages : [],
      masters: rawSchema.masters || {},
    },
    warnings: Array.isArray(raw.warnings) ? raw.warnings : [],
    serverTime: raw.serverTime || '',
  };
}

interface LabContextValue {
  snapshot: LabSnapshot | null;
  currentUser: User | null;
  cases: LabCase[];
  masters: MastersData;
  users: User[];
  schema: LabSchema;
  mustChangePassword: boolean;
  initialLoading: boolean;
  refreshing: boolean;
  isBusy: boolean;
  toasts: ToastMessage[];

  signIn: (
    username: string,
    password: string
  ) => Promise<{ ok: boolean; error?: string; firstAllowedPath?: string | null }>;
  signOut: () => Promise<void>;
  refreshAll: () => Promise<LabSnapshot | null>;
  addToast: (toast: Omit<ToastMessage, 'id'>) => void;
  dismissToast: (id: string) => void;

  // Auth & Users & Settings
  changeOwnPassword: (oldPassword: string, newPassword: string) => Promise<boolean>;
  saveUser: (input: UserFormPayload) => Promise<boolean>;
  deleteUser: (id: string) => Promise<boolean>;
  resetUserPassword: (id: string, newPassword: string) => Promise<boolean>;
  saveTat: (rows: Array<{ stage: number; tatDays: number }>) => Promise<boolean>;
  saveHolidays: (rows: HolidayRow[]) => Promise<boolean>;

  // Lost Orders
  addLostOrder: (input: {
    customer: string;
    product: string;
    category: string;
    orderValue: number;
    competitorId: string;
    lossReason: string;
    orderDate: string;
    notes: string;
  }) => Promise<LabSnapshot | null>;
  deleteLostOrder: (caseId: string) => Promise<boolean>;

  // Competitors
  saveCompetitor: (input: {
    id?: string;
    name: string;
    headquarters: string;
    marketSegment: string;
    website?: string;
    notes: string;
  }) => Promise<LabSnapshot | null>;

  // Samples & Testing
  requestSample: (input: RequestSampleInput) => Promise<LabSnapshot | null>;
  receiveSample: (input: ReceiveSampleInput) => Promise<LabSnapshot | null>;
  saveTest: (input: {
    caseId: string;
    results: Array<{ parameterId: string; measuredValue: number | null; notes?: string }>;
    attachments: Array<{ name: string; dataUrl: string }>;
    markCompleted: boolean;
  }) => Promise<LabSnapshot | null>;

  // Reports
  approveReport: (input: {
    caseId: string;
    approvalStatus: Extract<ApprovalStatus, 'Approved' | 'Revision Requested'>;
    managerComment: string;
    verdictOverride: string;
  }) => Promise<boolean>;

  // Templates & Parameters
  saveCategory: (category: string, description: string) => Promise<boolean>;
  saveParameter: (input: {
    category: string;
    parameterId?: string;
    name: string;
    unit: string;
    minValue: number;
    maxValue: number;
    ourStandardValue: number;
    higherIsBetter: boolean;
  }) => Promise<boolean>;
  deleteParameter: (parameterId: string) => Promise<boolean>;

  // Dynamic extra fields
  updateCase: (caseId: string, fields: Record<string, unknown>) => Promise<boolean>;
}

const LabContext = createContext<LabContextValue | null>(null);

export function LabProvider({ children }: { children: React.ReactNode }) {
  const [snapshot, setSnapshot] = useState<LabSnapshot | null>(null);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [initialLoading, setInitialLoading] = useState<boolean>(() => Boolean(getToken()));
  const [refreshing, setRefreshing] = useState(false);
  const [busyCount, setBusyCount] = useState(0);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const shownWarningsRef = useRef<Set<string>>(new Set());

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (toast: Omit<ToastMessage, 'id'>) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setToasts((prev) => [...prev, { ...toast, id }]);
      window.setTimeout(() => {
        dismissToast(id);
      }, 4500);
    },
    [dismissToast]
  );

  const clearSessionState = useCallback(() => {
    saveToken(null);
    setSnapshot(null);
    setMustChangePassword(false);
    shownWarningsRef.current.clear();
  }, []);

  const applySnapshot = useCallback(
    (rawSnapshot: LabSnapshot): LabSnapshot => {
      const normalized = normalizeSnapshot(rawSnapshot);
      setSnapshot(normalized);

      if (normalized.warnings.length > 0) {
        for (const msg of normalized.warnings) {
          const text = String(msg || '').trim();
          if (text && !shownWarningsRef.current.has(text)) {
            shownWarningsRef.current.add(text);
            addToast({ type: 'info', title: text });
          }
        }
      }
      return normalized;
    },
    [addToast]
  );

  // Wire global error & session expiry handling from sheetApi.call()
  useEffect(() => {
    purgeLegacyBusinessLocalStorage();
    setApiErrorObserver((message, isAuthError) => {
      if (isAuthError) {
        clearSessionState();
      }
      addToast({ type: 'error', title: message });
    });
    return () => setApiErrorObserver(null);
  }, [addToast, clearSessionState]);

  const runAction = useCallback(
    async <T = LabSnapshot,>(
      action: string,
      payload: Record<string, unknown> = {},
      options: { updateSnapshot?: boolean } = { updateSnapshot: true }
    ): Promise<T | null> => {
      setBusyCount((c) => c + 1);
      try {
        const result = await call<T>(action, payload);
        if (options.updateSnapshot !== false && result && typeof result === 'object') {
          applySnapshot(result as unknown as LabSnapshot);
        }
        return result;
      } catch (err) {
        if (err instanceof SessionAuthError) {
          clearSessionState();
        }
        return null;
      } finally {
        setBusyCount((c) => Math.max(0, c - 1));
      }
    },
    [applySnapshot, clearSessionState]
  );

  const refreshAll = useCallback(async (): Promise<LabSnapshot | null> => {
    setRefreshing(true);
    try {
      const next = await runAction<LabSnapshot>('getAll', {});
      return next ? normalizeSnapshot(next) : null;
    } finally {
      setRefreshing(false);
    }
  }, [runAction]);

  // On app start, if a token exists call "getAll"
  useEffect(() => {
    const existingToken = getToken();
    if (!existingToken) {
      setInitialLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const data = await call<LabSnapshot>('getAll', {});
        if (!cancelled && data) {
          applySnapshot(data);
        }
      } catch {
        // sheetApi observer handles clearing token on session errors and showing error toast
      } finally {
        if (!cancelled) {
          setInitialLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [applySnapshot]);

  const signIn = useCallback(
    async (
      username: string,
      password: string
    ): Promise<{ ok: boolean; error?: string; firstAllowedPath?: string | null }> => {
      setBusyCount((c) => c + 1);
      try {
        const res = await loginRequest(username.trim(), password);
        saveToken(res.token);
        setMustChangePassword(Boolean(res.mustChangePassword));
        shownWarningsRef.current.clear();
        const loaded = applySnapshot(res.snapshot);
        addToast({
          type: 'success',
          title: `Signed in as ${loaded.user.name}`,
          message: loaded.user.isAdmin ? 'Administrator access' : `@${loaded.user.username}`,
        });
        return { ok: true, firstAllowedPath: getFirstAllowedPath(loaded.user) };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Invalid username or password';
        return { ok: false, error: message };
      } finally {
        setBusyCount((c) => Math.max(0, c - 1));
      }
    },
    [applySnapshot, addToast]
  );

  const signOut = useCallback(async () => {
    setBusyCount((c) => c + 1);
    try {
      if (getToken()) {
        try {
          await call('logout', {});
        } catch {
          // Always clear local token even if server session already expired
        }
      }
    } finally {
      clearSessionState();
      setToasts([]);
      setBusyCount((c) => Math.max(0, c - 1));
    }
  }, [clearSessionState]);

  const changeOwnPassword = useCallback(
    async (oldPassword: string, newPassword: string): Promise<boolean> => {
      const next = await runAction('changePassword', { oldPassword, newPassword });
      if (!next) return false;
      setMustChangePassword(false);
      addToast({
        type: 'success',
        title: 'Password updated',
        message: 'Your new password is now active.',
      });
      return true;
    },
    [runAction, addToast]
  );

  const saveUser = useCallback(
    async (input: UserFormPayload): Promise<boolean> => {
      const payload: Record<string, unknown> = {
        ...(input.id ? { id: input.id } : {}),
        name: input.name.trim(),
        username: input.username.trim().toLowerCase(),
        ...(input.password && input.password.length > 0 ? { password: input.password } : {}),
        isAdmin: input.isAdmin,
        isActive: input.isActive,
        permissions: input.permissions,
      };
      const next = await runAction('saveUser', payload);
      if (!next) return false;
      addToast({
        type: 'success',
        title: input.id ? `Updated user "${input.name.trim()}"` : `Created user "${input.name.trim()}"`,
      });
      return true;
    },
    [runAction, addToast]
  );

  const deleteUser = useCallback(
    async (id: string): Promise<boolean> => {
      const next = await runAction('deleteUser', { id });
      if (!next) return false;
      addToast({ type: 'info', title: 'User removed from workspace' });
      return true;
    },
    [runAction, addToast]
  );

  const resetUserPassword = useCallback(
    async (id: string, newPassword: string): Promise<boolean> => {
      const next = await runAction('resetPassword', { id, newPassword });
      if (!next) return false;
      addToast({ type: 'success', title: 'User password reset successfully' });
      return true;
    },
    [runAction, addToast]
  );

  const saveTat = useCallback(
    async (rows: Array<{ stage: number; tatDays: number }>): Promise<boolean> => {
      const next = await runAction('saveTat', { rows });
      if (!next) return false;
      addToast({ type: 'success', title: 'Stage TAT settings saved' });
      return true;
    },
    [runAction, addToast]
  );

  const saveHolidays = useCallback(
    async (rows: HolidayRow[]): Promise<boolean> => {
      const next = await runAction('saveHolidays', { rows });
      if (!next) return false;
      addToast({ type: 'success', title: 'Laboratory holidays saved' });
      return true;
    },
    [runAction, addToast]
  );

  const addLostOrder = useCallback(
    async (input: {
      customer: string;
      product: string;
      category: string;
      orderValue: number;
      competitorId: string;
      lossReason: string;
      orderDate: string;
      notes: string;
    }): Promise<LabSnapshot | null> => {
      const next = await runAction('addLostOrder', input);
      if (!next) return null;
      addToast({
        type: 'success',
        title: 'Lost order logged',
        message: `${input.customer} · ${input.product}`,
      });
      return normalizeSnapshot(next);
    },
    [runAction, addToast]
  );

  const deleteLostOrder = useCallback(
    async (caseId: string): Promise<boolean> => {
      const next = await runAction('deleteLostOrder', { caseId });
      if (!next) return false;
      addToast({ type: 'info', title: `Removed lost order ${caseId}` });
      return true;
    },
    [runAction, addToast]
  );

  const saveCompetitor = useCallback(
    async (input: {
      id?: string;
      name: string;
      headquarters: string;
      marketSegment: string;
      website?: string;
      notes: string;
    }): Promise<LabSnapshot | null> => {
      const payload: Record<string, unknown> = {
        ...(input.id ? { id: input.id } : {}),
        name: input.name.trim(),
        headquarters: input.headquarters.trim(),
        marketSegment: input.marketSegment.trim(),
        website: (input.website ?? '').trim(),
        notes: input.notes.trim(),
      };
      const next = await runAction('saveCompetitor', payload);
      if (!next) return null;
      addToast({
        type: 'success',
        title: input.id
          ? `Updated competitor "${input.name.trim()}"`
          : `Competitor "${input.name.trim()}" saved`,
      });
      return normalizeSnapshot(next);
    },
    [runAction, addToast]
  );

  const requestSample = useCallback(
    async (input: RequestSampleInput): Promise<LabSnapshot | null> => {
      const next = await runAction('requestSample', {
        caseId: input.caseId,
        sampleName: input.sampleName,
        qtyNeeded: input.qtyNeeded,
        sourceType: input.sourceType,
        sourceLocation: input.sourceLocation,
        responsiblePerson: input.responsiblePerson,
        expectedDate: input.expectedDate,
        priority: input.priority,
        requestNotes: input.requestNotes,
      });
      if (!next) return null;
      addToast({
        type: 'success',
        title: `Sample requested for ${input.caseId}`,
        message: input.sampleName,
      });
      return normalizeSnapshot(next);
    },
    [runAction, addToast]
  );

  const receiveSample = useCallback(
    async (input: ReceiveSampleInput): Promise<LabSnapshot | null> => {
      const next = await runAction('receiveSample', {
        caseId: input.caseId,
        received: input.received,
        receivedBy: input.receivedBy,
        receivedQty: input.receivedQty,
        condition: input.condition,
        conditionNotes: input.conditionNotes,
        remarks: input.remarks,
        ...(input.photoDataUrl ? { photoDataUrl: input.photoDataUrl } : {}),
      });
      if (!next) return null;
      addToast({
        type: input.received ? 'success' : 'info',
        title: input.received
          ? `Sample received (${input.caseId})`
          : `Sample ${input.caseId} remains Requested`,
        message: input.received
          ? `${input.receivedQty} unit(s) · ${input.condition}`
          : input.remarks,
      });
      return normalizeSnapshot(next);
    },
    [runAction, addToast]
  );

  const saveTest = useCallback(
    async (input: {
      caseId: string;
      results: Array<{ parameterId: string; measuredValue: number | null; notes?: string }>;
      attachments: Array<{ name: string; dataUrl: string }>;
      markCompleted: boolean;
    }): Promise<LabSnapshot | null> => {
      const next = await runAction('saveTest', input);
      if (!next) return null;
      addToast({
        type: 'success',
        title: input.markCompleted ? 'Lab testing completed' : 'Draft measurements saved',
        message: input.markCompleted
          ? 'Comparison & executive report are ready for review.'
          : 'Measurements persisted to sheet.',
      });
      return normalizeSnapshot(next);
    },
    [runAction, addToast]
  );

  const approveReport = useCallback(
    async (input: {
      caseId: string;
      approvalStatus: Extract<ApprovalStatus, 'Approved' | 'Revision Requested'>;
      managerComment: string;
      verdictOverride: string;
    }): Promise<boolean> => {
      const next = await runAction('approveReport', input);
      if (!next) return false;
      addToast({
        type: input.approvalStatus === 'Approved' ? 'success' : 'info',
        title: `Report status: ${input.approvalStatus}`,
      });
      return true;
    },
    [runAction, addToast]
  );

  const saveCategory = useCallback(
    async (category: string, description: string): Promise<boolean> => {
      const next = await runAction('saveCategory', {
        category: category.trim(),
        description: description.trim(),
      });
      if (!next) return false;
      addToast({ type: 'success', title: `Category "${category.trim()}" saved` });
      return true;
    },
    [runAction, addToast]
  );

  const saveParameter = useCallback(
    async (input: {
      category: string;
      parameterId?: string;
      name: string;
      unit: string;
      minValue: number;
      maxValue: number;
      ourStandardValue: number;
      higherIsBetter: boolean;
    }): Promise<boolean> => {
      const next = await runAction('saveParameter', {
        category: input.category,
        ...(input.parameterId ? { parameterId: input.parameterId } : {}),
        name: input.name.trim(),
        unit: input.unit.trim(),
        minValue: input.minValue,
        maxValue: input.maxValue,
        ourStandardValue: input.ourStandardValue,
        higherIsBetter: input.higherIsBetter,
      });
      if (!next) return false;
      addToast({
        type: 'success',
        title: input.parameterId
          ? `Updated parameter "${input.name.trim()}"`
          : `Added parameter "${input.name.trim()}"`,
      });
      return true;
    },
    [runAction, addToast]
  );

  const deleteParameter = useCallback(
    async (parameterId: string): Promise<boolean> => {
      const next = await runAction('deleteParameter', { parameterId });
      if (!next) return false;
      addToast({ type: 'info', title: 'Parameter removed from template' });
      return true;
    },
    [runAction, addToast]
  );

  const updateCase = useCallback(
    async (caseId: string, fields: Record<string, unknown>): Promise<boolean> => {
      const next = await runAction('updateCase', { caseId, fields });
      if (!next) return false;
      addToast({ type: 'success', title: `Updated details for ${caseId}` });
      return true;
    },
    [runAction, addToast]
  );

  const value = useMemo<LabContextValue>(
    () => ({
      snapshot,
      currentUser: snapshot?.user ?? null,
      cases: snapshot?.cases ?? [],
      masters: snapshot?.masters ?? EMPTY_MASTERS,
      users: snapshot?.users ?? [],
      schema: snapshot?.schema ?? EMPTY_SCHEMA,
      mustChangePassword,
      initialLoading,
      refreshing,
      isBusy: busyCount > 0,
      toasts,
      signIn,
      signOut,
      refreshAll,
      addToast,
      dismissToast,
      changeOwnPassword,
      saveUser,
      deleteUser,
      resetUserPassword,
      saveTat,
      saveHolidays,
      addLostOrder,
      deleteLostOrder,
      saveCompetitor,
      requestSample,
      receiveSample,
      saveTest,
      approveReport,
      saveCategory,
      saveParameter,
      deleteParameter,
      updateCase,
    }),
    [
      snapshot,
      mustChangePassword,
      initialLoading,
      refreshing,
      busyCount,
      toasts,
      signIn,
      signOut,
      refreshAll,
      addToast,
      dismissToast,
      changeOwnPassword,
      saveUser,
      deleteUser,
      resetUserPassword,
      saveTat,
      saveHolidays,
      addLostOrder,
      deleteLostOrder,
      saveCompetitor,
      requestSample,
      receiveSample,
      saveTest,
      approveReport,
      saveCategory,
      saveParameter,
      deleteParameter,
      updateCase,
    ]
  );

  return <LabContext.Provider value={value}>{children}</LabContext.Provider>;
}

export function useLab(): LabContextValue {
  const ctx = useContext(LabContext);
  if (!ctx) {
    throw new Error('useLab must be used inside LabProvider');
  }
  return ctx;
}
