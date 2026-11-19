import test from 'node:test';
import assert from 'node:assert/strict';
import type { Competitor, FmsSchemaField, LabCase, TestParameter } from '../types/lab';
import {
  areAllParametersMeasured,
  buildComparisonRows,
  computeCompetitorStats,
  computeSampleSummary,
  evaluateComparisonRowFromSpec,
  generateAutoVerdict,
  getCaseExtraFieldValue,
  getExtraFmsSchemaFields,
  getPendingCasesForStage,
  isCaseOverdue,
  isMeasurementWithinRange,
  validateCompetitorForm,
  validateLostOrderForm,
  validateParameterForm,
  validateSampleReceiveForm,
  validateSampleRequestForm,
} from './labCalculations';

const burstParam: TestParameter = {
  category: 'Hydraulic Check Valves',
  parameterId: 'p-burst',
  name: 'Burst Pressure',
  unit: 'bar',
  minValue: 400,
  maxValue: 550,
  ourStandardValue: 480,
  higherIsBetter: true,
};

const leakageParam: TestParameter = {
  category: 'Hydraulic Check Valves',
  parameterId: 'p-leak',
  name: 'Internal Leakage',
  unit: 'mL/min',
  minValue: 0,
  maxValue: 2.5,
  ourStandardValue: 0.8,
  higherIsBetter: false,
};

function makeLabCase(overrides: Partial<LabCase> = {}): LabCase {
  return {
    caseId: 'CASE-1001',
    orderDate: '2026-10-18',
    customer: 'Meridian Flow Controls',
    product: 'HV-40',
    category: 'Hydraulic Check Valves',
    orderValue: 40000,
    competitorId: 'comp-1',
    competitorName: 'Apex Fluid Systems',
    lossReason: 'Quality',
    orderNotes: '',
    enteredBy: 'Sales',
    results: [],
    attachmentList: [],
    approvalStatus: 'Pending Approval',
    pendingStageNo: 2,
    pendingStage: 'Sample Request',
    pendingPlanned: '2026-10-20',
    pendingDelay: 0,
    totalDelay: 0,
    status: 'No Sample',
    ...overrides,
  };
}

test('isMeasurementWithinRange handles inclusive bounds accurately', () => {
  assert.equal(isMeasurementWithinRange(400, 400, 550), true);
  assert.equal(isMeasurementWithinRange(550, 400, 550), true);
  assert.equal(isMeasurementWithinRange(399.9, 400, 550), false);
  assert.equal(isMeasurementWithinRange(550.1, 400, 550), false);
});

test('evaluateComparisonRowFromSpec calculates diff %, pass/fail, and directional advantage', () => {
  const highRow = evaluateComparisonRowFromSpec({
    parameterId: 'p-burst',
    name: 'Burst Pressure',
    unit: 'bar',
    minValue: 400,
    maxValue: 550,
    ourStandardValue: 480,
    higherIsBetter: true,
    measuredValue: 432,
    passed: true,
  });
  assert.equal(highRow.passed, true);
  assert.equal(highRow.diffValue, -48);
  assert.equal(highRow.diffPercent, -10);
  assert.equal(highRow.performanceStatus, 'our-advantage');

  const leakFailRow = evaluateComparisonRowFromSpec({
    parameterId: 'p-leak',
    name: 'Internal Leakage',
    unit: 'mL/min',
    minValue: 0,
    maxValue: 2.5,
    ourStandardValue: 0.8,
    higherIsBetter: false,
    measuredValue: 3.2,
    passed: false,
  });
  assert.equal(leakFailRow.passed, false);
  assert.equal(leakFailRow.performanceStatus, 'our-advantage');

  const leakAheadRow = evaluateComparisonRowFromSpec({
    parameterId: 'p-leak',
    name: 'Internal Leakage',
    unit: 'mL/min',
    minValue: 0,
    maxValue: 2.5,
    ourStandardValue: 0.8,
    higherIsBetter: false,
    measuredValue: 0.4,
    passed: true,
  });
  assert.equal(leakAheadRow.passed, true);
  assert.equal(leakAheadRow.performanceStatus, 'competitor-ahead');
});

test('computeSampleSummary computes pass rate and completeness from LabCase results', () => {
  const completedCase = makeLabCase({
    sampleCode: 'SMP-0001',
    sampleName: 'Apex Check Valve X9',
    status: 'Completed',
    pendingStageNo: 5,
    results: [
      {
        parameterId: 'p-burst',
        name: 'Burst Pressure',
        unit: 'bar',
        min: 400,
        max: 550,
        standard: 480,
        higherIsBetter: true,
        measuredValue: 450,
        passed: true,
      },
      {
        parameterId: 'p-leak',
        name: 'Internal Leakage',
        unit: 'mL/min',
        min: 0,
        max: 2.5,
        standard: 0.8,
        higherIsBetter: false,
        measuredValue: 3.1,
        passed: false,
      },
    ],
  });

  const summary = computeSampleSummary(completedCase);
  assert.equal(summary.totalParameters, 2);
  assert.equal(summary.measuredCount, 2);
  assert.equal(summary.passedCount, 1);
  assert.equal(summary.failedCount, 1);
  assert.equal(summary.passRate, 50);
  assert.equal(summary.isComplete, true);

  const rows = buildComparisonRows(completedCase);
  const verdict = generateAutoVerdict(completedCase, 'Apex Fluid Systems', rows, summary);
  assert.match(verdict, /passed 1 of 2/);
  assert.match(verdict, /50% spec compliance/);
});

test('computeCompetitorStats aggregates lost value, counts, and average test scores', () => {
  const comp: Competitor = {
    id: 'comp-1',
    name: 'Apex Fluid Systems',
    headquarters: 'Chicago, IL',
    marketSegment: 'Mid-Market Industrial',
    notes: '',
  };

  const cases: LabCase[] = [
    makeLabCase({
      caseId: 'CASE-1001',
      orderValue: 40000,
      lossReason: 'Quality',
      status: 'Completed',
      sampleCode: 'SMP-0001',
      results: [
        {
          parameterId: 'p-burst',
          name: 'Burst Pressure',
          unit: 'bar',
          min: 400,
          max: 550,
          standard: 480,
          higherIsBetter: true,
          measuredValue: 460,
          passed: true,
        },
      ],
    }),
    makeLabCase({
      caseId: 'CASE-1002',
      orderValue: 20000,
      lossReason: 'Quality',
      status: 'No Sample',
    }),
  ];

  const stats = computeCompetitorStats(comp, cases);
  assert.equal(stats.lostOrderCount, 2);
  assert.equal(stats.totalLostValue, 60000);
  assert.equal(stats.sampleCount, 1);
  assert.equal(stats.completedSampleCount, 1);
  assert.equal(stats.averageTestScore, 100);
  assert.equal(stats.topLossReason, 'Quality');
});

test('isCaseOverdue and getPendingCasesForStage sort pending stages by planned date', () => {
  const cases: LabCase[] = [
    makeLabCase({
      caseId: 'CASE-2',
      pendingStageNo: 3,
      pendingPlanned: '2026-11-20',
      pendingDelay: 0,
      status: 'Requested',
    }),
    makeLabCase({
      caseId: 'CASE-1',
      pendingStageNo: 3,
      pendingPlanned: '2026-11-15',
      pendingDelay: 3,
      status: 'Requested',
    }),
    makeLabCase({
      caseId: 'CASE-3',
      pendingStageNo: 4,
      pendingPlanned: '2026-11-12',
      pendingDelay: 1,
      status: 'Received',
    }),
  ];

  assert.equal(isCaseOverdue(cases[0]), false);
  assert.equal(isCaseOverdue(cases[1]), true);

  const stage3Pending = getPendingCasesForStage(cases, 3);
  assert.deepEqual(
    stage3Pending.map((c) => c.caseId),
    ['CASE-1', 'CASE-2']
  );
});

test('getExtraFmsSchemaFields and getCaseExtraFieldValue expose non-standard sheet columns', () => {
  const schemaFms: FmsSchemaField[] = [
    { key: 'caseId', label: 'Case ID', role: 'auto' },
    { key: 'planned2', label: 'Planned 2', role: 'planned', stage: 2 },
    { key: 'regionCode', label: 'Region Code', role: 'data', stage: 1 },
    { key: 'auditScore', label: 'Audit Score', role: 'auto' },
  ];
  const extras = getExtraFmsSchemaFields(schemaFms);
  assert.deepEqual(
    extras.map((f) => f.key),
    ['regionCode', 'auditScore']
  );

  const c = makeLabCase({
    regionCode: 'WEST-04',
    fields: { auditScore: 98 },
  });
  assert.equal(getCaseExtraFieldValue(c, 'regionCode'), 'WEST-04');
  assert.equal(getCaseExtraFieldValue(c, 'auditScore'), '98');
  assert.equal(getCaseExtraFieldValue(c, 'missingField'), '');
});

test('form validators validate lost order, sample request, sample receive, parameter, and competitor forms', () => {
  const badOrder = validateLostOrderForm({
    customer: '',
    product: 'Valve',
    category: '',
    orderValue: 0,
    competitorId: '',
    lossReason: '',
    orderDate: '',
  });
  assert.equal(badOrder.valid, false);
  assert.ok(badOrder.errors.customer);
  assert.ok(badOrder.errors.category);
  assert.ok(badOrder.errors.orderValue);
  assert.ok(badOrder.errors.competitorId);
  assert.ok(badOrder.errors.lossReason);
  assert.ok(badOrder.errors.orderDate);

  const badParam = validateParameterForm({
    name: 'Pressure',
    unit: 'bar',
    minValue: 500,
    maxValue: 400,
    ourStandardValue: 450,
  });
  assert.equal(badParam.valid, false);
  assert.ok(badParam.errors.maxValue);

  const badRequest = validateSampleRequestForm(
    {
      caseId: 'CASE-1001',
      sampleName: '',
      qtyNeeded: 0,
      sourceType: 'Market-Retail Shop',
      sourceLocation: '',
      responsiblePerson: '',
      expectedDate: '2026-11-16',
      priority: 'High',
    },
    '2026-11-17'
  );
  assert.equal(badRequest.valid, false);
  assert.ok(badRequest.errors.sampleName);
  assert.ok(badRequest.errors.qtyNeeded);
  assert.ok(badRequest.errors.sourceLocation);
  assert.ok(badRequest.errors.responsiblePerson);
  assert.ok(badRequest.errors.expectedDate);

  const goodRequest = validateSampleRequestForm(
    {
      caseId: 'CASE-1001',
      sampleName: 'Check Valve X9',
      qtyNeeded: 3,
      sourceType: 'Dealer-Distributor',
      sourceLocation: 'Midwest Industrial Supply, Chicago IL',
      responsiblePerson: 'Elena Vance',
      expectedDate: '2026-11-20',
      priority: 'High',
    },
    '2026-11-17'
  );
  assert.equal(goodRequest.valid, true);

  const badReceiveNo = validateSampleReceiveForm({
    received: false,
    remarks: '',
    receivedBy: '',
    receivedQty: 0,
    condition: 'Sealed',
  });
  assert.equal(badReceiveNo.valid, false);
  assert.ok(badReceiveNo.errors.remarks);

  const badReceiveYes = validateSampleReceiveForm({
    received: true,
    remarks: '',
    receivedBy: '',
    receivedQty: 0,
    condition: '',
  });
  assert.equal(badReceiveYes.valid, false);
  assert.ok(badReceiveYes.errors.receivedBy);
  assert.ok(badReceiveYes.errors.receivedQty);
  assert.ok(badReceiveYes.errors.condition);

  const goodReceiveYes = validateSampleReceiveForm({
    received: true,
    remarks: '',
    receivedBy: 'Dr. Aris Thorne',
    receivedQty: 2,
    condition: 'Sealed',
  });
  assert.equal(goodReceiveYes.valid, true);

  const badCompetitor = validateCompetitorForm({
    name: '',
    headquarters: '',
    marketSegment: '',
  });
  assert.equal(badCompetitor.valid, false);
  assert.ok(badCompetitor.errors.name);
  assert.ok(badCompetitor.errors.headquarters);
  assert.ok(badCompetitor.errors.marketSegment);
});

test('areAllParametersMeasured requires non-empty parameters and finite values for all parameters', () => {
  assert.equal(areAllParametersMeasured([], []), false);
  assert.equal(
    areAllParametersMeasured(
      [burstParam, leakageParam],
      [
        { parameterId: 'p-burst', measuredValue: 450 },
        { parameterId: 'p-leak', measuredValue: null },
      ]
    ),
    false
  );
  assert.equal(
    areAllParametersMeasured([burstParam, leakageParam], [
      { parameterId: 'p-burst', measuredValue: 450 },
    ]),
    false
  );
  assert.equal(
    areAllParametersMeasured(
      [burstParam, leakageParam],
      [
        { parameterId: 'p-burst', measuredValue: 450 },
        { parameterId: 'p-leak', measuredValue: 0 },
      ]
    ),
    true
  );
});
