// History: every entry, grouped by day, newest first. Tap any entry to change it.

import { state, entryDay } from './state.js';
import { entryRow } from './today.js';
import { el, friendlyDay } from './util.js';

let daysShown = 30;

export function renderHistory(main) {
  const view = el(`
    <div>
      <header class="top"><h1>History</h1></header>
      <div class="days"></div>
    </div>`);

  const byDay = new Map();
  for (const e of state.entries) {
    const key = entryDay(e);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(e);
  }
  const keys = [...byDay.keys()].sort().reverse();
  const days = view.querySelector('.days');

  if (!keys.length) {
    days.append(el('<p class="quiet">Nothing here yet. Your entries will gather here, day by day.</p>'));
  }

  for (const key of keys.slice(0, daysShown)) {
    // Reflection last in the day, everything else newest first
    const entries = byDay.get(key).sort((a, b) => {
      if (a.kind === 'reflection') return 1;
      if (b.kind === 'reflection') return -1;
      return b.at - a.at;
    });
    const section = el(`<section class="card day"><h2>${friendlyDay(key)}</h2></section>`);
    for (const e of entries) section.append(entryRow(e));
    days.append(section);
  }

  if (keys.length > daysShown) {
    const more = el('<button class="secondary">Show earlier days</button>');
    more.addEventListener('click', () => {
      daysShown += 30;
      main.innerHTML = '';
      renderHistory(main);
    });
    days.append(more);
  }

  main.append(view);
}
