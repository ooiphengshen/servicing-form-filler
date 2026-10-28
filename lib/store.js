// Drafts, approvals and the run log, shared by the command line (app.js) and the app window (server.js).
const fs = require('fs');
const path = require('path');
const { FORMS } = require('./forms');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'output'), FINAL = path.join(OUT, 'approved'), LOGS = path.join(ROOT, 'logs');
const LOG_CSV = path.join(LOGS, 'runs.csv');
[OUT, FINAL, LOGS].forEach(d => fs.mkdirSync(d, { recursive: true }));

const stamp = () => {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};
const tail4 = nric => (nric || 'XXXX').replace(/\D/g, '').slice(-4) || 'XXXX';

function logRow(r) {
  if (!fs.existsSync(LOG_CSV)) fs.writeFileSync(LOG_CSV, 'time,run_id,form,client_ic_last4,status,filled,blanks,errors,warnings,file\n');
  const d = new Date(), p = n => String(n).padStart(2, '0');
  const time = `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  fs.appendFileSync(LOG_CSV, [time, r.id, r.form, r.ic4, r.status, r.filled, r.blanks, r.errors, r.warnings, path.basename(r.file || '')].join(',') + '\n');
}

function loadAgent(notes) {
  const f = path.join(ROOT, 'agent.json');
  const agent = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
  if (!agent) notes.warnings.push('agent.json not found — witness/agent fields left blank.');
  return agent;
}

function reviewText(form, notes, res, draft) {
  const L = [];
  L.push(`REVIEW: ${FORMS[form].title}`, `Draft: ${path.relative(ROOT, draft)}`, '');
  L.push(`FILLED (${res.filled.length}). Check each against the portal:`);
  res.filled.forEach(([k, v]) => L.push(`  ✓ ${k}: ${v}`));
  if (notes.errors.length) { L.push('', 'PROBLEMS IN SOURCE DATA (field left blank):'); notes.errors.forEach(e => L.push('  ✗ ' + e)); }
  if (res.blanks.length) { L.push('', 'NEEDED BUT MISSING (left blank):'); res.blanks.forEach(b => L.push('  ! ' + b)); }
  if (notes.warnings.length || notes.info.length) { L.push('', 'NOTES:'); [...notes.warnings, ...notes.info].forEach(w => L.push('  • ' + w)); }
  L.push('', 'STAYS MANUAL:'); res.manual.forEach(m => L.push('  – ' + m));
  L.push('', res.blanks.length || notes.errors.length
    ? `To approve anyway (you'll hand-fill the blanks): node app.js approve "${path.relative(ROOT, draft)}" --accept-blanks`
    : `If everything is correct: node app.js approve "${path.relative(ROOT, draft)}"`);
  return L.join('\n');
}

// Fill one form, save DRAFT + REVIEW + run details, log it. Nothing is final until approveDraft().
async function saveDraft({ id, form, client, notes, opts, extra = {} }) {
  const base = `${id}_${form}_${tail4(client.nric)}`;
  const draft = path.join(OUT, `${base}_DRAFT.pdf`);
  const res = await FORMS[form].fill(client, opts);
  fs.writeFileSync(draft, res.bytes);
  const review = reviewText(form, notes, res, draft);
  fs.writeFileSync(path.join(OUT, `${base}_REVIEW.txt`), review + '\n');
  fs.writeFileSync(path.join(LOGS, `${base}.json`), JSON.stringify({ id, form, ...extra, client, notes, filled: res.filled, blanks: res.blanks, manual: res.manual, status: 'AWAITING_APPROVAL' }, null, 2));
  logRow({ id, form, ic4: tail4(client.nric), status: 'DRAFT', filled: res.filled.length, blanks: res.blanks.length, errors: notes.errors.length, warnings: notes.warnings.length, file: draft });
  return { base, draft, review, res };
}

function approveDraft(base, acceptBlanks) {
  if (!/^[\w-]+$/.test(base)) throw new Error('Invalid draft name.');
  const draft = path.join(OUT, `${base}_DRAFT.pdf`), metaFile = path.join(LOGS, `${base}.json`);
  if (!fs.existsSync(draft) || !fs.existsSync(metaFile)) throw new Error(`Draft ${base} not found.`);
  const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
  const issues = meta.blanks.length + meta.notes.errors.length;
  if (issues && !acceptBlanks) return { ok: false, issues, message: `Not approved: ${issues} field(s) are blank or flagged.` };
  const final = path.join(FINAL, `${base}.pdf`);
  fs.copyFileSync(draft, final);  // copies the draft as it is now, including any edits made in Preview
  meta.status = 'APPROVED'; meta.approvedAt = new Date().toISOString(); meta.acceptedBlanks = !!issues;
  fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2));
  logRow({ id: meta.id, form: meta.form, ic4: tail4(meta.client.nric), status: issues ? 'APPROVED_WITH_BLANKS' : 'APPROVED', filled: meta.filled.length, blanks: meta.blanks.length, errors: meta.notes.errors.length, warnings: meta.notes.warnings.length, file: final });
  return { ok: true, final, message: `Approved → ${path.relative(ROOT, final)}` };
}

module.exports = { ROOT, OUT, FINAL, LOGS, LOG_CSV, stamp, tail4, logRow, loadAgent, saveDraft, approveDraft };
