// Appointments with her doctor: the date and her own notes, to look back on.
// The report can cover everything since an appointment.
// Saved as entries: { id, kind: 'appointment', at, day, notes }

import { state, saveEntry, deleteEntry, doctorName } from './state.js';
import { openSheet, closeSheet, toast } from './sheet.js';
import { el, esc, uid, dayKey, dateFromKey, formatDay } from './util.js';

export const appointments = () => state.entries
  .filter((e) => e.kind === 'appointment')
  .sort((a, b) => b.day.localeCompare(a.day));

export const lastAppointment = () => appointments().find((a) => a.day <= dayKey(new Date())) || null;

export const appointmentLabel = (a) => `${formatDay(dateFromKey(a.day))} ${a.day.slice(0, 4)}`;

export function openAppointment(entry = null) {
  const editing = !!entry;
  const day = entry?.day || dayKey(new Date());
  const root = el(`
    <form class="med-form appt">
      <h2>${editing ? 'Appointment' : 'Log an appointment'}</h2>
      <p class="quiet">With ${esc(doctorName())}</p>
      <label>Date <input type="date" data-day required value="${day}"></label>
      <label>Your notes <textarea rows="8" data-notes placeholder="What was said, any changes, what to try next">${esc(entry?.notes || '')}</textarea></label>
      <button class="primary" type="submit">Save</button>
      ${editing ? '<button type="button" class="link danger" data-delete>Delete this appointment</button>' : ''}
    </form>`);

  root.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const chosen = root.querySelector('[data-day]').value || dayKey(new Date());
    const at = dateFromKey(chosen);
    at.setHours(12);
    await saveEntry({
      ...entry,
      id: entry?.id || uid(),
      kind: 'appointment',
      day: chosen,
      at: at.getTime(),
      notes: root.querySelector('[data-notes]').value.trim(),
    });
    closeSheet();
    if (!editing) toast('Appointment saved. Your next report can start from here.');
  });

  root.querySelector('[data-delete]')?.addEventListener('click', async () => {
    if (!confirm('Delete this appointment and its notes?')) return;
    await deleteEntry(entry.id);
    closeSheet();
  });

  openSheet(root);
}

// For the doctor card in Settings: the latest few, newest first
export function appointmentList(limit = 4) {
  const list = el('<div class="appt-list"></div>');
  for (const a of appointments().slice(0, limit)) {
    const firstLine = (a.notes || '').split('\n')[0];
    const row = el(`
      <button class="entry">
        <span class="entry-text">${esc(appointmentLabel(a))}${firstLine ? `<small>${esc(firstLine)}</small>` : '<small>No notes</small>'}</span>
      </button>`);
    row.addEventListener('click', () => openAppointment(a));
    list.append(row);
  }
  return list;
}
