/**
 * Competitor Sample Lab - Apps Script backend (OPTIMIZED, header-driven)
 * FMS: header row 5 (HR), data from row 6 (DR) | Users: header row 1 | Masters: block title row 1, headers row 2, data from row 3.
 * Add / remove / move columns freely: columns are found by header name ("Case ID" -> caseId, "Planned 1" -> planned1).
 *  - "Planned N" = formula/sheet driven (NEVER written by app).
 *  - "Actual N" = stamped by script (current date-time) on submit.
 *  - Pending status:
 *      Planned 2 filled & Actual 2 empty -> Stage 2 (Request Sample)
 *      Planned 3 filled & Actual 3 empty -> Stage 3 (Sample Received)
 *      Planned 4 filled & Actual 4 empty -> Stage 4 (Test 1)
 *  - Case-insensitive sheet matching for FMS/Fms, Masters/Master, Users/users.
 *  - Password column stores plain text (legacy SHA-256 hashes are still accepted at login).
 * Setup: run setup() once, then Deploy > Web app (Execute as Me, Access Anyone). After edits: Deploy > Manage > New version.
 */
const T = { fms: 'FMS', users: 'Users', masters: 'Masters' }, ID = 'caseId', HR = 5, DR = 6, FOLDER = 'Competitor Sample Lab Files', FOLDER_ID = '1YUOnNQb5lwDQWHSNnuqM69If0W-NHMqP';
const DERIVED = ['pendingStageNo', 'pendingStage', 'pendingPlanned', 'pendingDelay', 'totalDelay'];
const PAGES = ['dashboard', 'lostOrders', 'samples', 'templates', 'testEntry', 'management', 'comparison', 'reports', 'competitors'];
const FMS_HEAD = 'Timestamp|Case ID|Customer|Product|Category|Order Value|Competitor|Loss Reason|Order Notes|Date Lost|Sample Code|Sample Name|Qty Needed|Source Type|Source Location|Responsible Person|Expected Date|Priority|Request Notes|Requested By|Planned 2|Actual 2|Received By|Received Qty|Condition|Condition Notes|Photo Link|Receive Remarks|Planned 3|Actual 3|Tested By|Test Results (JSON)|Pass Count|Fail Count|Overall Result|Attachment Links|Planned 4|Actual 4|Approval Status|Approved By|Manager Comment|Verdict Override|Planned 5|Actual 5|Pending Stage No|Pending Stage|Pending Planned|Pending Delay|Total Delay'.split('|');
const FMS_NAMES = ['NBD & NBD OF CRR FMS', 'CRR ENQUIRY'];
// FMS headings that follow the "Order Not Received" Google Form wording -> internal field keys.
// Applied only when the internal key's own column is not present, so older sheets keep working.
const FMS_ALIASES = {
  enquiryNoOfFms: 'enquiryNo',
  nameOfCompany: 'customer',
  productName: 'product',
  nameOfFms: 'fmsName',
  totalEnquiryValue: 'orderValue',
  givenToWhom: 'competitor',
  rate: 'competitorRate',
  whyUsNotReceivedOrder: 'orderNotes',
  haveToTakeSample: 'sampleRequired',
  // Test 2 (Step 5) headings used in the FMS tab
  testStatus1: 'test2Status',
  dateOfTest1: 'dateOfTest2',
  testedBy1: 'testedBy2',
  testRemark: 'test2Remarks'
};
function aliasFms_(m, l) {
  Object.keys(FMS_ALIASES).forEach(a => {
    const k = FMS_ALIASES[a];
    if (m[a] && !m[k]) { m[k] = m[a]; l[k] = l[a]; delete m[a]; delete l[a]; }
  });
}
const CASE_STATUSES = ['No Sample', 'Requested', 'Received', 'Testing', 'Completed'];
const DEFAULT_LISTS = { lossReasons: ['Price', 'Quality', 'Delivery', 'Other'], sourceTypes: ['Customer', 'Market', 'Dealer', 'Online', 'Other'], conditions: ['Sealed', 'Opened', 'Damaged', 'Expired'], priorities: ['Low', 'Medium', 'High'] };
// per-execution caches: Masters blocks/values/lists, FMS ctx, Users ctx/list, array-formula cols; _MD = Masters changed; _W = warnings
let _B = null, _MV = null, _M = null, _MD = false, _F = null, _A = null, _UC = null, _U = null, _W = [];

/* ---------------- helpers ---------------- */
const ss = () => SpreadsheetApp.getActiveSpreadsheet();
const sheet = n => {
  const s = ss().getSheetByName(n);
  if (s) return s;
  const l = String(n).toLowerCase();
  return ss().getSheets().find(x => {
    const xl = x.getName().toLowerCase();
    return xl === l || (l === 'masters' && xl === 'master') || (l === 'master' && xl === 'masters');
  }) || null;
};
const L = n => { let s = ''; for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s; return s; };
const key_ = h => {
  h = String(h).trim();
  return /^[a-z][A-Za-z0-9_]*$/.test(h) ? h : h.replace(/[^A-Za-z0-9]+/g, ' ').trim().split(' ').filter(Boolean).map((w, i) => i ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase()).join('');
};
const cell_ = v => v instanceof Date ? Utilities.formatDate(v, ss().getSpreadsheetTimeZone(), "yyyy-MM-dd'T'HH:mm:ss") : v;
const nowIso_ = () => cell_(new Date());
const conv_ = v => { // value going INTO the sheet
  if (v == null) return '';
  if (v instanceof Date) return v;
  if (typeof v === 'object') return JSON.stringify(v);
  if (typeof v === 'string') { v = v.trim(); const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v); if (d) return new Date(+d[1], +d[2] - 1, +d[3]); if (/^[=+\-@]/.test(v)) return "'" + v; }
  return v;
};
const need_ = (p, ks) => ks.forEach(k => { if (p[k] == null || String(p[k]).trim() === '') throw new Error('Missing required field: ' + k); });
const omit_ = (p, ks) => Object.fromEntries(Object.entries(p).filter(([k]) => !ks.includes(k)));
const warn_ = m => { if (!_W.includes(m)) _W.push(m); };
const json_ = o => ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
const isPlanned_ = k => /^planned\d+$/.test(k), isActual_ = k => /^actual\d+$/.test(k), isLocked_ = k => isPlanned_(k) || DERIVED.includes(k);
const bool_ = v => v === true || /^(true|yes|1)$/i.test(String(v));
const parse_ = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (e) { return d; } };
// contiguous columns runner: {col: value} -> [[startCol, [values]]]
const runs_ = o => { const cols = Object.keys(o).map(Number).sort((a, b) => a - b), out = []; for (let i = 0; i < cols.length;) { let j = i; while (j + 1 < cols.length && cols[j + 1] === cols[j] + 1) j++; out.push([cols[i], cols.slice(i, j + 1).map(x => o[x])]); i = j + 1; } return out; };

function hdr_(sh, row) {
  const m = {}, l = {}, lc = sh.getLastColumn();
  if (lc) sh.getRange(row, 1, 1, lc).getValues()[0].forEach((v, i) => {
    if (String(v).trim() === '') return;
    const k = key_(v);
    if (m[k]) throw new Error('Duplicate column "' + v + '" in tab ' + sh.getName() + '. Rename one.');
    m[k] = i + 1; l[k] = String(v);
  });
  return { m, l };
}
const stages_ = m => Object.keys(m).map(k => /^planned(\d+)$/.exec(k)).filter(x => x && m['actual' + x[1]]).map(x => +x[1]).sort((a, b) => a - b);
const stageOf_ = (m, col) => { const st = stages_(m); for (const n of st) if (col <= m['actual' + n]) return n; return 0; };

/* ---------------- menu / setup ---------------- */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Competitor Lab').addItem('Setup / Repair tabs', 'setup')
    .addItem('Fix formulas & formatting (after changing columns)', 'repairFormulas')
    .addItem('Add Google Form dropdowns to Masters', 'addFormMasters')
    .addItem('Setup Lab Test columns & dropdowns', 'setupLabTest')
    .addItem('Check structure', 'checkStructure')
    .addItem('Reset admin password to admin123', 'resetAdminPassword').addToUi();
}

const resetCaches_ = () => { _B = _MV = _M = _F = _A = _UC = _U = null; _MD = false; };

// Default Masters blocks for a new sheet + the Google Form "Pasmin Order Not Received Form" dropdowns.
const BASE_MASTERS = [
  ['Competitors', [], ['ID', 'Name']], ['Categories', [], ['Category']],
  ['Loss Reasons', DEFAULT_LISTS.lossReasons], ['Source Types', DEFAULT_LISTS.sourceTypes],
  ['Conditions', DEFAULT_LISTS.conditions], ['Priorities', DEFAULT_LISTS.priorities]
];
const FORM_MASTERS = [['Firm Names', []], ['FMS Names', FMS_NAMES], ['Have To Take Sample', ['Yes', 'No']]];

function setup() {
  let f = sheet(T.fms);
  if (!f) { const a = ss().getSheets()[0]; if (ss().getSheets().length === 1 && !a.getLastRow()) { a.setName(T.fms); f = a; } else f = ss().insertSheet(T.fms); }
  const u = sheet(T.users) || ss().insertSheet(T.users);
  if (!sheet(T.masters)) ss().insertSheet(T.masters);
  ensureBlocks_(BASE_MASTERS);
  if (!u.getLastRow()) {
    const h = ['id', 'name', 'username', 'password', 'isAdmin', 'isActive'].concat(PAGES.map(p => 'perm_' + p), ['createdAt', 'lastLoginAt']);
    const r = { id: 'usr-admin', name: 'Administrator', username: 'admin', password: plain_('admin123'), isAdmin: true, isActive: true, createdAt: new Date() };
    PAGES.forEach(p => r['perm_' + p] = 'full');
    u.getRange(1, 1, 1, h.length).setValues([h]).setFontWeight('bold'); u.getRange(2, 1, 1, h.length).setValues([h.map(k => r[k] === undefined ? '' : r[k])]);
  }
  if (!f.getLastRow()) f.getRange(HR, 1, 1, FMS_HEAD.length).setValues([FMS_HEAD]);
  f.setFrozenRows(HR);
  repairFormulas(); getUploadFolder_();
  try { SpreadsheetApp.getUi().alert('Setup complete. Default login: admin / admin123'); } catch (e) { /* no UI */ }
}

function addFormMasters() {
  const added = ensureBlocks_(FORM_MASTERS);
  const msg = added.length ? 'Added to Masters: ' + added.join(', ') + (added.indexOf('Firm Names') >= 0 ? '\nFill your firm names under "Firm Names" from row 3.' : '') : 'All Google Form dropdowns already exist in Masters.';
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { /* no UI */ }
  return msg;
}

/* ---------------- Lab Test form (Enter Test) ---------------- */
// [key, FMS heading, required when Tested]
const LAB_FIELDS = [
  ['wcPercentage', 'WC Percentage', true],
  ['initialSettingTime', 'Initial Setting Time', false],
  ['finalSettingTime', 'Final Setting Time', false],
  ['flowOfMaterial', 'Flow Of Material', true],
  ['whatToBeMixed', 'What To Be Mixed', false],
  ['sieveAnalysis', 'Sieve Analysis', false]
];
// Test 2 (Step 5) — physical test fields, saved from the Test 2 page.
const LAB2_FIELDS = [
  ['bdAt110C', 'BD at 110°C', true],
  ['ccsAt100C', 'CCS at 100°C', true],
  ['bdAt1100C', 'BD at 1100°C', true],
  ['ccsAt1100C', 'CCS at 1100°C', true],
  ['plcAt1100C', 'PLC at 1100°C', true]
];
const LAB_COLUMNS = [['testStatus', 'Test Status'], ['dateOfTest', 'Date Of Test'], ['testedBy', 'Tested By']]
  .concat(LAB_FIELDS.map(f => [f[0], f[1]]), [['testRemarks', 'Test Remarks']],
    [['planned5', 'Planned 5'], ['actual5', 'Actual 5'], ['test2Status', 'Test 2 Status'], ['dateOfTest2', 'Date Of Test 2'], ['testedBy2', 'Tested By 2']],
    LAB2_FIELDS.map(f => [f[0], f[1]]), [['test2Remarks', 'Test 2 Remarks']]);
const LAB_SKIP_STATUSES = ['non tested', 'direct supply'];
const LAB_MASTERS = [
  ['Test Status', ['Tested', 'Non Tested', 'Direct supply']],
  ['Tested By', []],
  ['Flow Of Material', []]
];

// Adds missing Masters blocks (never touches existing ones). Returns the titles added.
// list = [[title, values, headings = ['Value']]]
function ensureBlocks_(list) {
  const sh = sheet(T.masters) || ss().insertSheet(T.masters);
  mastersChanged_();
  const have = blocks_(), added = [];
  let col = sh.getLastColumn() ? sh.getLastColumn() + 2 : 1;
  list.forEach(([title, values, heads]) => {
    if (have[key_(title)]) return;
    heads = heads || ['Value'];
    sh.getRange(1, col).setValue(title).setFontWeight('bold');
    sh.getRange(2, col, 1, heads.length).setValues([heads]).setFontWeight('bold');
    if (values.length) sh.getRange(3, col, values.length, 1).setValues(values.map(v => [v]));
    added.push(title); col += heads.length + 1;
  });
  mastersChanged_();
  return added;
}

// Menu: adds the Lab Test columns at the END of the FMS header row + the Masters dropdown blocks.
function setupLabTest() {
  resetCaches_();
  const c = fms_(), added = [];
  let col = c.sh.getLastColumn() + 1;
  LAB_COLUMNS.forEach(([k, h]) => {
    if (c.m[k]) return;
    c.sh.getRange(c.hr, col).setValue(h).setFontWeight('bold');
    added.push(h); col++;
  });
  _F = null;
  if (added.length) repairFormulas(); // formats + pending-stage formulas (Planned columns stay the sheet's own)
  _F = null;
  const blocks = ensureBlocks_(LAB_MASTERS);
  const msg = (added.length ? 'FMS columns added at the end: ' + added.join(', ') : 'All Lab Test columns already exist in FMS.') +
    '\n' + (blocks.length ? 'Masters blocks added: ' + blocks.join(', ') + '\nFill technician names under "Tested By" and options under "Flow Of Material" from row 3.' : 'Masters blocks already exist.');
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { /* no UI */ }
  return msg;
}

function saveLabTest_(u, p) {
  const { c, o } = open_(u, p, 'testEntry', 4);
  const has = v => v !== undefined && v !== null && String(v).trim() !== '';
  const status = String(p.testStatus || '').trim();
  if (!status) throw new Error('Status is required.');
  const skip = LAB_SKIP_STATUSES.indexOf(status.toLowerCase()) >= 0;
  const lab = p.lab || {};
  const rec = { testStatus: status };
  let results = [], pass = 0, fail = 0;

  if (skip) {
    if (!has(p.testRemarks)) throw new Error('Remark is required.');
    // Never drop the remark silently: the sheet needs a column for it.
    if (!c.m.testRemarks) throw new Error('Add a "Test Remarks" column in the FMS tab to save the remark for "' + status + '".');
    rec.testRemarks = String(p.testRemarks).trim();
    rec.dateOfTest = null;
    rec.testedBy = null;
    LAB_FIELDS.forEach(([k]) => { rec[k] = null; });
    rec.overallResult = status;
  } else {
    if (!has(p.dateOfTest)) throw new Error('Date of Test is required.');
    if (!has(p.testedBy)) throw new Error('Tested By is required.');
    LAB_FIELDS.forEach(([k, h, req]) => {
      if (req && !has(lab[k])) throw new Error(h + ' is required.');
      rec[k] = has(lab[k]) ? String(lab[k]).trim() : '';
    });
    rec.dateOfTest = String(p.dateOfTest).slice(0, 10);
    rec.testedBy = String(p.testedBy).trim();
    if (c.m.testRemarks) rec.testRemarks = null; // clear an old remark; skip quietly when there is no column
    // Category template parameters (Test Templates) — optional, Pass/Fail as before.
    const params = readBlock_('parameters').filter(x => x.category === o.category);
    const inp = Object.fromEntries((p.results || []).map(r => [r.parameterId, r]));
    results = params.map(x => {
      const raw = inp[x.parameterId]; let v = null, ok = null;
      if (raw && has(raw.measuredValue)) {
        v = Number(raw.measuredValue);
        if (isNaN(v)) throw new Error('Invalid number for ' + x.name);
        ok = v >= +x.minValue && v <= +x.maxValue;
        ok ? pass++ : fail++;
      }
      return { parameterId: x.parameterId, name: x.name, unit: x.unit, min: +x.minValue, max: +x.maxValue, standard: +x.ourStandardValue, higherIsBetter: bool_(x.higherIsBetter), measuredValue: v, passed: ok, notes: (raw && raw.notes) || '' };
    });
    if (results.some(r => r.measuredValue === null)) throw new Error('Enter valid measurements for all ' + results.length + ' template parameters.');
    rec.overallResult = results.length ? (fail ? 'Fail' : 'Pass') : status;
  }
  rec.passCount = pass;
  rec.failCount = fail;
  const resKey = c.m.testResultsJson ? 'testResultsJson' : 'testResults';
  rec[resKey] = results;

  const files = parse_(o.attachmentLinks || o.attachments || '', []);
  (p.attachments || []).forEach(a => files.push({ name: a.name, url: saveFile_(a.dataUrl, a.name, o.sampleCode || o.caseId), uploadedAt: nowIso_() }));
  if ((p.attachments || []).length || c.m.attachmentLinks || c.m.attachments) rec[c.m.attachmentLinks ? 'attachmentLinks' : 'attachments'] = files;

  // Optional summary columns: skip quietly when the sheet doesn't have them.
  ['passCount', 'failCount', 'overallResult', resKey, 'attachmentLinks', 'attachments'].forEach(k => { if (rec[k] !== undefined && !c.m[k]) delete rec[k]; });
  put_(c, o.row, [rec], 4); // stamps Actual 4 = Test 1 completion
  // Direct supply skips the remaining test stage (Test 2 / Step 5): mark it done today.
  if (status.toLowerCase() === 'direct supply' && c.m.actual5 && !o.actual5) {
    const skipRec = { test2Status: 'Direct supply', test2Remarks: rec.testRemarks };
    Object.keys(skipRec).forEach(k => { if (!c.m[k]) delete skipRec[k]; });
    put_(c, o.row, [skipRec], 5);
  }
}

// Step 5: Test 2 (physical test) from the Test 2 page.
function saveLabTest2_(u, p) {
  const c0 = fms_();
  if (!c0.m.actual5) throw new Error('Test 2 columns are missing. Run "Competitor Lab → Setup Lab Test columns & dropdowns" in the sheet.');
  const { c, o } = open_(u, p, 'testEntry', 5);
  if (!o.actual4) throw new Error('Test 1 is not completed yet.');
  const has = v => v !== undefined && v !== null && String(v).trim() !== '';
  const status = String(p.testStatus || '').trim();
  if (!status) throw new Error('Status is required.');
  const skip = LAB_SKIP_STATUSES.indexOf(status.toLowerCase()) >= 0;
  const lab = p.lab || {};
  const rec = { test2Status: status };
  if (skip) {
    if (!has(p.testRemarks)) throw new Error('Remark is required.');
    rec.test2Remarks = String(p.testRemarks).trim();
    rec.dateOfTest2 = null;
    rec.testedBy2 = null;
    LAB2_FIELDS.forEach(([k]) => { rec[k] = null; });
  } else {
    if (!has(p.dateOfTest)) throw new Error('Date of Test is required.');
    if (!has(p.testedBy)) throw new Error('Tested By is required.');
    LAB2_FIELDS.forEach(([k, h, req]) => {
      if (req && !has(lab[k])) throw new Error(h + ' is required.');
      rec[k] = has(lab[k]) ? String(lab[k]).trim() : '';
    });
    rec.dateOfTest2 = String(p.dateOfTest).slice(0, 10);
    rec.testedBy2 = String(p.testedBy).trim();
    rec.test2Remarks = has(p.testRemarks) ? String(p.testRemarks).trim() : ''; // optional remark when Tested
  }
  put_(c, o.row, [rec], 5); // stamps Actual 5 = Test 2 completion
}

// Step 6: Management Action page -> Remark 6, Delay 6, Actual 6. Planned 6 is the sheet's formula and is never written.
function saveManagement_(u, p) {
  const c0 = fms_();
  if (!c0.m.actual6) throw new Error('Add an "Actual 6" column in the FMS tab for Management Action.');
  const { c, o } = open_(u, p, 'management', 6);
  if (!String(p.remark6 || '').trim()) throw new Error('Remark is required.');
  if (!c.m.remark6) throw new Error('Add a "Remark 6" column in the FMS tab to save the remark.');
  const rec = { remark6: String(p.remark6).trim() };
  // Delay 6 = working days late (Sunday off), like NETWORKDAYS.INTL(Planned 6, today, 11) - 1. Skipped if the cell has a formula.
  if (c.m.delay6) rec.delay6 = delayDays_(o.planned6, new Date());
  put_(c, o.row, [rec], 6);
}
function delayDays_(planned, done) {
  const p = planned ? new Date(planned) : null;
  if (!p || isNaN(p)) return 0;
  const d0 = new Date(p.getFullYear(), p.getMonth(), p.getDate()), d1 = new Date(done.getFullYear(), done.getMonth(), done.getDate());
  let n = 0;
  for (let d = new Date(d0); d <= d1; d.setDate(d.getDate() + 1)) if (d.getDay() !== 0) n++;
  return Math.max(n - 1, 0);
}

function resetAdminPassword() {
  const pr = PropertiesService.getScriptProperties();
  if (!pr.getProperty('PW_SALT')) pr.setProperty('PW_SALT', Utilities.getUuid() + Utilities.getUuid());
  const u = users_().find(x => x.username.toLowerCase() === 'admin');
  if (!u) throw new Error('No user "admin" in Users tab.');
  setUser_(u.row, { [usersCtx_().pw]: plain_('admin123'), isActive: true, isAdmin: true });
  try { SpreadsheetApp.getUi().alert('Admin password reset to: admin123'); } catch (e) { /* no UI */ }
}

function checkStructure() {
  resetCaches_(); const out = [];
  try { const c = fms_(); out.push('FMS header row ' + c.hr + ', data from row ' + c.dr + ' | stages: ' + (stages_(c.m).join(', ') || 'none') + ' | columns: ' + Object.keys(c.m).length); } catch (e) { out.push('FMS problem: ' + e.message); }
  try { out.push('Users permission columns: ' + Object.keys(usersCtx_().pk).join(', ')); } catch (e) { out.push('Users problem: ' + e.message); }
  try { out.push('Masters blocks: ' + Object.keys(blocks_()).join(', ')); } catch (e) { out.push('Masters problem: ' + e.message); }
  SpreadsheetApp.getUi().alert(out.join('\n'));
}

/* ---------------- masters (dynamic blocks) ---------------- */
function blocks_() {
  if (_B) return _B;
  _B = {};
  const v = mv_();
  if (v.length < 2) return _B;
  const r1 = v[0], r2 = v[1], lc = r1.length;
  r1.forEach((t, c) => {
    t = String(t).trim(); if (!t) return;
    let w = 0; while (c + w < lc && String(r2[c + w]).trim() !== '' && (!w || String(r1[c + w]).trim() === '')) w++;
    if (w) _B[key_(t)] = { title: t, col: c + 1, keys: r2.slice(c, c + w).map(key_), labels: r2.slice(c, c + w).map(String) };
  });
  return _B;
}
// Whole Masters tab, read ONCE per request (every block is sliced from this in memory).
function mv_() {
  if (_MV) return _MV;
  const sh = sheet(T.masters);
  return (_MV = sh && sh.getLastRow() ? sh.getDataRange().getValues() : []);
}
const mastersChanged_ = () => { _MV = null; _B = null; _M = null; };

function getMasters_() {
  if (_M) return _M;
  const result = { competitors: [], categories: [], lossReasons: [], sourceTypes: [], conditions: [], priorities: [], firmNames: [], parameters: [], tat: [], holidays: [] };
  // Masters layout: row 1 block titles, row 2 column headings, data from row 3.
  Object.keys(blocks_()).forEach(k => { result[k] = readBlock_(k).map(strip_); });
  // Parameters may also live in their own "Parameters" / "Templates" tab.
  const pSh = sheet('Parameters') || sheet('Templates');
  if (pSh && pSh.getLastRow() >= 2) {
    const rows = pSh.getDataRange().getValues(), m = {};
    rows[0].forEach((h, i) => { if (String(h).trim()) m[key_(h)] = i; });
    const g = (r, ...ks) => { for (const k of ks) if (m[k] !== undefined && r[m[k]] !== '') return r[m[k]]; return ''; };
    result.parameters = rows.slice(1).map((r, i) => ({
      category: String(g(r, 'category')).trim(),
      parameterId: String(g(r, 'parameterId', 'id') || 'PRM-' + (i + 1)).trim(),
      name: String(g(r, 'name', 'parameter')).trim(),
      unit: String(g(r, 'unit')).trim(),
      minValue: Number(g(r, 'minValue', 'min') || 0),
      maxValue: Number(g(r, 'maxValue', 'max') || 0),
      ourStandardValue: Number(g(r, 'ourStandardValue', 'standard') || 0),
      higherIsBetter: bool_(g(r, 'higherIsBetter'))
    })).filter(p => p.name && p.category);
  }
  Object.keys(DEFAULT_LISTS).forEach(k => { if (!result[k].length) result[k] = DEFAULT_LISTS[k].map(v => ({ value: v, name: v })); });
  return (_M = result);
}

function readBlock_(n) {
  const b = blocks_()[n];
  if (!b) return [];
  return mv_().slice(2).map((r, i) => {
    const o = { _row: 3 + i }; b.keys.forEach((k, j) => o[k] = cell_(r[b.col - 1 + j] === undefined ? '' : r[b.col - 1 + j])); return o;
  }).filter(o => o[b.keys[0]] !== '');
}
const strip_ = o => omit_(o, ['_row']);
const list_ = n => (getMasters_()[n] || []).map(o => typeof o === 'object' && o !== null ? (o.value || o.name || o.category || o.id) : o).filter(Boolean);
function upsert_(n, mk, rec) {
  const b = blocks_()[n]; if (!b) throw new Error('Masters block "' + n + '" not found');
  if (!b.keys.includes(mk)) throw new Error('Masters block "' + b.title + '" needs a column "' + mk + '"');
  const sh = sheet(T.masters), rows = readBlock_(n), ex = rows.find(x => String(x[mk]) === String(rec[mk]));
  const r = ex ? ex._row : (rows.length ? Math.max(...rows.map(x => x._row)) + 1 : 3);
  if (r > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), 50);
  const vals = {}; b.keys.forEach((k, i) => { if (rec[k] !== undefined) vals[b.col + i] = conv_(rec[k]); });
  runs_(vals).forEach(([c, v]) => sh.getRange(r, c, 1, v.length).setValues([v]));
  Object.keys(rec).forEach(k => { if (!b.keys.includes(k)) warn_('Masters "' + b.title + '": column "' + k + '" not found, ignored'); });
  mastersChanged_(); _MD = true;
}
// First of `names` that the block has as a column (falls back to the block's first column).
const pickKey_ = (b, names) => (b && (names.find(k => b.keys.includes(k)) || b.keys[0])) || names[0];
// Keep only the fields the block has columns for (no "column not found" warnings for optional extras).
const onlyKeys_ = (b, rec) => b ? Object.fromEntries(Object.entries(rec).filter(([k]) => b.keys.includes(k))) : rec;
function delRow_(n, mk, v) {
  const b = blocks_()[n]; if (!b) return;
  readBlock_(n).filter(x => String(x[mk]) === String(v)).forEach(x => sheet(T.masters).getRange(x._row, b.col, 1, b.keys.length).clearContent());
  mastersChanged_(); _MD = true;
}

function ensureNames_() {
  // TAT and Holidays are purely optional/manual and will NEVER be auto-inserted by script.
  const sh = sheet(T.masters);
  if (!sh) return;
  const B = blocks_(), tat = B.tat;
  if (!tat) return;
  try {
    const pick = o => { const k = o.find(x => tat.keys.includes(x)) || tat.keys.find(x => x.toLowerCase().includes(o[0].toLowerCase())); if (!k) return null; return tat.col + tat.keys.indexOf(k); };
    const cStage = pick(['stage']), cStep = pick(['step', 'name']), cDays = pick(['tatDays', 'days', 'tat']);
    if (!cStage || !cStep || !cDays) return;
    const rows = Math.max(sh.getMaxRows() - 2, 1);
    [['TAT_STAGE', cStage], ['TAT_STEP', cStep], ['TAT_DAYS', cDays], ['HOLIDAYS', (B.holidays ? B.holidays.col : 1)]].forEach(([n, c]) => {
      const rg = sh.getRange(3, c, rows, 1), ex = ss().getRangeByName(n);
      if (!ex || ex.getA1Notation() !== rg.getA1Notation() || ex.getSheet().getName() !== sh.getName()) ss().setNamedRange(n, rg);
    });
  } catch (e) { /* ignore */ }
}

/* ---------------- FMS ---------------- */
function findHeaderRow_(sh) {
  const lc = Math.max(sh.getLastColumn(), 1);
  if (sh.getLastRow() >= 5) {
    const r5 = sh.getRange(5, 1, 1, Math.min(lc, 30)).getValues()[0];
    if (r5.some(v => /case\s*id/i.test(String(v)))) return 5;
  }
  for (let r = 1; r <= 10; r++) {
    if (sh.getLastRow() < r) break;
    const vals = sh.getRange(r, 1, 1, Math.min(lc, 30)).getValues()[0];
    if (vals.some(v => /case\s*id/i.test(String(v)))) return r;
  }
  return HR;
}

function formulasFor_(m, r) {
  const st = stages_(m); if (!st.length) return {};
  const hasTat = Boolean(ss().getRangeByName('TAT_STAGE') && ss().getRangeByName('TAT_DAYS'));
  const hasHolidays = Boolean(ss().getRangeByName('HOLIDAYS'));
  const holRef = hasHolidays ? ',HOLIDAYS' : '';
  const A = n => L(m['actual' + n]) + r, P = n => L(m['planned' + n]) + r, f = {};

  if (hasTat) {
    st.forEach((n, i) => {
      if (i === 0) {
        if (n === 2 && !m.actual1) {
          const dateRef = m.dateLost ? L(m.dateLost) + r : m.orderDate ? L(m.orderDate) + r : m.timestamp ? L(m.timestamp) + r : '';
          // No Planned 2 when "Sample Required" = No
          const skip = m.sampleRequired ? `,UPPER(TRIM(${L(m.sampleRequired)}${r}))="NO"` : '';
          f['planned' + n] = dateRef ? `=IF(OR(${dateRef}=""${skip}),"",WORKDAY.INTL(INT(${dateRef}),IFERROR(INDEX(TAT_DAYS,MATCH(${n},TAT_STAGE,0)),1),11${holRef}))` : (m['actual' + n] ? `=IF(${A(n)}="","",INT(${A(n)}))` : '');
        } else {
          f['planned' + n] = m['actual' + n] ? `=IF(${A(n)}="","",INT(${A(n)}))` : '';
        }
      } else {
        const q = st[i - 1];
        f['planned' + n] = `=IF(${A(q)}="","",WORKDAY.INTL(INT(${A(q)}),IFERROR(INDEX(TAT_DAYS,MATCH(${n},TAT_STAGE,0)),0),11${holRef}))`;
      }
    });
  }

  const pendingStages = st.filter(n => n >= 2);
  let pn = '""', pp = '""';
  for (let i = pendingStages.length - 1; i >= 0; i--) {
    const n = pendingStages[i];
    pn = `IF(AND(${P(n)}<>"",${A(n)}=""),${n},${pn})`;
  }
  const PN = m.pendingStageNo ? L(m.pendingStageNo) + r : `(${pn})`;
  for (let i = pendingStages.length - 1; i >= 0; i--) {
    const n = pendingStages[i];
    pp = `IF(${PN}=${n},${P(n)},${pp})`;
  }
  const PP = m.pendingPlanned ? L(m.pendingPlanned) + r : `(${pp})`;
  const pd = `IF(${PP}="",0,IF(TODAY()>${PP},NETWORKDAYS.INTL(${PP},TODAY(),11${holRef})-1,0))`, PD = m.pendingDelay ? L(m.pendingDelay) + r : `(${pd})`;

  f.pendingStageNo = '=' + pn; f.pendingPlanned = '=' + pp; f.pendingDelay = '=' + pd;
  f.pendingStage = `=IF(${PN}<>"",IF(${PN}=2,"Sample Request",IF(${PN}=3,"Sample Receive",IF(${PN}=4,"Test 1",IF(${PN}=5,"Test 2",IF(${PN}=6,"Management Action",IF(${PN}=7,"Approval","Stage "&${PN})))))),IF(${A(st[st.length - 1])}<>"","Completed",""))`;
  f.totalDelay = '=' + [PD].concat(pendingStages.map(n => `IF(AND(${P(n)}<>"",${A(n)}<>"",INT(${A(n)})>${P(n)}),NETWORKDAYS.INTL(${P(n)},INT(${A(n)}),11${holRef})-1,0)`)).join('+');

  return Object.fromEntries(Object.entries(f).filter(([k]) => m[k]));
}

function fms_() {
  if (_F) return _F;
  const sh = sheet(T.fms);
  if (!sh) throw new Error('Tab "' + T.fms + '" not found in spreadsheet.');
  const hr = findHeaderRow_(sh), dr = hr + 1;
  const { m, l } = hdr_(sh, hr);
  aliasFms_(m, l);
  if (!m[ID]) throw new Error('FMS needs a "Case ID" column in row ' + hr + '.');
  return (_F = { sh, m, l, hr, dr });
}

function lastRow_(c) {
  const last = c.sh.getLastRow(); if (last < c.dr) return c.hr;
  const v = c.sh.getRange(c.dr, c.m[ID], last - c.hr, 1).getValues();
  for (let i = v.length - 1; i >= 0; i--) if (String(v[i][0]).trim() !== '') return i + c.dr;
  return c.hr;
}

function repairFormulas() {
  resetCaches_(); ensureNames_();
  const c = fms_(), last = lastRow_(c), maxR = c.sh.getMaxRows(), body = Math.max(maxR - c.hr, 1), keys = Object.keys(c.m);
  const arr = arrayCols_(c);
  if (last >= c.dr) {
    const rows = Array.from({ length: last - c.dr + 1 }, (_, i) => formulasFor_(c.m, c.dr + i));
    Object.keys(rows[0] || {}).forEach(k => {
      if (arr[c.m[k]] || isPlanned_(k)) return; // array-formula and Planned columns: the sheet owns them
      // A column where the sheet already has its own formula keeps it; only empty columns get the app's formula.
      const first = c.sh.getRange(c.dr, c.m[k]).getFormula();
      if (first) return;
      c.sh.getRange(c.dr, c.m[k], rows.length, 1).setFormulas(rows.map(r => [r[k]]));
    });
    // Clear stray per-row formulas under an array formula (these cause #REF!).
    Object.keys(arr).forEach(col => {
      if (last <= c.dr) return;
      const rg = c.sh.getRange(c.dr + 1, +col, last - c.dr, 1), fs = rg.getFormulas();
      fs.forEach((f, i) => { if (f[0]) c.sh.getRange(c.dr + 1 + i, +col).clearContent(); });
    });
  }
  const st = stages_(c.m), lastA = st.length ? c.m['actual' + st[st.length - 1]] : 0;
  keys.forEach(k => {
    const col = c.m[k], h = c.sh.getRange(c.hr, col).setFontWeight('bold').setWrap(true), rg = c.sh.getRange(c.dr, col, body, 1);
    h.setBackground(isPlanned_(k) ? '#B0BEC5' : isActual_(k) ? '#A5D6A7' : (st.length && col > lastA) ? '#E5E7EB' : ['#E5E7EB', '#DCE9ED', '#E1F4EC', '#FDF3DC', '#E3F0F8', '#F3E6F5'][Math.min(stageOf_(c.m, col), 5)]);
    const fmt = fmtFor_(k);
    if (fmt) rg.setNumberFormat(fmt);
  });
  c.sh.getProtections(SpreadsheetApp.ProtectionType.RANGE).forEach(p => { if (p.getDescription() === 'Auto column - do not edit') p.remove(); });
  keys.filter(k => isLocked_(k) || isActual_(k)).forEach(k => c.sh.getRange(c.dr, c.m[k], body, 1).protect().setDescription('Auto column - do not edit').setWarningOnly(true));
  if (c.m.pendingDelay) {
    const first = c.m.pendingStageNo || c.m.pendingStage || c.m.pendingPlanned || c.m.pendingDelay;
    c.sh.setConditionalFormatRules([SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied(`=$${L(c.m.pendingDelay)}${c.dr}>0`).setBackground('#FCE6E9').setRanges([c.sh.getRange(c.dr, first, body, Math.max(c.m.pendingDelay - first + 1, 1))]).build()]);
  }
}

const maxFmsCol_ = c => {
  const cols = Object.values(c.m);
  return cols.length ? Math.max.apply(null, cols) : (c.sh.getLastColumn() || 1);
};
const rowObj_ = (c, row, vals) => {
  const o = { row };
  Object.keys(c.m).forEach(k => {
    const idx = c.m[k] - 1;
    if (idx >= 0 && idx < vals.length) {
      const v = vals[idx];
      // Number columns (Rate / Qty / Enquiry Value) that the sheet formats as a date: read back the real number.
      o[k] = (v instanceof Date && isNum_(k)) ? serial_(v) : cell_(v);
    }
  });
  return o;
};
function readFms_(c) {
  const last = c.sh.getLastRow();
  if (last < c.dr) return [];
  const maxCol = maxFmsCol_(c);
  if (!maxCol) return [];
  return c.sh.getRange(c.dr, 1, last - c.hr, maxCol).getValues()
    .map((r, i) => rowObj_(c, c.dr + i, r))
    .filter(o => String(o[ID] || '').trim() !== '');
}

function findCase_(c, id) {
  const last = c.sh.getLastRow();
  const i = last < c.dr ? -1 : c.sh.getRange(c.dr, c.m[ID], last - c.hr, 1).getValues().findIndex(r => String(r[0]) === String(id));
  if (i < 0) throw new Error('Case not found: ' + id);
  const maxCol = maxFmsCol_(c);
  return rowObj_(c, c.dr + i, c.sh.getRange(c.dr + i, 1, 1, maxCol).getValues()[0]);
}

const status_ = o => {
  // A sheet "Status" column only overrides when it holds one of the app's own statuses.
  const s = String(o.status || '').trim();
  if (CASE_STATUSES.indexOf(s) >= 0) return s;
  if (!o.actual2 && !o.sampleCode) return 'No Sample';
  if (!o.actual3 && !o.receivedBy) return 'Requested';
  if (!o.actual4 && !o.testedBy) return (o.testResults || o.testResultsJson) ? 'Testing' : 'Received';
  return 'Completed';
};

function toCase_(o) {
  const c = omit_(o, ['row']);
  let psNo = (o.pendingStageNo !== undefined && o.pendingStageNo !== null && String(o.pendingStageNo).trim() !== '') ? Number(o.pendingStageNo) : null;
  if (psNo === null || isNaN(psNo)) {
    if (o.planned2 && !o.actual2) psNo = 2;
    else if (o.planned3 && !o.actual3) psNo = 3;
    else if (o.planned4 && !o.actual4) psNo = 4;
    else if (o.planned5 && !o.actual5) psNo = 5;
    else if (o.planned6 && !o.actual6) psNo = 6;
    else if (o.planned7 && !o.actual7) psNo = 7;
  }
  // "Have To Take Sample = No": no sample stage is pending for this order, so it never shows as overdue.
  const noSample = /^no$/i.test(String(o.sampleRequired || '').trim()) && !o.actual2 && !o.sampleCode;
  if (noSample) psNo = null;
  const testResults = parse_(o.testResultsJson || o.testResults, []);
  const attachmentList = parse_(o.attachmentLinks || o.attachments, []);
  return Object.assign(c, {
    status: status_(o),
    pendingStageNo: psNo,
    pendingPlanned: noSample ? '' : (o.pendingPlanned || (psNo ? o['planned' + psNo] : '')),
    pendingDelay: noSample ? 0 : o.pendingDelay,
    pendingStage: noSample ? 'Sample Not Required' : o.pendingStage || (psNo === 2 ? 'Sample Request' : psNo === 3 ? 'Sample Receive' : psNo === 4 ? 'Test 1' : psNo === 5 ? 'Test 2' : psNo === 6 ? 'Management Action' : psNo === 7 ? 'Approval' : (o.actual4 || o.actual5 ? 'Completed' : '')),
    results: testResults,
    testResults: testResults,
    attachmentList: attachmentList,
    attachments: attachmentList,
    approvalStatus: o.approvalStatus || (o.actual4 ? 'Pending Approval' : ''),
    competitorName: o.competitorName || o.competitor || '',
    competitor: o.competitor || o.competitorName || '',
    orderDate: o.orderDate || o.dateLost || o.timestamp || '',
    dateLost: o.dateLost || o.orderDate || o.timestamp || '',
    timestamp: o.timestamp || '',
    orderNotes: o.orderNotes || o.notes || '',
    notes: o.notes || o.orderNotes || '',
    requestNotes: o.requestNotes || o.sampleNotes || '',
    conditionNotes: o.conditionNotes || '',
    receiveRemarks: o.receiveRemarks || o.remarks || ''
  });
}

// Batched write helper:
// Planned columns are NEVER written by the app (sheet formula / sheet driven).
// Actual N is stamped by script with new Date() only on form submit.
function put_(c, row, parts, stamp, allowId) {
  const fm = c.sh.getRange(row, 1, 1, c.sh.getLastColumn()).getFormulas()[0], vals = {}, arr = arrayCols_(c);
  parts.forEach(p => {
    const fields = Array.isArray(p) ? p[0] : p;
    const opt = Array.isArray(p) ? (p[1] || {}) : {};
    Object.keys(fields || {}).forEach(k => {
      if (k === ID && !allowId && !opt.allowId) return;
      const col = c.m[k];
      if (!col) return warn_('FMS: column "' + k + '" not found, value ignored');
      // Never write into planned/derived/actual columns, a formula cell, or a column filled by an array formula.
      if (isLocked_(k) || isActual_(k) || arr[col] || (fm[col - 1] && fm[col - 1] !== '')) return;
      vals[col] = conv_(fields[k]);
    });
  });
  if (stamp) {
    if (c.m['actual' + stamp]) vals[c.m['actual' + stamp]] = new Date();
    else warn_('FMS: column "Actual ' + stamp + '" not found');
  }
  runs_(vals).forEach(([col, v]) => c.sh.getRange(row, col, 1, v.length).setValues([v]));
  // Keep date / number formats right on the cells just written (e.g. Actual 4 = dd/mm/yyyy hh:mm:ss).
  const byCol = Object.fromEntries(Object.keys(c.m).map(k => [c.m[k], k]));
  formatRow_(c, row, Object.keys(vals).map(col => byCol[col]).filter(Boolean));
}

function next_(c, key, prefix, start, pad) {
  let max = start - 1; const last = c.sh.getLastRow();
  if (c.m[key] && last >= c.dr) {
    c.sh.getRange(c.dr, c.m[key], last - c.hr, 1).getValues().forEach(r => {
      const x = new RegExp('^' + prefix + '(\\d+)$').exec(String(r[0])); if (x) max = Math.max(max, +x[1]);
    });
  }
  return prefix + String(max + 1).padStart(pad, '0');
}

// New FMS row. The sheet owns its formulas:
//  - columns driven by an array formula in the first data row (e.g. Planned 2 = {A6:A}) are never written,
//    otherwise the array can't expand and shows #REF!;
//  - other formula columns copy the previous row's formula;
//  - the app's own formulas are only used for the very first data row.
function newRow_(c) {
  const prev = lastRow_(c), r = prev + 1, arr = arrayCols_(c), byCol = {};
  // Planned columns (Planned 2, 3, 4, 5 ...) belong to the sheet's own formulas: the app never writes them.
  const plannedCol = {};
  Object.keys(c.m).forEach(k => { if (isPlanned_(k)) plannedCol[c.m[k]] = true; });
  if (r > c.sh.getMaxRows()) c.sh.insertRowsAfter(c.sh.getMaxRows(), 100);
  if (prev >= c.dr) {
    // Copy the previous row's formulas in contiguous blocks (one write per block, not one per cell).
    const copy = {};
    c.sh.getRange(prev, 1, 1, c.sh.getLastColumn()).getFormulasR1C1()[0].forEach((f, i) => {
      if (f && !arr[i + 1] && !plannedCol[i + 1]) copy[i + 1] = f;
    });
    runs_(copy).forEach(([col, fs]) => c.sh.getRange(r, col, 1, fs.length).setFormulasR1C1([fs]));
  } else {
    const gen = formulasFor_(c.m, r);
    Object.keys(gen).forEach(k => { if (!arr[c.m[k]] && !isPlanned_(k)) byCol[c.m[k]] = gen[k]; });
    runs_(byCol).forEach(([col, fs]) => c.sh.getRange(r, col, 1, fs.length).setFormulas([fs]));
  }
  formatRow_(c, r);
  return r;
}

// Columns whose first data-row cell holds a spilling/array formula ({A6:A}, ARRAYFORMULA, FILTER, MAP ...).
const ARRAY_RE = /^=\s*\{|ARRAYFORMULA\s*\(|\b(FILTER|MAP|BYROW|SCAN|SORT|UNIQUE|QUERY|SEQUENCE)\s*\(|\$?[A-Z]{1,3}\$?\d+\s*:\s*\$?[A-Z]{1,3}(?![\d$A-Z])/i;
function arrayCols_(c) {
  if (_A) return _A;
  const lc = c.sh.getLastColumn(), out = (_A = {});
  if (!lc) return out;
  c.sh.getRange(c.dr, 1, 1, lc).getFormulas()[0].forEach((f, i) => { if (f && ARRAY_RE.test(f)) out[i + 1] = true; });
  return out;
}

// Number formats: every date/time column = dd/mm/yyyy hh:mm:ss, amount/qty/rate columns = plain number.
const DATE_FMT = 'dd/mm/yyyy hh:mm:ss', NUM_FMT = '#,##0.##';
// Date -> the sheet's serial number (days since 30-Dec-1899), e.g. 09-Apr-1900 -> 100.
const serial_ = d => Math.round(((d.getTime() - new Date(1899, 11, 30).getTime()) / 86400000) * 1e6) / 1e6;
// Number columns: amounts / qty / rate, and every Delay column (Delay 6, Pending Delay, Total Delay).
const NUM_KEYS = ['qty', 'orderValue', 'competitorRate', 'pendingDelay', 'totalDelay'];
const isNum_ = k => NUM_KEYS.indexOf(k) >= 0 || /^delay\d+$/.test(k);
const fmtFor_ = k => (isPlanned_(k) || isActual_(k) || k === 'timestamp' || k === 'pendingPlanned' || /date/i.test(k)) ? DATE_FMT : isNum_(k) ? NUM_FMT : null;
function formatRow_(c, r, keys) {
  const by = {};
  (keys || Object.keys(c.m)).forEach(k => { const f = fmtFor_(k); if (f && c.m[k]) (by[f] = by[f] || []).push(L(c.m[k]) + r); });
  Object.keys(by).forEach(f => c.sh.getRangeList(by[f]).setNumberFormat(f));
}

/* ---------------- users ---------------- */
function usersCtx_() {
  if (_UC) return _UC;
  const sh = sheet(T.users);
  if (!sh) throw new Error('Tab "' + T.users + '" not found in spreadsheet.');
  const { m } = hdr_(sh, 1);
  if (!m.passwordHash && m.password) m.passwordHash = m.password;
  const pw = m.passwordHash ? 'passwordHash' : m.password ? 'password' : null;
  ['id', 'name', 'username', 'isAdmin', 'isActive'].forEach(k => { if (!m[k]) throw new Error('Users tab needs column "' + k + '"'); });
  if (!pw) throw new Error('Users tab needs a "password" (or "passwordHash") column');
  const pk = {}; Object.keys(m).filter(k => /^perm[_A-Z]/.test(k)).forEach(k => { const x = k.replace(/^perm_?/, ''); pk[x[0].toLowerCase() + x.slice(1)] = k; });
  return (_UC = { sh, m, pw, pk });
}
function users_() {
  if (_U) return _U;
  const c = usersCtx_(), last = c.sh.getLastRow();
  if (last < 2) return (_U = []);
  return (_U = c.sh.getRange(2, 1, last - 1, c.sh.getLastColumn()).getValues().map((r, i) => {
    const g = k => c.m[k] ? cell_(r[c.m[k] - 1]) : '', perm = {};
    Object.keys(c.pk).forEach(p => perm[p] = g(c.pk[p]) || 'none');
    return { row: i + 2, id: g('id'), name: g('name'), username: String(g('username')), pw: g(c.pw) || g('password') || g('passwordHash'), isAdmin: bool_(g('isAdmin')), isActive: bool_(g('isActive')), createdAt: g('createdAt'), lastLoginAt: g('lastLoginAt'), perm };
  }).filter(u => u.id));
}
function setUser_(row, vals) {
  const { sh, m } = usersCtx_(), byCol = {};
  Object.keys(vals).forEach(k => { if (m[k]) { let v = vals[k]; if ((k === 'createdAt' || k === 'lastLoginAt') && typeof v === 'string' && v) v = new Date(v); byCol[m[k]] = v == null ? '' : v; } });
  runs_(byCol).forEach(([c, v]) => sh.getRange(row, c, 1, v.length).setValues([v]));
  _U = null;
}
const pub_ = u => ({ id: u.id, name: u.name, username: u.username, isAdmin: u.isAdmin, isActive: u.isActive, createdAt: u.createdAt, lastLoginAt: u.lastLoginAt, permissions: Object.fromEntries(Object.keys(usersCtx_().pk).map(p => [p, u.isAdmin ? 'full' : (u.perm[p] || 'none')])) });
function hash_(pw) {
  const salt = PropertiesService.getScriptProperties().getProperty('PW_SALT') || '';
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + ':' + pw, Utilities.Charset.UTF_8).map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}
// Passwords are stored as plain text. Leading apostrophe forces Sheets to keep it as text
// (so "000123" stays "000123" and "=abc" is not treated as a formula).
const plain_ = pw => "'" + String(pw);
// Accepts plain-text passwords, and also legacy SHA-256 hashes already in the sheet.
const pwOk_ = (stored, pw) => { const s = String(stored == null ? '' : stored); return s === pw || s.trim() === pw || s.trim() === hash_(pw); };
const can_ = (u, pages) => u.isAdmin || pages.some(p => u.perm[p] === 'full');
const need = (u, pages) => { if (!can_(u, pages)) throw new Error('You do not have permission for this action.'); };
const admin_ = u => { if (!u.isAdmin) throw new Error('Admin only.'); };

function login_(p) {
  need_(p, ['username', 'password']);
  const un = String(p.username).trim().toLowerCase(), ch = CacheService.getScriptCache(), fk = 'f_' + un, pw = String(p.password);
  if (+ch.get(fk) >= 5) throw new Error('Too many failed attempts. Try again after 10 minutes.');
  const u = users_().find(x => x.username.toLowerCase() === un);
  if (!u || !u.isActive || !pwOk_(u.pw, pw)) { ch.put(fk, String(+ch.get(fk) + 1), 600); throw new Error('Invalid username or password'); }
  ch.remove(fk); setUser_(u.row, { lastLoginAt: new Date().toISOString() });
  const token = Utilities.getUuid() + Utilities.getUuid(); ch.put('tok_' + token, u.username, 21600);
  return { token, mustChangePassword: pwOk_(u.pw, 'admin123'), snapshot: snapshot_(users_().find(x => x.id === u.id) || u) };
}
function auth_(token) {
  const un = token && CacheService.getScriptCache().get('tok_' + token);
  if (!un) throw new Error(token ? 'Session expired. Please login again.' : 'Not logged in');
  const u = users_().find(x => x.username === un);
  if (!u || !u.isActive) throw new Error('User is inactive');
  return u;
}
function saveUser_(a, p) {
  admin_(a); need_(p, ['name', 'username']);
  const c = usersCtx_(), us = users_(), un = String(p.username).trim();
  if (!/^[A-Za-z0-9._-]{3,30}$/.test(un)) throw new Error('Username: 3-30 letters, numbers, . _ -');
  if (us.some(x => x.username.toLowerCase() === un.toLowerCase() && x.id !== p.id)) throw new Error('Username already exists');
  const ex = p.id ? us.find(x => x.id === p.id) : null;
  if (p.id && !ex) throw new Error('User not found');
  if ((!ex || p.password) && String(p.password || '').length < 6) throw new Error('Password must be at least 6 characters');
  const isAdmin = ex && ex.id === 'usr-admin' ? true : p.isAdmin === true, isActive = p.isActive !== false;
  if (ex && ex.id === 'usr-admin' && un !== 'admin') throw new Error('Default admin username cannot be changed');
  if (ex && ex.id === a.id && (!isActive || !isAdmin)) throw new Error('You cannot deactivate or demote yourself');
  const u = ex || { id: 'usr-' + Date.now().toString(36), createdAt: new Date().toISOString(), lastLoginAt: '', perm: {} };
  Object.assign(u, { name: String(p.name).trim(), username: un, isAdmin, isActive });
  const vals = { id: u.id, name: u.name, username: un, isAdmin, isActive, createdAt: u.createdAt, lastLoginAt: u.lastLoginAt };
  Object.keys(c.pk).forEach(pg => {
    const v = (p.permissions || {})[pg] || u.perm[pg] || 'none';
    if (!['none', 'view', 'full'].includes(v)) throw new Error('Invalid permission for ' + pg);
    vals[c.pk[pg]] = isAdmin ? 'full' : v;
  });
  if (p.password) vals[c.pw] = plain_(p.password);
  if (!us.filter(x => x.id !== u.id).concat([u]).some(x => x.isAdmin && x.isActive)) throw new Error('At least one active admin is required');
  setUser_(ex ? ex.row : c.sh.getLastRow() + 1, vals);
}
function deleteUser_(a, p) {
  admin_(a); need_(p, ['id']);
  const us = users_(), u = us.find(x => x.id === p.id);
  if (!u) throw new Error('User not found');
  if (u.id === a.id || u.id === 'usr-admin') throw new Error('This user cannot be deleted');
  if (!us.some(x => x.id !== u.id && x.isAdmin && x.isActive)) throw new Error('At least one active admin is required');
  usersCtx_().sh.deleteRow(u.row); _U = null;
}
function setPassword_(row, pw) { if (String(pw).length < 6) throw new Error('Password must be at least 6 characters'); setUser_(row, { [usersCtx_().pw]: plain_(pw) }); }

/* ---------------- files ---------------- */
function getUploadFolder_() {
  const fid = FOLDER_ID || PropertiesService.getScriptProperties().getProperty('FOLDER_ID');
  if (fid && String(fid).trim() !== '') {
    try {
      return DriveApp.getFolderById(String(fid).trim());
    } catch (e) {
      warn_('Target Google Drive Folder ID (' + fid + ') error: ' + e.message + '. Falling back to folder by name.');
    }
  }
  const it = DriveApp.getFoldersByName(FOLDER);
  return it.hasNext() ? it.next() : DriveApp.createFolder(FOLDER);
}

function saveFile_(dataUrl, name, prefix) {
  const mm = /^data:([\w\/+.\-]+);base64,(.+)$/.exec(String(dataUrl || ''));
  if (!mm) throw new Error('Invalid file data');
  if (!/^image\//.test(mm[1]) && mm[1] !== 'application/pdf') throw new Error('Only images and PDF files are allowed');
  const bytes = Utilities.base64Decode(mm[2]);
  if (bytes.length > 8 * 1024 * 1024) throw new Error('File too large (max 8 MB)');
  const fo = getUploadFolder_();
  const cleanPrefix = prefix ? String(prefix).replace(/[^\w.\-]+/g, '_') + '_' : '';
  const cleanName = String(name || 'file').replace(/[^\w.\-]+/g, '_');
  const f = fo.createFile(Utilities.newBlob(bytes, mm[1], cleanPrefix + cleanName));
  try {
    f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (e) {
    /* ignore domain permission restrictions */
  }
  return f.getUrl();
}

/* ---------------- snapshot ---------------- */
function snapshot_(u) {
  const c = fms_(), uc = usersCtx_(), any = u.isAdmin || Object.values(u.perm).some(v => v && v !== 'none');
  const last = lastRow_(c), tmpl = last >= c.dr ? c.sh.getRange(last, 1, 1, c.sh.getLastColumn()).getFormulas()[0] : [];
  return {
    user: pub_(u), serverTime: nowIso_(), warnings: _W.slice(),
    cases: any ? readFms_(c).map(toCase_) : [],
    masters: any ? getMasters_() : {},
    users: u.isAdmin ? users_().map(pub_) : [],
    schema: {
      stages: stages_(c.m), pages: Object.keys(uc.pk), masters: Object.fromEntries(Object.entries(blocks_()).map(([n, b]) => [n, b.keys])),
      fms: Object.keys(c.m).sort((a, b) => c.m[a] - c.m[b]).map(k => ({ key: k, label: c.l[k], stage: stageOf_(c.m, c.m[k]), role: isPlanned_(k) ? 'planned' : isActual_(k) ? 'actual' : (isLocked_(k) || tmpl[c.m[k] - 1]) ? 'auto' : 'data' }))
    }
  };
}

/* ---------------- actions ---------------- */
function open_(u, p, page, n, req) {
  need(u, [page]); need_(p, ['caseId'].concat(req || []));
  const c = fms_(), o = findCase_(c, p.caseId), st = stages_(c.m), i = st.indexOf(n);
  if (i > 0 && c.m['actual' + st[i - 1]] && !o['actual' + st[i - 1]]) throw new Error('The previous step is not completed yet');
  if (c.m['actual' + n] && o['actual' + n]) throw new Error('This step is already completed');
  return { c, o };
}
const positive_ = (v, name) => { if (!(Number(v) > 0)) throw new Error(name + ' must be greater than 0'); };
const inList_ = (n, v, name) => { const l = list_(n); if (l.length && !l.includes(v)) throw new Error('Invalid ' + name); };

const ACTIONS = {
  // Step 1: Log Lost Order -> Row 6+, writes Timestamp, Case ID, Customer, Product, Category, Order Value, Competitor, Loss Reason, Order Notes, Date Lost
  addLostOrder(u, p) {
    need(u, ['lostOrders']);
    need_(p, ['customer', 'product', 'category', 'orderValue', 'lossReason', 'orderDate']);
    positive_(p.orderValue, 'Order value');
    // Optional fields from the "Order Not Received" form. Validated when sent;
    // older clients that don't send them keep working.
    const has = v => v !== undefined && v !== null && String(v).trim() !== '';
    if (has(p.qty)) positive_(p.qty, 'Qty');
    if (has(p.competitorRate)) positive_(p.competitorRate, 'Rate');
    if (has(p.fmsName)) {
      const fmsList = list_('fmsNames').map(String);
      if ((fmsList.length ? fmsList : FMS_NAMES).indexOf(String(p.fmsName)) < 0) throw new Error('Invalid FMS name: ' + p.fmsName);
    }
    if (has(p.sampleRequired) && ['Yes', 'No'].indexOf(String(p.sampleRequired)) < 0) throw new Error('Have To Take Sample must be Yes or No');
    const enquiryNo = has(p.enquiryNo) ? String(p.enquiryNo).trim() : '';
    const c = fms_();
    // Block duplicate Enquiry No (reads only the Enquiry No + Case ID columns, before a new row is created).
    if (enquiryNo && c.m.enquiryNo) {
      const last = lastRow_(c);
      if (last >= c.dr) {
        const enq = c.sh.getRange(c.dr, c.m.enquiryNo, last - c.hr, 1).getValues(), ids = c.sh.getRange(c.dr, c.m[ID], last - c.hr, 1).getValues();
        const i = enq.findIndex(r => String(r[0]).trim().toLowerCase() === enquiryNo.toLowerCase());
        if (i >= 0) throw new Error('Enquiry No "' + enquiryNo + '" is already logged as ' + ids[i][0] + '.');
      }
    }
    // New competitor / category typed in the form: added to Masters in the same request.
    let compName = String(p.newCompetitorName || p.competitorName || '').trim();
    if (p.newCompetitorName) {
      try { ACTIONS.saveCompetitor(u, { name: compName }); } catch (e) { if (!/already exists/.test(e.message)) throw e; }
    } else if (p.competitorId) {
      const comp = readBlock_('competitors').find(x => x.id === p.competitorId);
      compName = (comp && (comp.name || comp.value)) || p.competitorId;
    }
    if (!compName) compName = 'Other';
    const cat = String(p.category).trim();
    if (blocks_().categories && list_('categories').map(x => String(x).toLowerCase()).indexOf(cat.toLowerCase()) < 0) {
      const cb = blocks_().categories, ck = pickKey_(cb, ['category', 'name', 'value', 'categories']);
      upsert_('categories', ck, { [ck]: cat });
    }
    const caseId = next_(c, ID, 'LO-', 1001, 0);
    const r = newRow_(c);
    const rec = {
      caseId: caseId,
      timestamp: new Date(),
      customer: p.customer,
      product: p.product,
      category: p.category,
      orderValue: Number(p.orderValue),
      competitor: compName,
      competitorName: compName,
      competitorId: p.competitorId || '',
      lossReason: p.lossReason,
      orderNotes: p.notes !== undefined ? p.notes : (p.orderNotes || ''),
      orderDate: p.orderDate,
      dateLost: p.orderDate,
      enteredBy: u.name
    };
    // Only write new-form fields that were actually sent (missing columns raise a warning, never silently drop data).
    if (enquiryNo) rec.enquiryNo = enquiryNo;
    if (has(p.qty)) rec.qty = Number(p.qty);
    if (has(p.fmsName)) rec.fmsName = String(p.fmsName);
    if (has(p.competitorRate)) rec.competitorRate = Number(p.competitorRate);
    if (has(p.sampleRequired)) rec.sampleRequired = String(p.sampleRequired);
    if (has(p.firmName)) rec.firmName = String(p.firmName).trim();
    // Same value under alternate names: write whichever columns exist, skip the rest quietly.
    [['competitor', 'competitorName'], ['orderDate', 'dateLost']].forEach(g => {
      if (g.some(k => c.m[k])) g.forEach(k => { if (!c.m[k]) delete rec[k]; });
    });
    if (!c.m.orderDate && !c.m.dateLost && c.m.timestamp) { delete rec.orderDate; delete rec.dateLost; } // Timestamp is the loss date
    if (!c.m.competitorId) delete rec.competitorId; // helper column, optional
    if (!c.m.enteredBy) delete rec.enteredBy; // optional column
    put_(c, r, [rec], c.m.actual1 ? 1 : 0, true); // Actual 1 only if the sheet has it; true = allowId
    return { caseId };
  },

  deleteLostOrder(u, p) {
    need(u, ['lostOrders']); need_(p, ['caseId']); const c = fms_(), o = findCase_(c, p.caseId);
    if (o.actual2 && !u.isAdmin) throw new Error('A sample is already requested. Only admin can delete this order.');
    c.sh.deleteRow(o.row);
  },

  // Step 2: Request Sample -> writes Sample Code, Sample Name, Qty Needed, Source Type, Source Location, Responsible Person, Expected Date, Priority, Request Notes, Requested By, Actual 2 (Planned 2 is NEVER overwritten)
  requestSample(u, p) {
    const { c, o } = open_(u, p, 'lostOrders', 2, ['sampleName', 'qtyNeeded', 'sourceType', 'responsiblePerson', 'expectedDate']);
    positive_(p.qtyNeeded, 'Quantity');
    inList_('sourceTypes', p.sourceType, 'source type');
    const sampleCode = o.sampleCode || next_(c, 'sampleCode', 'SMP-', 1, 4);
    const rec = {
      sampleCode: sampleCode,
      sampleName: p.sampleName,
      qtyNeeded: Number(p.qtyNeeded),
      sourceType: p.sourceType,
      sourceLocation: p.sourceLocation || '',
      responsiblePerson: p.responsiblePerson,
      expectedDate: p.expectedDate,
      priority: p.priority || '',
      requestNotes: p.requestNotes !== undefined ? p.requestNotes : (p.notes || ''),
      requestedBy: u.name
    };
    put_(c, o.row, [rec], 2);
  },

  // Step 3: Sample Received -> writes Received By, Received Qty, Condition, Condition Notes, Photo Link, Receive Remarks, Actual 3 (Planned 3 is NEVER overwritten)
  receiveSample(u, p) {
    const { c, o } = open_(u, p, 'samples', 3);
    if (p.received === false) return put_(c, o.row, [{ receiveRemarks: 'NOT RECEIVED: ' + (p.remarks || p.receiveRemarks || '') }]);
    need_(p, ['receivedQty', 'condition']);
    positive_(p.receivedQty, 'Received quantity');
    inList_('conditions', p.condition, 'condition');
    const rec = {
      receivedBy: p.receivedBy || u.name,
      receivedQty: Number(p.receivedQty),
      condition: p.condition,
      conditionNotes: p.conditionNotes || '',
      receiveRemarks: p.receiveRemarks !== undefined ? p.receiveRemarks : (p.remarks || '')
    };
    if (p.photoDataUrl) rec.photoLink = saveFile_(p.photoDataUrl, 'sample.jpg', o.sampleCode || o.caseId);
    put_(c, o.row, [rec], 3);
  },

  // Step 4: Test 1 (Test 1) -> status, date, tested by, lab fields, template results, attachments, Actual 4. Planned 4 is never written.
  saveTest(u, p) { return saveLabTest_(u, p); },

  approveReport(u, p) {
    // Step 5 = Test 2, Step 6 = Management Action, so approval is Step 7.
    const { c, o } = open_(u, p, 'reports', 7, ['approvalStatus']);
    if (!['Approved', 'Revision Requested', 'Pending Approval'].includes(p.approvalStatus)) throw new Error('Invalid approval status');
    const ok = p.approvalStatus === 'Approved';
    put_(c, o.row, [Object.assign(omit_(p, ['caseId']), ok ? { approvedBy: u.name } : {})], ok ? 7 : 0);
  },

  saveTest2(u, p) { return saveLabTest2_(u, p); },
  saveManagement(u, p) { return saveManagement_(u, p); },

  updateCase(u, p) { need(u, ['lostOrders', 'samples', 'testEntry', 'reports']); need_(p, ['caseId']); const c = fms_(); put_(c, findCase_(c, p.caseId).row, [p.fields || {}]); },

  // masters
  saveCompetitor(u, p) {
    need(u, ['lostOrders', 'competitors']); need_(p, ['name']);
    const cb = blocks_().competitors, nameKey = pickKey_(cb, ['name', 'competitor', 'competitorName', 'value']);
    if (readBlock_('competitors').some(x => String(x[nameKey] ?? x.name ?? '').toLowerCase() === String(p.name).trim().toLowerCase() && (!p.id || x.id !== p.id))) throw new Error('Competitor already exists');
    if (cb && !cb.keys.includes('id')) { // block without an ID column: match on the name column
      const nk = pickKey_(cb, ['name', 'competitor', 'competitorName', 'value']);
      upsert_('competitors', nk, onlyKeys_(cb, Object.assign({}, p, { [nk]: String(p.name).trim() })));
      return;
    }
    upsert_('competitors', 'id', onlyKeys_(cb, Object.assign({}, p, { id: p.id || 'comp-' + Date.now().toString(36) })));
  },
  saveCategory(u, p) {
    need(u, ['templates', 'lostOrders']); need_(p, ['category']);
    const cb = blocks_().categories, ck = pickKey_(cb, ['category', 'name', 'value', 'categories']);
    upsert_('categories', ck, onlyKeys_(cb, { [ck]: String(p.category).trim(), description: p.description }));
  },
  saveParameter(u, p) {
    need(u, ['templates']); need_(p, ['category', 'name', 'unit']);
    const mn = +p.minValue, mx = +p.maxValue, sd = +p.ourStandardValue;
    if ([mn, mx, sd].some(isNaN)) throw new Error('Min, max and standard must be numbers');
    if (mn > mx) throw new Error('Min cannot be greater than max');
    upsert_('parameters', 'parameterId', Object.assign({}, p, { parameterId: p.parameterId || 'prm-' + Date.now().toString(36), minValue: mn, maxValue: mx, ourStandardValue: sd, higherIsBetter: p.higherIsBetter !== false }));
    if (blocks_().categories && !list_('categories').includes(p.category)) upsert_('categories', 'category', { category: p.category });
  },
  deleteParameter(u, p) { need(u, ['templates']); need_(p, ['parameterId']); delRow_('parameters', 'parameterId', p.parameterId); },
  saveTat(u, p) { admin_(u); (p.rows || []).forEach(r => { if (isNaN(+r.tatDays) || +r.tatDays < 0) throw new Error('TAT must be 0 or more'); upsert_('tat', 'stage', { stage: +r.stage, tatDays: +r.tatDays, step: r.step }); }); },
  saveHolidays(u, p) { admin_(u); const b = blocks_().holidays, sh = sheet(T.masters); if (b && sh) { sh.getRange(3, b.col, Math.max(sh.getMaxRows() - 2, 1), b.keys.length).clearContent(); mastersChanged_(); _MD = true; (p.rows || []).filter(r => r.date).forEach(r => upsert_('holidays', 'date', { date: r.date, name: r.name || '' })); } },
  saveMasterRow(u, p) { admin_(u); need_(p, ['block', 'matchKey']); upsert_(p.block, p.matchKey, p.record || {}); },
  deleteMasterRow(u, p) { admin_(u); need_(p, ['block', 'matchKey', 'value']); delRow_(p.block, p.matchKey, p.value); },

  // users
  saveUser: saveUser_, deleteUser: deleteUser_,
  resetPassword(u, p) { admin_(u); need_(p, ['id', 'newPassword']); const x = users_().find(v => v.id === p.id); if (!x) throw new Error('User not found'); setPassword_(x.row, p.newPassword); },
  changePassword(u, p) { need_(p, ['oldPassword', 'newPassword']); if (!pwOk_(u.pw, String(p.oldPassword))) throw new Error('Old password is incorrect'); setPassword_(u.row, p.newPassword); },
  uploadFile(u, p) { need_(p, ['dataUrl']); return { url: saveFile_(p.dataUrl, p.name || 'file', p.prefix || 'upload'), name: p.name || 'file' }; },
  getAll() { }
};

/* ---------------- web app ---------------- */
function doGet() { return json_({ ok: true, message: 'Competitor Sample Lab API is running' }); }
function doPost(e) {
  try { return json_({ ok: true, data: route_(JSON.parse(e.postData.contents)) }); }
  catch (err) { return json_({ ok: false, error: String(err && err.message ? err.message : err) }); }
}
// Write actions answer with a small PATCH (only what changed), not the whole sheet:
//  - case actions -> just that case row; deleteLostOrder -> its id; Masters edits -> masters; user edits -> users.
// Reads (getAll / login) return the full snapshot and never take the script lock.
const CASE_ACTIONS = ['addLostOrder', 'requestSample', 'receiveSample', 'saveTest', 'saveTest2', 'saveManagement', 'updateCase', 'approveReport'];
const USER_ACTIONS = ['saveUser', 'deleteUser', 'resetPassword'];
function route_(req) {
  resetCaches_(); _W = [];
  if (!sheet(T.fms) || !sheet(T.users) || !sheet(T.masters)) setup();
  if (req.action === 'login') return login_(req.payload || {});
  const u = auth_(req.token), a = req.action, p = req.payload || {};
  if (a === 'logout') { CacheService.getScriptCache().remove('tok_' + req.token); return { loggedOut: true }; }
  if (!Object.prototype.hasOwnProperty.call(ACTIONS, a)) throw new Error('Unknown action: ' + a);
  if (a === 'getAll') return snapshot_(u);
  const lock = LockService.getScriptLock(); lock.waitLock(25000);
  try {
    const res = ACTIONS[a](u, p) || {};
    SpreadsheetApp.flush(); // let sheet formulas (Planned / pending stage) recalculate before reading the row back
    const me = users_().find(x => x.id === u.id) || u;
    const out = { patch: true, user: pub_(me), serverTime: nowIso_(), warnings: _W.slice() };
    const id = res.caseId || p.caseId;
    if (CASE_ACTIONS.indexOf(a) >= 0 && id) out.cases = [toCase_(findCase_(fms_(), id))];
    if (a === 'deleteLostOrder') out.removedCaseIds = [p.caseId];
    if (_MD) out.masters = getMasters_();
    if (USER_ACTIONS.indexOf(a) >= 0 && me.isAdmin) { _U = null; out.users = users_().map(pub_); }
    return out;
  } finally { lock.releaseLock(); }
}
