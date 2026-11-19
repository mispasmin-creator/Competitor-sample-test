import type {
  CaseTestResult,
  Competitor,
  FmsSchemaField,
  LabCase,
  TestParameter,
} from '../types/lab';

export interface ParameterComparisonRow {
  parameterId: string;
  name: string;
  unit: string;
  minValue: number;
  maxValue: number;
  ourStandardValue: number;
  higherIsBetter: boolean;
  measuredValue: number | null;
  passed: boolean | null;
  diffValue: number | null;
  diffPercent: number | null;
  performanceStatus: 'competitor-ahead' | 'our-advantage' | 'parity' | 'untested';
  ourNormalizedScore: number;
  competitorNormalizedScore: number;
  notes?: string;
}

export interface SampleTestSummary {
  totalParameters: number;
  measuredCount: number;
  passedCount: number;
  failedCount: number;
  passRate: number | null;
  isComplete: boolean;
}

export interface CompetitorStats {
  competitorId: string;
  lostOrderCount: number;
  totalLostValue: number;
  sampleCount: number;
  completedSampleCount: number;
  averageTestScore: number | null;
  topLossReason: string | null;
  reasonBreakdown: Record<string, number>;
}

export const KNOWN_CASE_KEYS = new Set<string>([
  'caseId',
  'orderDate',
  'customer',
  'product',
  'category',
  'orderValue',
  'competitorId',
  'competitorName',
  'lossReason',
  'orderNotes',
  'enteredBy',
  'planned1',
  'planned2',
  'planned3',
  'planned4',
  'planned5',
  'actual1',
  'actual2',
  'actual3',
  'actual4',
  'actual5',
  'sampleCode',
  'sampleName',
  'qtyNeeded',
  'sourceType',
  'sourceLocation',
  'responsiblePerson',
  'expectedDate',
  'priority',
  'requestNotes',
  'requestedBy',
  'receivedBy',
  'receivedQty',
  'condition',
  'conditionNotes',
  'photoLink',
  'receiveRemarks',
  'testedBy',
  'results',
  'passCount',
  'failCount',
  'overallResult',
  'attachmentList',
  'approvalStatus',
  'approvedBy',
  'managerComment',
  'verdictOverride',
  'pendingStageNo',
  'pendingStage',
  'pendingPlanned',
  'pendingDelay',
  'totalDelay',
  'status',
  'fields',
]);

export function getExtraFmsSchemaFields(schemaFms: FmsSchemaField[] = []): FmsSchemaField[] {
  return schemaFms.filter((f) => f.key && !KNOWN_CASE_KEYS.has(f.key));
}

export function getCaseExtraFieldValue(labCase: LabCase, key: string): string {
  const direct = labCase[key];
  if (direct !== undefined && direct !== null && typeof direct !== 'object') {
    return String(direct);
  }
  const nested = labCase.fields?.[key];
  if (nested !== undefined && nested !== null && typeof nested !== 'object') {
    return String(nested);
  }
  return '';
}

export function getLocalTodayIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isCaseOverdue(labCase: Pick<LabCase, 'pendingDelay'>): boolean {
  return typeof labCase.pendingDelay === 'number' && labCase.pendingDelay > 0;
}

export function getPendingCasesForStage(cases: LabCase[], stageNo: number): LabCase[] {
  return cases
    .filter((c) => Number(c.pendingStageNo) === stageNo)
    .sort((a, b) =>
      String(a.pendingPlanned || '9999-12-31').localeCompare(
        String(b.pendingPlanned || '9999-12-31')
      )
    );
}

export function isMeasurementWithinRange(
  measuredValue: number,
  minValue: number,
  maxValue: number
): boolean {
  return measuredValue >= minValue && measuredValue <= maxValue;
}

export function normalizeScoreForRadar(
  value: number,
  param: Pick<TestParameter, 'minValue' | 'maxValue' | 'ourStandardValue' | 'higherIsBetter'>
): number {
  const span = Math.max(
    Math.abs(param.maxValue - param.minValue),
    Math.abs(param.ourStandardValue) * 0.25,
    1
  );
  if (param.higherIsBetter) {
    const floor = Math.min(param.minValue, param.ourStandardValue) - span * 0.4;
    const ceiling = Math.max(param.maxValue, param.ourStandardValue) + span * 0.35;
    const raw = ((value - floor) / Math.max(ceiling - floor, 0.0001)) * 100;
    return Math.round(Math.max(10, Math.min(100, raw)));
  }
  const floor = Math.max(0, Math.min(param.minValue, param.ourStandardValue) - span * 0.25);
  const ceiling = Math.max(param.maxValue, param.ourStandardValue) + span * 0.5;
  const raw = ((ceiling - value) / Math.max(ceiling - floor, 0.0001)) * 100;
  return Math.round(Math.max(10, Math.min(100, raw)));
}

export function evaluateComparisonRowFromSpec(spec: {
  parameterId: string;
  name: string;
  unit: string;
  minValue: number;
  maxValue: number;
  ourStandardValue: number;
  higherIsBetter: boolean;
  measuredValue: number | null;
  passed?: boolean | null;
  notes?: string;
}): ParameterComparisonRow {
  const measured =
    spec.measuredValue !== null &&
    spec.measuredValue !== undefined &&
    !Number.isNaN(Number(spec.measuredValue))
      ? Number(spec.measuredValue)
      : null;

  const ourNormalizedScore = normalizeScoreForRadar(spec.ourStandardValue, spec);

  if (measured === null) {
    return {
      parameterId: spec.parameterId,
      name: spec.name,
      unit: spec.unit,
      minValue: spec.minValue,
      maxValue: spec.maxValue,
      ourStandardValue: spec.ourStandardValue,
      higherIsBetter: spec.higherIsBetter,
      measuredValue: null,
      passed: null,
      diffValue: null,
      diffPercent: null,
      performanceStatus: 'untested',
      ourNormalizedScore,
      competitorNormalizedScore: 0,
      notes: spec.notes,
    };
  }

  const passed =
    typeof spec.passed === 'boolean'
      ? spec.passed
      : isMeasurementWithinRange(measured, spec.minValue, spec.maxValue);
  const diffValue = Number((measured - spec.ourStandardValue).toFixed(4));
  const diffPercent =
    spec.ourStandardValue !== 0
      ? Number(
          (((measured - spec.ourStandardValue) / Math.abs(spec.ourStandardValue)) * 100).toFixed(1)
        )
      : 0;

  let performanceStatus: ParameterComparisonRow['performanceStatus'] = 'parity';
  if (Math.abs(diffValue) > 0.0001) {
    if (spec.higherIsBetter) {
      performanceStatus =
        measured > spec.ourStandardValue ? 'competitor-ahead' : 'our-advantage';
    } else {
      performanceStatus =
        measured < spec.ourStandardValue ? 'competitor-ahead' : 'our-advantage';
    }
  }

  return {
    parameterId: spec.parameterId,
    name: spec.name,
    unit: spec.unit,
    minValue: spec.minValue,
    maxValue: spec.maxValue,
    ourStandardValue: spec.ourStandardValue,
    higherIsBetter: spec.higherIsBetter,
    measuredValue: measured,
    passed,
    diffValue,
    diffPercent,
    performanceStatus,
    ourNormalizedScore,
    competitorNormalizedScore: normalizeScoreForRadar(measured, spec),
    notes: spec.notes,
  };
}

export function buildComparisonRows(
  labCase: LabCase,
  fallbackParameters: TestParameter[] = []
): ParameterComparisonRow[] {
  const results: CaseTestResult[] = Array.isArray(labCase.results) ? labCase.results : [];
  if (results.length > 0) {
    return results.map((r) =>
      evaluateComparisonRowFromSpec({
        parameterId: r.parameterId,
        name: r.name,
        unit: r.unit,
        minValue: Number(r.min ?? 0),
        maxValue: Number(r.max ?? 0),
        ourStandardValue: Number(r.standard ?? 0),
        higherIsBetter: Boolean(r.higherIsBetter),
        measuredValue: r.measuredValue,
        passed: r.passed,
        notes: r.notes,
      })
    );
  }

  return fallbackParameters.map((p) =>
    evaluateComparisonRowFromSpec({
      parameterId: p.parameterId,
      name: p.name,
      unit: p.unit,
      minValue: Number(p.minValue),
      maxValue: Number(p.maxValue),
      ourStandardValue: Number(p.ourStandardValue),
      higherIsBetter: Boolean(p.higherIsBetter),
      measuredValue: null,
      passed: null,
    })
  );
}

export function computeSampleSummary(
  labCase: LabCase,
  fallbackParameters: TestParameter[] = []
): SampleTestSummary {
  const rows = buildComparisonRows(labCase, fallbackParameters);
  const totalParameters = rows.length;
  const measuredRows = rows.filter((r) => r.measuredValue !== null);
  const measuredCount = measuredRows.length;
  const passedCount = measuredRows.filter((r) => r.passed === true).length;
  const failedCount = measuredRows.filter((r) => r.passed === false).length;
  const passRate =
    measuredCount > 0 ? Math.round((passedCount / measuredCount) * 100) : null;
  const isComplete = totalParameters > 0 && measuredCount === totalParameters;

  return {
    totalParameters,
    measuredCount,
    passedCount,
    failedCount,
    passRate,
    isComplete,
  };
}

export function areAllParametersMeasured(
  parameters: TestParameter[],
  results: Array<{ parameterId: string; measuredValue: number | null }>
): boolean {
  if (!parameters || parameters.length === 0) {
    return false;
  }
  const valueByParamId = new Map(results.map((r) => [r.parameterId, r.measuredValue]));
  return parameters.every((param) => {
    const val = valueByParamId.get(param.parameterId);
    return val !== undefined && val !== null && Number.isFinite(val);
  });
}

export function generateAutoVerdict(
  labCase: LabCase,
  competitorName: string,
  rows: ParameterComparisonRow[],
  summary: SampleTestSummary
): string {
  const sampleLabel = labCase.sampleCode || labCase.caseId;
  const productLabel = labCase.sampleName || labCase.product;

  if (summary.measuredCount === 0) {
    return `Sample ${sampleLabel} (${productLabel}) from ${competitorName} has not been benchmarked yet. Enter test measurements in Test Entry to generate an empirical comparison verdict.`;
  }

  const testedRows = rows.filter((r) => r.measuredValue !== null);
  const compAheadRows = testedRows.filter((r) => r.performanceStatus === 'competitor-ahead');
  const ourAheadRows = testedRows.filter((r) => r.performanceStatus === 'our-advantage');

  const reasonLower = (labCase.lossReason || '').toLowerCase();
  const reasonLabel =
    reasonLower === 'price'
      ? 'unit pricing pressure'
      : reasonLower === 'quality'
        ? 'perceived product quality'
        : reasonLower === 'delivery'
          ? 'lead time / delivery commitment'
          : labCase.lossReason || 'commercial competition';

  const passSentence = `${competitorName}'s ${productLabel} (${sampleLabel}) passed ${summary.passedCount} of ${summary.measuredCount} evaluated specification parameters (${summary.passRate ?? 0}% spec compliance).`;

  let comparisonSentence = '';
  if (compAheadRows.length > ourAheadRows.length) {
    const highlights = compAheadRows
      .slice(0, 2)
      .map(
        (r) =>
          `${r.name} (${r.diffPercent !== null && r.diffPercent > 0 ? '+' : ''}${r.diffPercent}% vs our standard)`
      )
      .join(' and ');
    comparisonSentence = ` The competitor outperformed our internal benchmark on ${compAheadRows.length} parameter(s), notably ${highlights}.`;
  } else if (ourAheadRows.length > 0) {
    const highlights = ourAheadRows
      .slice(0, 2)
      .map(
        (r) =>
          `${r.name} (${r.diffPercent !== null && r.diffPercent > 0 ? '+' : ''}${r.diffPercent}% delta)`
      )
      .join(' and ');
    comparisonSentence = ` Our standard maintains a measurable engineering advantage on ${ourAheadRows.length} parameter(s), led by ${highlights}.`;
  } else {
    comparisonSentence = ` Measured performance sits at engineering parity with our baseline specification.`;
  }

  let strategicSentence = '';
  if (reasonLower === 'price' && summary.failedCount > 0) {
    strategicSentence = ` Although this order was lost due to ${reasonLabel}, lab testing exposed ${summary.failedCount} out-of-spec parameter(s) on the competitor unit—providing concrete technical evidence for value-based sales defense.`;
  } else if (reasonLower === 'quality' && compAheadRows.length > 0) {
    strategicSentence = ` Empirical findings align with the reported loss due to ${reasonLabel}; R&D should review tolerances on the lagging parameters before the next bid cycle.`;
  } else {
    strategicSentence = ` With the order attributed to ${reasonLabel}, sales and engineering teams should leverage these benchmark tolerances during customer technical reviews.`;
  }

  return `${passSentence}${comparisonSentence}${strategicSentence}`;
}

export function computeCompetitorStats(
  competitor: Competitor,
  cases: LabCase[]
): CompetitorStats {
  const compCases = cases.filter(
    (c) =>
      c.competitorId === competitor.id ||
      (!c.competitorId && c.competitorName?.toLowerCase() === competitor.name.toLowerCase())
  );
  const compSamples = compCases.filter((c) => c.status !== 'No Sample');

  const reasonBreakdown: Record<string, number> = {};
  let totalLostValue = 0;

  for (const c of compCases) {
    totalLostValue += Number(c.orderValue) || 0;
    const reasonKey = (c.lossReason || 'Other').trim();
    reasonBreakdown[reasonKey] = (reasonBreakdown[reasonKey] ?? 0) + 1;
  }

  let topLossReason: string | null = null;
  let maxReasonCount = 0;
  for (const [reason, count] of Object.entries(reasonBreakdown)) {
    if (count > maxReasonCount) {
      maxReasonCount = count;
      topLossReason = reason;
    }
  }

  const sampleScores: number[] = [];
  let completedSampleCount = 0;

  for (const c of compSamples) {
    if (c.status === 'Completed') {
      completedSampleCount += 1;
    }
    const summary = computeSampleSummary(c);
    if (summary.passRate !== null) {
      sampleScores.push(summary.passRate);
    }
  }

  const averageTestScore =
    sampleScores.length > 0
      ? Math.round(sampleScores.reduce((acc, v) => acc + v, 0) / sampleScores.length)
      : null;

  return {
    competitorId: competitor.id,
    lostOrderCount: compCases.length,
    totalLostValue,
    sampleCount: compSamples.length,
    completedSampleCount,
    averageTestScore,
    topLossReason,
    reasonBreakdown,
  };
}

// Form validation helpers
export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

export function validateLostOrderForm(input: {
  customer: string;
  product: string;
  category: string;
  orderValue: string | number;
  competitorId: string;
  lossReason: string;
  orderDate: string;
}): ValidationResult {
  const errors: Record<string, string> = {};
  if (!input.customer.trim()) errors.customer = 'Customer name is required.';
  if (!input.product.trim()) errors.product = 'Product model or SKU is required.';
  if (!input.category.trim()) errors.category = 'Product category is required.';
  const numericVal =
    typeof input.orderValue === 'number' ? input.orderValue : Number(input.orderValue);
  if (Number.isNaN(numericVal) || numericVal <= 0) {
    errors.orderValue = 'Order value must be greater than zero.';
  }
  if (!input.competitorId.trim()) errors.competitorId = 'Select a competitor.';
  if (!input.lossReason.trim()) {
    errors.lossReason = 'Select a loss reason.';
  }
  if (!input.orderDate.trim()) errors.orderDate = 'Order loss date is required.';
  return { valid: Object.keys(errors).length === 0, errors };
}

export function validateSampleRequestForm(
  input: {
    caseId: string;
    sampleName: string;
    qtyNeeded: string | number;
    sourceType: string;
    sourceLocation: string;
    responsiblePerson: string;
    expectedDate: string;
    priority: string;
  },
  todayIso = getLocalTodayIsoDate()
): ValidationResult {
  const errors: Record<string, string> = {};
  if (!input.caseId.trim()) errors.caseId = 'Link this sample to a lost order.';
  if (!input.sampleName.trim()) {
    errors.sampleName = 'Sample name / product to collect is required.';
  }
  const qty = typeof input.qtyNeeded === 'number' ? input.qtyNeeded : Number(input.qtyNeeded);
  if (!Number.isInteger(qty) || qty < 1 || qty > 500) {
    errors.qtyNeeded = 'Quantity needed must be a whole number between 1 and 500.';
  }
  if (!input.sourceType.trim()) {
    errors.sourceType = 'Select a sample source.';
  }
  if (!input.sourceLocation.trim()) {
    errors.sourceLocation = 'Enter exact shop, customer location, or address.';
  }
  if (!input.responsiblePerson.trim()) {
    errors.responsiblePerson = 'Responsible person is required.';
  }
  if (!input.expectedDate.trim()) {
    errors.expectedDate = 'Expected arrival date is required.';
  } else if (input.expectedDate < todayIso) {
    errors.expectedDate = 'Expected arrival date cannot be before today.';
  }
  if (!input.priority.trim()) {
    errors.priority = 'Select a priority.';
  }
  return { valid: Object.keys(errors).length === 0, errors };
}

export function validateSampleReceiveForm(input: {
  received: boolean;
  remarks: string;
  receivedBy: string;
  receivedQty: string | number;
  condition: string;
}): ValidationResult {
  const errors: Record<string, string> = {};
  if (!input.received) {
    if (!input.remarks.trim()) {
      errors.remarks = 'Enter remarks explaining why the sample was not received.';
    }
    return { valid: Object.keys(errors).length === 0, errors };
  }

  if (!input.receivedBy.trim()) {
    errors.receivedBy = 'Received by name is required.';
  }
  const qty =
    typeof input.receivedQty === 'number'
      ? input.receivedQty
      : Number(input.receivedQty);
  if (!Number.isInteger(qty) || qty < 1 || qty > 500) {
    errors.receivedQty = 'Actual quantity received must be a whole number between 1 and 500.';
  }
  if (!input.condition.trim()) {
    errors.condition = 'Select a sample condition.';
  }
  return { valid: Object.keys(errors).length === 0, errors };
}

export function validateParameterForm(input: {
  name: string;
  unit: string;
  minValue: string | number;
  maxValue: string | number;
  ourStandardValue: string | number;
}): ValidationResult {
  const errors: Record<string, string> = {};
  if (!input.name.trim()) errors.name = 'Parameter name is required.';
  if (!input.unit.trim()) errors.unit = 'Measurement unit is required.';

  const min = Number(input.minValue);
  const max = Number(input.maxValue);
  const std = Number(input.ourStandardValue);

  if (input.minValue === '' || Number.isNaN(min)) errors.minValue = 'Enter a valid minimum value.';
  if (input.maxValue === '' || Number.isNaN(max)) errors.maxValue = 'Enter a valid maximum value.';
  if (input.ourStandardValue === '' || Number.isNaN(std)) {
    errors.ourStandardValue = 'Enter a valid standard value.';
  }
  if (!errors.minValue && !errors.maxValue && min >= max) {
    errors.maxValue = 'Max value must be greater than min value.';
  }
  if (!errors.minValue && !errors.maxValue && !errors.ourStandardValue && (std < min || std > max)) {
    errors.ourStandardValue =
      'Our standard value should sit within the min–max specification range.';
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

export function validateCompetitorForm(input: {
  name: string;
  headquarters: string;
  marketSegment: string;
}): ValidationResult {
  const errors: Record<string, string> = {};
  if (!input.name.trim()) errors.name = 'Competitor name is required.';
  if (!input.headquarters.trim()) errors.headquarters = 'Headquarters location is required.';
  if (!input.marketSegment.trim()) errors.marketSegment = 'Market segment is required.';
  return { valid: Object.keys(errors).length === 0, errors };
}
