// One entry per supported form. Each filler writes what it can and
// returns: filled (what went where), blanks (needed but missing), manual (always by hand).
const fs = require('fs');
const path = require('path');
const { PDFDocument, PDFName, StandardFonts, rgb } = require('pdf-lib');
const { RELATIONSHIPS } = require('./nominees');
const { FUNDS } = require('./funds');

const FORMS_DIR = path.join(__dirname, '..', 'forms');
const digits = s => (s || '').replace(/\D/g, '');

// Agent's witness signature, scaled to fit inside box {x, y, w, h} (points, bottom-left origin).
async function drawSignature(doc, page, ag, box, label, filled, manual) {
  const file = ag.signature && path.resolve(__dirname, '..', ag.signature);
  if (!file || !fs.existsSync(file)) return manual.push(`${label}: no signature file set in agent.json, so sign by hand.`);
  const bytes = fs.readFileSync(file);
  const img = /\.png$/i.test(file) ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
  const s = Math.min(box.w / img.width, box.h / img.height);
  const w = img.width * s, h = img.height * s;
  page.drawImage(img, { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, width: w, height: h });
  filled.push([label, 'signature image inserted']);
  const note = 'Witness signature is pre-printed. Use this copy only when the client signs in front of you (the witness statement certifies that). Also check with Customer Service whether a printed or digital witness signature is accepted.';
  if (!manual.includes(note)) manual.push(note);
}

function freeLookNote(c) {
  if (!c.policyIssueDate) return [];
  const [d, m, y] = c.policyIssueDate.split('/').map(Number);
  const days = Math.floor((Date.now() - new Date(y, m - 1, d)) / 864e5);
  return days <= 60 ? [`Policy issued ${c.policyIssueDate} (${days} days ago). Check whether it is still within the free-look period before submitting.`] : [];
}

const FORMS = {
  nomination: {
    title: 'Appointment / Change of Nominee(s) / Trustee(s) (NBZ-FNOMI-V07-082025)',
    file: 'nomination.pdf',
    async fill(c, opts) {
      const doc = await PDFDocument.load(fs.readFileSync(path.join(FORMS_DIR, this.file)));
      const form = doc.getForm();
      const filled = [], blanks = [];
      const text = (field, value, label) => {
        const f = form.getTextField(field), max = f.getMaxLength();
        if (!value) return blanks.push(label);
        if (max && value.length > max) return blanks.push(`${label} ("${value}" is longer than the ${max} boxes — fill by hand)`);
        f.setText(value); filled.push([label, value]);
      };
      text('Policy No', c.policyNo, 'Policy No.');
      text('Proposer Name', c.name, '1) Full name as per NRIC');
      text('Proposer NRIC', digits(c.nric), '2) NRIC (12 digits)');
      text('Proposer Name2', c.name, 'Name under Proposer signature (page 3)');
      // Date boxes on page 3: DD MM YYYY
      if (c.declarationDate) { form.getTextField('Declaration Date').setText(c.declarationDate.replace(/\//g, '')); filled.push(['Date (page 3)', c.declarationDate]); }
      else blanks.push('Date (page 3)');
      // Checkbox groups share one field; widgets are ordered left to right as printed on the form.
      const tick = (field, index) => {
        const cb = form.getCheckBox(field), ws = cb.acroField.getWidgets().slice().sort((a, b) => a.getRectangle().x - b.getRectangle().x);
        const on = ws[index].getOnValue();
        cb.acroField.dict.set(PDFName.of('V'), on);
        ws.forEach(w => w.setAppearanceState(w.getOnValue() === on ? on : PDFName.of('Off')));
      };
      if (c.muslim === null || c.muslim === undefined) blanks.push('3) Are you a Muslim? (not chosen)');
      else { tick('Proposer Muslim', c.muslim ? 1 : 0); filled.push(['3) Are you a Muslim?', c.muslim ? 'Yes' : 'No']); }

      const STATUS = ['MARRIED', 'SINGLE', 'DIVORCED', 'WIDOWED'];
      if (!c.maritalStatus) blanks.push('4) Status (not chosen)');
      else { tick('Proposer Status', STATUS.indexOf(c.maritalStatus)); filled.push(['4) Status', c.maritalStatus]); }

      if (c.children === null || c.children === undefined) blanks.push('5) Do you have any children? (not chosen)');
      else if (c.children === 0) { tick('Proposer Children', 0); filled.push(['5) Do you have any children?', 'No']); }
      else {
        tick('Proposer Children', 1);
        form.getTextField('No. of Children').setText(String(c.children));
        filled.push(['5) Do you have any children?', `Yes, ${c.children}`]);
      }
      // Part 1: nominees N1–N4 (blank fields were already flagged during validation)
      const nominees = c.nominees || [];
      const set = (field, v) => { if (v !== undefined && v !== null && v !== '') form.getTextField(field).setText(String(v)); };
      const nameLines = s => s.split(' ').reduce((ls, w) => {
        const last = ls[ls.length - 1];
        if (last !== undefined && (last + ' ' + w).length <= 28) ls[ls.length - 1] = last + ' ' + w; else ls.push(w);
        return ls;
      }, []);
      nominees.forEach((n, i) => {
        const k = `N${i + 1}`;
        if (n.name) {
          const ls = nameLines(n.name);
          if (ls.length > 3 || ls.some(l => l.length > 28)) blanks.push(`${k} name too long for the boxes — fill by hand`);
          else ls.forEach((l, j) => set(`${k} Name${j + 1}`, l));
        }
        set(`${k} NRIC`, n.nric);
        if (n.gender) tick(`${k} Gender`, n.gender === 'M' ? 0 : 1);
        if (n.dob) { const [d, m, y] = n.dob.split('/'); set(`${k} DOB Day`, d); set(`${k} DOB Month`, m); set(`${k} DOB Year`, y.slice(2)); }
        if (n.nationality === 'MALAYSIAN') tick(`${k} Nationality`, 0);
        else if (n.nationality) { tick(`${k} Nationality`, 1); set(`${k} Nationality Others`, n.nationality); }
        if (n.relationship) {
          tick(`${k} Relationship`, RELATIONSHIPS.indexOf(n.relationship));
          if (n.relationshipOther) set(`${k} Relationship Others`, n.relationshipOther);
        }
        if (n.address) {
          n.address.lines.forEach((l, j) => set(`${k} Mailing${j + 1}`, l));
          set(`${k} Postcode`, n.address.postcode); set(`${k} Town`, n.address.town); set(`${k} Country`, n.address.country);
        }
        set(`${k} percent`, n.percent);
        filled.push([`Nominee ${i + 1}`, [n.name, n.nric, n.dob, n.gender && (n.gender === 'M' ? 'Male' : 'Female'), n.nationality, n.relationshipOther || n.relationship, n.address && `${n.address.lines.join(', ')}, ${n.address.postcode} ${n.address.town}`, n.percent && `${n.percent}%`].filter(Boolean).join(' | ')]);
      });
      if (nominees.length) {
        const total = nominees.reduce((s, n) => s + (n.percent || 0), 0);
        set('Total %', total); set('Total 1', total);
      }

      const ag = opts.agent || {};
      text('W1 Name', ag.name, 'Witness name (page 3, agent)');
      text('IAC No 1', digits(ag.code), 'Witness IAC No. (page 3, agent)');
      const manual = [
        ...(nominees.length ? ['Nominee passport details, if any (not asked).'] : ['Part 1: nominee details and % share (none entered).']),
        ...(c.muslim === false ? ['Client is Non-Muslim. If the nominee is a spouse, child or parent, the policy becomes a trust policy (form note 2), so consider completing Part 2 (trustees).'] : []),
        'The client\'s and witness\'s signatures. The Witness Details box can be skipped when the witness is the agent.',
      ];
      await drawSignature(doc, doc.getPages()[2], ag, { x: 204, y: 536, w: 106, h: 53 }, 'Witness signature (page 3, agent)', filled, manual);

      // Pages 4–5 name boxes are plain fields that auto-size badly: shrink the text to fit the box.
      const helv = await doc.embedFont(StandardFonts.Helvetica);
      const fit = (field, v) => {
        if (!v) return;
        const f = form.getTextField(field), w = f.acroField.getWidgets()[0].getRectangle().width - 4;
        f.setText(String(v)); f.setFontSize(Math.min(9, +(w / helv.widthOfTextAtSize(String(v), 1)).toFixed(1)));
      };
      const comb = (field, v) => { if (!v) return; const f = form.getTextField(field); f.enableCombing(); f.setText(String(v)); f.setFontSize(10); };

      // Part 2: trustees T1–T2 and the page 4 declaration (only when trustees are given)
      const trustees = c.trustees || [];
      // Passport expiry: the form prints Day | _ | Month | _ | Year | _ — write DD, MM, YY in the empty boxes.
      const expiry = (field, d) => {
        const r = form.getTextField(field).acroField.getWidgets()[0].getRectangle(), [dd, mm, yyyy] = d.split('/');
        [[dd, 33], [mm, 81.5], [yyyy.slice(2), 113]].forEach(([t, dx]) =>
          doc.getPages()[3].drawText(t, { x: r.x + dx + (16 - helv.widthOfTextAtSize(t, 9)) / 2, y: r.y + 4, size: 9, font: helv }));
      };
      const dateBoxes = (d, day, month, year) => { const [dd, mm, yy] = d.split('/'); set(day, dd); set(month, mm); set(year, yy.slice(2)); };
      trustees.forEach((t, i) => {
        const k = `T${i + 1}`;
        if (t.name) {
          const ls = nameLines(t.name);
          if (ls.length > 3 || ls.some(l => l.length > 28)) blanks.push(`Trustee ${i + 1} name too long for the boxes — fill by hand`);
          else ls.forEach((l, j) => set(`${k} Name${j + 1}`, l));
          fit(`${k} Name`, t.name);  // name under the trustee's signature
        }
        set(`${k} NRIC`, t.id);
        if (t.passportExpiry) expiry(`${k} Passport`, t.passportExpiry);
        if (t.gender) tick(`${k} Gender`, t.gender === 'M' ? 0 : 1);
        if (t.dob) dateBoxes(t.dob, `${k} DOB Day`, `${k} DOB Month`, `${k} DOB Year`);
        if (t.nationality === 'MALAYSIAN') tick(`${k} Nationality`, 0);
        else if (t.nationality) { tick(`${k} Nationality`, 1); set(`${k} Nationality Others`, t.nationality); }
        if (t.countryOfBirth === 'MALAYSIAN') tick(`${k} Country of Birth`, 0);
        else if (t.countryOfBirth) { tick(`${k} Country of Birth`, 1); set(`${k} Country of Birth Others`, t.countryOfBirth); }
        if (t.tel) { set(`${k} Tel No`, t.tel); set(`${k} Tel Country`, t.telCountry); tick(`${k} Tels`, ['HOUSE', 'HANDPHONE', 'OFFICE'].indexOf(t.telType)); }
        if (t.address) {
          t.address.lines.forEach((l, j) => set(`${k} Mailing${j + 1}`, l));
          set(`${k} Postcode`, t.address.postcode); set(`${k} Town`, t.address.town); set(`${k} Country`, t.address.country);
        }
        filled.push([`Trustee ${i + 1} (page 4)`, [t.name, t.id, t.passportExpiry && `passport exp ${t.passportExpiry}`, t.dob, t.gender && (t.gender === 'M' ? 'Male' : 'Female'), t.nationality, t.countryOfBirth && `born ${t.countryOfBirth === 'MALAYSIAN' ? 'MALAYSIA' : t.countryOfBirth}`, t.tel && `+${t.tel} (${t.telType.toLowerCase()})`, t.address && `${t.address.lines.join(', ')}, ${t.address.postcode} ${t.address.town}`].filter(Boolean).join(' | ')]);
      });
      if (trustees.length) {
        if (c.declarationDate) { dateBoxes(c.declarationDate, 'Day2', 'Month2', 'Year2'); filled.push(['Date (page 4)', c.declarationDate]); } else blanks.push('Date (page 4)');
        if (ag.name) { fit('W2 Name', ag.name); filled.push(['Witness name (page 4, agent)', ag.name]); } else blanks.push('Witness name (page 4, agent)');
        text('IAC No 2', digits(ag.code), 'Witness IAC No. (page 4, agent)');
        await drawSignature(doc, doc.getPages()[3], ag, { x: 440, y: 111, w: 105, h: 36 }, 'Witness signature (page 4, agent)', filled, manual);
        manual.push('Page 4: signatures of the policyholder and each trustee (trustees sign to accept).');
      } else if (c.muslim === false) manual.push('Part 2 (trustees, page 4) left blank: no trustees entered.');

      // Part 3: consent of existing nominees/trustees (page 5), each witnessed by the agent
      const consents = c.consents || [];
      const COLS = [126, 236, 345, 454];
      for (const [i, s] of consents.entries()) {
        const n = i + 1;
        fit(`Page 5 Consent${n}`, s.name);
        set(`Page 5 Consent1 NRIC${n}`, s.id);
        if (s.date) dateBoxes(s.date, `Day${n + 2}`, `Month${n + 2}`, `Year${n + 2}`);
        fit(`Page 5 Witness ${n}`, ag.name);
        comb(`Page 5 Witness IAC ${n}`, digits(ag.code));
        filled.push([`Consent ${n} (page 5)`, [s.name, s.id, s.date && `signs ${s.date}`, ag.name && `witness ${ag.name}`].filter(Boolean).join(' | ')]);
        await drawSignature(doc, doc.getPages()[4], ag, { x: COLS[i] + 12, y: 304, w: 90, h: 34 }, `Witness signature (page 5, consent ${n})`, filled, manual);
      }
      if (consents.length) manual.push('Page 5: each consenting nominee/trustee signs in their column. Witness Details boxes (top of page 5 and rows viii–xi) are skipped because the witness is an agent.');
      return { bytes: await doc.save(), filled, blanks, manual };
    },
  },

  psf33: {
    title: 'Discharge Voucher for Withdrawal/Surrender, Investment-Linked (CSD-PSF33-V19-092026)',
    file: 'CSD-PSF33-V19-092026_14SEPT.pdf',
    // This PDF has no fillable fields, so text is printed at measured positions (points, origin bottom-left).
    async fill(c, opts) {
      const doc = await PDFDocument.load(fs.readFileSync(path.join(FORMS_DIR, this.file)));
      const font = await doc.embedFont(StandardFonts.Helvetica);
      const [p1, , , p4] = doc.getPages();
      const ink = rgb(0, 0, 0.55);
      const filled = [], blanks = [];
      const put = (page, s, x, y, size = 9) => page.drawText(s, { x, y, size, font, color: ink });
      const boxes = (page, s, x0, pitch, y, n, size = 10) => {
        [...s].slice(0, n).forEach((ch, i) => put(page, ch, x0 + i * pitch + (pitch - font.widthOfTextAtSize(ch, size)) / 2, y, size));
      };

      const pol = (c.policyNo || '').replace(/\s/g, '');
      if (!pol) blanks.push('Policy No. (page 1)');
      else if (pol.length > 10) blanks.push(`Policy No. ("${pol}" is longer than the 10 boxes)`);
      else { boxes(p1, pol, 81, 14.4, 752, 10); filled.push(['Policy No. (page 1)', pol]); }

      const ic = digits(c.nric);
      if (ic.length === 12) {
        boxes(p1, ic.slice(0, 6), 357.3, 14.33, 752, 6);
        boxes(p1, ic.slice(6, 8), 457.3, 14.33, 752, 2);
        boxes(p1, ic.slice(8), 500.7, 14.33, 752, 4);
        filled.push(['New NRIC No. (page 1)', c.nric]);
      } else blanks.push('New NRIC No. (page 1)');

      if (c.name) { put(p1, c.name, 155, 716); filled.push(['Name of Life Assured (page 1)', c.name]); } else blanks.push('Name of Life Assured');

      // Page 4: Policy Owner block under signature
      if (c.name) { put(p4, c.name, 101, 407, 8); filled.push(['Policy Owner name (page 4)', c.name]); } else blanks.push('Policy Owner name (page 4)');
      if (c.nric) { put(p4, c.nric, 119, 395, 8); filled.push(['Policy Owner NRIC (page 4)', c.nric]); } else blanks.push('Policy Owner NRIC (page 4)');
      if (c.mobile) { put(p4, c.mobile, 107, 383, 8); filled.push(['Policy Owner Tel (page 4)', c.mobile]); } else blanks.push('Policy Owner Tel (page 4)');

      // Page 4: Witness block (servicing agent by default)
      const ag = opts.agent || {};
      if (ag.name) { put(p4, ag.name, 433, 407, 8); filled.push(['Witness name (page 4, agent)', ag.name]); } else blanks.push('Witness name (page 4)');

      // Section A (page 2) / C (page 4): action, fund ticks and amounts
      const p2 = doc.getPages()[1];
      const tickAt = (page, cx, cy) => {
        const pts = [[cx - 3, cy], [cx - 0.8, cy - 3], [cx + 3.6, cy + 3.8]];
        page.drawLine({ start: { x: pts[0][0], y: pts[0][1] }, end: { x: pts[1][0], y: pts[1][1] }, thickness: 1.3, color: ink });
        page.drawLine({ start: { x: pts[1][0], y: pts[1][1] }, end: { x: pts[2][0], y: pts[2][1] }, thickness: 1.3, color: ink });
      };
      const inCell = (page, s, [x0, x1], cy, size = 8) => put(page, s, (x0 + x1 - font.widthOfTextAtSize(s, size)) / 2, cy - 3, size);
      const fundList = c.funds.map(f => `${f.code || '(not on form)'} ${f.name}${f.units !== null ? ` ${f.units} units` : ''}${f.value !== null ? ` RM${f.value}` : ''}`).join('; ');
      const w = c.withdrawal || {};
      const manual = [];
      if (w.action === 'partial') {
        tickAt(p2, 33.5, 767.5);
        filled.push(['A. Partial withdrawal (page 2)', 'ticked']);
        for (const f of w.funds) {
          const def = FUNDS.find(x => x.code === f.code);
          tickAt(p2, def.col.box, def.y);
          const amt = f.mode === 'ALL' ? 'ALL UNITS' : f.mode === 'UNITS' ? String(f.amount) : f.amount.toFixed(2);
          inCell(p2, amt, f.mode === 'RM' ? def.col.rm : def.col.units, def.y);
          filled.push([`${f.code} ${f.name} (page 2)`, f.mode === 'ALL' ? 'ALL UNITS' : f.mode === 'UNITS' ? `${f.amount} units` : `RM${f.amount.toFixed(2)}`]);
        }
        manual.push('Account box on page 2 (IPA / TUPA / ILES): the portal does not show the account type.');
      } else if (w.action === 'surrender') {
        tickAt(p4, 36, 770);
        filled.push(['C. Full surrender (page 4)', 'ticked']);
        manual.push('Reason(s) for full surrender on page 4.');
      } else {
        blanks.push('Action not chosen: A partial withdrawal or C full surrender');
      }
      manual.push(`Funds in portal: ${fundList || 'none found (include ILP FUND DETAILS in a screenshot)'}.`);
      manual.push(
        'Section B (regular partial withdrawal) is not auto-filled.',
        'Date, the client\'s and witness\'s signatures, and the witness NRIC and tel (page 4). The form has no agent code box.',
        'Section D consent (page 5), only if there is a trustee, nominee or assignee.',
        ...freeLookNote(c),
      );
      await drawSignature(doc, p4, ag, { x: 400, y: 439, w: 140, h: 50 }, 'Witness signature (page 4, agent)', filled, manual);
      return { bytes: await doc.save(), filled, blanks, manual };
    },
  },
};

module.exports = { FORMS };
