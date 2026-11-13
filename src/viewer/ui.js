export function renderHeader(el, title) {
  el.textContent = '';
  const h1 = document.createElement('h1');
  h1.textContent = title;
  el.append(h1);
  document.title = title;
}

export function showError(container, message) {
  container.textContent = '';
  const box = document.createElement('div');
  box.className = 'error-screen';
  const p = document.createElement('p');
  p.textContent = message;
  box.append(p);
  container.append(box);
}

export function openLightbox(urls) {
  if (urls.length === 0) return;
  let index = 0;
  const overlay = document.createElement('div');
  overlay.className = 'lightbox';
  overlay.innerHTML = `
    <button class="lightbox__close" aria-label="Zavřít">×</button>
    <button class="lightbox__prev" aria-label="Předchozí">‹</button>
    <img class="lightbox__img" alt="Exteriér" />
    <button class="lightbox__next" aria-label="Další">›</button>`;
  const img = overlay.querySelector('img');
  const show = (i) => {
    index = (i + urls.length) % urls.length;
    img.src = urls[index];
  };
  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => {
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowLeft') show(index - 1);
    if (e.key === 'ArrowRight') show(index + 1);
  };
  overlay.querySelector('.lightbox__close').onclick = close;
  overlay.querySelector('.lightbox__prev').onclick = () => show(index - 1);
  overlay.querySelector('.lightbox__next').onclick = () => show(index + 1);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', onKey);
  show(0);
  document.body.append(overlay);
}
