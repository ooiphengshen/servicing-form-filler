#!/bin/zsh
# Double-click to fill a servicing form from the screenshots in the "input" folder.
cd "$(dirname "$0")"
shots=(input/*.(png|PNG|jpg|JPG|jpeg|webp|heic|HEIC)(N))
if (( ${#shots} == 0 )); then echo "Put the ePartner screenshots in the 'input' folder first."; read -k1; exit 1; fi
echo "Screenshots found: ${#shots}"
echo "Which form?  1) Nomination   2) PSF33 withdrawal/surrender   3) Both"
read "choice?Enter 1, 2 or 3: "
case $choice in 1) form=nomination;; 2) form=psf33;; 3) form=nomination,psf33;; *) echo "Invalid choice"; read -k1; exit 1;; esac
args=(run --form $form)

read "pol?Policy No. (press Enter to read it from the screenshot): "
[[ -n $pol ]] && args+=(--policy $pol)

if [[ $form == *nomination* ]]; then
  echo
  echo "Status:  1) Married  2) Single  3) Divorced  4) Widowed  (Enter = leave blank)"
  read "s?Choose: "
  case $s in 1) args+=(--status married);; 2) args+=(--status single);; 3) args+=(--status divorced);; 4) args+=(--status widowed);; esac
  read "k?Number of children (0 = none, Enter = leave blank): "
  [[ -n $k ]] && args+=(--children $k)
  echo "Muslim?  1) Yes  2) No  (Enter = use what the portal shows)"
  read "m?Choose: "
  case $m in 1) args+=(--muslim yes);; 2) args+=(--muslim no);; esac
  args+=(--ask-nominees --ask-trustees --ask-consents)
fi
[[ $form == *psf33* ]] && args+=(--ask-withdrawal)

echo
node app.js $args $shots
echo
echo "Check the draft PDF that just opened. To approve, type the approve line shown above,"
echo "or press any key to close."
read -k1
