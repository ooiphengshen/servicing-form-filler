// PSF33 page 2 fund table: code, name as printed, and where its tick box / amount cells sit (points).
// y = vertical centre of the row's tick box. Column x ranges: left table RM 180–242, Units 243–297;
// right table RM 450–508, Units 509–571.
const LEFT = { box: 31.5, rm: [180, 242], units: [243, 297] };
const RIGHT = { box: 305.5, rm: [450, 508], units: [509, 571] };

const FUNDS = [
  ['F01', 'Lion Balanced Fund', LEFT, 640.5],
  ['F02', 'Lion Growth Fund', LEFT, 618.5],
  ['F03', 'Dana Restu', LEFT, 597, ['Barakah Fund']],
  ['F04', 'Lion Fixed Income Fund', LEFT, 573],
  ['F05', 'Lion Progressive Fund', LEFT, 550.5],
  ['F06', 'Dana Sejati', LEFT, 527, ['Mauzuun Bond Fund']],
  ['F09', 'Lion Strategic Fund', LEFT, 504.5],
  ['F21', 'Lion Advanced Strategic Fund', LEFT, 483.5],
  ['F27', 'Lion Equity Global Sustainability Fund', LEFT, 461],
  ['F29', 'Lion Dividend Fund (RM-Unhedged)', LEFT, 421.5],
  ['F10', 'Lion US-i Fund', RIGHT, 640],
  ['F11', 'Lion UK-i Fund', RIGHT, 618],
  ['F12', 'Lion AU-i Fund', RIGHT, 596],
  ['F16', 'Lion Asia Pac Fund', RIGHT, 573],
  ['F17', 'Lion Enhanced Equity Fund', RIGHT, 550],
  ['F18', 'Dana Gemilang', RIGHT, 526.5],
  ['F22', 'Lion Small Mid Cap', RIGHT, 504],
  ['F26', 'Lion ASEAN Fund', RIGHT, 483],
  ['F28', 'Lion Physical Gold Fund', RIGHT, 461.5],
].map(([code, name, col, y, aliases = []]) => ({ code, name, col, y, aliases }));

// Exact match after ignoring case, spaces, punctuation and the word "fund". No fuzzy guessing.
const key = s => s.toLowerCase().replace(/\bfund\b/g, '').replace(/[^a-z0-9]/g, '');
function match(portalName) {
  const k = key(portalName || '');
  return FUNDS.find(f => key(f.name) === k || f.aliases.some(a => key(a) === k)) || null;
}

module.exports = { FUNDS, match };
