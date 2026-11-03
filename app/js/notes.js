// Day notes: anything she wants to remember about a day, in her own words.
// Saved as entries: { id, kind: 'note', at, day, text }

import { state, saveEntry, deleteEntry } from './state.js';
import { openSheet, closeSheet, toast } from './sheet.js';
import { el, esc, uid, dayKey, dateFromKey } from './util.js';

export const dayNotes = () => state.entries.filter((e) => e.kind === 'note');

export function openNote(entry = null) {
  const editing = !!entry;
  const root = el(`
    <form class="med-form appt">
      <h2>${editing ? 'Day note' : 'Write a note'}</h2>
      <label>Date <input type="date" data-day required value="${entry?.day || dayKey(new Date())}"></label>
      <label>Your note <textarea rows="8" data-text placeholder="How today went, in your own words">${esc(entry?.text || '')}</textarea></label>
      <button class="primary" type="submit">Save</button>
      ${editing ? '<button type="button" class="link danger" data-delete>Delete this note</button>' : ''}
    </form>`);

  root.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const text = root.querySelector('[data-text]').value.trim();
    if (!text) return;
    const day = root.querySelector('[data-day]').value || dayKey(new Date());
    const at = dateFromKey(day);
    at.setHours(12);
    await saveEntry({ ...entry, id: entry?.id || uid(), kind: 'note', day, at: at.getTime(), text });
    closeSheet();
    if (!editing) toast('Note saved.');
  });

  root.querySelector('[data-delete]')?.addEventListener('click', async () => {
    if (!confirm('Delete this note?')) return;
    await deleteEntry(entry.id);
    closeSheet();
  });

  openSheet(root);
  if (!editing) root.querySelector('[data-text]').focus();
}
