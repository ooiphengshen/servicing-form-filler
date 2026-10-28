# Servicing Form Filler

Fills the Great Eastern nomination form (NBZ-FNOMI-V07-082025) and the PSF33 discharge voucher, so servicing paperwork takes minutes instead of filling every box by hand.

- **Web app (any device):** https://ooiphengshen.github.io/servicing-form-filler/ (nomination form: policyholder, nominees, trustees, Part 3 consent, witness). Everything runs in the browser, and client details are never uploaded.
- **Mac app:** reads ePartner screenshots (macOS text recognition) and fills the nomination form and the PSF33 form. See [GUIDE.md](GUIDE.md).

Client screenshots, filled PDFs, logs, signatures and `agent.json` are kept out of this repository (see `.gitignore`). Copy `agent.example.json` to `agent.json` to set your own witness details.

Always check the filled form before submitting. The forms belong to Great Eastern Life Assurance (Malaysia) Berhad. Use the latest official version.
