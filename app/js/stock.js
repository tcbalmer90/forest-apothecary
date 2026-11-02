// Stock: tablets left, repeats, script expiry, and gentle notes about them.
// Notes only ever point to her doctor or pharmacy. Nothing here suggests a dose.

import { state, activeMeds, doctorName } from './state.js';
import { dateFromKey, dayKey } from './util.js';

const DAY = 24 * 60 * 60 * 1000;
const LOW_DAYS = 5;        // "running low" when about this many days are left
const EXPIRY_DAYS = 30;    // mention a script expiring within this many days
const RISE = 1.5;          // "more than usual" means at least this many times her usual week
const BASELINE_WEEKS = 8;  // her usual week is the average over the 8 weeks before the last two

export const tracksStock = (med) => typeof med.stockCount === 'number';

const dosesOf = (med) => state.entries.filter((e) => e.kind === 'dose' && e.medId === med.id);

export function tabletsLeft(med) {
  if (!tracksStock(med)) return null;
  const used = dosesOf(med)
    .filter((e) => e.at > med.stockAt)
    .reduce((sum, e) => sum + (e.tablets ?? 1), 0);
  return Math.max(0, med.stockCount - used);
}

// Tablets a day, from the last week (or since stock was counted, if sooner)
export function dailyUse(med, now = Date.now()) {
  const since = Math.max(now - 7 * DAY, med.stockAt ?? 0);
  // At least one day, so a first morning's doses don't look like a huge daily rate
  const days = Math.max(1, (now - since) / DAY);
  const used = dosesOf(med)
    .filter((e) => e.at > since && e.at <= now)
    .reduce((sum, e) => sum + (e.tablets ?? 1), 0);
  return used / days;
}

export function daysLeft(med, now = Date.now()) {
  const left = tabletsLeft(med);
  const rate = dailyUse(med, now);
  if (left == null || rate === 0) return null;
  return left / rate;
}

function daysUntil(key, now) {
  const today = dateFromKey(dayKey(new Date(now)));
  return Math.round((dateFromKey(key) - today) / DAY);
}

const shortDate = (key) => {
  const d = dateFromKey(key);
  return `${d.getDate()} ${d.toLocaleString('en-AU', { month: 'long' })}`;
};

// ---------- More than usual ----------
// Doses of the medicines she has asked to watch, week by week

function weeklyDoses(meds, now) {
  const ids = new Set(meds.map((m) => m.id));
  const doses = state.entries.filter((e) => e.kind === 'dose' && ids.has(e.medId));
  const week = (n) => doses.filter((e) => e.at <= now - n * 7 * DAY && e.at > now - (n + 1) * 7 * DAY).length;
  return { week, first: Math.min(...doses.map((e) => e.at)) };
}

export function risingUse(now = Date.now()) {
  const watched = activeMeds('med').filter((m) => m.watchUse);
  if (!watched.length) return null;
  const { week, first } = weeklyDoses(watched, now);
  // Needs at least four weeks of history before the last two to know her usual
  const weeksOfHistory = Math.floor((now - first) / (7 * DAY)) - 2;
  if (weeksOfHistory < 4) return null;
  const span = Math.min(BASELINE_WEEKS, weeksOfHistory);
  let total = 0;
  for (let n = 2; n < 2 + span; n += 1) total += week(n);
  const usual = total / span;
  if (usual === 0) return null;
  if (week(0) >= usual * RISE && week(1) >= usual * RISE) {
    return { names: watched.map((m) => m.name), usual, recent: [week(1), week(0)] };
  }
  return null;
}

// ---------- Notes for Today ----------

export function shelfNotes(now = Date.now()) {
  const notes = [];
  for (const med of activeMeds('med')) {
    const days = daysLeft(med, now);
    const left = tabletsLeft(med);
    if (left === 0 || (days != null && days <= LOW_DAYS)) {
      const when = left === 0 ? 'none left' : `about ${Math.max(1, Math.round(days))} ${Math.round(days) <= 1 ? 'day' : 'days'} left`;
      const ask = med.repeats > 0 ? 'ask for your repeat' : `ask ${doctorName()} for a new script`;
      notes.push({ kind: 'low', medId: med.id, text: `${med.name} is running low, ${when}. Time to ${ask}.` });
    }
    if (med.scriptExpiry) {
      const until = daysUntil(med.scriptExpiry, now);
      if (until < 0) {
        notes.push({ kind: 'expiry', medId: med.id, text: `${med.name}'s script expired on ${shortDate(med.scriptExpiry)}. ${capital(doctorName())} can write a new one.` });
      } else if (until <= EXPIRY_DAYS) {
        notes.push({ kind: 'expiry', medId: med.id, text: `${med.name}'s script expires on ${shortDate(med.scriptExpiry)}. Worth asking ${doctorName()} for a new one.` });
      }
    }
  }
  const rising = risingUse(now);
  if (rising) {
    notes.push({
      kind: 'rising',
      text: `You've logged ${listNames(rising.names)} more often than usual these last two weeks. It could be worth mentioning to ${doctorName()}.`,
    });
  }
  return notes;
}

const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function listNames(names) {
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}
