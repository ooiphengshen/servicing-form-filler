// Reads ePartner policy-enquiry screenshots (via macOS text recognition)
// and turns them into one client record, with validation notes.
const { execFileSync } = require('child_process');
const path = require('path');
const { match } = require('./funds');

const ROW_TOL = 0.006; // how far apart (fraction of image height) cells on one row can be

function ocr(files) {
  const out = execFileSync('osascript', ['-l', 'JavaScript', path.join(__dirname, 'ocr.jxa.js'), ...files.map(f => path.resolve(f))], { maxBuffer: 50e6 });
  return JSON.parse(out.toString());
}

const norm = s => s.trim().replace(/\s+/g, ' ').toUpperCase();

// Section = items between a header and the next header below it, on the same side of the page.
function section(items, header) {
  const h = items.find(i => norm(i.t) === header);
  if (!h) return null;
  const left = h.x < 0.45;
  const headers = items.filter(i => /^[A-Z][A-Z ()\/&.-]{5,}$/.test(i.t.trim()) && i.t.trim() === i.t.trim().toUpperCase()
    && /DETAILS|INFORMATION|STATUS|VALUES|PAYABLE|PRINTOUT/.test(i.t) && i.y > h.y + ROW_TOL && (i.x < 0.45) === left);
  const end = Math.min(1, ...headers.map(i => i.y));
  return items.filter(i => i.y > h.y + ROW_TOL / 2 && i.y < end - ROW_TOL / 2);
}

// "Label | Value" layout: value is the nearest cell to the right on the same row.
function rowValue(items, label, maxGap = 0.3) {
  const l = items.find(i => norm(i.t) === label.toUpperCase());
  if (!l) return null;
  const right = items.filter(i => i !== l && Math.abs(i.y - l.y) < ROW_TOL && i.x > l.x + l.w - 0.002 && i.x - (l.x + l.w) < maxGap)
    .sort((a, b) => a.x - b.x);
  return right.length ? { value: right[0].t.trim(), cell: right[0] } : null;
}

// Column table: header row on top, row label on the left.
function cellValue(items, rowLabel, colHeader) {
  const r = items.find(i => norm(i.t) === rowLabel.toUpperCase());
  const c = items.filter(i => norm(i.t) === colHeader.toUpperCase()).sort((a, b) => a.y - b.y)[0];
  if (!r || !c) return null;
  const hit = items.find(i => i !== r && Math.abs(i.y - r.y) < ROW_TOL && Math.abs(i.x - c.x) < 0.012);
  return hit ? hit.t.trim() : null;
}

function extract(files) {
  const pages = ocr(files);
  const raw = {}, notes = { errors: [], warnings: [], info: [] };
  for (const p of pages) {
    if (p.error) { notes.errors.push(`Could not read ${path.basename(p.file)}: ${p.error}`); continue; }
    const it = p.items;
    const payer = section(it, 'PAYER DETAILS');
    if (payer) {
      for (const k of ['Title', 'Name', 'ID No', 'ID Type', 'Mobile No', 'Residence Tel', 'Office Tel', 'Email']) {
        const v = rowValue(payer, k, k === 'Name' ? 0.4 : 0.3);
        if (v) raw['payer.' + k] = v.value;
      }
      const a = rowValue(payer, 'Address');
      if (a) {
        const below = payer.filter(i => Math.abs(i.x - a.cell.x) < 0.01 && i.y > a.cell.y + ROW_TOL && i.y < a.cell.y + 0.04).sort((x, y) => x.y - y.y);
        raw['payer.Address'] = [a.value, ...below.map(i => i.t.trim())];
      }
    }
    const fund = section(it, 'ILP FUND DETAILS');
    if (fund) {
      const hdr = h => fund.find(i => norm(i.t).replace(/^\*/, '') === h);
      const fn = hdr('FUND NAME'), pn = hdr('PLAN NAME'), fu = hdr('FUND UNITS'), fv = hdr('FUND VALUE');
      if (pn) raw['fund.plan'] = (fund.find(i => Math.abs(i.x - pn.x) < 0.012 && i.y > pn.y + ROW_TOL) || {}).t;
      // One row per fund: read units and value on the same line as the fund name
      const inCol = (col, row) => col && (fund.find(i => Math.abs(i.x - col.x) < 0.012 && Math.abs(i.y - row.y) < ROW_TOL) || {}).t;
      if (fn) raw['fund.rows'] = fund.filter(i => Math.abs(i.x - fn.x) < 0.012 && i.y > fn.y + ROW_TOL)
        .map(r => ({ name: r.t.trim(), units: inCol(fu, r) || null, value: inCol(fv, r) || null }));
    }
    if (it.some(i => norm(i.t) === 'LIFE ASSURED')) {
      for (const row of ['Proposer', 'Life Assured'])
        for (const col of ['Name', 'Gender', 'ID No', 'DOB', 'Religion']) {
          const v = cellValue(it, row, col);
          if (v) raw[`${row}.${col}`] = v;
        }
    }
    const status = section(it, 'STATUS');
    if (status) { const v = rowValue(status, 'Policy Status'); if (v) raw['policy.status'] = v.value; }
    const sdate = section(it, 'STATUS DATE');
    if (sdate) { const v = rowValue(sdate, 'Policy Issue Date'); if (v) raw['policy.issueDate'] = v.value; }
    // Page header: "Policy Detail Information for P/N: 1234567890 as at DD/MM/YYYY"
    for (const i of it) {
      const m = i.t.match(/P\/N\s*[:.]?\s*([A-Z0-9]{6,12})\b/i);
      if (m) {
        if (raw['policy.no'] && raw['policy.no'] !== m[1]) { notes.errors.push(`Screenshots show two different policy numbers (${raw['policy.no']} / ${m[1]}). Policy No. left blank. Use one policy per run.`); raw['policy.conflict'] = true; }
        raw['policy.no'] = m[1];
      }
    }
  }
  return { raw, ...build(raw, notes) };
}

// ---------- validation: never guess, flag instead ----------
const NRIC = /^(\d{2})(\d{2})(\d{2})-?(\d{2})-?(\d{4})$/;

function pickConsistent(raw, keys, label, notes) {
  const vals = keys.map(k => raw[k]).filter(Boolean);
  if (!vals.length) return null;
  const distinct = [...new Set(vals.map(norm))];
  if (distinct.length > 1) { notes.errors.push(`${label} differs between screens (${distinct.join(' / ')}) — left blank, please check.`); return null; }
  return vals[0].trim();
}

function build(raw, notes) {
  const c = {};
  c.name = pickConsistent(raw, ['Proposer.Name', 'payer.Name', 'Life Assured.Name'], 'Name', notes);
  c.title = raw['payer.Title'] || null;

  const nric = pickConsistent(raw, ['Proposer.ID No', 'payer.ID No', 'Life Assured.ID No'], 'NRIC', notes);
  if (nric) {
    const m = nric.replace(/\s/g, '').match(NRIC);
    if (!m) notes.errors.push(`NRIC "${nric}" is not 12 digits — left blank.`);
    else {
      c.nric = `${m[1]}${m[2]}${m[3]}-${m[4]}-${m[5]}`;
      c.nricGender = (+m[5].slice(-1)) % 2 ? 'M' : 'F';
      c.nricDob = { d: m[3], m: m[2], yy: m[1] };
    }
  }
  if (raw['payer.ID Type'] && !/MALAYSIAN IC/i.test(raw['payer.ID Type'])) notes.warnings.push(`ID type is "${raw['payer.ID Type']}" — check NRIC/passport boxes manually.`);

  const dob = pickConsistent(raw, ['Life Assured.DOB', 'Proposer.DOB'], 'Date of birth', notes);
  if (dob) {
    const m = dob.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) notes.errors.push(`Date of birth "${dob}" not in DD/MM/YYYY — left blank.`);
    else {
      c.dob = { d: m[1], m: m[2], y: m[3] };
      if (c.nricDob && (c.nricDob.d !== m[1] || c.nricDob.m !== m[2] || c.nricDob.yy !== m[3].slice(2)))
        notes.errors.push(`Date of birth ${dob} does not match NRIC ${c.nric} — please check which is wrong.`);
    }
  }

  const g = (raw['Life Assured.Gender'] || raw['Proposer.Gender'] || '').trim().toUpperCase();
  if (g === 'M' || g === 'F') {
    c.gender = g;
    if (c.nricGender && c.nricGender !== g) notes.errors.push(`Gender ${g} does not match NRIC last digit — please check.`);
  } else if (c.nricGender) { c.gender = c.nricGender; notes.info.push(`Gender taken from NRIC last digit (${c.nricGender}).`); }

  const rel = (raw['Life Assured.Religion'] || raw['Proposer.Religion'] || '').toUpperCase();
  c.muslim = rel === 'NON-MUSLIM' ? false : rel === 'MUSLIM' ? true : null;
  if (c.muslim === null) notes.warnings.push('Religion not found — "Are you a Muslim?" left blank.');

  // Phone: accept only a valid Malaysian mobile; prefer Mobile No, fall back to Residence Tel.
  const okMobile = s => /^01\d{8,9}$/.test(s);
  const mob = (raw['payer.Mobile No'] || '').replace(/\D/g, ''), res = (raw['payer.Residence Tel'] || '').replace(/\D/g, '');
  if (okMobile(mob)) c.mobile = mob;
  else if (okMobile(res)) {
    c.mobile = res;
    if (mob) notes.warnings.push(`Mobile No in portal is "${mob}" (not a valid number) — used Residence Tel ${res} instead.`);
  } else if (mob || res) notes.errors.push(`No valid phone number (Mobile "${mob}", Residence "${res}") — left blank.`);
  if (raw['payer.Email'] && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(raw['payer.Email'])) c.email = raw['payer.Email'];

  const addr = raw['payer.Address'];
  if (addr && addr.length) {
    const last = addr[addr.length - 1];
    const m = last.match(/^(.*?)\s*\b(\d{5})\s+(.+)$/);
    if (m) {
      c.address = { lines: [...addr.slice(0, -1), m[1]].filter(Boolean), postcode: m[2], town: m[3] };
      notes.info.push('Address country not shown in portal; assumed MALAYSIA from the 5-digit postcode.');
      c.address.country = 'MALAYSIA';
    } else { c.address = { lines: addr }; notes.warnings.push('Could not find a postcode in the address — postcode/town left blank.'); }
  }

  c.plan = raw['fund.plan'] || null;
  // Screen each portal fund against the PSF33 fund list
  c.funds = (raw['fund.rows'] || []).map(r => {
    const f = match(r.name), num = s => (s && /^\d+(\.\d+)?$/.test(s.replace(/,/g, '')) ? +s.replace(/,/g, '') : null);
    if (!f) notes.warnings.push(`Fund "${r.name}" is not on the PSF33 fund list — handle it manually.`);
    if (r.units && num(r.units) === null) notes.warnings.push(`Units for "${r.name}" unreadable ("${r.units}").`);
    return { name: r.name, code: f ? f.code : null, units: num(r.units), value: num(r.value) };
  });
  c.policyStatus = raw['policy.status'] || null;
  c.policyIssueDate = raw['policy.issueDate'] || null;
  c.policyNo = raw['policy.conflict'] ? null : raw['policy.no'] || null;
  return { client: c, notes };
}

module.exports = { extract, build };
