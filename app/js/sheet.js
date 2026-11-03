// Sheets slide up over the screen for logging; toasts are brief messages at the bottom

const root = () => document.getElementById('sheet-root');
let current = null;

export function openSheet(content, { full = false } = {}) {
  closeSheet();
  const backdrop = document.createElement('div');
  backdrop.className = 'backdrop';
  const panel = document.createElement('div');
  panel.className = full ? 'sheet full' : 'sheet';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.append(content);
  if (!full) backdrop.addEventListener('click', closeSheet);
  // Full-screen questions have their answers at the bottom: don't let a message cover them
  if (full) document.getElementById('toast').classList.remove('show');
  root().append(backdrop, panel);
  document.body.classList.add('sheet-open');
  current = { backdrop, panel };
}

export function closeSheet() {
  if (!current) return;
  current.backdrop.remove();
  current.panel.remove();
  current = null;
  document.body.classList.remove('sheet-open');
}

export const isSheetOpen = () => current !== null;

let toastTimer;

export function toast(message, { action, onAction } = {}) {
  const box = document.getElementById('toast');
  box.innerHTML = '';
  const text = document.createElement('span');
  text.textContent = message;
  box.append(text);
  if (action) {
    const btn = document.createElement('button');
    btn.textContent = action;
    btn.addEventListener('click', () => { hide(); onAction(); });
    box.append(btn);
  }
  box.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hide, 6000);

  function hide() { box.classList.remove('show'); }
}
