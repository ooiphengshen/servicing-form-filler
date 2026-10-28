// Checks policyholder details typed (or corrected) in the app window. Same rules as the screenshot reader:
// bad values are flagged and left blank, never guessed.
function checkDetails(d, notes) {
  const c = { funds: [] };
  const name = (d.name || '').trim().toUpperCase().replace(/\s+/g, ' ');
  if (/^[A-Z@'.\/ -]{2,}$/.test(name)) c.name = name; else notes.errors.push(`Policyholder name "${d.name || ''}" missing or invalid — left blank.`);

  const ic = (d.nric || '').replace(/\D/g, '');
  if (/^\d{12}$/.test(ic)) c.nric = `${ic.slice(0, 6)}-${ic.slice(6, 8)}-${ic.slice(8)}`;
  else notes.errors.push(`Policyholder NRIC "${d.nric || ''}" is not 12 digits — left blank.`);

  const pol = (d.policyNo || '').replace(/\s/g, '');
  if (/^[A-Z0-9]{6,12}$/i.test(pol)) c.policyNo = pol.toUpperCase();
  else notes.errors.push(`Policy No. "${d.policyNo || ''}" doesn't look like a policy number — left blank.`);

  c.muslim = d.muslim === 'yes' ? true : d.muslim === 'no' ? false : null;
  if (['MARRIED', 'SINGLE', 'DIVORCED', 'WIDOWED'].includes(d.status)) c.maritalStatus = d.status;
  if (d.children !== '' && d.children !== undefined && d.children !== null) {
    const n = Number(d.children);
    if (Number.isInteger(n) && n >= 0 && n <= 20) c.children = n;
    else notes.errors.push(`Number of children "${d.children}" must be a whole number — left blank.`);
  }

  if (d.date) {
    const m = String(d.date).trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    const dt = m && new Date(+m[3], +m[2] - 1, +m[1]);
    if (dt && dt.getDate() === +m[1] && dt.getMonth() === +m[2] - 1) c.declarationDate = m[0];
    else notes.errors.push(`Date "${d.date}" is not a valid DD/MM/YYYY date — left blank.`);
  }

  const a = d.address || {};
  const lines = (a.lines || []).map(l => (l || '').trim()).filter(Boolean);
  if (lines.length || a.postcode) {
    if (/^\d{5}$/.test(a.postcode || '')) c.address = { lines, postcode: a.postcode, town: (a.town || '').trim().toUpperCase(), country: (a.country || 'MALAYSIA').trim().toUpperCase() };
    else notes.warnings.push(`Policyholder postcode "${a.postcode || ''}" is not 5 digits — "same as policyholder" addresses can't be used.`);
  }
  return c;
}

module.exports = { checkDetails };
