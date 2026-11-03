// Logging: the dose sheet, the flare questions and the evening reflection.
// Flares only record what she ticks. Nothing here gives warnings or dose advice.

import { state, saveEntry, deleteEntry, activeMeds } from './state.js';
import { openSheet, closeSheet, toast } from './sheet.js';
import { bottleSVG } from './bottle.js';
import { tabletsLeft, countedLabel } from './stock.js';
import { openAppointment } from './appointments.js';
import {
  uid, esc, el, formatTime, formatTablets, timeValue, dateValue, fromInputs, reflectionDay,
  stepTablets, toggleHalf,
} from './util.js';

const SCALE = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

const TRIGGERS = ['Period', 'Ovulation', 'Stress', 'Poor sleep', 'Food', 'Bowel movement',
  'Sex', 'Exercise', 'Long day on feet', 'Travel', 'Cold weather', 'Not sure'];

const LOCATIONS = ['Lower abdomen', 'Pelvis', 'Lower back', 'Left side', 'Right side',
  'Upper abdomen', 'Bowel', 'Bladder', 'Legs'];

const PAIN_TYPES = ['Cramping', 'Stabbing', 'Aching', 'Burning', 'Pulling', 'Throbbing',
  'Pressure', 'Worse moving'];

const FLARE_SYMPTOMS = ['Shoulder tip pain', 'Nausea', 'Vomiting', 'Dizzy or faint', 'Fever',
  'Heavy bleeding', 'Bloating', 'Diarrhoea', 'Constipation', 'Pain passing urine'];

const BODY_PAIN = ['None', 'Mild', 'Moderate', 'Strong'];

// ---------- Dose ----------

export function openDoseSheet(med, entry = null) {
  const editing = !!entry;
  let tablets = editing ? (entry.tablets ?? 1) : (med.startTablets || 1);
  let when = editing ? new Date(entry.at) : new Date();
  const name = med.name;

  const root = el(`
    <div class="dose">
      <div class="dose-head">
        ${bottleSVG(med.colour)}
        <div>
          <h2>${esc(name)}</h2>
          ${tabletsLeft(med) != null ? `<p class="quiet left">${formatTablets(tabletsLeft(med))} left</p>` : ''}
        </div>
      </div>
      <div class="stepper" role="group" aria-label="Tablets">
        <button class="round" data-step="-1" aria-label="Fewer tablets">−</button>
        <div class="stepper-value"><span data-tablets></span><small data-unit></small></div>
        <button class="round" data-step="1" aria-label="More tablets">+</button>
      </div>
      <button class="link half" data-half></button>
      <div class="when-row">
        ${editing ? `<label>Date <input type="date" data-date value="${dateValue(when)}"></label>` : ''}
        <label>Time <input type="time" data-time value="${timeValue(when)}"></label>
      </div>
      <p class="quiet before-count" data-before hidden></p>
      <button class="primary" data-save>${editing ? 'Save' : 'Log it'}</button>
      ${editing ? '<button class="link danger" data-delete>Delete this dose</button>' : ''}
    </div>`);

  const show = () => {
    root.querySelector('[data-tablets]').textContent = formatTablets(tablets);
    root.querySelector('[data-unit]').textContent = tablets > 1 ? 'tablets' : 'tablet';
    root.querySelector('[data-half]').textContent = tablets % 1 ? 'Remove the half' : 'Add a half';
  };
  show();

  root.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => {
    tablets = stepTablets(tablets, Number(b.dataset.step));
    show();
  }));
  root.querySelector('[data-half]').addEventListener('click', () => {
    tablets = toggleHalf(tablets);
    show();
  });
  // iPhones don't always report a time change before "Log it" is tapped,
  // so compare with the starting value rather than waiting for a change event
  const startTime = timeValue(when);

  function pickedTime() {
    const dateStr = editing ? root.querySelector('[data-date]').value : dateValue(new Date());
    const timeStr = root.querySelector('[data-time]').value;
    const timeChanged = editing || (timeStr && timeStr !== startTime);
    const picked = timeChanged && timeStr ? fromInputs(dateStr || dateValue(when), timeStr) : new Date();
    // A new dose picked for later than now (e.g. 11pm, logged after midnight) was yesterday
    if (!editing && picked.getTime() > Date.now() + 5 * 60 * 1000) picked.setDate(picked.getDate() - 1);
    return picked;
  }

  // A dose from before her stock count came out of the box before she counted it
  const beforeNote = root.querySelector('[data-before]');
  function explainCount() {
    const before = med.stockAt && pickedTime().getTime() <= med.stockAt;
    beforeNote.hidden = !before;
    if (before) {
      beforeNote.textContent = `This was before your stock count (${countedLabel(med)}), so tablets left stay at ${formatTablets(tabletsLeft(med))}.`;
    }
  }
  for (const type of ['input', 'change', 'blur']) {
    root.querySelectorAll('input').forEach((i) => i.addEventListener(type, explainCount));
  }
  explainCount();

  root.querySelector('[data-save]').addEventListener('click', async () => {
    when = pickedTime();
    const record = editing
      ? { ...entry, tablets, at: when.getTime() }
      : { id: uid(), kind: 'dose', at: when.getTime(), medId: med.id, medName: name, tablets };
    // An imported dose with no time keeps "no time" unless she picks one
    if (record.timeUnknown && root.querySelector('[data-time]').value !== startTime) delete record.timeUnknown;
    await saveEntry(record);
    closeSheet();
    if (!editing) {
      toast(`${name} x${formatTablets(tablets)} logged at ${formatTime(when)}`, {
        action: 'Undo', onAction: () => deleteEntry(record.id),
      });
    }
  });

  root.querySelector('[data-delete]')?.addEventListener('click', async () => {
    if (!confirm(`Delete ${name} at ${formatTime(new Date(entry.at))}?`)) return;
    await deleteEntry(entry.id);
    closeSheet();
  });

  openSheet(root);
}

// Shelf bottles that don't fit on Today
export function openMoreSheet(meds) {
  const root = el(`
    <div class="more">
      <h2>More from the shelf</h2>
      <div class="shelf shelf-wrap"></div>
    </div>`);
  const shelf = root.querySelector('.shelf');
  for (const med of meds) {
    const b = el(`<button class="bottle-btn">${bottleSVG(med.colour)}<span>${esc(med.name)}</span></button>`);
    b.addEventListener('click', () => openDoseSheet(med));
    shelf.append(b);
  }
  openSheet(root);
}

// ---------- Step-by-step questions ----------
// Each step: { key, title, type: 'scale' | 'single' | 'multi' | 'custom', options, render }
// A custom step's render returns a function that reads its boxes just before saving.
// The answers and buttons sit at the bottom of the screen, within reach of one thumb.
// Single-choice steps move on by themselves after a tap.

function runSteps({ heading, steps, values, onSave, onDelete }) {
  let i = 0;
  const root = el('<div class="flow"></div>');

  function render() {
    const step = steps[i];
    const last = i === steps.length - 1;
    root.innerHTML = `
      <div class="flow-top">
        <button class="link" data-close>Close</button>
        <span class="flow-count">${i + 1} of ${steps.length}</span>
      </div>
      <p class="flow-heading">${esc(heading)}</p>
      <h2 class="flow-title">${esc(step.title)}</h2>
      <div class="flow-bottom">
        <div class="flow-body"></div>
        <div class="flow-actions"><div class="flow-row"></div></div>
      </div>`;

    const body = root.querySelector('.flow-body');
    const actions = root.querySelector('.flow-actions');
    const row = root.querySelector('.flow-row');
    if (i > 0) {
      const back = el('<button class="secondary back">Back</button>');
      back.addEventListener('click', () => { i -= 1; render(); });
      row.append(back);
    }

    let collect = null;
    if (step.type === 'custom') {
      collect = step.render(body, values);
    } else {
      const multi = step.type === 'multi';
      body.className = `flow-body chips ${step.type === 'scale' ? 'chips-scale' : ''}`;
      for (const opt of step.options) {
        const on = multi ? (values[step.key] || []).includes(opt) : values[step.key] === opt;
        const chip = el(`<button class="chip" aria-pressed="${on}">${esc(String(opt))}</button>`);
        chip.addEventListener('click', () => {
          if (multi) {
            const list = new Set(values[step.key] || []);
            list.has(opt) ? list.delete(opt) : list.add(opt);
            values[step.key] = [...list];
            chip.setAttribute('aria-pressed', String(list.has(opt)));
          } else {
            values[step.key] = opt;
            body.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
            if (!last) setTimeout(next, 180);
          }
        });
        body.append(chip);
      }
    }

    const answered = step.type !== 'scale' && step.type !== 'single' ? true : values[step.key] != null;
    if (last) {
      const save = el('<button class="primary">Save</button>');
      save.addEventListener('click', async () => { collect?.(); await onSave(values); closeSheet(); });
      row.append(save);
    } else if (answered) {
      const nextBtn = el('<button class="secondary">Next</button>');
      nextBtn.addEventListener('click', next);
      row.append(nextBtn);
    }
    if (onDelete) {
      const del = el('<button class="link danger">Delete</button>');
      del.addEventListener('click', async () => {
        if (!confirm('Delete this entry?')) return;
        await onDelete();
        closeSheet();
      });
      actions.append(del);
    }

    root.querySelector('[data-close]').addEventListener('click', closeSheet);
    root.scrollTop = 0;
  }

  function next() { i = Math.min(i + 1, steps.length - 1); render(); }

  render();
  openSheet(root, { full: true });
}

// ---------- Flare ----------

export function openFlare(entry = null) {
  const values = entry ? structuredClone(entry) : {};
  const when = entry ? new Date(entry.at) : new Date();

  runSteps({
    heading: entry ? 'Flare' : 'Log a flare',
    values,
    steps: [
      { key: 'pain', title: 'How strong is the pain?', type: 'scale', options: SCALE },
      { key: 'locations', title: 'Where is it?', type: 'multi', options: LOCATIONS },
      { key: 'types', title: 'What does it feel like?', type: 'multi', options: PAIN_TYPES },
      { key: 'triggers', title: 'Anything that set it off?', type: 'multi', options: TRIGGERS },
      { key: 'symptoms', title: 'Anything else with it?', type: 'multi', options: FLARE_SYMPTOMS },
      {
        key: 'when', title: 'When did it start?', type: 'custom',
        render(body, v) {
          body.innerHTML = `
            <div class="when-row">
              <label>Date <input type="date" data-date value="${dateValue(when)}"></label>
              <label>Time <input type="time" data-time value="${timeValue(when)}"></label>
            </div>
            <label class="note">A note, if you like
              <textarea rows="3" data-note>${esc(v.note || '')}</textarea>
            </label>`;
          const sync = () => {
            v.at = fromInputs(body.querySelector('[data-date]').value, body.querySelector('[data-time]').value).getTime();
            v.note = body.querySelector('[data-note]').value.trim();
          };
          body.addEventListener('input', sync);
          sync();
          return sync;
        },
      },
    ],
    async onSave(v) {
      await saveEntry({
        id: entry?.id || uid(),
        kind: 'flare',
        at: v.at || Date.now(),
        pain: v.pain ?? null,
        locations: v.locations || [],
        types: v.types || [],
        triggers: v.triggers || [],
        symptoms: v.symptoms || [],
        note: v.note || '',
      });
      if (!entry) toast('Flare saved. Be gentle with yourself.');
    },
    onDelete: entry ? () => deleteEntry(entry.id) : null,
  });
}

// ---------- Evening reflection ----------

export function openReflection(entry = null) {
  const values = entry ? structuredClone(entry) : {};
  const hormones = activeMeds('hormone').map((m) => m.name);

  const steps = [
    { key: 'pain', title: 'Pain today, overall', type: 'scale', options: SCALE },
    { key: 'fatigue', title: 'How tired today?', type: 'scale', options: SCALE },
    { key: 'mood', title: 'Your mood today', type: 'single', options: ['Low', 'Flat', 'Okay', 'Good', 'Bright'] },
    { key: 'sleep', title: "Last night's sleep", type: 'single', options: ['Poor', 'Broken', 'Okay', 'Good', 'Deep'] },
    { key: 'bleeding', title: 'Any bleeding?', type: 'single', options: ['None', 'Spotting', 'Light', 'Medium', 'Heavy'] },
    { key: 'period', title: 'A period day?', type: 'single', options: ['Yes', 'No'] },
    { key: 'sex', title: 'Sex today?', type: 'single', options: ['No', 'Yes, comfortable', 'Yes, painful'] },
    { key: 'bowel', title: 'Bowel pain', type: 'single', options: BODY_PAIN },
    { key: 'bladder', title: 'Bladder pain', type: 'single', options: BODY_PAIN },
    { key: 'triggers', title: 'Anything stir things up?', type: 'multi', options: TRIGGERS },
  ];
  if (hormones.length) {
    steps.push({ key: 'hormones', title: 'Daily hormones taken', type: 'multi', options: hormones });
  }

  runSteps({
    heading: 'Evening reflection',
    values,
    steps,
    async onSave(v) {
      const record = {
        ...entry,
        id: entry?.id || uid(),
        kind: 'reflection',
        at: entry?.at || Date.now(),
        day: entry?.day || reflectionDay(),
      };
      for (const s of steps) record[s.key] = v[s.key] ?? (s.type === 'multi' ? [] : null);
      await saveEntry(record);
      if (!entry) toast('Your pages are done for tonight. Sleep well.');
    },
    onDelete: entry ? () => deleteEntry(entry.id) : null,
  });
}

// ---------- Opening any entry to edit ----------

export function openEntry(e) {
  if (e.kind === 'dose') {
    const med = state.meds.find((m) => m.id === e.medId) || { name: e.medName, colour: 'amber' };
    openDoseSheet(med, e);
  } else if (e.kind === 'flare') {
    openFlare(e);
  } else if (e.kind === 'reflection') {
    openReflection(e);
  } else if (e.kind === 'appointment') {
    openAppointment(e);
  }
}

// One-line summary, used on Today and in History
export function describe(e) {
  if (e.kind === 'dose') {
    // Some doses from her old Notes history have no time
    const time = e.timeUnknown ? '–' : formatTime(new Date(e.at));
    return { time, text: e.tablets == null ? e.medName : `${e.medName} x${formatTablets(e.tablets)}` };
  }
  if (e.kind === 'flare') {
    const where = (e.locations || []).slice(0, 2).join(', ');
    return { time: formatTime(new Date(e.at)), text: `Flare ${e.pain ?? '?'}/10`, sub: where };
  }
  if (e.kind === 'appointment') {
    return { time: 'Appt', text: 'Appointment', sub: (e.notes || '').split('\n')[0] };
  }
  return { time: 'Evening', text: 'Evening reflection', sub: e.pain != null ? `pain ${e.pain}/10` : '' };
}
