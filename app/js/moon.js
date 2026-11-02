// The moon and the Wheel of the Year, worked out on the phone with no internet.
// Just for delight: nothing here is ever linked to her symptoms.

import { dayKey, dateFromKey } from './util.js';

const SYNODIC = 29.530588853;                              // days from new moon to new moon
const KNOWN_NEW_MOON = Date.UTC(2000, 0, 6, 18, 14);       // 6 January 2000
const FULL_AGE = SYNODIC / 2;
const DAY = 24 * 60 * 60 * 1000;

// The moon's age in days at 9pm on that date, so each day has one steady phase
export function moonAge(date = new Date()) {
  const evening = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 21);
  const days = (evening.getTime() - KNOWN_NEW_MOON) / DAY;
  return ((days % SYNODIC) + SYNODIC) % SYNODIC;
}

const PHASES = [
  { name: 'New moon', line: 'A new moon tonight: a dark, quiet sky for a fresh page.' },
  { name: 'Waxing crescent', line: 'A slim crescent is growing, a little more each night.' },
  { name: 'First quarter', line: 'Half a moon tonight, lit on the left like a lantern.' },
  { name: 'Waxing gibbous', line: 'The moon is plump and nearly round. Good night for a warm drink.' },
  { name: 'Full moon', line: 'The full moon is out. Lovely night for tea by the window.' },
  { name: 'Waning gibbous', line: 'The moon is softening now, generous and bright.' },
  { name: 'Last quarter', line: 'Half a moon again, the other side glowing.' },
  { name: 'Waning crescent', line: 'A thin, sleepy moon. Rest is a fine thing to grow.' },
];

export function moonPhase(date = new Date()) {
  const age = moonAge(date);
  const near = (target, days) => Math.abs(age - target) < days;
  // New and full get one night each; the half moons a couple; the rest fill between
  let index;
  if (near(FULL_AGE, 0.6)) index = 4;
  else if (age < 0.6 || age > SYNODIC - 0.6) index = 0;
  else if (near(SYNODIC / 4, 1)) index = 2;
  else if (near((3 * SYNODIC) / 4, 1)) index = 6;
  else if (age < SYNODIC / 4) index = 1;
  else if (age < FULL_AGE) index = 3;
  else if (age < (3 * SYNODIC) / 4) index = 5;
  else index = 7;
  const toFull = index === 4 ? 0 : Math.ceil((FULL_AGE - age + SYNODIC) % SYNODIC);
  return { age, index, ...PHASES[index], nightsToFull: toFull };
}

export const PHASE_NAMES = PHASES.map((p) => p.name);

export function nightsToFullText(phase) {
  if (phase.nightsToFull === 0) return 'Full tonight';
  return `${phase.nightsToFull} ${phase.nightsToFull === 1 ? 'night' : 'nights'} to full`;
}

// The moon as seen from the southern hemisphere: a waxing moon is lit on the LEFT
export function moonSVG(date = new Date(), size = 56) {
  const p = moonAge(date) / SYNODIC; // 0 new, 0.5 full
  const r = 24;
  const rx = Math.abs(Math.cos(2 * Math.PI * p)) * r;
  const waxing = p < 0.5;
  const gibbous = p > 0.25 && p < 0.75;
  // Drawn the northern way (waxing lit on the right), then mirrored
  const outer = waxing ? 1 : 0;
  const terminator = waxing ? (gibbous ? 1 : 0) : (gibbous ? 0 : 1);
  const lit = `M30 ${30 - r} A${r} ${r} 0 0 ${outer} 30 ${30 + r} A${rx.toFixed(2)} ${r} 0 0 ${terminator} 30 ${30 - r}Z`;
  return `
    <svg class="moon" viewBox="0 0 60 60" width="${size}" height="${size}" aria-hidden="true">
      <circle cx="30" cy="30" r="${r}" fill="#2E3B31"/>
      <g transform="translate(60 0) scale(-1 1)"><path d="${lit}" fill="#E6CB86"/></g>
      <circle cx="30" cy="30" r="${r}" fill="none" stroke="#D8B76E" stroke-width="1"/>
    </svg>`;
}

// ---------- Wheel of the Year, southern hemisphere ----------

const SABBATS = [
  { name: 'Lughnasadh', month: 1, day: 1, line: 'the first harvest' },
  { name: 'Mabon', month: 2, day: 21, line: 'the autumn equinox' },
  { name: 'Samhain', month: 4, day: 1, line: 'when the veil is thin' },
  { name: 'Yule', month: 5, day: 21, line: 'the longest night' },
  { name: 'Imbolc', month: 7, day: 1, line: 'the first stirrings of spring' },
  { name: 'Ostara', month: 8, day: 21, line: 'the spring equinox' },
  { name: 'Beltane', month: 10, day: 1, line: 'the blossoming' },
  { name: 'Litha', month: 11, day: 21, line: 'the longest day' },
];

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

// The next sabbat on or after this date
export function nextSabbat(date = new Date()) {
  const today = dateFromKey(dayKey(date));
  for (const year of [today.getFullYear(), today.getFullYear() + 1]) {
    for (const s of SABBATS) {
      const when = new Date(year, s.month, s.day);
      if (when >= today) {
        const days = Math.round((when - today) / DAY);
        return { ...s, when, days, dateText: `${s.day} ${MONTHS[s.month]}` };
      }
    }
  }
  return null;
}

export function sabbatText(date = new Date()) {
  const s = nextSabbat(date);
  if (s.days === 0) return `Today is ${s.name}, ${s.line}.`;
  if (s.days === 1) return `${s.name}, ${s.line}, is tomorrow.`;
  return `${s.name}, ${s.line}, is on ${s.dateText}.`;
}
