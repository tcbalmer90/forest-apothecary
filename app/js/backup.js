// Backups: a full copy to Files, a readable summary to Notes, restoring,
// and bringing in her old medicine history from the Notes app.
// Nothing leaves the phone unless she chooses where to send it in the share sheet.
// A backup file is locked: its records are encrypted with her data key, and the file
// also holds that key sealed with her recovery phrase. So the phrase alone opens it,
// on this phone or a new one. The Notes summary is plain text on purpose.

import { state, activeMeds, entryDay, saveMany, saveSetting } from './state.js';
import { sealWithKey } from './db.js';
import { backupLock, keyFromBackup } from './vault.js';
import { importDataKey, decryptJSON, sealedToText, sealedFromText } from './crypto.js';
import { describe } from './flows.js';
import { tabletsLeft, tracksStock } from './stock.js';
import { dayKey, dateFromKey, formatDay, formatTablets, uid } from './util.js';

const APP = 'forest-apothecary';
const DAY = 24 * 60 * 60 * 1000;
export const NUDGE_AFTER_DAYS = 7;

// ---------- Sharing ----------

// Opens the iPhone share sheet; falls back to a download on computers
export async function shareFile(file) {
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file] });
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

// Resolves true if she finished sharing, false if she closed the share sheet
export async function shareOrCancel(action) {
  try {
    await action();
    return true;
  } catch (e) {
    if (e.name === 'AbortError') return false;
    throw e;
  }
}

// ---------- Full backup ----------

export async function makeBackup() {
  const records = {
    meds: state.meds,
    entries: state.entries,
    settings: Object.entries(state.settings)
      .filter(([id]) => id !== 'lastBackupAt')
      .map(([id, value]) => ({ id, value })),
  };
  return {
    app: APP,
    version: 2,
    createdAt: Date.now(),
    count: records.entries.length,
    lock: await backupLock(),
    payload: sealedToText(await sealWithKey(records)),
  };
}

export async function backUpToFiles() {
  const file = new File(
    [JSON.stringify(await makeBackup())],
    `pages-backup-${dayKey(new Date())}.json`,
    { type: 'application/json' },
  );
  const done = await shareOrCancel(() => shareFile(file));
  if (done) await saveSetting('lastBackupAt', Date.now());
  return done;
}

export async function readBackup(file) {
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error("That file isn't a backup from this app.");
  }
  const plain = Array.isArray(data?.entries) && Array.isArray(data?.meds);
  const locked = data?.lock && data?.payload;
  if (data?.app !== APP || !(plain || locked)) {
    throw new Error("That file isn't a backup from this app.");
  }
  return data;
}

// Backups made during her trial, before Protection, are plain and need no phrase
export const isLocked = (data) => !!data.payload;

// Opens a locked backup with the recovery phrase in use when it was made
export async function openBackup(data, phrase) {
  let keyBytes;
  try {
    keyBytes = await keyFromBackup(data.lock, phrase);
  } catch {
    throw new Error("Those words don't open this backup. Check the order and spelling.");
  }
  const records = await decryptJSON(await importDataKey(keyBytes), sealedFromText(data.payload));
  return { ...records, keyBytes };
}

// Restoring adds back everything in the backup. Nothing already in the app is removed.
export async function restore(data) {
  await saveMany({ meds: data.meds, entries: data.entries, settings: data.settings || [] });
  return { meds: data.meds.length, entries: data.entries.length };
}

export function needsNudge(now = Date.now()) {
  if (!state.entries.length) return false;
  const last = state.settings.lastBackupAt;
  const since = last ?? Math.min(...state.entries.map((e) => e.at));
  return now - since > NUDGE_AFTER_DAYS * DAY;
}

// ---------- Readable summary for the Notes app ----------

function entryLines(e) {
  const { time, text } = describe(e);
  if (e.kind === 'dose') return [`  ${time}  ${text}`];
  if (e.kind === 'flare') {
    const parts = [
      e.locations?.join(', '),
      e.types?.join(', '),
      e.triggers?.length && `set off by ${e.triggers.join(', ').toLowerCase()}`,
      e.symptoms?.length && `with ${e.symptoms.join(', ').toLowerCase()}`,
    ].filter(Boolean);
    return [`  ${time}  ${text}${parts.length ? ` (${parts.join('; ')})` : ''}`, ...(e.note ? [`         "${e.note}"`] : [])];
  }
  const r = e; // an evening reflection
  const bits = [
    r.pain != null && `pain ${r.pain}/10`,
    r.fatigue != null && `tiredness ${r.fatigue}/10`,
    r.mood && `mood ${r.mood.toLowerCase()}`,
    r.sleep && `sleep ${r.sleep.toLowerCase()}`,
    r.bleeding && `bleeding ${r.bleeding.toLowerCase()}`,
    r.period === 'Yes' && 'period day',
    r.sex && r.sex !== 'No' && `sex ${r.sex.replace('Yes, ', '')}`,
    r.bowel && r.bowel !== 'None' && `bowel pain ${r.bowel.toLowerCase()}`,
    r.bladder && r.bladder !== 'None' && `bladder pain ${r.bladder.toLowerCase()}`,
    r.triggers?.length && `stirred by ${r.triggers.join(', ').toLowerCase()}`,
    r.hormones?.length && `hormones: ${r.hormones.join(', ')}`,
  ].filter(Boolean);
  return [`  Evening: ${bits.join(', ')}`];
}

export function summaryText(days = 14, now = new Date()) {
  const from = dayKey(new Date(now.getTime() - (days - 1) * DAY));
  const lines = [`Forest Apothecary`, `Made ${formatDay(now)} ${now.getFullYear()}`, '', `The last ${days} days`];

  const byDay = new Map();
  for (const e of state.entries) {
    const key = entryDay(e);
    if (key < from) continue;
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(e);
  }
  for (const key of [...byDay.keys()].sort().reverse()) {
    lines.push('', `${formatDay(dateFromKey(key))}`);
    const list = byDay.get(key).sort((a, b) => (a.kind === 'reflection') - (b.kind === 'reflection') || a.at - b.at);
    for (const e of list) lines.push(...entryLines(e));
  }
  if (!byDay.size) lines.push('', 'Nothing logged.');

  const stocked = activeMeds('med').filter(tracksStock);
  if (stocked.length) {
    lines.push('', 'Stock');
    for (const m of stocked) {
      const bits = [`${formatTablets(tabletsLeft(m))} left`];
      if (m.repeats != null) bits.push(`${m.repeats} repeats`);
      if (m.scriptExpiry) bits.push(`script expires ${formatDay(dateFromKey(m.scriptExpiry))}`);
      lines.push(`  ${m.name}: ${bits.join(', ')}`);
    }
  }
  return lines.join('\n');
}

export async function summaryToNotes() {
  const text = summaryText();
  if (navigator.share) return shareOrCancel(() => navigator.share({ text }));
  await shareFile(new File([text], `pages-summary-${dayKey(new Date())}.txt`, { type: 'text/plain' }));
  return true;
}

// ---------- Her history from the Notes app ----------
// A list of [date "YYYY-MM-DD", medicine code, tablets or null, hour or null]

export async function readHistory(file) {
  let rows;
  try {
    rows = JSON.parse(await file.text());
  } catch {
    throw new Error("That file couldn't be read.");
  }
  const ok = Array.isArray(rows) && rows.length && rows.every((r) => Array.isArray(r)
    && /^\d{4}-\d{2}-\d{2}$/.test(r[0]) && typeof r[1] === 'string');
  if (!ok) throw new Error("That doesn't look like a medicine history file.");
  const names = [...new Set(rows.map((r) => r[1]))];
  const dates = rows.map((r) => r[0]).sort();
  return { rows, names, from: dates[0], to: dates.at(-1) };
}

// "night_drops" -> "Night drops"
export function prettyName(code) {
  const s = code.replace(/[_-]+/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Best guess at which of her medicines a code means; she can change it
export function guessMed(code) {
  const want = prettyName(code).toLowerCase();
  return state.meds.find((m) => m.name.toLowerCase() === want) || null;
}

// mapping: { code: medId | null }. null adds a new medicine, kept off the shelf.
// Imported entries have fixed ids, so importing the same file twice adds nothing new.
export async function importHistory({ rows }, mapping) {
  const newMeds = [];
  const medFor = {};
  let order = Math.max(0, ...state.meds.map((m) => m.order + 1));
  for (const code of Object.keys(mapping)) {
    let med = state.meds.find((m) => m.id === mapping[code]);
    if (!med) {
      med = state.meds.find((m) => m.importCode === code);
    }
    if (!med) {
      med = { id: uid(), name: prettyName(code), colour: 'amber', startTablets: 1, kind: 'med', order: order++, archived: true, importCode: code };
      newMeds.push(med);
    }
    medFor[code] = med;
  }

  const seen = {};
  const entries = rows.map(([date, code, tablets, hour]) => {
    const base = `imp-${date}-${code}-${hour ?? 'x'}-${tablets ?? 'x'}`;
    seen[base] = (seen[base] || 0) + 1;
    const d = dateFromKey(date);
    d.setHours(hour ?? 12);
    const med = medFor[code];
    return {
      id: `${base}-${seen[base]}`,
      kind: 'dose',
      at: d.getTime(),
      medId: med.id,
      medName: med.name,
      tablets: tablets ?? null,
      ...(hour == null ? { timeUnknown: true } : {}),
      imported: true,
    };
  });

  await saveMany({ meds: newMeds, entries });
  return { entries: entries.length, newMeds: newMeds.map((m) => m.name) };
}
