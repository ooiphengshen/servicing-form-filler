#!/usr/bin/env node
// Nomination Form app: a local window (in Safari) for filling the nomination form.
// Runs only on this Mac (127.0.0.1); client data never leaves the computer.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { extract } = require('./lib/portal');
const { checkDetails } = require('./lib/details');
const nominees = require('./lib/nominees');
const trustees = require('./lib/trustees');
const { ROOT, OUT, FINAL, stamp, logRow, loadAgent, saveDraft, approveDraft } = require('./lib/store');

const PORT = Number((process.argv.find(a => a.startsWith('--port=')) || '').split('=')[1]) || 4580;
const UPLOADS = path.join(ROOT, 'input');

const send = (res, code, body, type = 'application/json') => {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
};
const readJson = req => new Promise((ok, fail) => {
  let b = '';
  req.on('data', c => { b += c; if (b.length > 60e6) req.destroy(); });
  req.on('end', () => { try { ok(JSON.parse(b || '{}')); } catch (e) { fail(new Error('Bad request')); } });
});
const newNotes = () => ({ errors: [], warnings: [], info: [] });

const routes = {
  'GET /': (req, res) => send(res, 200, fs.readFileSync(path.join(ROOT, 'ui', 'nomination.html')), 'text/html; charset=utf-8'),

  'GET /api/agent': (req, res) => {
    const a = loadAgent(newNotes()) || {};
    send(res, 200, { name: a.name || '', code: a.code || '', hasSignature: !!(a.signature && fs.existsSync(path.join(ROOT, a.signature))) });
  },

  // Screenshots → policyholder details (prefill only; the user reviews them on screen)
  'POST /api/extract': async (req, res) => {
    const { images = [] } = await readJson(req);
    if (!images.length) return send(res, 400, { error: 'No screenshots received.' });
    const id = stamp(), files = [];
    images.forEach((im, i) => {
      const ext = (path.extname(im.name || '') || '.png').toLowerCase().replace(/[^.a-z]/g, '');
      const f = path.join(UPLOADS, `${id}-${i + 1}${ext}`);
      fs.writeFileSync(f, Buffer.from(String(im.data).split(',').pop(), 'base64'));
      files.push(f);
    });
    const { client, notes } = extract(files);
    if (!client.name && !client.nric) notes.errors.push('No client name or NRIC found. Use the ePartner policy enquiry page (Insured / Payer Details visible).');
    send(res, 200, { client, notes });
  },

  // Details + nominees → DRAFT PDF and review list. Paused for approval.
  'POST /api/draft': async (req, res) => {
    const body = await readJson(req);
    const notes = newNotes();
    const client = checkDetails(body.details || {}, notes);
    const list = (body.nominees || []).filter(n => Object.values(n).some(v => v && v !== 'same'));
    if (list.length) client.nominees = nominees.validate(list, client, notes).nominees;
    const filled = l => (l || []).filter(x => Object.entries(x).some(([k, v]) => v && v !== 'same' && !['telType', 'idType'].includes(k)));
    const tl = filled(body.trustees), cl = filled(body.consents);
    if (tl.length) client.trustees = trustees.validateTrustees(tl, client, notes);
    if (cl.length) client.consents = trustees.validateConsents(cl, client, notes);
    const agent = loadAgent(notes) || {};
    if (!body.useSignature) delete agent.signature;
    const { base, res: r } = await saveDraft({ id: stamp(), form: 'nomination', client, notes, opts: { agent }, extra: { source: 'app window' } });
    send(res, 200, { base, pdf: `/output/${base}_DRAFT.pdf`, filled: r.filled, blanks: r.blanks, manual: r.manual, ...notes });
  },

  'POST /api/approve': async (req, res) => {
    const { base, acceptBlanks } = await readJson(req);
    const r = approveDraft(base, !!acceptBlanks);
    send(res, 200, { ...r, final: r.final && path.relative(ROOT, r.final) });
  },

  'POST /api/reveal': async (req, res) => {
    execFile('open', [FINAL]);
    send(res, 200, { ok: true });
  },
};

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const route = routes[`${req.method} ${url.pathname}`];
    if (route) return await route(req, res);
    const m = req.method === 'GET' && url.pathname.match(/^\/output\/([\w-]+\.pdf)$/);
    if (m && fs.existsSync(path.join(OUT, m[1]))) return send(res, 200, fs.readFileSync(path.join(OUT, m[1])), 'application/pdf');
    send(res, 404, { error: 'Not found' });
  } catch (e) {
    try { logRow({ id: stamp(), form: 'nomination', ic4: '-', status: 'FAILED: ' + e.message.replace(/,/g, ';'), filled: 0, blanks: 0, errors: 1, warnings: 0, file: '' }); } catch { }
    send(res, 500, { error: e.message });
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`Nomination Form app running at http://localhost:${PORT}  (close this window to stop it)`);
  if (!process.argv.includes('--no-open')) execFile('open', [`http://localhost:${PORT}`]);
});
