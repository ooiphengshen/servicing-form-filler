// PSF33 withdrawal instructions: action (partial / full surrender) and, for partial,
// an amount per fund in RM, units, or ALL units. Checked against what the portal shows.
const { q } = require('./input');
const { FUNDS } = require('./funds');

// "ALL" | "RM200" / "200" | "20U" / "20 units"
function parseAmount(s) {
  const t = String(s || '').trim().toUpperCase().replace(/,/g, '');
  if (t === 'ALL' || t === 'ALL UNITS') return { mode: 'ALL' };
  let m = t.match(/^(\d+(?:\.\d+)?)\s*(U|UNIT|UNITS)$/);
  if (m) return { mode: 'UNITS', amount: +m[1] };
  m = t.match(/^(?:RM\s*)?(\d+(?:\.\d{1,2})?)$/);
  if (m) return { mode: 'RM', amount: +m[1] };
  return null;
}

// --withdraw "F10=ALL;F01=RM200;F02=20U"
function parseSpec(action, withdraw) {
  const funds = String(withdraw || '').split(/[;,]/).map(s => s.trim()).filter(Boolean).map(p => {
    const [code, amt] = p.split('=');
    return { code: (code || '').trim().toUpperCase(), raw: amt };
  });
  return { action: String(action).toLowerCase(), funds };
}

function validate(spec, client, notes) {
  const out = { action: null, funds: [] };
  if (!['partial', 'surrender'].includes(spec.action)) { notes.errors.push(`Action "${spec.action}" must be partial or surrender — section A/C left blank.`); return out; }
  out.action = spec.action;
  if (spec.action === 'surrender') {
    if (spec.funds.length) notes.warnings.push('Full surrender covers all funds; fund amounts given were ignored.');
    return out;
  }
  for (const f of spec.funds) {
    const def = FUNDS.find(x => x.code === f.code);
    const held = client.funds.find(x => x.code === f.code);
    const amt = f.mode ? f : parseAmount(f.raw);
    const tag = `${f.code}${def ? ' ' + def.name : ''}`;
    if (!def) { notes.errors.push(`Fund code "${f.code}" is not on the PSF33 form — skipped.`); continue; }
    if (!held) { notes.errors.push(`${tag}: the portal doesn't show this fund in the policy — skipped.`); continue; }
    if (!amt) { notes.errors.push(`${tag}: amount "${f.raw}" not understood (use 200, RM200, 20U or ALL) — skipped.`); continue; }
    if (amt.mode !== 'ALL' && !(amt.amount > 0)) { notes.errors.push(`${tag}: amount must be more than 0 — skipped.`); continue; }
    if (amt.mode === 'UNITS' && held.units !== null && amt.amount > held.units) { notes.errors.push(`${tag}: ${amt.amount} units requested but only ${held.units} held — skipped.`); continue; }
    if (amt.mode === 'RM' && held.value !== null && amt.amount > held.value) { notes.errors.push(`${tag}: RM${amt.amount} requested but fund value is RM${held.value} — skipped.`); continue; }
    if (amt.mode === 'ALL' && client.funds.filter(x => x.code).length === 1) notes.warnings.push(`${tag}: withdrawing ALL units of the only fund. Check whether a full surrender (section C) is intended instead.`);
    out.funds.push({ code: f.code, name: def.name, mode: amt.mode, amount: amt.amount });
  }
  if (!out.funds.length) notes.errors.push('Partial withdrawal chosen but no valid fund amount given — fund table left blank.');
  return out;
}

async function ask(client) {
  {
    const held = client.funds;
    console.log('\nFunds found in portal:');
    if (!held.length) console.log('  (none — include the ILP FUND DETAILS section in a screenshot)');
    held.forEach(f => console.log(`  ${f.code || '??? '} ${f.name}${f.units !== null ? ` | ${f.units} units` : ''}${f.value !== null ? ` | RM${f.value}` : ''}${f.code ? '' : '  ← not on the form, handle manually'}`));
    const a = await q('PSF33 action: 1 Partial withdrawal  2 Full surrender  (Enter = leave blank): ');
    if (a === '2') return { action: 'surrender', funds: [] };
    if (a !== '1') return null;
    const funds = [];
    for (const f of held.filter(x => x.code)) {
      for (;;) {
        const s = await q(`Withdraw from ${f.code} ${f.name}? Amount in RM (e.g. 200), units (e.g. 20U), ALL, or Enter = none: `);
        if (!s) break;
        const amt = parseAmount(s);
        if (!amt) { console.log('  Not understood. Use 200, 20U or ALL.'); continue; }
        if (amt.mode === 'UNITS' && f.units !== null && amt.amount > f.units) { console.log(`  Only ${f.units} units held.`); continue; }
        if (amt.mode === 'RM' && f.value !== null && amt.amount > f.value) { console.log(`  Fund value is only RM${f.value}.`); continue; }
        funds.push({ code: f.code, ...amt });
        break;
      }
    }
    return { action: 'partial', funds };
  }
}

module.exports = { ask, validate, parseSpec };
