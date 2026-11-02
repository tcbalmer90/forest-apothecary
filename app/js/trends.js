// Trends: doses each month, time of day, pain week by week,
// start markers for medicines, and a "Just for fun" moon chart.

import { state } from './state.js';
import { barChart, lineChart } from './charts.js';
import { moonPhase, PHASE_NAMES } from './moon.js';
import { el, esc, dayKey, dateFromKey, formatDay } from './util.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];
const DAY = 24 * 60 * 60 * 1000;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

let chosen = 'all'; // which medicine the dose charts show

export function renderTrends(main) {
  const doses = state.entries.filter((e) => e.kind === 'dose');
  const view = el(`
    <div>
      <header class="top"><h1>Trends</h1></header>
      <div class="chips filter" role="group" aria-label="Which medicine"></div>
      <div class="charts"></div>
      <h2 class="fun-heading">Just for fun</h2>
      <div class="fun"></div>
    </div>`);

  // Medicine filter, most logged first
  const counts = {};
  for (const d of doses) counts[d.medId] = (counts[d.medId] || 0) + 1;
  const medIds = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
  if (chosen !== 'all' && !counts[chosen]) chosen = 'all';
  const nameOf = (id) => state.meds.find((m) => m.id === id)?.name
    || doses.find((d) => d.medId === id)?.medName || 'Medicine';
  const filter = view.querySelector('.filter');
  for (const id of ['all', ...medIds]) {
    const chip = el(`<button class="chip" aria-pressed="${chosen === id}">${esc(id === 'all' ? 'All medicines' : nameOf(id))}</button>`);
    chip.addEventListener('click', () => { chosen = id; main.innerHTML = ''; renderTrends(main); });
    filter.append(chip);
  }
  if (!medIds.length) filter.remove();

  const picked = chosen === 'all' ? doses : doses.filter((d) => d.medId === chosen);
  const charts = view.querySelector('.charts');
  if (!picked.length) {
    charts.append(el('<section class="card"><p class="quiet">Nothing to chart yet. Your trends will grow as you log, or bring in your Notes history from Settings.</p></section>'));
  } else {
    charts.append(monthlyChart(picked), timeOfDayChart(picked));
  }
  const pain = painChart();
  if (pain) charts.append(pain);

  view.querySelector('.fun').append(moonFunChart());
  main.append(view);
}

// Medicines (and hormones) she has given a start date
function startMarkers(indexOf) {
  return state.meds
    .filter((m) => m.startedOn)
    .map((m) => ({ index: indexOf(dateFromKey(m.startedOn)), label: `${m.name} starts` }))
    .filter((m) => m.index != null);
}

// ---------- Doses each month ----------

function monthlyChart(doses) {
  const first = new Date(Math.min(...doses.map((d) => d.at)));
  const now = new Date();
  const months = [];
  for (let d = new Date(first.getFullYear(), first.getMonth(), 1); d <= now; d.setMonth(d.getMonth() + 1)) {
    months.push(new Date(d));
  }
  const key = (d) => d.getFullYear() * 12 + d.getMonth();
  const start = key(months[0]);
  const values = months.map(() => 0);
  for (const dose of doses) values[key(new Date(dose.at)) - start] += 1;

  const data = months.map((m, i) => ({
    label: `${MONTHS[m.getMonth()].slice(0, 3)} ${m.getFullYear()}`,
    value: values[i],
    tip: `${MONTHS[m.getMonth()]} ${m.getFullYear()}: ${plural(values[i], 'dose')}`,
  }));
  // Label the first month with its year, then each January far enough from it to fit
  const gap = Math.max(3, Math.ceil(months.length / 6));
  const labels = [{ index: 0, text: `${MONTHS[months[0].getMonth()].slice(0, 3)} ${months[0].getFullYear()}`, anchor: 'start' }];
  months.forEach((m, i) => {
    if (m.getMonth() === 0 && i >= gap) labels.push({ index: i, text: String(m.getFullYear()) });
  });
  const indexOf = (date) => {
    const i = key(date) - start;
    return i >= 0 && i < months.length ? i : null;
  };

  return barChart({
    title: 'Doses each month',
    data,
    labels,
    markers: startMarkers(indexOf),
    caption: `${plural(values.at(-1), 'dose')} so far this month. Tap a bar to see a month.`,
    columns: ['Month', 'Doses'],
  });
}

// ---------- Time of day ----------

const WINDOWS = ['12am', '3am', '6am', '9am', '12pm', '3pm', '6pm', '9pm'];

function timeOfDayChart(doses) {
  const timed = doses.filter((d) => !d.timeUnknown);
  const values = WINDOWS.map(() => 0);
  for (const d of timed) values[Math.floor(new Date(d.at).getHours() / 3)] += 1;
  const range = (i) => `${WINDOWS[i]} to ${WINDOWS[(i + 1) % 8]}`;
  const share = (v) => (timed.length ? Math.round((v / timed.length) * 100) : 0);
  const busiest = values.indexOf(Math.max(...values));

  return barChart({
    title: 'Time of day',
    note: `From ${plural(timed.length, 'dose')} with a time.`,
    data: values.map((v, i) => ({ label: range(i), value: v, tip: `${range(i)}: ${plural(v, 'dose')} (${share(v)}%)` })),
    labels: WINDOWS.map((text, index) => ({ index, text })),
    caption: timed.length ? `Most often between ${WINDOWS[busiest]} and ${WINDOWS[(busiest + 1) % 8]}.` : 'No doses with a time yet.',
    columns: ['Time', 'Doses'],
  });
}

// ---------- Pain, week by week (from evening reflections) ----------

function painChart() {
  const evenings = state.entries.filter((e) => e.kind === 'reflection' && e.pain != null);
  if (!evenings.length) return null;
  const WEEKS = 26;
  // Weeks start on Monday
  const today = dateFromKey(dayKey(new Date()));
  const monday = new Date(today.getTime() - ((today.getDay() + 6) % 7) * DAY);
  const starts = Array.from({ length: WEEKS }, (_, i) => new Date(monday.getTime() - (WEEKS - 1 - i) * 7 * DAY));
  const indexOf = (date) => {
    const i = Math.floor((date - starts[0]) / (7 * DAY));
    return i >= 0 && i < WEEKS ? i : null;
  };

  const sums = starts.map(() => ({ total: 0, n: 0 }));
  for (const e of evenings) {
    const i = indexOf(dateFromKey(e.day));
    if (i != null) { sums[i].total += e.pain; sums[i].n += 1; }
  }
  const data = starts.map((s, i) => {
    const { total, n } = sums[i];
    const avg = n ? Math.round((total / n) * 10) / 10 : null;
    return {
      label: `Week of ${formatDay(s)}`,
      value: avg,
      tip: n ? `Week of ${formatDay(s)}: average pain ${avg}/10 (${plural(n, 'evening')})` : `Week of ${formatDay(s)}: no reflections`,
    };
  });
  const labels = starts
    .map((s, i) => ({ s, i }))
    .filter(({ s, i }) => i === 0 || s.getDate() <= 7)
    .filter((_, k, all) => k % 2 === 0 || all.length < 7)
    .map(({ s, i }) => ({ index: i, text: MONTHS[s.getMonth()].slice(0, 3) }));

  return lineChart({
    title: 'Pain, week by week',
    note: 'The average from your evening reflections, over six months.',
    data,
    labels,
    markers: startMarkers(indexOf),
    caption: 'Tap the line to see a week.',
    columns: ['Week', 'Average pain'],
  });
}

// ---------- Just for fun: flares and the moon ----------
// Never part of the doctor's report.

const SHORT = ['New', 'Cres', 'Half', 'Gibb', 'Full', 'Gibb', 'Half', 'Cres'];

function moonFunChart() {
  const flares = state.entries.filter((e) => e.kind === 'flare');
  const values = PHASE_NAMES.map(() => 0);
  for (const f of flares) values[moonPhase(new Date(f.at)).index] += 1;
  const chart = barChart({
    title: 'Flares and the moon',
    note: "Only for curiosity: the moon isn't linked to your symptoms.",
    data: PHASE_NAMES.map((name, i) => ({ label: name, value: values[i], tip: `${name}: ${plural(values[i], 'flare')}` })),
    labels: SHORT.map((text, index) => ({ index, text })),
    caption: flares.length ? 'Tap a bar to see a phase.' : 'No flares logged yet.',
    columns: ['Moon phase', 'Flares'],
  });
  chart.classList.add('fun-chart');
  return chart;
}
