// Beskydská chalupa – page behaviour (no dependencies).
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// Header turns solid once the hero scrolls away; pages without a hero keep it solid.
const header = $('.header');
const hero = $('.hero');
if (hero) {
  new IntersectionObserver(([e]) => header.classList.toggle('is-solid', !e.isIntersecting), { rootMargin: '-80px 0px 0px 0px' }).observe(hero);
}

// Mobile menu
const nav = $('.nav');
const toggle = $('.nav-toggle');
function setMenu(open) {
  nav.classList.toggle('is-open', open);
  header.classList.toggle('is-open', open);
  toggle.setAttribute('aria-expanded', String(open));
}
toggle?.addEventListener('click', () => setMenu(!nav.classList.contains('is-open')));
nav?.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });

// 360° tour: the viewer loads only when asked for, then the chips jump between rooms.
const tour = $('.tour');
if (tour) {
  const base = tour.dataset.src;
  const open = (room) => {
    let frame = $('iframe', tour);
    if (!frame) {
      frame = document.createElement('iframe');
      frame.title = 'Virtuální prohlídka Beskydské chalupy';
      frame.allow = 'fullscreen; gyroscope; accelerometer';
      frame.allowFullscreen = true;
      tour.replaceChildren(frame);
    }
    frame.src = room ? `${base}&room=${room}` : base;
    $$('.chip').forEach((c) => c.classList.toggle('is-active', c.dataset.room === room));
  };
  $('.tour__poster')?.addEventListener('click', () => open(''));
  $$('.chip').forEach((chip) => chip.addEventListener('click', () => {
    open(chip.dataset.room);
    tour.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }));
}

// Gallery: show the rest of the photos
const gallery = $('.gallery');
$('.gallery-more button')?.addEventListener('click', (e) => {
  gallery.classList.remove('is-collapsed');
  e.currentTarget.parentElement.remove();
});

// Lightbox for the gallery and the floor plans
const box = $('.lightbox');
if (box) {
  const img = $('img', box);
  const caption = $('figcaption', box);
  let items = [];
  let index = 0;
  const show = (i) => {
    index = (i + items.length) % items.length;
    const thumb = $('img', items[index]);
    img.src = items[index].href;
    img.alt = thumb.alt;
    caption.textContent = items.length > 1 ? `${thumb.alt} · ${index + 1} / ${items.length}` : thumb.alt;
  };
  $$('[data-lightbox]').forEach((group) => {
    group.addEventListener('click', (e) => {
      const link = e.target.closest('a');
      if (!link || !group.contains(link)) return;
      e.preventDefault();
      items = $$('a', group);
      show(items.indexOf(link));
      box.showModal();
    });
  });
  $('.lightbox__prev', box).addEventListener('click', () => show(index - 1));
  $('.lightbox__next', box).addEventListener('click', () => show(index + 1));
  $('.lightbox__close', box).addEventListener('click', () => box.close());
  box.addEventListener('click', (e) => { if (e.target === box || e.target.tagName === 'FIGURE') box.close(); });
  box.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') show(index - 1);
    if (e.key === 'ArrowRight') show(index + 1);
  });
  box.addEventListener('close', () => { img.removeAttribute('src'); });
}

// Fade sections in as they scroll into view
const reveal = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (e.isIntersecting) {
      e.target.classList.add('is-in');
      reveal.unobserve(e.target);
    }
  }
}, { threshold: 0.12 });
$$('.reveal').forEach((el) => reveal.observe(el));
