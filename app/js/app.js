// Forest Apothecary: start-up, locking and moving between screens

import { load } from './state.js';
import { isSheetOpen } from './sheet.js';
import { loadVault } from './vault.js';
import { setUp, unlock, hideLockLayer } from './lock.js';
import { renderToday } from './today.js';
import { renderHistory } from './history.js';
import { renderSettings } from './settings.js';

// Away from the app for longer than this, and it locks again
const LOCK_AFTER_MS = 60 * 1000;

const screens = { today: renderToday, history: renderHistory, settings: renderSettings };
const main = document.getElementById('main');
let unlocked = false;

function show() {
  const name = screens[location.hash.slice(1)] ? location.hash.slice(1) : 'today';
  main.innerHTML = '';
  screens[name](main);
  document.querySelectorAll('.tabs a').forEach((a) => {
    a.toggleAttribute('aria-current', a.getAttribute('href') === `#${name}`);
  });
}

// Locking simply reloads the page: everything in memory, including her key, is gone
function lockNow() { location.reload(); }

// ---------- Offline: the service worker saves the app on the phone ----------
if ('serviceWorker' in navigator) {
  const hadWorker = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').catch(() => {});
  // A new version arrived: reload, unless she is in the middle of logging
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadWorker && !isSheetOpen()) location.reload();
  });
}

// ---------- App switcher: cover the screen so nothing shows in the preview ----------
const cover = (on) => document.body.classList.toggle('covered', on);

// Native date and time pickers can take focus; don't cover the screen for those
const pickerOpen = () => ['date', 'time'].includes(document.activeElement?.type);

window.addEventListener('blur', () => { if (!pickerOpen()) cover(true); });
window.addEventListener('focus', () => cover(false));
window.addEventListener('pagehide', () => cover(true));
// Safari can restore a page from memory: lock it instead
window.addEventListener('pageshow', (e) => { if (e.persisted && unlocked) lockNow(); });

let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    hiddenAt = Date.now();
    cover(true);
    return;
  }
  if (unlocked && Date.now() - hiddenAt > LOCK_AFTER_MS) return lockNow();
  cover(false);
  // Coming back on a new day shows the new day
  if (unlocked && !isSheetOpen()) show();
});

// ---------- Start: unlock first, then show her pages ----------
const vault = await loadVault();
if (vault) await unlock(vault); else await setUp();
unlocked = true;
hideLockLayer();

await load();
window.addEventListener('hashchange', () => { show(); window.scrollTo(0, 0); });
document.addEventListener('data-changed', show);
show();

// Ask Safari to keep her data even when the phone is short of space
navigator.storage?.persist?.();
