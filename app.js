#!/usr/bin/env node
// Servicing Form Filler
//   node app.js run --form nomination,psf33 [--policy 1234567890] [--status married] [--children 2] [--muslim no] [--ask-nominees | --nominees file.json] [--ask-trustees | --trustees file.json] [--ask-consents | --consents file.json] [--ask-withdrawal | --action partial|surrender --withdraw "F10=ALL;F01=RM200;F02=20U"] screenshot1.png screenshot2.png
//   node app.js approve output/<draft>_DRAFT.pdf [--accept-blanks]
//   node app.js log
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { extract } = require('./lib/portal');
const { FORMS } = require('./lib/forms');
const nominees = require('./lib/nominees');
const trustees = require('./lib/trustees');
const withdrawal = require('./lib/withdrawal');
const input = require('./lib/input');

const { ROOT, LOG_CSV, stamp, tail4, logRow, loadAgent, saveDraft, approveDraft } = require('./lib/store');

const FLAGS = ['no-open', 'accept-blanks', 'ask-nominees', 'ask-withdrawal', 'ask-trustees', 'ask-consents'];  // options that take no value

function parseArgs(argv) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const k = argv[i].slice(2);
      a[k] = !FLAGS.includes(k) && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    } else a._.push(argv[i]);
  }
  return a;
}

async function run(a) {
  const forms = String(a.form || '').split(',').filter(Boolean);
  const shots = a._.slice(1);
  if (!forms.length || forms.some(f => !FORMS[f])) throw new Error(`--form must be one or more of: ${Object.keys(FORMS).join(', ')}`);
  if (!shots.length) throw new Error('Give at least one portal screenshot (PNG/JPG/WEBP/HEIC).');
  for (const s of shots) if (!fs.existsSync(s)) throw new Error(`Screenshot not found: ${s}`);

  const id = stamp();
  console.log(`Run ${id}: reading ${shots.length} screenshot(s)…`);
  const { raw, client, notes } = extract(shots);
  if (a.policy) {
    const p = String(a.policy).replace(/\s/g, '');
    if (!/^[A-Z0-9]{6,12}$/i.test(p)) notes.errors.push(`--policy "${a.policy}" doesn't look like a policy number — left blank.`);
    else if (client.policyNo && client.policyNo !== p) notes.errors.push(`--policy ${p} differs from portal (${client.policyNo}) — left blank.`);
    else client.policyNo = p;
  }
  // Your choices for details the portal doesn't show (nomination form)
  if (a.status) {
    const s = String(a.status).toUpperCase();
    if (['MARRIED', 'SINGLE', 'DIVORCED', 'WIDOWED'].includes(s)) client.maritalStatus = s;
    else notes.errors.push(`--status "${a.status}" must be married, single, divorced or widowed — left blank.`);
  }
  if (a.children !== undefined) {
    const n = Number(a.children);
    if (Number.isInteger(n) && n >= 0 && n <= 20) client.children = n;
    else notes.errors.push(`--children "${a.children}" must be a whole number (0 = no children) — left blank.`);
  }
  if (a.muslim) {
    const m = String(a.muslim).toLowerCase();
    if (m !== 'yes' && m !== 'no') notes.errors.push(`--muslim "${a.muslim}" must be yes or no — kept portal value.`);
    else {
      const chosen = m === 'yes';
      if (client.muslim !== null && client.muslim !== chosen) notes.warnings.push(`Muslim status set to ${m.toUpperCase()} by you, but portal shows ${client.muslim ? 'Muslim' : 'Non-Muslim'}. Please confirm.`);
      client.muslim = chosen;
    }
  }

  // Date printed on the form: today unless --date DD/MM/YYYY is given
  {
    const d = new Date(), p = n => String(n).padStart(2, '0');
    const date = a.date ? String(a.date) : `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
    const m = date.match(/^(\d{2})\/(\d{2})\/(\d{4})$/), dt = m && new Date(+m[3], +m[2] - 1, +m[1]);
    if (dt && dt.getDate() === +m[1] && dt.getMonth() === +m[2] - 1) client.declarationDate = date;
    else notes.errors.push(`--date "${a.date}" is not a valid DD/MM/YYYY date — left blank.`);
  }

  // Nominees: typed in now (--ask-nominees) or from a saved file (--nominees file.json)
  if (forms.includes('nomination')) {
    let list = null;
    if (a['ask-nominees']) {
      list = await nominees.ask(client);
      if (list && list.length) {
        const saved = path.join(ROOT, 'input', 'nominees.json');
        fs.writeFileSync(saved, JSON.stringify(list, null, 2));
        console.log(`\nNominee details saved to input/nominees.json (re-use with --nominees input/nominees.json).`);
      }
    } else if (a.nominees) {
      if (!fs.existsSync(a.nominees)) throw new Error(`Nominee file not found: ${a.nominees}`);
      list = JSON.parse(fs.readFileSync(a.nominees, 'utf8'));
    }
    if (list && list.length) client.nominees = nominees.validate(list, client, notes).nominees;

    // Part 2 trustees (page 4) and Part 3 consent (page 5): typed in now or from a saved file
    for (const [key, ask, check] of [['trustees', trustees.askTrustees, trustees.validateTrustees], ['consents', trustees.askConsents, trustees.validateConsents]]) {
      let l = null;
      if (a['ask-' + key]) {
        l = await ask(client);
        if (l && l.length) fs.writeFileSync(path.join(ROOT, 'input', key + '.json'), JSON.stringify(l, null, 2));
      } else if (a[key]) {
        if (!fs.existsSync(a[key])) throw new Error(`${key} file not found: ${a[key]}`);
        l = JSON.parse(fs.readFileSync(a[key], 'utf8'));
      }
      if (l && l.length) client[key] = check(l, client, notes);
    }
  }

  // PSF33: partial withdrawal / surrender instructions
  if (forms.includes('psf33')) {
    let spec = null;
    if (a['ask-withdrawal']) spec = await withdrawal.ask(client);
    else if (a.action) spec = withdrawal.parseSpec(a.action, a.withdraw);
    if (spec) client.withdrawal = withdrawal.validate(spec, client, notes);
  }
  input.close();

  if (!client.name && !client.nric) throw new Error('No client name or NRIC found in the screenshots. Use the ePartner policy enquiry page (Payer Details / Insured section visible).');

  // Servicing agent, printed as witness by default (edit agent.json to change)
  a.agent = loadAgent(notes);

  for (const form of forms) {
    const { draft, review } = await saveDraft({ id, form, client, notes, opts: a, extra: { screenshots: shots.map(s => path.resolve(s)), raw } });
    console.log('\n' + review + '\n');
    if (!a['no-open']) try { execFileSync('open', [draft]); } catch { }
  }
  console.log('Paused for your approval. Nothing has been sent or submitted.');
}

function approve(a) {
  const draft = a._[1];
  if (!draft || !fs.existsSync(draft) || !/_DRAFT\.pdf$/.test(draft)) throw new Error('Usage: node app.js approve output/<name>_DRAFT.pdf');
  const base = path.basename(draft).replace(/_DRAFT\.pdf$/, '');
  const r = approveDraft(base, a['accept-blanks']);
  if (!r.ok) {
    console.log(`${r.message} (see ${base}_REVIEW.txt).`);
    console.log('Either re-run with the missing info (e.g. --policy), or approve with --accept-blanks if you will fill them by hand.');
    process.exitCode = 1; return;
  }
  console.log(`${r.message}\nPrint, get it signed, and submit as usual.`);
}

function showLog() {
  if (!fs.existsSync(LOG_CSV)) return console.log('No runs yet.');
  console.log(fs.readFileSync(LOG_CSV, 'utf8').trim().split('\n').slice(-20).map(l => l.split(',').join('  |  ')).join('\n'));
}

(async () => {
  const a = parseArgs(process.argv.slice(2));
  try {
    if (a._[0] === 'run') await run(a);
    else if (a._[0] === 'approve') approve(a);
    else if (a._[0] === 'log') showLog();
    else console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 6).join('\n').replace(/\/\/ ?/g, ''));
  } catch (e) {
    console.error('Error: ' + e.message);
    try { logRow({ id: stamp(), form: a.form || '-', ic4: '-', status: 'FAILED: ' + e.message.replace(/,/g, ';'), filled: 0, blanks: 0, errors: 1, warnings: 0, file: '' }); } catch { }
    process.exitCode = 1;
  }
})();
