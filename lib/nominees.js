// Nominee details: asked one by one until shares reach 100% (max 4, as on the form),
// then validated. Bad values are flagged and left blank, never guessed.
const { q } = require('./input');

const MAX = 4;
const RELATIONSHIPS = ['HUSBAND', 'WIFE', 'SON', 'DAUGHTER', 'FATHER', 'MOTHER', 'BROTHER', 'SISTER', 'OTHERS'];
const NRIC = /^(\d{2})(\d{2})(\d{2})(\d{2})(\d{4})$/;

function dobFromNric(ic) {
  const m = ic.match(NRIC);
  const yy = +m[1], nowYY = new Date().getFullYear() % 100;
  return `${m[3]}/${m[2]}/${yy <= nowYY ? 2000 + yy : 1900 + yy}`;
}

// Shared by interactive input and nominees.json
function validate(list, client, notes) {
  const out = [];
  let total = 0;
  if (list.length > MAX) notes.errors.push(`The form has room for ${MAX} nominees; ${list.length} given. Only the first ${MAX} are filled.`);
  list.slice(0, MAX).forEach((n, i) => {
    const tag = `Nominee ${i + 1}`, v = {};
    const name = (n.name || '').trim().toUpperCase().replace(/\s+/g, ' ');
    if (/^[A-Z@'.\/ -]{2,84}$/.test(name)) v.name = name; else notes.errors.push(`${tag}: name "${n.name || ''}" missing or invalid — left blank.`);

    const ic = (n.nric || '').replace(/\D/g, '');
    if (NRIC.test(ic)) {
      v.nric = ic;
      v.gender = (+ic.slice(-1)) % 2 ? 'M' : 'F';
      const fromIc = dobFromNric(ic);
      if (!n.dob) { v.dob = fromIc; notes.info.push(`${tag}: date of birth taken from NRIC (${fromIc}).`); }
      else if (n.dob !== fromIc) notes.errors.push(`${tag}: date of birth ${n.dob} does not match NRIC ${ic} — DOB left blank.`);
      else v.dob = n.dob;
    } else notes.errors.push(`${tag}: NRIC "${n.nric || ''}" is not 12 digits — NRIC, gender and DOB left blank.`);

    if (n.nationality) {
      const nat = String(n.nationality).trim().toUpperCase();
      if (nat === 'MALAYSIAN' || nat === 'MALAYSIA') v.nationality = 'MALAYSIAN';
      else if (nat.length <= 16) v.nationality = nat;
      else notes.errors.push(`${tag}: nationality "${nat}" is longer than the 16 boxes — left blank.`);
    }

    if (n.relationship) {
      const r = String(n.relationship).toUpperCase();
      if (RELATIONSHIPS.includes(r)) v.relationship = r; else { v.relationship = 'OTHERS'; v.relationshipOther = r.slice(0, 12); }
    }

    let addr = n.address;
    if (!addr) notes.warnings.push(`${tag}: mailing address not chosen — left blank.`);
    if (addr === 'same') {
      addr = client.address;
      if (!addr || !addr.postcode) { notes.errors.push(`${tag}: "same as policyholder" chosen but policyholder address not found — address left blank.`); addr = null; }
    }
    if (addr) {
      const lines = wrapAddress(addr.lines || []);
      if (!lines) notes.errors.push(`${tag}: address too long for the 3 lines on the form — address left blank.`);
      else if (!/^\d{5}$/.test(addr.postcode || '')) notes.errors.push(`${tag}: postcode "${addr.postcode || ''}" is not 5 digits — address left blank.`);
      else v.address = { lines, postcode: addr.postcode, town: (addr.town || '').toUpperCase().slice(0, 25), country: (addr.country || 'MALAYSIA').toUpperCase().slice(0, 10) };
    }

    const p = Number(n.percent);
    if (!(p > 0 && p <= 100)) notes.errors.push(`${tag}: share "${n.percent}" must be between 1 and 100 — left blank.`);
    else { v.percent = p; total += p; }
    out.push(v);
  });
  if (out.length && Math.abs(total - 100) > 0.001) notes.errors.push(`Nominee shares add up to ${total}%, not 100%. Please correct before submitting.`);
  return { nominees: out, total };
}

// Form gives 3 lines x 32 boxes. Keep the client's own line breaks where they fit.
function wrapAddress(src) {
  const wrap = s => s.split(/\s+/).filter(Boolean).reduce((ls, w) => {
    const last = ls[ls.length - 1];
    if (last !== undefined && (last + ' ' + w).length <= 32) ls[ls.length - 1] = last + ' ' + w; else ls.push(w);
    return ls;
  }, []);
  const clean = src.map(l => l.trim().toUpperCase()).filter(Boolean);
  const lines = clean.length <= 3 && clean.every(l => l.length <= 32) ? clean : wrap(clean.join(' '));
  return lines.length <= 3 && lines.every(l => l.length <= 32) ? lines : null;
}

async function ask(client) {
  const list = [];
  {
    if (!/^y/i.test(await q('\nAdd nominee details now? (y/n): '))) return null;
    let total = 0;
    while (total < 100 && list.length < MAX) {
      const n = {}, left = 100 - total;
      console.log(`\n— Nominee ${list.length + 1} (remaining share: ${left}%) —`);
      n.name = await q('Full name as per NRIC: ');
      for (;;) {
        n.nric = (await q('NRIC (12 digits): ')).replace(/\D/g, '');
        if (NRIC.test(n.nric)) break;
        console.log('  Must be 12 digits, e.g. 900101075123. Try again.');
      }
      for (;;) {
        const d = await q(`Date of birth DD/MM/YYYY (Enter = ${dobFromNric(n.nric)} from NRIC): `);
        if (!d) break;
        if (d === dobFromNric(n.nric)) { n.dob = d; break; }
        console.log(`  Doesn't match the NRIC (${dobFromNric(n.nric)}). Check the NRIC or DOB.`);
      }
      for (;;) {
        const nat = await q('Nationality: 1 Malaysian  2 Others (Enter = skip): ');
        if (!nat) break;
        if (nat === '1') { n.nationality = 'MALAYSIAN'; break; }
        if (nat === '2') {
          for (;;) {
            const o = await q('  Please state nationality: ');
            if (o && o.length <= 16) { n.nationality = o; break; }
            console.log('  Enter a nationality of up to 16 letters.');
          }
          break;
        }
        console.log('  Enter 1, 2 or press Enter.');
      }
      const r = await q('Relationship: 1 Husband 2 Wife 3 Son 4 Daughter 5 Father 6 Mother 7 Brother 8 Sister 9 Others (Enter = skip): ');
      if (/^[1-8]$/.test(r)) n.relationship = RELATIONSHIPS[+r - 1];
      else if (r === '9') n.relationship = (await q('  Please state relationship: ')) || 'OTHERS';

      const same = client.address && client.address.postcode
        ? await q(`Address: 1 Same as policyholder (${[...client.address.lines, client.address.postcode, client.address.town].join(', ')})  2 New address: `) : '2';
      if (same === '1') n.address = 'same';
      else {
        const lines = [];
        for (let i = 1; i <= 3; i++) { const l = await q(`  Address line ${i}${i > 1 ? ' (Enter = none)' : ''}: `); if (!l) break; lines.push(l); }
        let pc;
        for (;;) { pc = await q('  Postcode (5 digits): '); if (/^\d{5}$/.test(pc)) break; console.log('  Must be 5 digits.'); }
        n.address = { lines, postcode: pc, town: await q('  Town: '), country: (await q('  Country (Enter = MALAYSIA): ')) || 'MALAYSIA' };
      }
      for (;;) {
        const p = Number(await q(`Share % (1–${left}): `));
        if (p > 0 && p <= left) { n.percent = p; break; }
        console.log(`  Enter a number from 1 to ${left}.`);
      }
      list.push(n); total += n.percent;
      if (total < 100 && list.length < MAX) console.log(`Total so far ${total}%. A further nominee is needed to reach 100%.`);
    }
    if (total < 100) console.log(`Form only has ${MAX} nominee sections; total is ${total}%.`);
  }
  return list;
}

module.exports = { ask, validate, wrapAddress, dobFromNric, RELATIONSHIPS };
