// The interactive report screen, and turning it into a PDF to share

import { saveSetting, doctorName } from './state.js';
import { openSheet, closeSheet, toast } from './sheet.js';
import { lineChart, barChart } from './charts.js';
import { reportData, sentences, flareLine, rangeText } from './report.js';
import { PdfDoc } from './pdf.js';
import { shareFile, shareOrCancel } from './backup.js';
import { el, esc, formatDay } from './util.js';

const SECTIONS = [
  ['pain', 'Pain'],
  ['flares', 'Flares'],
  ['triggers', 'Triggers'],
  ['key', 'Key symptoms'],
  ['bleeding', 'Bleeding'],
  ['meds', 'Medicines'],
  ['wellbeing', 'Sleep, tiredness and mood'],
];

const lines = (list) => list.map((l) => `<p>${esc(l)}</p>`).join('');

export function openReport() {
  const r = reportData();
  const s = sentences(r);
  const doctor = doctorName();

  const root = el(`
    <div class="report">
      <div class="flow-top">
        <button class="link" data-close>Close</button>
        <span></span>
        <span></span>
      </div>
      <h1>Six weeks of pages</h1>
      <p class="quiet">${esc(rangeText(r))}. For ${esc(doctor)}.</p>
      <div class="report-body"></div>
      <section class="card">
        <h2>Side effects</h2>
        <textarea rows="3" data-setting="reportSideEffects" placeholder="Anything you've noticed from your medicines">${esc(r.sideEffects)}</textarea>
      </section>
      <section class="card">
        <h2>Questions for ${esc(doctor)}</h2>
        <textarea rows="4" data-setting="reportQuestions" placeholder="What would you like to ask?">${esc(r.questions)}</textarea>
      </section>
      <label class="field">Your name on the report (optional)
        <input type="text" data-setting="reportName" autocomplete="name" value="${esc(r.name)}">
      </label>
      <button class="primary" data-share>Share as PDF</button>
      <p class="quiet center">Your words save as you type. Nothing leaves your phone until you share.</p>
    </div>`);

  const body = root.querySelector('.report-body');
  for (const [key, title] of SECTIONS) {
    const card = el(`<section class="card"><h2>${title}</h2>${lines(s[key])}</section>`);
    if (key === 'pain' && r.pain.average != null) {
      card.append(chartBody(lineChart({
        title: 'Evening pain each week',
        data: r.weeks.map((w) => ({ label: w.label, value: w.pain, tip: w.pain == null ? `${w.label}: no reflections` : `${w.label}: ${w.pain}/10 (${w.evenings} evenings)` })),
        labels: r.weeks.map((w, i) => ({ index: i, text: `${w.begins.getDate()}/${w.begins.getMonth() + 1}` })),
        caption: 'Tap the line to see a week.',
        columns: ['Week', 'Average pain'],
      })));
    }
    if (key === 'flares' && r.flares.count) {
      card.append(chartBody(barChart({
        title: 'Flares each week',
        data: r.weeks.map((w) => ({ label: w.label, value: w.flares, tip: `${w.label}: ${w.flares} ${w.flares === 1 ? 'flare' : 'flares'}` })),
        labels: r.weeks.map((w, i) => ({ index: i, text: `${w.begins.getDate()}/${w.begins.getMonth() + 1}` })),
        caption: 'Tap a bar to see a week.',
        columns: ['Week', 'Flares'],
      })));
      card.append(el(`<details><summary>Every flare</summary>${r.flares.list.map((f) => `<p>${esc(flareLine(f))}</p>`).join('')}</details>`));
    }
    if (key === 'meds' && s.hormones.length) card.insertAdjacentHTML('beforeend', lines(s.hormones));
    body.append(card);
  }

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
    const now = { ...r };
    root.querySelectorAll('[data-setting]').forEach((i) => {
      const k = { reportSideEffects: 'sideEffects', reportQuestions: 'questions', reportName: 'name' }[i.dataset.setting];
      now[k] = i.value.trim();
    });
    const file = new File([reportPdf(now, s, doctor)], `report-${r.to}.pdf`, { type: 'application/pdf' });
    try {
      await shareOrCancel(() => shareFile(file));
    } catch {
      toast('Something went wrong sharing the report. Please try again.');
    }
  });

  openSheet(root, { full: true });
}

// A chart from charts.js without its card frame, to sit inside a report section
function chartBody(card) {
  card.classList.remove('card');
  card.classList.add('report-chart');
  return card;
}

// ---------- The PDF ----------

export function reportPdf(r, s, doctor) {
  const pdf = new PdfDoc();
  pdf.write('Six weeks of pages', { size: 22, font: 'serif', gapAfter: 2 });
  pdf.write(`${rangeText(r)}${r.name ? `  ·  ${r.name}` : ''}  ·  For ${doctor}`, { size: 10, colour: '#555555', gapAfter: 2 });
  pdf.write('Recorded day by day in a phone diary. A summary of what was logged, not a diagnosis.', { size: 8.5, colour: '#777777' });
  pdf.rule();

  const section = (title, list) => {
    pdf.write(title, { size: 13, font: 'bold', gapAfter: 3 });
    for (const line of list) pdf.write(line);
    pdf.y -= 6;
  };

  section('Pain', s.pain);
  if (r.pain.average != null) {
    pdf.write('Average evening pain each week (out of 10)', { size: 8.5, colour: '#555555', gapAfter: 8 });
    pdf.bars(r.weeks.map((w) => ({ label: `${w.begins.getDate()}/${w.begins.getMonth() + 1}`, value: w.pain })), { max: 10 });
  }
  section('Flares', s.flares);
  if (r.flares.count) {
    for (const f of r.flares.list) pdf.write(`•  ${flareLine(f)}`, { size: 9.5, x: 60, width: 485, gapAfter: 2 });
    pdf.y -= 6;
  }
  section('Triggers', s.triggers);
  section('Key symptoms', s.key);
  section('Bleeding', s.bleeding);
  section('Medicines', [...s.meds, ...s.hormones]);
  section('Side effects', [r.sideEffects || 'None noted.']);
  section('Sleep, tiredness and mood', s.wellbeing);
  section(`Questions for ${doctor}`, [r.questions || 'None written.']);

  pdf.rule();
  pdf.write(`Made ${formatDay(r.now)} ${r.now.getFullYear()} with Forest Apothecary.`, { size: 8, colour: '#777777' });
  return pdf.toBytes();
}
