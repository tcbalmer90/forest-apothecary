// Today's pages: the medicine shelf, the two main buttons and what's logged so far

import { state, activeMeds, entryDay, reflectionFor } from './state.js';
import { openDoseSheet, openMoreSheet, openFlare, openReflection, openEntry, describe } from './flows.js';
import { bottleSVG } from './bottle.js';
import { shelfNotes } from './stock.js';
import { needsNudge, backUpToFiles } from './backup.js';
import { toast } from './sheet.js';
import { el, esc, dayKey, formatDay, reflectionDay } from './util.js';

const SHELF_SIZE = 4;

export function renderToday(main) {
  const now = new Date();
  const meds = activeMeds('med');
  const tonight = reflectionDay(now);
  const yesterday = dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  const done = reflectionFor(tonight);
  const lastNight = tonight !== yesterday && reflectionFor(yesterday);

  const view = el(`
    <div>
      <header class="top">
        <p class="date">${formatDay(now)}</p>
        <h1>Today's pages</h1>
      </header>
      <section class="shelf" aria-label="Your medicines"></section>
      <div class="main-buttons">
        <button class="primary flare-btn" data-flare>Log a flare</button>
        <button class="secondary reflect-btn ${done ? 'done' : ''}" data-reflect>
          Evening reflection${done ? '<small>Done for tonight</small>' : ''}
        </button>
        ${lastNight && !done ? '<p class="quiet">Last night\'s pages are done.</p>' : ''}
      </div>
      <section class="card nudge" hidden>
        <p>It's been a week or more since your last backup. A quick one keeps your pages safe.</p>
        <button class="secondary" data-backup>Back up now</button>
      </section>
      <section class="card notes" hidden>
        <h2>Notes from the shelf</h2>
        <ul></ul>
      </section>
      <section class="card so-far">
        <h2>So far today</h2>
        <div class="entry-list"></div>
      </section>
    </div>`);

  // Shelf: up to four bottles; if there are more, three plus a "More" bottle
  const shelf = view.querySelector('.shelf');
  if (!meds.length) {
    shelf.replaceWith(el(`
      <section class="card empty-shelf">
        <h2>Fill your shelf</h2>
        <p>Add the medicines you take, and each gets its own little bottle here.</p>
        <a class="secondary button" href="#settings">Add your medicines</a>
      </section>`));
  } else {
    const fits = meds.length <= SHELF_SIZE;
    const shown = fits ? meds : meds.slice(0, SHELF_SIZE - 1);
    for (const med of shown) {
      const b = el(`<button class="bottle-btn">${bottleSVG(med.colour)}<span>${esc(med.name)}</span></button>`);
      b.addEventListener('click', () => openDoseSheet(med));
      shelf.append(b);
    }
    if (!fits) {
      const more = el(`<button class="bottle-btn">${bottleSVG(null, { empty: true })}<span>More</span></button>`);
      more.addEventListener('click', () => openMoreSheet(meds.slice(SHELF_SIZE - 1)));
      shelf.append(more);
    }
  }

  view.querySelector('[data-flare]').addEventListener('click', () => openFlare());
  view.querySelector('[data-reflect]').addEventListener('click', () => openReflection(done || null));

  // Running low, scripts expiring, using more than usual
  const notes = shelfNotes();
  if (notes.length) {
    const card = view.querySelector('.notes');
    card.hidden = false;
    for (const n of notes) card.querySelector('ul').append(el(`<li>${esc(n.text)}</li>`));
  }

  // A gentle weekly reminder to back up
  if (needsNudge()) {
    const nudge = view.querySelector('.nudge');
    nudge.hidden = false;
    nudge.querySelector('[data-backup]').addEventListener('click', () => backUpToFiles()
      .then((done) => done && toast('Backed up. Thank you, future you.'))
      .catch(() => toast('Something went wrong. Please try again.')));
  }

  // Today's doses and flares, newest first
  const today = dayKey(now);
  const list = view.querySelector('.entry-list');
  const items = state.entries
    .filter((e) => e.kind !== 'reflection' && entryDay(e) === today)
    .sort((a, b) => b.at - a.at);
  if (!items.length) {
    list.append(el('<p class="quiet">Nothing logged yet today.</p>'));
  }
  for (const e of items) list.append(entryRow(e));

  main.append(view);
}

export function entryRow(e) {
  const d = describe(e);
  const row = el(`
    <button class="entry">
      <span class="entry-time">${esc(d.time)}</span>
      <span class="entry-text">${esc(d.text)}${d.sub ? `<small>${esc(d.sub)}</small>` : ''}</span>
    </button>`);
  row.addEventListener('click', () => openEntry(e));
  return row;
}
