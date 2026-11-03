// The report for her doctor: the numbers behind the report screen and the PDF.
// It covers a period she chooses (usually since her last appointment), and compares
// the first half of that period with the second.
// Only facts she logged, never advice. The moon chart is deliberately not part of it.

import { state, entryDay, activeMeds } from './state.js';
import { dayKey, dateFromKey, formatDay, addDays, daysBetween } from './util.js';

export const DEFAULT_WEEKS = 6;

const avg = (list) => (list.length ? Math.round((list.reduce((a, b) => a + b, 0) / list.length) * 10) / 10 : null);

function tally(items, skip = []) {
  const counts = {};
  for (const i of items) if (i && !skip.includes(i)) counts[i] = (counts[i] || 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
}

function countBy(evenings, key, order) {
  return order.map((level) => ({ name: level, count: evenings.filter((e) => e[key] === level).length }));
}

export function reportData({ start, now = new Date() } = {}) {
  start = start ? dateFromKey(dayKey(start)) : addDays(now, -(DEFAULT_WEEKS * 7 - 1));
  const days = daysBetween(start, now) + 1;
  const weekCount = Math.max(1, Math.ceil(days / 7));
  const from = dayKey(start);
  const to = dayKey(now);
  const inRange = (e) => { const k = entryDay(e); return k >= from && k <= to; };
  const entries = state.entries.filter(inRange);
  const evenings = entries.filter((e) => e.kind === 'reflection').sort((a, b) => a.day.localeCompare(b.day));
  const flares = entries.filter((e) => e.kind === 'flare').sort((a, b) => a.at - b.at);
  const doses = entries.filter((e) => e.kind === 'dose');

  // Week by week: average pain and tiredness, and flares
  const dayOf = (key) => daysBetween(start, dateFromKey(key));
  const weekOf = (key) => Math.floor(dayOf(key) / 7);
  const firstHalf = (key) => dayOf(key) < days / 2;
  const weeks = Array.from({ length: weekCount }, (_, i) => {
    const begins = addDays(start, i * 7);
    const ev = evenings.filter((e) => weekOf(e.day) === i);
    return {
      begins,
      label: `Week of ${formatDay(begins)}`,
      pain: avg(ev.filter((e) => e.pain != null).map((e) => e.pain)),
      fatigue: avg(ev.filter((e) => e.fatigue != null).map((e) => e.fatigue)),
      evenings: ev.length,
      flares: flares.filter((f) => weekOf(entryDay(f)) === i).length,
    };
  });

  const painEvenings = evenings.filter((e) => e.pain != null);
  const half = (list, first) => list.filter((e) => firstHalf(e.day) === first);
  const worst = painEvenings.reduce((w, e) => (!w || e.pain > w.pain ? e : w), null);

  const periodDays = evenings.filter((e) => e.period === 'Yes');
  const otherDays = evenings.filter((e) => e.period === 'No');
  const sexDays = evenings.filter((e) => e.sex && e.sex !== 'No');

  // Medicines, most used first, comparing the first half of the period with the second
  const byMed = {};
  for (const d of doses) {
    const m = (byMed[d.medId] ||= { name: d.medName, doses: 0, tablets: 0, days: new Set(), firstHalf: 0, secondHalf: 0 });
    m.doses += 1;
    m.tablets += d.tablets ?? 0;
    m.days.add(entryDay(d));
    if (firstHalf(entryDay(d))) m.firstHalf += 1; else m.secondHalf += 1;
  }
  const meds = Object.values(byMed)
    .map((m) => ({ ...m, days: m.days.size, perWeek: Math.round((m.doses / (days / 7)) * 10) / 10 }))
    .sort((a, b) => b.doses - a.doses);

  const hormones = activeMeds('hormone').map((h) => ({
    name: h.name,
    taken: evenings.filter((e) => e.hormones?.includes(h.name)).length,
    of: evenings.length,
  }));

  return {
    from, to, start, now,
    doctor: state.settings.doctor || '',
    name: state.settings.reportName || '',
    questions: state.settings.reportQuestions || '',
    sideEffects: state.settings.reportSideEffects || '',
    eveningsLogged: evenings.length,
    days,
    weeks,
    pain: {
      average: avg(painEvenings.map((e) => e.pain)),
      firstHalf: avg(half(painEvenings, true).map((e) => e.pain)),
      secondHalf: avg(half(painEvenings, false).map((e) => e.pain)),
      worst: worst && { pain: worst.pain, day: worst.day },
    },
    flares: {
      count: flares.length,
      average: avg(flares.filter((f) => f.pain != null).map((f) => f.pain)),
      highest: flares.length ? Math.max(...flares.map((f) => f.pain ?? 0)) : null,
      list: flares,
      locations: tally(flares.flatMap((f) => f.locations || [])),
      symptoms: tally(flares.flatMap((f) => f.symptoms || [])),
    },
    triggers: tally([...flares.flatMap((f) => f.triggers || []), ...evenings.flatMap((e) => e.triggers || [])], ['Not sure']),
    key: {
      periodDays: periodDays.length,
      painOnPeriodDays: avg(periodDays.filter((e) => e.pain != null).map((e) => e.pain)),
      painOtherDays: avg(otherDays.filter((e) => e.pain != null).map((e) => e.pain)),
      sexDays: sexDays.length,
      painfulSex: sexDays.filter((e) => e.sex === 'Yes, painful').length,
      bowel: countBy(evenings, 'bowel', ['Mild', 'Moderate', 'Strong']),
      bladder: countBy(evenings, 'bladder', ['Mild', 'Moderate', 'Strong']),
    },
    bleeding: countBy(evenings, 'bleeding', ['None', 'Spotting', 'Light', 'Medium', 'Heavy']),
    meds,
    hormones,
    sleep: countBy(evenings, 'sleep', ['Poor', 'Broken', 'Okay', 'Good', 'Deep']),
    mood: countBy(evenings, 'mood', ['Low', 'Flat', 'Okay', 'Good', 'Bright']),
    fatigue: {
      average: avg(evenings.filter((e) => e.fatigue != null).map((e) => e.fatigue)),
      firstHalf: avg(half(evenings.filter((e) => e.fatigue != null), true).map((e) => e.fatigue)),
      secondHalf: avg(half(evenings.filter((e) => e.fatigue != null), false).map((e) => e.fatigue)),
    },
  };
}

// ---------- Plain sentences, shared by the screen and the PDF ----------

export const rangeText = (r) => {
  const sameYear = r.start.getFullYear() === r.now.getFullYear();
  return `${formatDay(r.start)}${sameYear ? '' : ` ${r.start.getFullYear()}`} to ${formatDay(r.now)} ${r.now.getFullYear()}`;
};

// The parts of the report she can tick on or off, in order
export const SECTIONS = [
  ['pain', 'Pain'],
  ['flares', 'Flares'],
  ['triggers', 'Triggers'],
  ['key', 'Key symptoms'],
  ['bleeding', 'Bleeding'],
  ['meds', 'Medicines'],
  ['sideEffects', 'Side effects'],
  ['wellbeing', 'Sleep, tiredness and mood'],
  ['questions', 'Questions'],
];

export const chosenSections = () => state.settings.reportSections || SECTIONS.map(([k]) => k);

const levelList = (rows) => rows.filter((r) => r.count).map((r) => `${r.name.toLowerCase()} ${r.count}`).join(', ') || 'none';

export function sentences(r) {
  const s = {};
  s.pain = r.pain.average == null
    ? ['No evening reflections in these six weeks.']
    : [
      `Average evening pain ${r.pain.average}/10, from ${r.eveningsLogged} of ${r.days} evenings.`,
      `First half of the period ${r.pain.firstHalf ?? '–'}/10, second half ${r.pain.secondHalf ?? '–'}/10.`,
      `Highest: ${r.pain.worst.pain}/10 on ${formatDay(dateFromKey(r.pain.worst.day))}.`,
    ];
  s.flares = r.flares.count
    ? [
      `${r.flares.count} ${r.flares.count === 1 ? 'flare' : 'flares'}, average ${r.flares.average}/10, highest ${r.flares.highest}/10.`,
      r.flares.locations.length && `Where: ${r.flares.locations.map((l) => `${l.name.toLowerCase()} (${l.count})`).join(', ')}.`,
      r.flares.symptoms.length && `Also noted with flares: ${r.flares.symptoms.map((l) => `${l.name.toLowerCase()} (${l.count})`).join(', ')}.`,
    ].filter(Boolean)
    : ['No flares logged.'];
  s.triggers = r.triggers.length
    ? [`Most noted: ${r.triggers.slice(0, 6).map((t) => `${t.name.toLowerCase()} (${t.count})`).join(', ')}.`]
    : ['No triggers noted.'];
  s.key = [
    `Period days: ${r.key.periodDays}.${r.key.painOnPeriodDays != null ? ` Average pain on period days ${r.key.painOnPeriodDays}/10, other days ${r.key.painOtherDays ?? '–'}/10.` : ''}`,
    `Sex: ${r.key.sexDays} ${r.key.sexDays === 1 ? 'day' : 'days'}, painful on ${r.key.painfulSex}.`,
    `Bowel pain days: ${levelList(r.key.bowel)}.`,
    `Bladder pain days: ${levelList(r.key.bladder)}.`,
  ];
  s.bleeding = [`Bleeding by evening: ${levelList(r.bleeding)}.`];
  s.meds = r.meds.length
    ? r.meds.map((m) => `${m.name}: ${m.doses} ${m.doses === 1 ? 'dose' : 'doses'} on ${m.days} ${m.days === 1 ? 'day' : 'days'}${m.tablets ? `, ${m.tablets} tablets` : ''} (first half ${m.firstHalf}, second half ${m.secondHalf}).`)
    : ['No medicines logged.'];
  s.hormones = r.hormones.map((h) => `${h.name}: ticked on ${h.taken} of ${h.of} evenings.`);
  s.wellbeing = [
    `Sleep: ${levelList(r.sleep)}.`,
    `Tiredness: average ${r.fatigue.average ?? '–'}/10 (first half ${r.fatigue.firstHalf ?? '–'}, second half ${r.fatigue.secondHalf ?? '–'}).`,
    `Mood: ${levelList(r.mood)}.`,
  ];
  return s;
}

// One line per flare for the list
export function flareLine(f) {
  const d = new Date(f.at);
  const parts = [f.locations?.join(', '), f.types?.join(', ')].filter(Boolean).join('; ');
  const extra = [
    f.triggers?.length && `set off by ${f.triggers.join(', ').toLowerCase()}`,
    f.symptoms?.length && `with ${f.symptoms.join(', ').toLowerCase()}`,
  ].filter(Boolean).join('; ');
  return `${formatDay(d)}: ${f.pain ?? '?'}/10${parts ? `, ${parts.toLowerCase()}` : ''}${extra ? `; ${extra}` : ''}${f.note ? `. "${f.note}"` : ''}`;
}
