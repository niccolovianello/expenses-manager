let region = null;
let timer = null;
let remaining = 0;
let hideAt = 0;

const hide = () => region.classList.remove('is-visible');

function schedule(ms) {
  clearTimeout(timer);
  remaining = ms;
  hideAt = Date.now() + ms;
  timer = setTimeout(hide, ms);
}

// While the pointer or focus is on a toast with an action, it does not go away.
function pause() {
  if (!region.classList.contains('is-visible')) return;
  clearTimeout(timer);
  remaining = Math.max(1500, hideAt - Date.now());
}

export function mountToast(element) {
  region = element;
  region.addEventListener('pointerenter', pause);
  region.addEventListener('focusin', pause);
  region.addEventListener('pointerleave', () => schedule(remaining));
  region.addEventListener('focusout', () => schedule(remaining));
}

// `action`: { label, run } adds a button (Annulla, Crea regola…); the toast then stays longer.
export function showToast(message, { tone = 'info', duration = 3200, action = null } = {}) {
  if (!region) return;
  region.replaceChildren(message);
  if (action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'toast-action';
    button.textContent = action.label;
    button.addEventListener('click', () => {
      hide();
      action.run();
    }, { once: true });
    region.append(button);
  }
  region.dataset.tone = tone;
  region.classList.toggle('has-action', Boolean(action));
  region.classList.add('is-visible');
  schedule(action ? Math.max(duration, 6000) : tone === 'error' ? duration * 2 : duration);
}
