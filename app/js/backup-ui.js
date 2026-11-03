// The Backups and Notes history cards in Settings, and the import sheet

import { state } from './state.js';
import { openSheet, closeSheet, toast } from './sheet.js';
import {
  backUpToFiles, summaryToNotes, readBackup, restore, readHistory, importHistory, guessMed, prettyName,
  isLocked, openBackup,
} from './backup.js';
import { el, esc, formatDay, dateFromKey, dayKey, pickFile } from './util.js';

function lastBackupText() {
  const last = state.settings.lastBackupAt;
  if (!last) return 'No backup yet.';
  const d = new Date(last);
  return `Last backup: ${dayKey(d) === dayKey(new Date()) ? 'today' : formatDay(d)}.`;
}

// Asks for the recovery phrase that opens a locked backup
function askPhrase(made) {
  return new Promise((resolve) => {
    const root = el(`
      <form class="med-form">
        <h2>Open this backup</h2>
        <p class="quiet">Type the recovery phrase you had when this backup was made (${esc(made)}).</p>
        <textarea rows="4" data-words autocapitalize="none" autocomplete="off" autocorrect="off" spellcheck="false" aria-label="Recovery phrase"></textarea>
        <button class="primary" type="submit">Open it</button>
        <button class="link" type="button" data-cancel>Not now</button>
      </form>`);
    root.addEventListener('submit', (ev) => { ev.preventDefault(); resolve(root.querySelector('[data-words]').value); closeSheet(); });
    root.querySelector('[data-cancel]').addEventListener('click', () => { resolve(null); closeSheet(); });
    openSheet(root);
  });
}

const count = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

const failed = (e) => toast(e.message || 'Something went wrong. Please try again.');

export function backupCards() {
  const view = el(`
    <div>
      <section class="card">
        <h2>Backups</h2>
        <p class="quiet">${lastBackupText()} Backups are locked: only your recovery phrase opens them. The Notes summary is plain words, readable by anyone who can open your Notes.</p>
        <button class="secondary" data-files>Back up to Files</button>
        <button class="secondary" data-notes>Save a summary to Notes</button>
        <button class="secondary" data-restore>Restore from a backup</button>
      </section>
      <section class="card">
        <h2>Your Notes history</h2>
        <p class="quiet">Bring in the medicines you noted before this app, so your charts start from then.</p>
        <button class="secondary" data-history>Bring in your history</button>
      </section>
    </div>`);

  view.querySelector('[data-files]').addEventListener('click', () => backUpToFiles()
    .then((done) => done && toast('Backed up. Thank you, future you.'))
    .catch(failed));

  view.querySelector('[data-notes]').addEventListener('click', () => summaryToNotes().catch(failed));

  view.querySelector('[data-restore]').addEventListener('click', async () => {
    const file = await pickFile('.json,application/json');
    if (!file) return;
    try {
      let data = await readBackup(file);
      const made = formatDay(new Date(data.createdAt));
      if (isLocked(data)) {
        const phrase = await askPhrase(made);
        if (!phrase) return;
        data = await openBackup(data, phrase);
      }
      if (!confirm(`Bring back ${data.entries.length} entries from the backup made ${made}? Nothing already here is removed.`)) return;
      const n = await restore(data);
      toast(`Brought back ${n.entries} ${n.entries === 1 ? 'entry' : 'entries'} and ${n.meds} ${n.meds === 1 ? 'medicine' : 'medicines'}.`);
    } catch (e) {
      failed(e);
    }
  });

  view.querySelector('[data-history]').addEventListener('click', async () => {
    const file = await pickFile('.json,application/json,text/plain');
    if (!file) return;
    try {
      openImportSheet(await readHistory(file));
    } catch (e) {
      failed(e);
    }
  });

  return view;
}

// Match each medicine name in her history to a medicine in the app
function openImportSheet(history) {
  const counts = {};
  for (const r of history.rows) counts[r[1]] = (counts[r[1]] || 0) + 1;
  const meds = [...state.meds].sort((a, b) => a.name.localeCompare(b.name));
  const options = (code) => {
    const guess = guessMed(code);
    return [
      `<option value="">Add as "${esc(prettyName(code))}"</option>`,
      ...meds.map((m) => `<option value="${m.id}" ${guess?.id === m.id ? 'selected' : ''}>${esc(m.name)}</option>`),
    ].join('');
  };

  const root = el(`
    <form class="import">
      <h2>Your Notes history</h2>
      <p class="quiet">${count(history.rows.length, 'dose')}${history.notes.length ? `, ${count(history.notes.length, 'day note')}` : ''}${history.appts.length ? ` and ${count(history.appts.length, 'appointment')}` : ''}, from ${formatDay(dateFromKey(history.from))} ${history.from.slice(0, 4)}
        to ${formatDay(dateFromKey(history.to))} ${history.to.slice(0, 4)}. Choose which medicine each name means.</p>
      ${Object.keys(counts).sort((a, b) => counts[b] - counts[a]).map((code) => `
        <label class="map-row">
          <span>${esc(code)} <small>${counts[code]} doses</small></span>
          <select data-code="${esc(code)}">${options(code)}</select>
        </label>`).join('')}
      <p class="quiet">Names added new stay off your shelf, but show in History and charts.</p>
      <button class="primary" type="submit">Bring them in</button>
    </form>`);

  root.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const mapping = {};
    root.querySelectorAll('[data-code]').forEach((s) => { mapping[s.dataset.code] = s.value || null; });
    const btn = root.querySelector('[type=submit]');
    btn.disabled = true;
    btn.textContent = 'Bringing them in…';
    try {
      const result = await importHistory(history, mapping);
      closeSheet();
      toast(`Brought in ${count(result.entries, 'dose')}${result.notes ? `, ${count(result.notes, 'day note')}` : ''}${result.appts ? ` and ${count(result.appts, 'appointment')}` : ''}.`);
    } catch (e) {
      btn.disabled = false;
      btn.textContent = 'Bring them in';
      failed(e);
    }
  });

  openSheet(root);
}
