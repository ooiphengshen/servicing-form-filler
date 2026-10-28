// Part 2 trustees (page 4, max 2) and Part 3 consent of existing nominees/trustees (page 5, max 4).
// Same rule as nominees: bad values are flagged and left blank, never guessed.
const { q } = require('./input');
const { wrapAddress, dobFromNric } = require('./nominees');

const MAX_TRUSTEES = 2, MAX_CONSENTS = 4;
const NRIC = /^\d{12}$/;
const validDate = s => {
  const m = String(s || '').trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/), dt = m && new Date(+m[3], +m[2] - 1, +m[1]);
  return dt && dt.getDate() === +m[1] && dt.getMonth() === +m[2] - 1 ? m[0] : null;
};
const cleanName = s => (s || '').trim().toUpperCase().replace(/\s+/g, ' ');
const NAME = /^[A-Z@'.\/ -]{2,84}$/;

function country(v, tag, what, notes) {
  if (!v) return undefined;
  const s = String(v).trim().toUpperCase();
  if (s === 'MALAYSIAN' || s === 'MALAYSIA') return 'MALAYSIAN';
  if (s.length <= 21) return s;
  notes.errors.push(`${tag}: ${what} "${s}" is longer than the 21 boxes — left blank.`);
}

function validateTrustees(list, client, notes) {
  const out = [];
  if (list.length > MAX_TRUSTEES) notes.errors.push(`The form has room for ${MAX_TRUSTEES} trustees; ${list.length} given. Only the first ${MAX_TRUSTEES} are filled.`);
  list.slice(0, MAX_TRUSTEES).forEach((t, i) => {
    const tag = `Trustee ${i + 1}`, v = {};
    const name = cleanName(t.name);
    if (NAME.test(name)) v.name = name; else notes.errors.push(`${tag}: name "${t.name || ''}" missing or invalid — left blank.`);

    if (t.passport) {
      const p = String(t.passport).replace(/\s/g, '').toUpperCase();
      if (/^[A-Z0-9]{5,12}$/.test(p)) v.id = p; else notes.errors.push(`${tag}: passport no. "${t.passport}" invalid — left blank.`);
      if (t.passportExpiry) { v.passportExpiry = validDate(t.passportExpiry); if (!v.passportExpiry) notes.errors.push(`${tag}: passport expiry "${t.passportExpiry}" is not a valid DD/MM/YYYY date — left blank.`); }
      else notes.warnings.push(`${tag}: passport expiry date not given — left blank.`);
      if (t.gender === 'M' || t.gender === 'F') v.gender = t.gender; else notes.warnings.push(`${tag}: gender not chosen — left blank.`);
      if (t.dob) { v.dob = validDate(t.dob); if (!v.dob) notes.errors.push(`${tag}: date of birth "${t.dob}" is not a valid DD/MM/YYYY date — left blank.`); }
      else notes.warnings.push(`${tag}: date of birth not given — left blank.`);
    } else {
      const ic = (t.nric || '').replace(/\D/g, '');
      if (NRIC.test(ic)) {
        v.id = ic; v.gender = (+ic.slice(-1)) % 2 ? 'M' : 'F';
        const fromIc = dobFromNric(ic);
        if (t.dob && t.dob !== fromIc) notes.errors.push(`${tag}: date of birth ${t.dob} does not match NRIC ${ic} — DOB left blank.`);
        else v.dob = fromIc;
        if (client.nric && ic === client.nric.replace(/\D/g, '')) { notes.errors.push(`${tag} has the policyholder's NRIC. The policyholder cannot be their own trustee (form note) — trustee left blank.`); return out.push({}); }
      } else notes.errors.push(`${tag}: NRIC "${t.nric || ''}" is not 12 digits — NRIC, gender and DOB left blank.`);
    }

    v.nationality = country(t.nationality, tag, 'nationality', notes);
    v.countryOfBirth = country(t.countryOfBirth, tag, 'country of birth', notes);
    if (!v.nationality) notes.warnings.push(`${tag}: nationality not chosen — left blank.`);
    if (!v.countryOfBirth) notes.warnings.push(`${tag}: country of birth not chosen — left blank.`);

    // Tel: "+ [number with country code]  Country [name]". Local 01x numbers become +60.
    const tel = String(t.tel || '').replace(/[\s-]/g, '');
    if (!tel) notes.warnings.push(`${tag}: tel no. not given — left blank.`);
    else if (/^01\d{8,9}$/.test(tel)) { v.tel = '6' + tel; v.telCountry = 'MALAYSIA'; }
    else if (/^\+?[1-9]\d{6,11}$/.test(tel)) { v.tel = tel.replace('+', ''); v.telCountry = String(t.telCountry || '').trim().toUpperCase().slice(0, 8) || undefined; if (!v.telCountry) notes.warnings.push(`${tag}: tel country not given — left blank.`); }
    else notes.errors.push(`${tag}: tel no. "${t.tel}" is not a valid number (e.g. 0123456789) — left blank.`);
    if (v.tel) v.telType = ['HOUSE', 'HANDPHONE', 'OFFICE'].includes(t.telType) ? t.telType : 'HANDPHONE';

    let addr = t.address;
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
    out.push(v);
  });
  return out;
}

// Consent: name, NRIC/passport and signature date (defaults to the form date) of each existing nominee/trustee.
function validateConsents(list, client, notes) {
  const out = [];
  if (list.length > MAX_CONSENTS) notes.errors.push(`Part 3 has room for ${MAX_CONSENTS} consents; ${list.length} given. Only the first ${MAX_CONSENTS} are filled.`);
  list.slice(0, MAX_CONSENTS).forEach((c, i) => {
    const tag = `Consent ${i + 1}`, v = {};
    const name = cleanName(c.name);
    if (NAME.test(name)) v.name = name; else notes.errors.push(`${tag}: name "${c.name || ''}" missing or invalid — left blank.`);
    const id = String(c.nric || '').replace(/[\s-]/g, '').toUpperCase();
    if (NRIC.test(id) || /^[A-Z][A-Z0-9]{4,11}$/.test(id)) v.id = id; else notes.errors.push(`${tag}: NRIC/passport "${c.nric || ''}" invalid — left blank.`);
    const date = c.date || client.declarationDate;
    v.date = validDate(date);
    if (!v.date) notes.errors.push(`${tag}: signature date "${date || ''}" is not a valid DD/MM/YYYY date — left blank.`);
    else if (!c.date) notes.info.push(`${tag}: signature date set to the form date (${v.date}). Change it if they sign on another day.`);
    out.push(v);
  });
  return out;
}

async function askAddress(client) {
  const same = client.address && client.address.postcode
    ? await q(`  Address: 1 Same as policyholder (${[...client.address.lines, client.address.postcode, client.address.town].join(', ')})  2 New address: `) : '2';
  if (same === '1') return 'same';
  const lines = [];
  for (let i = 1; i <= 3; i++) { const l = await q(`  Address line ${i}${i > 1 ? ' (Enter = none)' : ''}: `); if (!l) break; lines.push(l); }
  let pc;
  for (;;) { pc = await q('  Postcode (5 digits): '); if (/^\d{5}$/.test(pc)) break; console.log('  Must be 5 digits.'); }
  return { lines, postcode: pc, town: await q('  Town: '), country: (await q('  Country (Enter = MALAYSIA): ')) || 'MALAYSIA' };
}

async function askCountry(label) {
  const a = await q(`  ${label}: 1 Malaysian  2 Others (Enter = skip): `);
  if (a === '1') return 'MALAYSIAN';
  if (a === '2') return await q('    Please state: ');
}

async function askTrustees(client) {
  if (!/^y/i.test(await q('\nAppoint trustees (Part 2, page 4)? (y/n): '))) return null;
  const list = [];
  while (list.length < MAX_TRUSTEES) {
    const t = {};
    console.log(`\n— Trustee ${list.length + 1} —`);
    t.name = await q('  Full name as per NRIC/passport: ');
    const id = await q('  NRIC (12 digits), or P for passport: ');
    if (/^p$/i.test(id)) {
      t.passport = await q('  Passport no.: ');
      t.passportExpiry = await q('  Passport expiry DD/MM/YYYY: ');
      t.gender = (await q('  Gender M/F: ')).toUpperCase();
      t.dob = await q('  Date of birth DD/MM/YYYY: ');
    } else t.nric = id;
    t.nationality = await askCountry('Nationality');
    t.countryOfBirth = await askCountry('Country of birth');
    t.tel = await q('  Tel no. (e.g. 0123456789): ');
    const ty = await q('  Tel type: 1 House  2 Handphone  3 Office (Enter = Handphone): ');
    t.telType = ['HOUSE', 'HANDPHONE', 'OFFICE'][(+ty || 2) - 1];
    t.address = await askAddress(client);
    list.push(t);
    if (list.length < MAX_TRUSTEES && !/^y/i.test(await q('Add another trustee? (y/n): '))) break;
  }
  return list;
}

async function askConsents(client) {
  if (!/^y/i.test(await q('\nPart 3 consent of existing nominees/trustees (page 5)? (y/n): '))) return null;
  const list = [];
  while (list.length < MAX_CONSENTS) {
    console.log(`\n— Consent ${list.length + 1} —`);
    const c = { name: await q('  Full name as per NRIC/passport: '), nric: await q('  NRIC / passport no.: ') };
    const d = await q(`  Signature date DD/MM/YYYY (Enter = ${client.declarationDate || 'form date'}): `);
    if (d) c.date = d;
    list.push(c);
    if (list.length < MAX_CONSENTS && !/^y/i.test(await q('Add another? (y/n): '))) break;
  }
  return list;
}

module.exports = { validateTrustees, validateConsents, askTrustees, askConsents, MAX_TRUSTEES, MAX_CONSENTS };
