# Servicing Form Filler: How to Use

Takes ePartner policy-enquiry screenshots and pre-fills Great Eastern servicing forms. You review, approve, get it signed, submit.

## Each time (about 1 minute)

1. **Screenshot** the client's policy enquiry page in ePartner (Cmd+Shift+4). Capture the **Payer Details** section and the **Insured** table (Name / Gender / ID No / DOB / Religion). The **ILP Fund Details** are useful for PSF33.
2. **Clear out the `input` folder**, then drop in this client's screenshots only.
3. **Double-click `Fill Form.command`**. Choose the form. For the nomination it also asks for **status** (married/single/divorced/widowed), **number of children** (0 = none) and **Muslim** (Enter = use the portal value). Press Enter to leave any of them blank. Then it asks for **nominees** one by one: name, NRIC, date of birth (Enter = taken from NRIC), nationality (Malaysian or others, stated), relationship, address (or "same as policyholder") and share %. If the total is under 100%, it asks for the next nominee automatically (up to 4, as on the form). Wrong NRIC, a DOB that does not match the NRIC, or a share over the remaining % is asked again. Answers are saved to `input/nominees.json` for re-runs (`--nominees input/nominees.json`). Include the top of the page ("Policy Detail Information for P/N: …") in a screenshot and the Policy No. is read automatically. If not, type it when asked.
4. A **DRAFT PDF** opens with a **REVIEW** list in the window:
   - ✓ Filled: check each one against the portal
   - ✗ / ! Blank or problem: left empty on purpose, never guessed
   - – Stays manual: what you or the client must complete
5. Fix anything directly in Preview if needed, then **approve**:
   ```
   node app.js approve "output/<name>_DRAFT.pdf"
   ```
   Add `--accept-blanks` if you'll hand-fill the blanks. Approved copies go to `output/approved/`.
6. Print, get it signed, submit as usual.

## What it fills

| Form | Auto-filled | You complete |
|---|---|---|
| **Nomination** (NBZ-FNOMI-V07-082025) | Policy No, proposer name, NRIC, Muslim Yes/No, status, no. of children, nominees 1–4 (name, NRIC, gender from NRIC, DOB, nationality, relationship, address, share %), total %, name under signature | Nominee passport details, trustee (Part 2), date, signatures, witness |
| **PSF33** (CSD-PSF33-V19-092026) | Policy No, NRIC boxes, Life Assured name, Policy Owner name / NRIC / tel (p4), **action tick** (A partial or C surrender), **fund tick + amount** (RM, units or ALL UNITS) for funds found in the portal | IPA/TUPA/ILES account box, section B (regular withdrawal), surrender reason, date, signatures, witness, Section D consent |

## Agent as witness
The agent's name and code are saved in `agent.json` (OOI PHENG SHEN, 6408530) and printed as the witness by default:
- **Nomination, page 3:** witness name and IAC No.
- **PSF33, page 4:** witness name. The form has no box for the agent code.
- **Signature:** `assets/signature.jpg` is inserted in the witness signature box on both forms. To stop inserting it, delete the `"signature"` line from `agent.json`.
  Use a pre-signed copy only when the client signs in front of you, because the witness statement certifies that. Check with Customer Service whether a printed or digital witness signature is accepted.

To change the agent, edit `agent.json`.

## Built-in checks
- The NRIC must be 12 digits, **match the DOB**, and **match the gender** (last digit).
- The name must be the same on every screen. If it differs, the field is left blank.
- Phone must be a valid 01x number. If "Mobile No" is broken it falls back to "Residence Tel", with a note.
- Recently issued policies get a free-look reminder on PSF33.

## Log
Each run is recorded in `logs/runs.csv` (see the last 20 with `node app.js log`). Clients appear by the **last 4 digits of their NRIC** only. A full detail file for each run is in `logs/`.

## Keep it private
`input/`, `output/` and `logs/` contain client data and stay on this Mac. Nothing is uploaded or sent. Empty `input/` after each client.

## Steps that must stay manual
- Signatures and the date signed
- The client's choices: nominees, withdrawal amount or surrender, reasons
- Submitting to Great Eastern

## Adding another form
Send Claude the blank PDF. The form layout is set in `lib/forms.js`.

## PSF33 fund screening
When PSF33 is chosen, the app lists the funds it read from the portal's **ILP FUND DETAILS** and matches each one to its code on the form (e.g. Lion US-i Fund → F10). Then it asks:
- **Action:** 1 Partial withdrawal or 2 Full surrender (Enter = leave blank).
- **For partial withdrawal, the amount per fund:** `200` (RM), `20U` (units), `ALL` (all units), or Enter to skip that fund.

Checks:
- Units can't exceed the units held, and RM can't exceed the fund value shown.
- A fund not on the PSF33 list is flagged for you to handle by hand.
- Withdrawing ALL units of the only fund triggers a reminder to consider full surrender instead.

Without the launcher: `--action partial --withdraw "F10=ALL;F01=RM200"` or `--action surrender`.

## Nomination App (window version)
Double-click **`Nomination App.command`**. Safari opens the app at http://localhost:4580. It runs only on this Mac; close the Terminal window to stop it.

1. **Drop the ePartner screenshots** into the box. Policy No., name, NRIC, Muslim status and address fill in by themselves. Check them.
2. **Choose status and children.** The NRIC box shows the DOB and gender it reads from the number, as a check.
3. **Fill in Nominee 1.** Tick the **relationship** (Husband … Others) and choose the **mailing address**: "Same as policyholder" (shows the address it will use) or "Different address" (opens address boxes). Once you enter a share under 100%, **Nominee 2 opens automatically** (up to 4). The total bar turns green at 100%. A DOB that doesn't match the NRIC turns red.
4. **Date & witness:** the date is set to **today** and printed in the Date boxes on page 3 (change it if the client signs on another day). Your name, IAC and signature come from `agent.json`. Untick the signature box if you'll sign by hand.
5. **Create draft PDF.** A review list (✓ filled, ✗ problem, ! blank) and a preview appear.
6. **Approve.** If anything is blank or flagged, tick "I'll fill by hand" first. The approved copy goes to `output/approved/`, with a "Show in Finder" link.

Screenshots dropped in are saved to `input/`. Clear that folder after each client.

## Online version (any device)
Link: https://claude.ai/artifact/Vu1f23SLgC7VXWKiKTWAdx. It's private: you must be signed in to claude.ai.
- Works on iPhone, iPad and any computer. The form is filled inside the browser, and client details are not uploaded or saved.
- No screenshot reading online: type the policyholder details in.
- Signature: add the image from your device each time, or tick "Remember on this device".
- "Approve & download PDF" asks you to confirm the download.
- Source copy: `online/nomination-filler.html`.

## Trustees (page 4) and consent (page 5)

Both are optional and work the same way in the online version, the Nomination App and `Fill Form.command`.

- **Trustees (Part 2, page 4):** up to 2. For each trustee: name, NRIC (or passport no., expiry, DOB and gender), nationality, country of birth, tel no. and type, and address ("same as policyholder" or a new one). DOB and gender come from the NRIC. Malaysian numbers are written as +60. You are printed as witness on page 4 (name, IAC, signature), and the page 4 date is the form date. The app refuses the policyholder's own NRIC as a trustee.
- **Consent (Part 3, page 5):** up to 4 existing nominees/trustees, used only when revoking a trust nomination. For each person: name, NRIC/passport and signature date (defaults to the form date). You are printed as witness in each column. The Witness Details boxes on page 5 are left blank because the witness is an agent.
- **Command line:** `--ask-trustees` / `--ask-consents` to type them in, or `--trustees file.json` / `--consents file.json`.
- **Still signed by hand:** the policyholder and trustees on page 4, and each consenting person on page 5.
