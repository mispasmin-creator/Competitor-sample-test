export type PageKey =
  | 'dashboard'
  | 'lostOrders'
  | 'samples'
  | 'testEntry'
  | 'management';

export type PagePermission = 'none' | 'view' | 'full';

export type UserPermissions = Record<string, PagePermission>;

export interface User {
  id: string;
  name: string;
  username: string;
  isAdmin: boolean;
  isActive: boolean;
  permissions: UserPermissions;
  fields?: Record<string, unknown>;
  createdAt?: string;
  lastLoginAt?: string;
}

export type CaseStatus = 'No Sample' | 'Requested' | 'Received' | 'Testing' | 'Completed';

export type ApprovalStatus = 'Pending Approval' | 'Approved' | 'Revision Requested';

export interface Competitor {
  id: string;
  name: string;
  headquarters: string;
  marketSegment: string;
  website?: string;
  notes: string;
}

export interface CategoryMaster {
  category: string;
  description: string;
}

export interface TestParameter {
  category: string;
  parameterId: string;
  name: string;
  unit: string;
  minValue: number;
  maxValue: number;
  ourStandardValue: number;
  higherIsBetter: boolean;
}

export interface MasterValueItem {
  value: string;
}

export interface TatSettingRow {
  stage: number;
  step: string;
  tatDays: number;
}

export interface HolidayRow {
  date: string; // yyyy-mm-dd
  name: string;
}

export interface MastersData {
  competitors: Competitor[];
  categories: CategoryMaster[];
  parameters: TestParameter[];
  lossReasons: MasterValueItem[];
  sourceTypes: MasterValueItem[];
  conditions: MasterValueItem[];
  priorities: MasterValueItem[];
  /** Masters block "Firm Names" (column "Value" or "Name"); optional. */
  firmNames: Array<MasterValueItem & { name?: string }>;
  fmsNames?: Array<MasterValueItem & { name?: string }>;
  /** Masters blocks for the Enter Test form. */
  testStatus?: Array<MasterValueItem & { name?: string }>;
  testedBy?: Array<MasterValueItem & { name?: string }>;
  flowOfMaterial?: Array<MasterValueItem & { name?: string }>;
  tat: TatSettingRow[];
  holidays: HolidayRow[];
}

export interface CaseTestResult {
  parameterId: string;
  name: string;
  unit: string;
  min: number;
  max: number;
  standard: number;
  higherIsBetter: boolean;
  measuredValue: number | null;
  passed: boolean | null;
  notes?: string;
}

export interface CaseAttachment {
  name: string;
  url: string;
}

export interface LabCase {
  caseId: string;
  orderDate: string;
  dateLost?: string;
  timestamp?: string;
  customer: string;
  product: string;
  category: string;
  orderValue: number;
  competitorId: string;
  competitorName: string;
  competitor?: string;
  lossReason: string;
  orderNotes: string;
  enteredBy: string;

  // "Order Not Received" form fields (FMS columns: Enquiry No, Qty, FMS Name, Competitor Rate, Sample Required)
  enquiryNo?: string;
  firmName?: string;
  qty?: number | string;
  fmsName?: string;
  competitorRate?: number | string;
  sampleRequired?: string;

  // Read-only FMS timestamps
  planned1?: string;
  planned2?: string;
  planned3?: string;
  planned4?: string;
  planned5?: string;
  actual1?: string;
  actual2?: string;
  actual3?: string;
  actual4?: string;
  actual5?: string;

  // Sample request & collection
  sampleCode?: string;
  sampleName?: string;
  qtyNeeded?: number;
  sourceType?: string;
  sourceLocation?: string;
  responsiblePerson?: string;
  expectedDate?: string;
  priority?: string;
  requestNotes?: string;
  requestedBy?: string;

  // Sample receipt
  receivedBy?: string;
  receivedQty?: number;
  condition?: string;
  conditionNotes?: string;
  photoLink?: string;
  receiveRemarks?: string;

  // Testing & results
  testedBy?: string;
  /** Test 1 (Test Entry) status / remarks / date. */
  testStatus?: string;
  testRemarks?: string;
  dateOfTest?: string;
  /** Test 2 (Step 5) */
  test2Status?: string;
  test2Remarks?: string;
  dateOfTest2?: string;
  testedBy2?: string;
  /** Management Action (Step 6) */
  planned6?: string;
  actual6?: string;
  remark6?: string;
  delay6?: number | string;
  results: CaseTestResult[];
  passCount?: number;
  failCount?: number;
  overallResult?: string;
  attachmentList: CaseAttachment[];

  // Reports & approval
  approvalStatus: ApprovalStatus;
  approvedBy?: string;
  managerComment?: string;
  verdictOverride?: string;

  // Pending & SLA calculations (read-only from server)
  pendingStageNo: number | null;
  pendingStage?: string;
  pendingPlanned?: string;
  pendingDelay: number;
  totalDelay: number;
  status: CaseStatus;

  // Dynamic extra sheet columns
  fields?: Record<string, unknown>;
  [extraKey: string]: unknown;
}

export interface FmsSchemaField {
  key: string;
  label: string;
  role: 'data' | 'planned' | 'actual' | 'auto';
  stage?: number;
}

export interface SchemaPageEntry {
  key: string;
  label?: string;
}

export interface LabSchema {
  fms: FmsSchemaField[];
  stages: number[];
  users: unknown[];
  pages: Array<string | SchemaPageEntry>;
  masters: Record<string, string[]>;
}

export interface LabSnapshot {
  user: User;
  cases: LabCase[];
  masters: MastersData;
  users: User[];
  schema: LabSchema;
  warnings: string[];
  serverTime: string;
}

export interface LoginResponseData {
  token: string;
  mustChangePassword: boolean;
  snapshot: LabSnapshot;
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  title: string;
  message?: string;
}
