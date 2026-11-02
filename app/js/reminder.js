// The daily "Time for your pages" reminder, as a real notification.
// iPhones let a Home Screen web app receive notifications, but not schedule its own.
// So: this phone gives the app a private notification address, she sends a set-up
// code (address, time and time zone; no health information) to the person who set
// up the app, and a daily job on GitHub sends the notification at her chosen time.

import { state, saveSetting } from './state.js';
import { el, esc } from './util.js';
import { toast } from './sheet.js';
import { shareOrCancel } from './backup.js';

// The public half of the key that proves notifications come from this app
const PUBLIC_KEY = 'BJmDWuk7R1xZnyaAynmtU0N9lSqX3NKL0SompFFCBLH-e_9OfbKjAErZn6OVuh69MYCFAO-jEQT_KIWKJ0pGDVQ';

const fromBase64Url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const onHomeScreen = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

async function currentSubscription() {
  if (!supported()) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

function setupCode(sub, time) {
  const { endpoint, keys } = sub.toJSON();
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return JSON.stringify({ endpoint, keys, time, tz });
}

async function turnOn(time) {
  if ((await Notification.requestPermission()) !== 'granted') {
    throw new Error('Notifications are switched off for this app. You can allow them in the iPhone Settings app, under Notifications.');
  }
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription())
    || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromBase64Url(PUBLIC_KEY) });
  await saveSetting('reminderTime', time);
  return sub;
}

async function sendCode(sub, time) {
  const text = `Forest Apothecary reminder set-up code:\n${setupCode(sub, time)}`;
  if (navigator.share) return shareOrCancel(() => navigator.share({ text }));
  await navigator.clipboard.writeText(text);
  toast('Set-up code copied.');
  return true;
}

const timeText = (t) => {
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')}${h < 12 ? 'am' : 'pm'}`;
};

export function reminderCard() {
  const time = state.settings.reminderTime || '20:00';
  const card = el(`
    <section class="card reminder">
      <h2>Daily reminder</h2>
      <p class="quiet">A gentle "Time for your pages" each evening. It never mentions medicines or symptoms.</p>
      <div data-body></div>
    </section>`);
  const body = card.querySelector('[data-body]');

  if (!supported() || !onHomeScreen()) {
    body.innerHTML = '<p class="quiet">Open the app from its Home Screen icon to turn this on.</p>';
    return card;
  }

  currentSubscription().then((sub) => {
    if (sub && Notification.permission === 'granted') {
      body.innerHTML = `
        <p>Reminders are on for this phone, at ${esc(timeText(time))}.</p>
        <button class="secondary" data-send>Send the set-up code</button>
        <button class="link danger" data-off>Turn off reminders</button>`;
      body.querySelector('[data-send]').addEventListener('click', () => sendCode(sub, time).catch(() => {}));
      body.querySelector('[data-off]').addEventListener('click', async () => {
        await sub.unsubscribe();
        await saveSetting('reminderTime', '');
        toast('Reminders are off for this phone.');
      });
      return;
    }
    body.innerHTML = `
      <label class="field">Time <input type="time" data-time value="${esc(time)}"></label>
      <button class="secondary" data-on>Turn on reminders</button>
      <p class="quiet small">Then send the set-up code once to the person who set up this app. It holds only a notification address and the time.</p>`;
    body.querySelector('[data-on]').addEventListener('click', async () => {
      const chosen = body.querySelector('[data-time]').value || '20:00';
      try {
        // The share sheet needs a fresh tap, so sending the code is its own button
        await turnOn(chosen);
        toast('Reminders are on. Now tap "Send the set-up code".');
      } catch (e) {
        toast(e.message || 'Something went wrong. Please try again.');
      }
    });
  });
  return card;
}
