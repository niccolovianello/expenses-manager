let region = null;
let timer = null;

export function mountToast(element) {
  region = element;
}

export function showToast(message, { tone = 'info', duration = 3200 } = {}) {
  if (!region) return;
  region.textContent = message;
  region.dataset.tone = tone;
  region.classList.add('is-visible');
  clearTimeout(timer);
  timer = setTimeout(() => region.classList.remove('is-visible'), tone === 'error' ? duration * 2 : duration);
}
