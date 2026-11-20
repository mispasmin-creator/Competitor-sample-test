/**
 * Competitor Sample Lab - Apps Script backend (OPTIMIZED, header-driven)
 * FMS: header row 5 (HR), data from row 6 (DR) | Users: header row 1 | Masters: block title row 1, headers row 2, data from row 3.
 * Add / remove / move columns freely: columns are found by header name ("Case ID" -> caseId, "Planned 1" -> planned1).
 *  - "Planned N" = formula/sheet driven (NEVER written by app).
 *  - "Actual N" = stamped by script (current date-time) on submit.
 *  - Pending status:
 *      Planned 2 filled & Actual 2 empty -> Stage 2 (Request Sample)
 *      Planned 3 filled & Actual 3 empty -> Stage 3 (Sample Received)
 *      Planned 4 filled & Actual 4 empty -> Stage 4 (Test Entry)
 *  - Case-insensitive sheet matching for FMS/Fms, Masters/Master, Users/users.
 *  - Password column stores plain text (legacy SHA-256 hashes are still accepted at login).
 * Setup: run setup() once, then Deploy > Web app (Execute as Me, Access Anyone). After edits: Deploy > Manage > New version.
 */
const T = { fms: 'FMS', users: 'Users', masters: 'Masters' }, ID = 'caseId', HR = 5, DR = 6, FOLDER = 'Competitor Sample Lab Files', FOLDER_ID = '1YUOnNQb5lwDQWHSNnuqM69If0W-NHMqP';
const DERIVED = ['pendingStageNo', 'pendingStage', 'pendingPlanned', 'pendingDelay', 'totalDelay'];
const PAGES = ['dashboard', 'lostOrders', 'samples', 'templates', 'testEntry', 'comparison', 'reports', 'competitors'];
const FMS_HEAD = 'Timestamp|Case ID|Customer|Product|Category|Order Value|Competitor|Loss Reason|Order Notes|Date Lost|Sample Code|Sample Name|Qty Needed|Source Type|Source Location|Responsible Person|Expected Date|Priority|Request Notes|Requested By|Planned 2|Actual 2|Received By|Received Qty|Condition|Condition Notes|Photo Link|Receive Remarks|Planned 3|Actual 3|Tested By|Test Results (JSON)|Pass Count|Fail Count|Overall Result|Attachment Links|Planned 4|Actual 4|Approval Status|Approved By|Manager Comment|Verdict Override|Planned 5|Actual 5|Pending Stage No|Pending Stage|Pending Planned|Pending Delay|Total Delay'.split('|');
const MASTERS = [
  ['Competitors', 'Name'], ['Categories', 'Category'],
  ['Loss Reasons', 'Value', ['Price', 'Quality', 'Delivery', 'Other']], ['Source Types', 'Value', ['Customer', 'Market', 'Dealer', 'Online', 'Other']],
  ['Conditions', 'Value', ['Sealed', 'Opened', 'Damaged', 'Expired']], ['Priorities', 'Value', ['Low', 'Medium', 'High']]
];
let _B = null, _F = null, _UC = null, _U = null, _W = []; // per-execution caches + warnings

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
    .addItem('Check structure', 'checkStructure')
    .addItem('Reset admin password to admin123', 'resetAdminPassword').addToUi();
}

function setup() {
  const pr = PropertiesService.getScriptProperties();
  if (!pr.getProperty('PW_SALT')) pr.setProperty('PW_SALT', Utilities.getUuid() + Utilities.getUuid());
  let f = sheet(T.fms);
  if (!f) { const a = ss().getSheets()[0]; if (ss().getSheets().length === 1 && !a.getLastRow()) { a.setName(T.fms); f = a; } else f = ss().insertSheet(T.fms); }
  const u = sheet(T.users) || ss().insertSheet(T.users), m = sheet(T.masters) || ss().insertSheet(T.masters);
  if (!m.getLastRow()) {
    const flatHeaders = ['Competitor', 'Category', 'Loss Reason', 'Source Type', 'Condition', 'Priority', 'Responsible Person'];
    const sampleRows = [
      ['ABC Hydraulics', 'Hydraulic Check Valves', 'Price', 'Customer', 'Sealed', 'Low', 'Admin'],
      ['XYZ Fluid Controls', 'Directional Valves', 'Quality', 'Market', 'Opened', 'Medium', 'Lab Incharge'],
      ['Bosch Rexroth', 'Proportional Valves', 'Delivery', 'Dealer', 'Damaged', 'High', ''],
      ['Parker Hannifin', 'Cartridge Valves', 'Other', 'Online', 'Expired', '', '']
    ];
    m.getRange(1, 1, 1, flatHeaders.length).setValues([flatHeaders]).setFontWeight('bold');
    m.getRange(2, 1, sampleRows.length, flatHeaders.length).setValues(sampleRows);
  }
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

function resetAdminPassword() {
  const pr = PropertiesService.getScriptProperties();
  if (!pr.getProperty('PW_SALT')) pr.setProperty('PW_SALT', Utilities.getUuid() + Utilities.getUuid());
  const u = users_().find(x => x.username.toLowerCase() === 'admin');
  if (!u) throw new Error('No user "admin" in Users tab.');
  setUser_(u.row, { [usersCtx_().pw]: plain_('admin123'), isActive: true, isAdmin: true });
  try { SpreadsheetApp.getUi().alert('Admin password reset to: admin123'); } catch (e) { /* no UI */ }
}

function checkStructure() {
  _B = _F = _UC = _U = null; const out = [];
  try { const c = fms_(); out.push('FMS header row ' + c.hr + ', data from row ' + c.dr + ' | stages: ' + (stages_(c.m).join(', ') || 'none') + ' | columns: ' + Object.keys(c.m).length); } catch (e) { out.push('FMS problem: ' + e.message); }
  try { out.push('Users permission columns: ' + Object.keys(usersCtx_().pk).join(', ')); } catch (e) { out.push('Users problem: ' + e.message); }
  try { out.push('Masters blocks: ' + Object.keys(blocks_()).join(', ')); } catch (e) { out.push('Masters problem: ' + e.message); }
  SpreadsheetApp.getUi().alert(out.join('\n'));
}

/* ---------------- masters (dynamic blocks) ---------------- */
function blocks_() {
  if (_B) return _B;
  _B = {};
  const sh = sheet(T.masters);
  if (!sh) return _B;
  const lc = sh.getLastColumn();
  if (!lc) return _B;
  const r1 = sh.getRange(1, 1, 1, lc).getValues()[0], r2 = sh.getRange(2, 1, 1, lc).getValues()[0];
  r1.forEach((t, c) => {
    t = String(t).trim(); if (!t) return;
    let w = 0; while (c + w < lc && String(r2[c + w]).trim() !== '' && (!w || String(r1[c + w]).trim() === '')) w++;
    if (w) _B[key_(t)] = { title: t, col: c + 1, keys: r2.slice(c, c + w).map(key_), labels: r2.slice(c, c + w).map(String) };
  });
  return _B;
}

function getMasters_() {
  const result = {
    competitors: [],
    categories: [],
    lossReasons: [],
    sourceTypes: [],
    conditions: [],
    priorities: [],
    parameters: [],
    tat: [],
    holidays: []
  };
  const sh = sheet(T.masters);
  if (!sh) return result;
  const lc = sh.getLastColumn(), lr = sh.getLastRow();
  if (!lc || lr < 1) return result;

  const r1 = sh.getRange(1, 1, 1, lc).getValues()[0];
  const colMap = {};
  r1.forEach((t, i) => {
    const k = key_(t);
    if (k) colMap[k] = i + 1;
  });

  // Check if Row 1 has single-column headers (flat master mode)
  const isFlat = ['competitor', 'competitors', 'lossReason', 'lossReasons', 'sourceType', 'sourceTypes', 'condition', 'conditions', 'priority', 'priorities', 'category', 'categories'].some(k => colMap[k]);

  if (isFlat && lr >= 2) {
    const data = sh.getRange(2, 1, lr - 1, lc).getValues();
    const readCol = (names) => {
      for (let n = 0; n < names.length; n++) {
        const c = colMap[names[n]];
        if (c) {
          const vals = [];
          for (let r = 0; r < data.length; r++) {
            const v = String(data[r][c - 1] || '').trim();
            if (v && !vals.includes(v)) vals.push(v);
          }
          if (vals.length) return vals;
        }
      }
      return [];
    };

    const comps = readCol(['competitor', 'competitors', 'competitorName']);
    if (comps.length) {
      result.competitors = comps.map((name, i) => ({
        id: 'comp-' + (i + 1),
        name: name,
        value: name,
        headquarters: '',
        marketSegment: '',
        website: '',
        notes: ''
      }));
    }

    const cats = readCol(['category', 'categories', 'productCategory']);
    if (cats.length) {
      result.categories = cats.map(cat => ({
        category: cat,
        name: cat,
        value: cat,
        description: ''
      }));
    }

    const reasons = readCol(['lossReason', 'lossReasons', 'reason']);
    if (reasons.length) result.lossReasons = reasons.map(v => ({ value: v, name: v }));

    const sources = readCol(['sourceType', 'sourceTypes', 'source']);
    if (sources.length) result.sourceTypes = sources.map(v => ({ value: v, name: v }));

    const conds = readCol(['condition', 'conditions']);
    if (conds.length) result.conditions = conds.map(v => ({ value: v, name: v }));

    const prios = readCol(['priority', 'priorities']);
    if (prios.length) result.priorities = prios.map(v => ({ value: v, name: v }));

    const resp = readCol(['responsiblePerson', 'responsiblePersons', 'responsible']);
    if (resp.length) result.responsiblePersons = resp.map(v => ({ value: v, name: v }));
  }

  // Also check blocks for any remaining / block-defined masters
  const B = blocks_();
  Object.keys(B).forEach(k => {
    if (!result[k] || !result[k].length) {
      result[k] = readBlock_(k).map(strip_);
    }
  });

  // Parameters: check dedicated sheet 'Parameters' / 'Templates' or block 'parameters'
  const pSh = sheet('Parameters') || sheet('Templates');
  if (pSh && pSh.getLastRow() >= 2) {
    const { m } = hdr_(pSh, 1);
    const pLr = pSh.getLastRow(), pLc = pSh.getLastColumn();
    const rows = pSh.getRange(2, 1, pLr - 1, pLc).getValues();
    result.parameters = rows.map((r, i) => {
      const getVal = (k) => m[k] ? r[m[k] - 1] : '';
      return {
        category: String(getVal('category') || '').trim(),
        parameterId: String(getVal('parameterId') || getVal('id') || ('PRM-' + (i + 1))).trim(),
        name: String(getVal('name') || getVal('parameter') || '').trim(),
        unit: String(getVal('unit') || '').trim(),
        minValue: Number(getVal('minValue') || getVal('min') || 0),
        maxValue: Number(getVal('maxValue') || getVal('max') || 0),
        ourStandardValue: Number(getVal('ourStandardValue') || getVal('standard') || 0),
        higherIsBetter: bool_(getVal('higherIsBetter')),
      };
    }).filter(p => p.name && p.category);
  } else if (!result.parameters.length && B.parameters) {
    result.parameters = readBlock_('parameters').map(strip_);
  }

  // Defaults fallback
  if (!result.lossReasons.length) result.lossReasons = ['Price', 'Quality', 'Delivery', 'Other'].map(v => ({ value: v, name: v }));
  if (!result.sourceTypes.length) result.sourceTypes = ['Customer', 'Market', 'Dealer', 'Online', 'Other'].map(v => ({ value: v, name: v }));
  if (!result.conditions.length) result.conditions = ['Sealed', 'Opened', 'Damaged', 'Expired'].map(v => ({ value: v, name: v }));
  if (!result.priorities.length) result.priorities = ['Low', 'Medium', 'High'].map(v => ({ value: v, name: v }));

  return result;
}

function readBlock_(n) {
  const b = blocks_()[n];
  if (b) {
    const sh = sheet(T.masters);
    if (!sh) return [];
    const last = sh.getLastRow();
    if (last < 3) return [];
    return sh.getRange(3, b.col, last - 2, b.keys.length).getValues().map((r, i) => {
      const o = { _row: 3 + i }; b.keys.forEach((k, j) => o[k] = cell_(r[j])); return o;
    }).filter(o => o[b.keys[0]] !== '');
  }
  const m = getMasters_();
  return m[n] || [];
}
const strip_ = o => omit_(o, ['_row']);
const list_ = n => {
  const m = getMasters_();
  if (m[n] && Array.isArray(m[n]) && m[n].length) {
    return m[n].map(o => typeof o === 'object' && o !== null ? (o.value || o.name || o.category || o.id) : o).filter(Boolean);
  }
  const b = blocks_()[n];
  return b ? readBlock_(n).map(o => o[b.keys[0]]) : [];
};
function upsert_(n, mk, rec) {
  const b = blocks_()[n]; if (!b) throw new Error('Masters block "' + n + '" not found');
  if (!b.keys.includes(mk)) throw new Error('Masters block "' + b.title + '" needs a column "' + mk + '"');
  const sh = sheet(T.masters), rows = readBlock_(n), ex = rows.find(x => String(x[mk]) === String(rec[mk]));
  const r = ex ? ex._row : (rows.length ? Math.max(...rows.map(x => x._row)) + 1 : 3);
  if (r > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), 50);
  const vals = {}; b.keys.forEach((k, i) => { if (rec[k] !== undefined) vals[b.col + i] = conv_(rec[k]); });
  runs_(vals).forEach(([c, v]) => sh.getRange(r, c, 1, v.length).setValues([v]));
  Object.keys(rec).forEach(k => { if (!b.keys.includes(k)) warn_('Masters "' + b.title + '": column "' + k + '" not found, ignored'); });
}
function delRow_(n, mk, v) { const b = blocks_()[n]; if (b) readBlock_(n).filter(x => String(x[mk]) === String(v)).forEach(x => sheet(T.masters).getRange(x._row, b.col, 1, b.keys.length).clearContent()); }

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
          const dateRef = m.dateLost ? L(m.dateLost) + r : (m.orderDate ? L(m.orderDate) + r : '');
          f['planned' + n] = dateRef ? `=IF(${dateRef}="","",WORKDAY.INTL(INT(${dateRef}),IFERROR(INDEX(TAT_DAYS,MATCH(${n},TAT_STAGE,0)),1),11${holRef}))` : (m['actual' + n] ? `=IF(${A(n)}="","",INT(${A(n)}))` : '');
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
  f.pendingStage = `=IF(${PN}<>"",IF(${PN}=2,"Sample Request",IF(${PN}=3,"Sample Receive",IF(${PN}=4,"Test Entry",IF(${PN}=5,"Approval","Stage "&${PN})))),IF(${A(st[st.length - 1])}<>"","Completed",""))`;
  f.totalDelay = '=' + [PD].concat(pendingStages.map(n => `IF(AND(${P(n)}<>"",${A(n)}<>"",INT(${A(n)})>${P(n)}),NETWORKDAYS.INTL(${P(n)},INT(${A(n)}),11${holRef})-1,0)`)).join('+');

  return Object.fromEntries(Object.entries(f).filter(([k]) => m[k]));
}

function fms_() {
  if (_F) return _F;
  const sh = sheet(T.fms);
  if (!sh) throw new Error('Tab "' + T.fms + '" not found in spreadsheet.');
  const hr = findHeaderRow_(sh), dr = hr + 1;
  const { m, l } = hdr_(sh, hr);
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
  _B = _F = null; ensureNames_();
  const c = fms_(), last = lastRow_(c), maxR = c.sh.getMaxRows(), body = Math.max(maxR - c.hr, 1), keys = Object.keys(c.m);
  if (last >= c.dr) {
    const rows = Array.from({ length: last - c.dr + 1 }, (_, i) => formulasFor_(c.m, c.dr + i));
    Object.keys(rows[0] || {}).forEach(k => c.sh.getRange(c.dr, c.m[k], rows.length, 1).setFormulas(rows.map(r => [r[k]])));
  }
  const st = stages_(c.m), lastA = st.length ? c.m['actual' + st[st.length - 1]] : 0;
  keys.forEach(k => {
    const col = c.m[k], h = c.sh.getRange(c.hr, col).setFontWeight('bold').setWrap(true), rg = c.sh.getRange(c.dr, col, body, 1);
    h.setBackground(isPlanned_(k) ? '#B0BEC5' : isActual_(k) ? '#A5D6A7' : (st.length && col > lastA) ? '#E5E7EB' : ['#E5E7EB', '#DCE9ED', '#E1F4EC', '#FDF3DC', '#E3F0F8', '#F3E6F5'][Math.min(stageOf_(c.m, col), 5)]);
    if (isActual_(k) || k === 'timestamp') rg.setNumberFormat('dd-mmm-yyyy hh:mm:ss');
    else if (isPlanned_(k) || k === 'pendingPlanned' || /Date$/.test(k) || k === 'dateLost') rg.setNumberFormat('dd-mmm-yyyy');
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
    if (idx >= 0 && idx < vals.length) o[k] = cell_(vals[idx]);
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
  if (o.status) return o.status;
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
  }
  const testResults = parse_(o.testResultsJson || o.testResults, []);
  const attachmentList = parse_(o.attachmentLinks || o.attachments, []);
  return Object.assign(c, {
    status: status_(o),
    pendingStageNo: psNo,
    pendingPlanned: o.pendingPlanned || (psNo ? o['planned' + psNo] : ''),
    pendingStage: o.pendingStage || (psNo === 2 ? 'Sample Request' : psNo === 3 ? 'Sample Receive' : psNo === 4 ? 'Test Entry' : psNo === 5 ? 'Approval' : (o.actual4 || o.actual5 ? 'Completed' : '')),
    results: testResults,
    testResults: testResults,
    attachmentList: attachmentList,
    attachments: attachmentList,
    approvalStatus: o.approvalStatus || (o.actual4 ? 'Pending Approval' : ''),
    competitorName: o.competitorName || o.competitor || '',
    competitor: o.competitor || o.competitorName || '',
    orderDate: o.orderDate || o.dateLost || '',
    dateLost: o.dateLost || o.orderDate || '',
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
  const fm = c.sh.getRange(row, 1, 1, c.sh.getLastColumn()).getFormulas()[0], vals = {};
  parts.forEach(p => {
    const fields = Array.isArray(p) ? p[0] : p;
    const opt = Array.isArray(p) ? (p[1] || {}) : {};
    Object.keys(fields || {}).forEach(k => {
      if (k === ID && !allowId && !opt.allowId) return;
      const col = c.m[k];
      if (!col) return warn_('FMS: column "' + k + '" not found, value ignored');
      if (isLocked_(k) || isActual_(k) || (fm[col - 1] && fm[col - 1] !== '')) return;
      vals[col] = conv_(fields[k]);
    });
  });
  if (stamp) {
    if (c.m['actual' + stamp]) vals[c.m['actual' + stamp]] = new Date();
    else warn_('FMS: column "Actual ' + stamp + '" not found');
  }
  runs_(vals).forEach(([col, v]) => c.sh.getRange(row, col, 1, v.length).setValues([v]));
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

function newRow_(c) {
  const prev = lastRow_(c), r = prev + 1, gen = formulasFor_(c.m, r), byCol = {};
  Object.keys(gen).forEach(k => byCol[c.m[k]] = gen[k]);
  if (r > c.sh.getMaxRows()) c.sh.insertRowsAfter(c.sh.getMaxRows(), 100);
  if (prev >= c.dr) {
    c.sh.getRange(prev, 1, 1, c.sh.getLastColumn()).getFormulasR1C1()[0].forEach((f, i) => {
      if (f && !byCol[i + 1]) c.sh.getRange(r, i + 1).setFormulaR1C1(f);
    });
  }
  runs_(byCol).forEach(([col, fs]) => c.sh.getRange(r, col, 1, fs.length).setFormulas([fs]));
  return r;
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
  SpreadsheetApp.flush();
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
    let compName = p.competitorName || '';
    if (p.competitorId) {
      const comp = readBlock_('competitors').find(x => x.id === p.competitorId);
      if (comp) compName = comp.name;
      if (!compName) compName = p.competitorId;
    }
    if (!compName) compName = 'Other';
    ensureNames_();
    const c = fms_(), caseId = next_(c, ID, 'LO-', 1001, 0);
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
    put_(c, r, [rec], 1, true); // true = allowId
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

  // Step 4: Test Entry -> writes Tested By, Test Results (JSON), Pass Count, Fail Count, Overall Result, Attachment Links, Actual 4 (Planned 4 is NEVER overwritten)
  saveTest(u, p) {
    const { c, o } = open_(u, p, 'testEntry', 4);
    const params = readBlock_('parameters').filter(x => x.category === o.category);
    if (!params.length) throw new Error('No test parameters for category "' + o.category + '". Add them in Test Templates first.');
    const inp = Object.fromEntries((p.results || []).map(r => [r.parameterId, r]));
    let pass = 0, fail = 0, filled = 0;
    const results = params.map(x => {
      const raw = inp[x.parameterId]; let v = null, ok = null;
      if (raw && raw.measuredValue !== null && raw.measuredValue !== undefined && raw.measuredValue !== '') {
        v = Number(raw.measuredValue);
        if (isNaN(v)) throw new Error('Invalid number for ' + x.name);
      }
      if (v !== null) {
        filled++;
        ok = v >= +x.minValue && v <= +x.maxValue;
        ok ? pass++ : fail++;
      }
      return { parameterId: x.parameterId, name: x.name, unit: x.unit, min: +x.minValue, max: +x.maxValue, standard: +x.ourStandardValue, higherIsBetter: bool_(x.higherIsBetter), measuredValue: v, passed: ok, notes: (raw && raw.notes) || '' };
    });
    if (p.markCompleted && filled < params.length) throw new Error('Enter valid measurements for all ' + params.length + ' parameters before completing.');
    
    const existingRaw = o.attachmentLinks || o.attachments || '';
    const files = parse_(existingRaw, []);
    (p.attachments || []).forEach(a => files.push({ name: a.name, url: saveFile_(a.dataUrl, a.name, o.sampleCode || o.caseId), uploadedAt: nowIso_() }));

    const rec = {
      testedBy: u.name,
      passCount: pass,
      failCount: fail,
      overallResult: p.markCompleted ? (fail ? 'Fail' : 'Pass') : 'In Progress'
    };
    if (c.m.testResultsJson) rec.testResultsJson = results;
    if (c.m.testResults) rec.testResults = results;
    if (!c.m.testResultsJson && !c.m.testResults) rec.testResults = results;

    if (c.m.attachmentLinks) rec.attachmentLinks = files;
    if (c.m.attachments) rec.attachments = files;
    if (!c.m.attachmentLinks && !c.m.attachments) rec.attachments = files;

    put_(c, o.row, [rec], p.markCompleted ? 4 : 0);
  },

  approveReport(u, p) {
    const { c, o } = open_(u, p, 'reports', 5, ['approvalStatus']);
    if (!['Approved', 'Revision Requested', 'Pending Approval'].includes(p.approvalStatus)) throw new Error('Invalid approval status');
    const ok = p.approvalStatus === 'Approved';
    put_(c, o.row, [Object.assign(omit_(p, ['caseId']), ok ? { approvedBy: u.name } : {})], ok ? 5 : 0);
  },

  updateCase(u, p) { need(u, ['lostOrders', 'samples', 'testEntry', 'reports']); need_(p, ['caseId']); const c = fms_(); put_(c, findCase_(c, p.caseId).row, [p.fields || {}]); },

  // masters
  saveCompetitor(u, p) {
    need(u, ['lostOrders', 'competitors']); need_(p, ['name']);
    if (readBlock_('competitors').some(x => String(x.name).toLowerCase() === String(p.name).trim().toLowerCase() && x.id !== p.id)) throw new Error('Competitor already exists');
    upsert_('competitors', 'id', Object.assign({}, p, { id: p.id || 'comp-' + Date.now().toString(36) }));
  },
  saveCategory(u, p) { need(u, ['templates', 'lostOrders']); need_(p, ['category']); upsert_('categories', 'category', { category: String(p.category).trim(), description: p.description }); },
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
  saveHolidays(u, p) { admin_(u); const b = blocks_().holidays, sh = sheet(T.masters); if (b && sh) { sh.getRange(3, b.col, Math.max(sh.getMaxRows() - 2, 1), b.keys.length).clearContent(); (p.rows || []).filter(r => r.date).forEach(r => upsert_('holidays', 'date', { date: r.date, name: r.name || '' })); } },
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
function route_(req) {
  _B = _F = _UC = _U = null; _W = [];
  const lock = LockService.getScriptLock(); lock.waitLock(25000);
  try {
    if (!sheet(T.fms) || !sheet(T.users) || !sheet(T.masters)) setup();
    if (req.action === 'login') return login_(req.payload || {});
    const u = auth_(req.token);
    if (req.action === 'logout') { CacheService.getScriptCache().remove('tok_' + req.token); return { loggedOut: true }; }
    if (!Object.prototype.hasOwnProperty.call(ACTIONS, req.action)) throw new Error('Unknown action: ' + req.action);
    ACTIONS[req.action](u, req.payload || {});
    _B = null;
    return snapshot_(users_().find(x => x.id === u.id) || u);
  } finally { lock.releaseLock(); }
}
