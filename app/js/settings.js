// Settings: her medicines and daily hormones, and whether the app is ready offline

import { state, saveMed, activeMeds } from './state.js';
import { openSheet, closeSheet } from './sheet.js';
import { bottleSVG, COLOURS } from './bottle.js';
import { el, esc, uid, formatTablets, stepTablets } from './util.js';

export function renderSettings(main) {
  const view = el(`
    <div>
      <header class="top"><h1>Settings</h1></header>
      <section class="card">
        <h2>Your shelf</h2>
        <p class="quiet">The first four sit on Today's pages. Use the arrows to change the order.</p>
        <div class="med-list" data-kind="med"></div>
        <button class="secondary" data-add="med">Add a medicine</button>
      </section>
      <section class="card">
        <h2>Daily hormones</h2>
        <p class="quiet">Ticked off in your evening reflection.</p>
        <div class="med-list" data-kind="hormone"></div>
        <button class="secondary" data-add="hormone">Add a daily hormone</button>
      </section>
      <p class="status" id="offline-status"></p>
    </div>`);

  for (const list of view.querySelectorAll('.med-list')) {
    const meds = activeMeds(list.dataset.kind);
    meds.forEach((med, i) => list.append(medRow(med, meds, i)));
  }
  view.querySelectorAll('[data-add]').forEach((b) => b.addEventListener('click', () => openMedSheet(null, b.dataset.add)));

  const status = view.querySelector('#offline-status');
  if (navigator.serviceWorker?.controller) {
    status.textContent = 'Ready to open without internet';
    status.classList.add('ready');
  } else {
    status.textContent = 'Getting ready to work offline…';
  }

  main.append(view);
}

function medRow(med, meds, i) {
  const row = el(`
    <div class="med-row">
      <button class="med-name">
        ${med.kind === 'med' ? bottleSVG(med.colour) : ''}
        <span>${esc(med.name)}</span>
      </button>
      <button class="round small" data-move="-1" aria-label="Move ${esc(med.name)} up" ${i === 0 ? 'disabled' : ''}>↑</button>
      <button class="round small" data-move="1" aria-label="Move ${esc(med.name)} down" ${i === meds.length - 1 ? 'disabled' : ''}>↓</button>
    </div>`);
  row.querySelector('.med-name').addEventListener('click', () => openMedSheet(med, med.kind));
  row.querySelectorAll('[data-move]').forEach((b) => b.addEventListener('click', async () => {
    const other = meds[i + Number(b.dataset.move)];
    [med.order, other.order] = [other.order, med.order];
    await saveMed(other);
    await saveMed(med);
  }));
  return row;
}

function openMedSheet(med, kind) {
  const editing = !!med;
  const draft = editing ? { ...med } : {
    id: uid(), name: '', colour: 'amber', startTablets: 1, kind, archived: false,
    order: Math.max(0, ...state.meds.map((m) => m.order + 1)),
  };
  const isMed = draft.kind === 'med';

  const root = el(`
    <form class="med-form">
      <h2>${editing ? 'Change' : 'Add'} ${isMed ? 'a medicine' : 'a daily hormone'}</h2>
      <label>Name <input type="text" data-name maxlength="40" autocomplete="off" autocapitalize="words" required value="${esc(draft.name)}"></label>
      ${isMed ? `
        <fieldset>
          <legend>Bottle colour</legend>
          <div class="swatches">
            ${Object.keys(COLOURS).map((c) => `
              <button type="button" class="swatch" data-colour="${c}" aria-pressed="${draft.colour === c}" aria-label="${c}">${bottleSVG(c)}</button>`).join('')}
          </div>
        </fieldset>
        <div class="stepper-row">
          <span>Tablets to start at</span>
          <div class="stepper small">
            <button type="button" class="round" data-step="-1" aria-label="Fewer">−</button>
            <span data-tablets></span>
            <button type="button" class="round" data-step="1" aria-label="More">+</button>
          </div>
        </div>` : ''}
      <button class="primary" type="submit">Save</button>
      ${editing ? `<button type="button" class="link danger" data-archive>Take off the ${isMed ? 'shelf' : 'list'}</button>` : ''}
    </form>`);

  const tabletsOut = root.querySelector('[data-tablets]');
  const showTablets = () => { if (tabletsOut) tabletsOut.textContent = formatTablets(draft.startTablets); };
  showTablets();

  root.querySelectorAll('[data-colour]').forEach((b) => b.addEventListener('click', () => {
    draft.colour = b.dataset.colour;
    root.querySelectorAll('[data-colour]').forEach((s) => s.setAttribute('aria-pressed', String(s === b)));
  }));
  root.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => {
    draft.startTablets = stepTablets(draft.startTablets, Number(b.dataset.step));
    showTablets();
  }));

  root.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    draft.name = root.querySelector('[data-name]').value.trim();
    if (!draft.name) return;
    await saveMed(draft);
    closeSheet();
  });

  // Taken off rather than deleted, so past doses keep their name
  root.querySelector('[data-archive]')?.addEventListener('click', async () => {
    await saveMed({ ...draft, archived: true });
    closeSheet();
  });

  openSheet(root);
  if (!editing) root.querySelector('[data-name]').focus();
}
