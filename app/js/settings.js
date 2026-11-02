// Settings: her medicines and daily hormones, her doctor, backups, and whether the app is ready offline

import { state, saveMed, saveSetting, activeMeds } from './state.js';
import { openSheet, closeSheet, toast } from './sheet.js';
import { tabletsLeft, tracksStock, countedLabel } from './stock.js';
import { bottleSVG, COLOURS } from './bottle.js';
import { backupCards } from './backup-ui.js';
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
      <section class="card">
        <h2>Your doctor</h2>
        <p class="quiet">Used in gentle notes, like "worth mentioning to …". Stays on this phone.</p>
        <label class="field">Name <input type="text" data-doctor maxlength="40" autocomplete="off" autocapitalize="words" placeholder="your doctor" value="${esc(state.settings.doctor || '')}"></label>
      </section>
      <div data-backups></div>
      <p class="status" id="offline-status"></p>
    </div>`);
  view.querySelector('[data-backups]').replaceWith(...backupCards().children);

  for (const list of view.querySelectorAll('.med-list')) {
    const meds = activeMeds(list.dataset.kind);
    meds.forEach((med, i) => list.append(medRow(med, meds, i)));
  }
  view.querySelectorAll('[data-add]').forEach((b) => b.addEventListener('click', () => openMedSheet(null, b.dataset.add)));
  view.querySelector('[data-doctor]').addEventListener('change', (e) => saveSetting('doctor', e.target.value.trim()));

  const status = view.querySelector('#offline-status');
  if (navigator.serviceWorker?.controller) {
    status.textContent = 'Ready to open without internet';
    status.classList.add('ready');
    // Show which version is running, e.g. "Ready to open without internet · v5"
    navigator.serviceWorker.addEventListener('message', (e) => {
      if (e.data?.version) status.textContent = `Ready to open without internet · ${e.data.version}`;
    }, { once: true });
    navigator.serviceWorker.controller.postMessage('version');
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
        <span>${esc(med.name)}${stockSummary(med)}</span>
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

function stockSummary(med) {
  if (!tracksStock(med)) return '';
  const parts = [`${formatTablets(tabletsLeft(med))} left`];
  if (med.repeats != null) parts.push(`${med.repeats} ${med.repeats === 1 ? 'repeat' : 'repeats'}`);
  return `<small>${parts.join(' · ')}</small>`;
}

function openMedSheet(med, kind) {
  const editing = !!med;
  const draft = editing ? { ...med } : {
    id: uid(), name: '', colour: 'amber', startTablets: 1, kind, archived: false,
    order: Math.max(0, ...state.meds.map((m) => m.order + 1)),
  };
  const isMed = draft.kind === 'med';
  const left = editing ? tabletsLeft(med) : null;

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
        </div>
        <fieldset class="stock">
          <legend>Stock, if you'd like reminders</legend>
          <div class="field-grid">
            <label>Tablets you have now <input type="number" inputmode="decimal" min="0" step="0.5" data-count value="${left ?? ''}"></label>
            <label>Repeats left <input type="number" inputmode="numeric" min="0" step="1" data-repeats value="${draft.repeats ?? ''}"></label>
            <label>Tablets in a box <input type="number" inputmode="numeric" min="1" step="1" data-pack value="${draft.packSize ?? ''}"></label>
            <label>Script expires <input type="date" data-expiry value="${draft.scriptExpiry || ''}"></label>
          </div>
          ${left != null ? `<p class="quiet counted">Counted ${countedLabel(draft)}. Doses logged for before then don't change it.</p>` : ''}
          ${left != null && draft.packSize ? '<button type="button" class="secondary" data-box>I picked up a new box</button>' : ''}
          <label class="check"><input type="checkbox" data-watch ${draft.watchUse ? 'checked' : ''}> Let me know if I'm using this more than usual</label>
        </fieldset>` : ''}
      <label>Started on, if you'd like it marked on your charts <input type="date" data-started value="${draft.startedOn || ''}"></label>
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

  const field = (name) => root.querySelector(`[data-${name}]`);
  const numberOrNull = (name) => (field(name).value === '' ? null : Number(field(name).value));

  root.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    draft.name = field('name').value.trim();
    if (!draft.name) return;
    draft.startedOn = field('started').value || null;
    if (isMed) {
      // A changed count starts a fresh tally from now; an unchanged one keeps counting down
      const count = numberOrNull('count');
      if (count == null) {
        delete draft.stockCount;
        delete draft.stockAt;
      } else if (count !== left) {
        draft.stockCount = count;
        draft.stockAt = Date.now();
      }
      draft.repeats = numberOrNull('repeats');
      draft.packSize = numberOrNull('pack');
      draft.scriptExpiry = field('expiry').value || null;
      draft.watchUse = field('watch').checked;
    }
    await saveMed(draft);
    closeSheet();
  });

  // A new box: add a box's worth of tablets and use up one repeat, then save
  field('box')?.addEventListener('click', () => {
    const pack = numberOrNull('pack') || 0;
    field('count').value = (numberOrNull('count') ?? 0) + pack;
    const repeats = numberOrNull('repeats');
    if (repeats) field('repeats').value = repeats - 1;
    root.requestSubmit();
    toast(`Added a box of ${pack}.`);
  });

  // Taken off rather than deleted, so past doses keep their name
  root.querySelector('[data-archive]')?.addEventListener('click', async () => {
    await saveMed({ ...draft, archived: true });
    closeSheet();
  });

  openSheet(root);
  if (!editing) root.querySelector('[data-name]').focus();
}
