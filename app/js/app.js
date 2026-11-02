// Forest Apothecary: start-up and moving between screens

import { load } from './state.js';
import { isSheetOpen } from './sheet.js';
import { renderToday } from './today.js';
import { renderHistory } from './history.js';
import { renderSettings } from './settings.js';

const screens = { today: renderToday, history: renderHistory, settings: renderSettings };
const main = document.getElementById('main');

function show() {
  const name = screens[location.hash.slice(1)] ? location.hash.slice(1) : 'today';
  main.innerHTML = '';
  screens[name](main);
  document.querySelectorAll('.tabs a').forEach((a) => {
    a.toggleAttribute('aria-current', a.getAttribute('href') === `#${name}`);
  });
}

window.addEventListener('hashchange', () => { show(); window.scrollTo(0, 0); });
document.addEventListener('data-changed', show);

// Coming back to the app on a new day shows the new day
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !isSheetOpen()) show();
});

await load();
show();

// Ask Safari to keep her data even when the phone is short of space
navigator.storage?.persist?.();

// The service worker saves the app on the phone so it opens with no internet
if ('serviceWorker' in navigator) {
  const hadWorker = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').catch(() => {});
  // A new version arrived: reload, unless she is in the middle of logging
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadWorker && !isSheetOpen()) location.reload();
  });
}
