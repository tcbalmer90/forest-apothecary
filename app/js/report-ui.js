// The interactive report screen, and turning it into a PDF to share.
// She chooses the period (usually since her last appointment) and ticks which
// sections to include; unticked sections are left out of the screen and the PDF.

import { saveSetting, doctorName } from './state.js';
import { openSheet, closeSheet, toast } from './sheet.js';
import { lineChart, barChart } from './charts.js';
import { reportData, sentences, flareLine, rangeText, SECTIONS, chosenSections, DEFAULT_WEEKS } from './report.js';
import { appointments, appointmentLabel } from './appointments.js';
import { PdfDoc } from './pdf.js';
import { shareFile, shareOrCancel } from './backup.js';
import { el, esc, formatDay, addDays, dateFromKey, dayKey } from './util.js';

const lines = (list) => list.map((l) => `<p>${esc(l)}</p>`).join('');

// The periods she can choose from: since each appointment, or a fixed span
function periods() {
  const today = dayKey(new Date());
  const since = appointments()
    .filter((a) => a.day <= today)
    .map((a) => ({ label: `Since the appointment on ${appointmentLabel(a)}`, start: dateFromKey(a.day), appointment: a }));
  return [
    ...since,
    { label: `The last ${DEFAULT_WEEKS} weeks`, start: addDays(new Date(), -(DEFAULT_WEEKS * 7 - 1)) },
    { label: 'The last 3 months', start: addDays(new Date(), -90) },
  ];
}

// With many weeks, label every second or third week so the dates don't crowd
function weekLabels(weeks) {
  const every = Math.max(1, Math.ceil(weeks.length / 7));
  return weeks
    .map((w, i) => ({ index: i, text: `${w.begins.getDate()}/${w.begins.getMonth() + 1}` }))
    .filter((_, i) => i % every === 0);
}

export function openReport() {
  const doctor = doctorName();
  const options = periods();
  let period = options[0];
  let r;
  let s;

  const root = el(`
    <div class="report">
      <div class="flow-top">
        <button class="link" data-close>Close</button>
        <span></span>
      </div>
      <h1 data-title></h1>
      <p class="quiet" data-range></p>
      <label class="field">Covers
        <select data-period>${options.map((o, i) => `<option value="${i}">${esc(o.label)}</option>`).join('')}</select>
      </label>
      <details class="card choose">
        <summary>Choose what to include</summary>
        <div class="choose-list">
          ${SECTIONS.map(([key, title]) => `
            <label class="check"><input type="checkbox" data-section="${key}" ${chosenSections().includes(key) ? 'checked' : ''}> ${esc(title)}</label>`).join('')}
        </div>
      </details>
      <div class="report-body"></div>
      <section class="card" data-part="sideEffects">
        <h2>Side effects</h2>
        <textarea rows="3" data-setting="reportSideEffects" placeholder="Anything you've noticed from your medicines"></textarea>
      </section>
      <section class="card" data-part="questions">
        <h2>Questions for ${esc(doctor)}</h2>
        <textarea rows="4" data-setting="reportQuestions" placeholder="What would you like to ask?"></textarea>
      </section>
      <label class="field">Your name on the report (optional)
        <input type="text" data-setting="reportName" autocomplete="name">
      </label>
      <button class="primary" data-share>Share as PDF</button>
      <p class="quiet center">Your words save as you type. Nothing leaves your phone until you share.</p>
    </div>`);

  const field = (k) => root.querySelector(`[data-setting="${k}"]`);
  const picked = () => [...root.querySelectorAll('[data-section]')].filter((c) => c.checked).map((c) => c.dataset.section);

  function build() {
    r = reportData({ start: period.start });
    s = sentences(r);
    root.querySelector('[data-title]').textContent = `Pages since ${formatDay(r.start)}`;
    root.querySelector('[data-range]').textContent = `${rangeText(r)}. For ${doctor}.`;

    const on = picked();
    const body = root.querySelector('.report-body');
    body.innerHTML = '';
    for (const [key, title] of SECTIONS) {
      if (!on.includes(key) || !s[key]) continue;
      const card = el(`<section class="card"><h2>${title}</h2>${lines(s[key])}</section>`);
      if (key === 'pain' && r.pain.average != null) {
        card.append(chartBody(lineChart({
          title: 'Evening pain each week',
          data: r.weeks.map((w) => ({ label: w.label, value: w.pain, tip: w.pain == null ? `${w.label}: no reflections` : `${w.label}: ${w.pain}/10 (${w.evenings} evenings)` })),
          labels: weekLabels(r.weeks),
          caption: 'Tap the line to see a week.',
          columns: ['Week', 'Average pain'],
        })));
      }
      if (key === 'flares' && r.flares.count) {
        card.append(chartBody(barChart({
          title: 'Flares each week',
          data: r.weeks.map((w) => ({ label: w.label, value: w.flares, tip: `${w.label}: ${w.flares} ${w.flares === 1 ? 'flare' : 'flares'}` })),
          labels: weekLabels(r.weeks),
          caption: 'Tap a bar to see a week.',
          columns: ['Week', 'Flares'],
        })));
        card.append(el(`<details><summary>Every flare</summary>${r.flares.list.map((f) => `<p>${esc(flareLine(f))}</p>`).join('')}</details>`));
      }
      if (key === 'meds' && s.hormones.length) card.insertAdjacentHTML('beforeend', lines(s.hormones));
      body.append(card);
    }
    // Her typed sections stay in place (so nothing is lost), just hidden when unticked
    root.querySelectorAll('[data-part]').forEach((p) => { p.hidden = !on.includes(p.dataset.part); });
  }

  // Fill in her saved words once
  const first = reportData();
  field('reportSideEffects').value = first.sideEffects;
  field('reportQuestions').value = first.questions;
  field('reportName').value = first.name;

  root.querySelector('[data-period]').addEventListener('change', (e) => { period = options[Number(e.target.value)]; build(); });
  root.querySelectorAll('[data-section]').forEach((c) => c.addEventListener('change', () => {
    saveSetting('reportSections', picked());
    build();
  }));

  // Her own words save as she types
  root.querySelectorAll('[data-setting]').forEach((input) => {
    let timer;
    input.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => saveSetting(input.dataset.setting, input.value.trim()), 400);
    });
  });

  root.querySelector('[data-close]').addEventListener('click', closeSheet);
  root.querySelector('[data-share]').addEventListener('click', async () => {
    // Use exactly what is on screen, even if the last save hasn't landed yet
    const now = {
      ...r,
      sideEffects: field('reportSideEffects').value.trim(),
      questions: field('reportQuestions').value.trim(),
      name: field('reportName').value.trim(),
      appointment: period.appointment || null,
    };
    const file = new File([reportPdf(now, s, doctor, picked())], `report-${r.to}.pdf`, { type: 'application/pdf' });
    try {
      await shareOrCancel(() => shareFile(file));
    } catch {
      toast('Something went wrong sharing the report. Please try again.');
    }
  });

  build();
  openSheet(root, { full: true });
}

// A chart from charts.js without its card frame, to sit inside a report section
function chartBody(card) {
  card.classList.remove('card');
  card.classList.add('report-chart');
  return card;
}

// ---------- The PDF ----------

export function reportPdf(r, s, doctor, include = SECTIONS.map(([k]) => k)) {
  const pdf = new PdfDoc();
  pdf.write(`Pages since ${formatDay(r.start)}`, { size: 22, font: 'serif', gapAfter: 2 });
  pdf.write(`${rangeText(r)}${r.name ? `  ·  ${r.name}` : ''}  ·  For ${doctor}`, { size: 10, colour: '#555555', gapAfter: 2 });
  if (r.appointment) pdf.write(`Since the appointment on ${appointmentLabel(r.appointment)}.`, { size: 9, colour: '#555555', gapAfter: 2 });
  pdf.write('Recorded day by day in a phone diary. A summary of what was logged, not a diagnosis.', { size: 8.5, colour: '#777777' });
  pdf.rule();

  const section = (title, list) => {
    pdf.write(title, { size: 13, font: 'bold', gapAfter: 3 });
    for (const line of list) pdf.write(line);
    pdf.y -= 6;
  };
  const weekBars = (pick) => r.weeks.map((w) => ({ label: `${w.begins.getDate()}/${w.begins.getMonth() + 1}`, value: pick(w) }));
  const has = (k) => include.includes(k);

  if (has('pain')) {
    section('Pain', s.pain);
    if (r.pain.average != null && r.weeks.length <= 16) {
      pdf.write('Average evening pain each week (out of 10)', { size: 8.5, colour: '#555555', gapAfter: 8 });
      pdf.bars(weekBars((w) => w.pain), { max: 10 });
    }
  }
  if (has('flares')) {
    section('Flares', s.flares);
    for (const f of r.flares.list) pdf.write(`•  ${flareLine(f)}`, { size: 9.5, x: 60, width: 485, gapAfter: 2 });
    if (r.flares.count) pdf.y -= 6;
  }
  if (has('triggers')) section('Triggers', s.triggers);
  if (has('key')) section('Key symptoms', s.key);
  if (has('bleeding')) section('Bleeding', s.bleeding);
  if (has('meds')) section('Medicines', [...s.meds, ...s.hormones]);
  if (has('sideEffects')) section('Side effects', [r.sideEffects || 'None noted.']);
  if (has('wellbeing')) section('Sleep, tiredness and mood', s.wellbeing);
  if (has('questions')) section(`Questions for ${doctor}`, [r.questions || 'None written.']);

  pdf.rule();
  pdf.write(`Made ${formatDay(r.now)} ${r.now.getFullYear()} with Forest Apothecary.`, { size: 8, colour: '#777777' });
  return pdf.toBytes();
}
