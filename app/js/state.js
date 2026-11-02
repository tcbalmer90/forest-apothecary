// Everything she has logged, kept in memory while the app is open.
//
// A medicine: { id, name, colour, startTablets, kind: 'med' | 'hormone', order, archived }
// An entry is one of:
//   dose:       { id, kind: 'dose', at, medId, medName, tablets }
//   flare:      { id, kind: 'flare', at, pain, locations, types, triggers, symptoms, note }
//   reflection: { id, kind: 'reflection', at, day, pain, fatigue, mood, sleep, bleeding,
//                 period, sex, bowel, bladder, triggers, hormones }
// "at" is the time in milliseconds; "day" is the evening it belongs to, e.g. "2026-11-02".

import * as db from './db.js';
import { dayKey } from './util.js';

export const state = { meds: [], entries: [] };

export async function load() {
  [state.meds, state.entries] = await Promise.all([db.getAll('meds'), db.getAll('entries')]);
}

function changed() {
  document.dispatchEvent(new Event('data-changed'));
}

function upsert(list, record) {
  const i = list.findIndex((r) => r.id === record.id);
  if (i >= 0) list[i] = record; else list.push(record);
}

export async function saveMed(med) {
  await db.put('meds', med);
  upsert(state.meds, med);
  changed();
}

export async function saveEntry(entry) {
  await db.put('entries', entry);
  upsert(state.entries, entry);
  changed();
}

export async function deleteEntry(id) {
  await db.remove('entries', id);
  state.entries = state.entries.filter((e) => e.id !== id);
  changed();
}

// Medicines on her shelf (or daily hormones), in her chosen order
export function activeMeds(kind = 'med') {
  return state.meds
    .filter((m) => m.kind === kind && !m.archived)
    .sort((a, b) => a.order - b.order);
}

export function entryDay(e) {
  return e.kind === 'reflection' ? e.day : dayKey(new Date(e.at));
}

export function reflectionFor(day) {
  return state.entries.find((e) => e.kind === 'reflection' && e.day === day);
}
