// The lock screens: first set-up, unlocking, and the recovery phrase.
// They cover the whole app until her pages are unlocked.

import { el, esc, pickFile } from './util.js';
import { bottleSVG } from './bottle.js';
import { WORDS } from './words.js';
import { newPhrase, unknownWords, normalisePhrase } from './crypto.js';
import { NoPrfError, passkeysAvailable } from './passkey.js';
import {
  prepareFaceId, startPhraseOnly, finishVault, unlockWithFaceId, unlockWithPhrase, renewFaceId, adoptBackupKey,
} from './vault.js';
import { readBackup, isLocked, openBackup, restore } from './backup.js';

const box = () => document.getElementById('lock');

export function showLockLayer() { document.body.classList.add('locked'); }
export function hideLockLayer() { document.body.classList.remove('locked'); box().replaceChildren(); }

function screen(html) {
  const node = el(html);
  box().replaceChildren(node);
  window.scrollTo(0, 0);
  return node;
}

function say(node, text) { node.querySelector('.lock-msg').textContent = text; }

// ---------- First set-up ----------

export function setUp() {
  return new Promise((resolve) => {
    function intro() {
      const s = screen(`
        <div class="lock-screen">
          ${bottleSVG('sage')}
          <h1>Lock your pages</h1>
          <p>Your pages will open with Face ID, and everything you write is locked so only you can read it.</p>
          <button class="primary" data-go>Set up Face ID</button>
          <button class="link" data-restore>Restore from a backup</button>
          <p class="lock-msg" role="alert"></p>
        </div>`);
      s.querySelector('[data-restore]').addEventListener('click', () => restoreFromBackup(s));
      s.querySelector('[data-go]').addEventListener('click', async () => {
        say(s, '');
        if (!passkeysAvailable()) return noFaceId();
        try {
          const face = await prepareFaceId();
          phraseFlow(newPhrase(), (phrase) => finishVault(face, phrase)).then(resolve);
        } catch (e) {
          if (e instanceof NoPrfError) noFaceId();
          else say(s, "That didn't go through. Try again when you're ready.");
        }
      });
    }

    // A new phone, or a cleared one: open a backup with the phrase, then add Face ID
    async function restoreFromBackup(s) {
      say(s, '');
      const file = await pickFile('.json,application/json');
      if (!file) return;
      let data;
      try {
        data = await readBackup(file);
      } catch (e) {
        return say(s, e.message);
      }
      if (!isLocked(data)) {
        return say(s, 'That backup is from before your pages were locked. Set up Face ID first, then restore it from Settings.');
      }
      const p = screen(`
        <form class="lock-screen">
          <h1>Open your backup</h1>
          <p>Type your 12 words, in order, with spaces between them.</p>
          <textarea rows="4" data-words autocapitalize="none" autocomplete="off" autocorrect="off" spellcheck="false" aria-label="Recovery phrase"></textarea>
          <button class="primary" type="submit">Restore my pages</button>
          <button type="button" class="link" data-back>Back</button>
          <p class="lock-msg" role="alert"></p>
        </form>`);
      p.querySelector('[data-back]').addEventListener('click', intro);
      p.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const typed = p.querySelector('[data-words]').value;
        const unknown = unknownWords(typed);
        if (unknown.length) return say(p, `These aren't on the word list: ${unknown.join(', ')}. Check the spelling.`);
        const btn = p.querySelector('[type=submit]');
        btn.disabled = true;
        say(p, 'Opening…');
        let records;
        try {
          records = await openBackup(data, typed);
        } catch (e) {
          btn.disabled = false;
          return say(p, e.message);
        }
        say(p, 'Now Face ID, so it opens easily from here on.');
        try {
          await adoptBackupKey(records.keyBytes, data.lock, { faceId: passkeysAvailable() });
        } catch (e) {
          // No Face ID on this phone (or she cancelled): the phrase still opens it
          if (!(e instanceof NoPrfError)) say(p, 'Face ID was skipped. You can set it up later in Settings.');
          await adoptBackupKey(records.keyBytes, data.lock, { faceId: false });
        }
        await restore(records);
        resolve();
      });
    }

    function noFaceId() {
      const s = screen(`
        <div class="lock-screen">
          <h1>Face ID isn't available</h1>
          <p>Opening with Face ID needs iOS 18 or later. You can still lock your pages with a recovery phrase, but you'll type it each time you open the app.</p>
          <button class="primary" data-phrase>Use a phrase instead</button>
          <button class="link" data-retry>Try Face ID again</button>
        </div>`);
      s.querySelector('[data-retry]').addEventListener('click', intro);
      s.querySelector('[data-phrase]').addEventListener('click', async () => {
        const face = await startPhraseOnly();
        phraseFlow(newPhrase(), (phrase) => finishVault(face, phrase)).then(resolve);
      });
    }

    intro();
  });
}

// ---------- Showing and checking the recovery phrase ----------
// Resolves once she has confirmed the words and save() has finished.

export function phraseFlow(phrase, save, { canCancel = false } = {}) {
  return new Promise((resolve) => {
    const words = phrase.split(' ');
    const picks = [];
    while (picks.length < 3) {
      const i = Math.floor(Math.random() * 12);
      if (!picks.includes(i)) picks.push(i);
    }
    picks.sort((a, b) => a - b);

    function show() {
      const s = screen(`
        <div class="lock-screen">
          <h1>Your recovery phrase</h1>
          <p>If Face ID stops working, or you move to a new phone, these 12 words open your pages. Write them on paper, in order, and keep it somewhere safe.</p>
          <ol class="phrase">${words.map((w) => `<li>${esc(w)}</li>`).join('')}</ol>
          <p class="quiet">No one can reset them for you, so please don't skip this.</p>
          <button class="primary" data-next>I've written them down</button>
          ${canCancel ? '<button class="link" data-cancel>Not now</button>' : ''}
        </div>`);
      s.querySelector('[data-next]').addEventListener('click', () => check(0));
      s.querySelector('[data-cancel]')?.addEventListener('click', () => resolve(false));
    }

    function check(n) {
      const i = picks[n];
      const options = [words[i]];
      while (options.length < 4) {
        const w = WORDS[Math.floor(Math.random() * WORDS.length)];
        if (!options.includes(w)) options.push(w);
      }
      options.sort(() => Math.random() - 0.5);
      const s = screen(`
        <div class="lock-screen">
          <p class="flow-heading">Check ${n + 1} of 3</p>
          <h1>Which is word ${i + 1}?</h1>
          <div class="chips">${options.map((w) => `<button class="chip">${esc(w)}</button>`).join('')}</div>
          <p class="lock-msg" role="alert"></p>
          <button class="link" data-back>Show the words again</button>
        </div>`);
      s.querySelectorAll('.chip').forEach((c) => c.addEventListener('click', async () => {
        if (c.textContent !== words[i]) return say(s, 'Not quite. Have another look at your paper.');
        if (n < 2) return check(n + 1);
        say(s, 'Locking your pages…');
        s.querySelectorAll('button').forEach((b) => { b.disabled = true; });
        try {
          await save(phrase);
          resolve(true);
        } catch {
          say(s, 'Something went wrong while saving. Please try again.');
          s.querySelectorAll('button').forEach((b) => { b.disabled = false; });
        }
      }));
      s.querySelector('[data-back]').addEventListener('click', show);
    }

    show();
  });
}

// ---------- Unlocking ----------

export function unlock(vault) {
  return new Promise((resolve) => {
    function faceScreen(auto) {
      const s = screen(`
        <div class="lock-screen">
          ${bottleSVG('sage')}
          <h1>Your pages</h1>
          <button class="primary" data-face>Open with Face ID</button>
          <button class="link" data-phrase>Use recovery phrase</button>
          <p class="lock-msg" role="alert"></p>
        </div>`);
      const go = async (quiet) => {
        say(s, '');
        try {
          await unlockWithFaceId(vault);
          resolve();
        } catch {
          if (!quiet) say(s, "Face ID didn't open it. Try again, or use your recovery phrase.");
        }
      };
      s.querySelector('[data-face]').addEventListener('click', () => go(false));
      s.querySelector('[data-phrase]').addEventListener('click', phraseScreen);
      // Ask for Face ID straight away; if the phone wants a tap first, the button is there
      if (auto) go(true);
    }

    function phraseScreen() {
      const s = screen(`
        <form class="lock-screen">
          <h1>Recovery phrase</h1>
          <p>Type your 12 words, in order, with spaces between them.</p>
          <textarea rows="4" data-words autocapitalize="none" autocomplete="off" autocorrect="off" spellcheck="false" aria-label="Recovery phrase"></textarea>
          <button class="primary" type="submit">Open my pages</button>
          ${vault.mode === 'faceid' ? '<button type="button" class="link" data-face>Use Face ID instead</button>' : ''}
          <p class="lock-msg" role="alert"></p>
        </form>`);
      s.querySelector('[data-face]')?.addEventListener('click', () => faceScreen(false));
      s.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const typed = s.querySelector('[data-words]').value;
        const unknown = unknownWords(typed);
        if (unknown.length) return say(s, `These aren't on the word list: ${unknown.join(', ')}. Check the spelling.`);
        if (normalisePhrase(typed).split(' ').length !== 12) return say(s, 'That needs all 12 words.');
        const btn = s.querySelector('[type=submit]');
        btn.disabled = true;
        say(s, 'Opening…');
        try {
          await unlockWithPhrase(vault, typed);
          if (vault.mode === 'faceid') offerFaceId(); else resolve();
        } catch {
          btn.disabled = false;
          say(s, "Those words don't open it. Check the order and spelling.");
        }
      });
    }

    // After a phrase unlock, Face ID may have stopped working (or this is a new phone)
    function offerFaceId() {
      const s = screen(`
        <div class="lock-screen">
          <h1>Set up Face ID again?</h1>
          <p>If Face ID stopped working, or this is a new phone, this makes a fresh one.</p>
          <button class="primary" data-yes>Set up Face ID</button>
          <button class="link" data-no>Not now</button>
          <p class="lock-msg" role="alert"></p>
        </div>`);
      s.querySelector('[data-no]').addEventListener('click', () => resolve());
      s.querySelector('[data-yes]').addEventListener('click', async () => {
        try {
          await renewFaceId();
          resolve();
        } catch {
          say(s, "That didn't go through. You can try again later from Settings.");
        }
      });
    }

    if (vault.mode === 'faceid') faceScreen(true); else phraseScreen();
  });
}
