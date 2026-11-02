// Small hand-drawn charts (SVG), so they work offline with no chart library.
// One colour per chart, thin rounded bars, recessive grid, tap a bar or point
// to read its value, and every chart has a "Show as a list" table underneath.

import { el, esc } from './util.js';

const GOLD = '#D8B76E';
const HIGHLIGHT = '#F2DFA8';
const GRID = '#4A5A44';
const INK = '#B8AE95';

const W = 340;
const H = 170;
const PAD = { top: 22, right: 6, bottom: 26, left: 26 };
const plotW = W - PAD.left - PAD.right;
const plotH = H - PAD.top - PAD.bottom;

function niceMax(v) {
  if (v <= 4) return 4;
  const step = 10 ** Math.floor(Math.log10(v));
  return Math.ceil(v / (step / 2)) * (step / 2);
}

// A bar with rounded top corners sitting on the baseline
function barPath(x, y, w, h) {
  const r = Math.min(3, w / 2, h);
  const b = y + h;
  return `M${x} ${b}V${y + r}Q${x} ${y} ${x + r} ${y}H${x + w - r}Q${x + w} ${y} ${x + w} ${y + r}V${b}Z`;
}

function axisAndGrid(max, fixedTicks) {
  const ticks = fixedTicks || [0, max / 2, max];
  return ticks.map((t) => {
    const y = PAD.top + plotH - (t / max) * plotH;
    return `<line x1="${PAD.left}" x2="${W - PAD.right}" y1="${y}" y2="${y}" stroke="${GRID}" stroke-width="1" ${t ? 'stroke-dasharray="2 3"' : ''}/>
      <text x="${PAD.left - 6}" y="${y + 4}" text-anchor="end" fill="${INK}" font-size="10">${t}</text>`;
  }).join('');
}

function markerLines(markers, xOf) {
  return (markers || []).map((m) => {
    const x = xOf(m.index);
    return `<line x1="${x}" x2="${x}" y1="${PAD.top - 4}" y2="${PAD.top + plotH}" stroke="${GOLD}" stroke-width="1.5" stroke-dasharray="4 3"/>
      <text x="${Math.min(Math.max(x, PAD.left + 20), W - 24)}" y="${PAD.top - 9}" text-anchor="middle" fill="${GOLD}" font-size="11">${esc(m.label)}</text>`;
  }).join('');
}

function xLabelText(labels, xOf) {
  // A label can start at its bar instead of centring on it (so the first one isn't cut off)
  return labels.map((l) => {
    const x = l.anchor === 'start' ? Math.max(4, xOf(l.index) - 6) : Math.min(W - 12, xOf(l.index));
    return `<text x="${x}" y="${H - 8}" text-anchor="${l.anchor || 'middle'}" fill="${INK}" font-size="10">${esc(l.text)}</text>`;
  }).join('');
}

function wrap({ title, svg, caption, rows, columns, note }) {
  const card = el(`
    <section class="card chart">
      <h2>${esc(title)}</h2>
      ${note ? `<p class="quiet">${esc(note)}</p>` : ''}
      <div class="chart-svg">${svg}</div>
      <p class="chart-caption" aria-live="polite">${esc(caption)}</p>
      <details>
        <summary>Show as a list</summary>
        <table>
          <thead><tr>${columns.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead>
          <tbody>${rows.map((r) => `<tr>${r.map((v) => `<td>${esc(String(v))}</td>`).join('')}</tr>`).join('')}</tbody>
        </table>
      </details>
    </section>`);
  return card;
}

// data: [{ label, value, tip }]; labels: [{ index, text }]; markers: [{ index, label }]
export function barChart({ title, note, data, labels = [], markers = [], caption, columns }) {
  const max = niceMax(Math.max(1, ...data.map((d) => d.value)));
  const slot = plotW / data.length;
  const gap = Math.min(2, slot * 0.25);
  const xOf = (i) => PAD.left + slot * i + slot / 2;

  const bars = data.map((d, i) => {
    const h = (d.value / max) * plotH;
    const x = PAD.left + slot * i + gap / 2;
    return d.value > 0
      ? `<path data-bar="${i}" d="${barPath(x, PAD.top + plotH - h, Math.max(1.5, slot - gap), h)}" fill="${GOLD}"/>`
      : '';
  }).join('');
  // Tap targets cover the whole column, so thin bars are easy to hit
  const hits = data.map((d, i) => `<rect data-hit="${i}" x="${PAD.left + slot * i}" y="${PAD.top}" width="${slot}" height="${plotH}" fill="transparent"/>`).join('');

  const svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">
    ${axisAndGrid(max)}${markerLines(markers, xOf)}${bars}${xLabelText(labels, xOf)}${hits}</svg>`;
  const card = wrap({ title, note, svg, caption, columns, rows: data.map((d) => [d.label, d.value]) });

  const cap = card.querySelector('.chart-caption');
  card.querySelectorAll('[data-hit]').forEach((hit) => hit.addEventListener('click', () => {
    const i = Number(hit.dataset.hit);
    card.querySelectorAll('[data-bar]').forEach((b) => b.setAttribute('fill', Number(b.dataset.bar) === i ? HIGHLIGHT : GOLD));
    cap.textContent = data[i].tip;
  }));
  return card;
}

// data: [{ label, value (or null for a gap), tip }] on a fixed 0 to 10 scale
export function lineChart({ title, note, data, labels = [], markers = [], caption, columns }) {
  const max = 10;
  const step = plotW / Math.max(1, data.length - 1);
  const xOf = (i) => PAD.left + step * i;
  const yOf = (v) => PAD.top + plotH - (v / max) * plotH;

  // Separate runs, so missing weeks leave a gap rather than a false line
  const runs = [];
  let run = [];
  data.forEach((d, i) => {
    if (d.value == null) { if (run.length) runs.push(run); run = []; } else run.push(i);
  });
  if (run.length) runs.push(run);
  const lines = runs.map((r) => `<polyline points="${r.map((i) => `${xOf(i)},${yOf(data[i].value)}`).join(' ')}" fill="none" stroke="${GOLD}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`).join('');
  const dots = data.map((d, i) => (d.value == null ? '' : `<circle data-dot="${i}" cx="${xOf(i)}" cy="${yOf(d.value)}" r="${runs.find((r) => r.includes(i)).length === 1 ? 3 : 0}" fill="${GOLD}"/>`)).join('');
  const hits = data.map((d, i) => `<rect data-hit="${i}" x="${xOf(i) - step / 2}" y="${PAD.top}" width="${step}" height="${plotH}" fill="transparent"/>`).join('');

  const svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">
    ${axisAndGrid(max, [0, 5, 10])}${markerLines(markers, xOf)}${lines}${dots}${xLabelText(labels, xOf)}
    <circle data-focus r="4.5" fill="${HIGHLIGHT}" stroke="#1A241D" stroke-width="2" visibility="hidden"/>${hits}</svg>`;
  const card = wrap({ title, note, svg, caption, columns, rows: data.map((d) => [d.label, d.value ?? '–']) });

  const cap = card.querySelector('.chart-caption');
  const focus = card.querySelector('[data-focus]');
  card.querySelectorAll('[data-hit]').forEach((hit) => hit.addEventListener('click', () => {
    const i = Number(hit.dataset.hit);
    cap.textContent = data[i].tip;
    if (data[i].value == null) { focus.setAttribute('visibility', 'hidden'); return; }
    focus.setAttribute('cx', xOf(i));
    focus.setAttribute('cy', yOf(data[i].value));
    focus.setAttribute('visibility', 'visible');
  }));
  return card;
}
