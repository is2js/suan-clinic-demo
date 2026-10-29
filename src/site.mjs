/* Standalone clinic preview: no game client, account access or reservation API. */
const dataNode = document.querySelector('#site-data');
let content = {};
try { content = JSON.parse(dataNode?.textContent || '{}'); } catch { content = {}; }

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
const page = document.body;
const header = document.querySelector('[data-header]');
const backTop = document.querySelector('[data-back-top]');
const toast = document.querySelector('[data-status]');
let toastTimer = 0;

function announce(message = '준비 중입니다.') {
  const layer = document.querySelector('dialog[open] [data-dialog-status]');
  const target = layer || toast;
  if (!target) return;
  target.textContent = message;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { target.textContent = ''; }, 3500);
}

function showDialog(dialog) {
  if (!dialog || dialog.open) return;
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
  page.classList.add('has-dialog');
}

function closeDialog(dialog) {
  if (!dialog?.open) return;
  if (typeof dialog.close === 'function') dialog.close();
  else { dialog.removeAttribute('open'); dialog.dispatchEvent(new Event('close')); }
}

function finishDialog(dialog, restore) {
  dialog?.addEventListener('close', () => {
    if (!document.querySelector('dialog[open]')) page.classList.remove('has-dialog');
    dialog.querySelector('[data-dialog-status]')?.replaceChildren();
    if (restore?.isConnected) restore.focus({ preventScroll: true });
  });
  dialog?.addEventListener('click', event => {
    if (event.target === dialog) closeDialog(dialog);
  });
}

const menu = document.querySelector('#mobile-menu');
const menuOpener = document.querySelector('[data-menu-open]');
menuOpener?.addEventListener('click', () => {
  showDialog(menu);
  menuOpener.setAttribute('aria-expanded', 'true');
  menu?.querySelector('[data-menu-close]')?.focus();
});
menu?.querySelectorAll('[data-menu-close], [data-menu-link]').forEach(element => {
  element.addEventListener('click', () => closeDialog(menu));
});
menu?.addEventListener('close', () => menuOpener?.setAttribute('aria-expanded', 'false'));
finishDialog(menu, menuOpener);

for (const button of document.querySelectorAll('[data-service-action]')) {
  button.addEventListener('click', () => announce());
}

function safeAsset(path) {
  if (typeof path !== 'string' || !path.startsWith('assets/') || /[\\?#]/.test(path)) return null;
  try {
    const decoded = decodeURIComponent(path);
    if (decoded.split('/').some(part => part === '.' || part === '..') || decoded.includes('\\')) return null;
    const base = new URL(document.baseURI);
    const boundary = new URL('assets/', base);
    const result = new URL(path, base);
    return result.origin === base.origin && result.pathname.startsWith(boundary.pathname) ? result.href : null;
  } catch { return null; }
}

const details = document.querySelector('#detail-dialog');
let detailOpener = null;
for (const button of document.querySelectorAll('[data-detail-type][data-detail-id]')) {
  button.addEventListener('click', () => {
    const type = button.dataset.detailType;
    if (type !== 'clinicians' && type !== 'departments') return;
    const list = Array.isArray(content[type]) ? content[type] : [];
    const item = list.find(value => value.id === button.dataset.detailId);
    if (!item || !details) return;
    detailOpener = button;
    details.dataset.detailType = type;
    details.dataset.detailId = item.id;
    details.setAttribute('aria-label', `${item.name || '상세'} 소개`);
    details.querySelector('[data-detail-title]').textContent = item.name || '';
    details.querySelector('[data-detail-eyebrow]').textContent = item.eyebrow || item.role || 'SUAN';
    details.querySelector('[data-detail-focus]').textContent = item.focus || item.role || '';
    details.querySelector('[data-detail-description]').textContent = item.description || '';
    const image = details.querySelector('[data-detail-image]');
    const url = safeAsset(item.image);
    if (url) { image.src = url; image.alt = `${item.name || ''} 소개 이미지`; image.hidden = false; }
    else { image.removeAttribute('src'); image.alt = ''; image.hidden = true; }
    showDialog(details);
    details.querySelector('[data-detail-close]')?.focus();
  });
}
details?.querySelectorAll('[data-detail-close]').forEach(button => button.addEventListener('click', () => closeDialog(details)));
details?.addEventListener('close', () => { if (detailOpener?.isConnected) detailOpener.focus({ preventScroll: true }); detailOpener = null; });
finishDialog(details, null);

const themeButton = document.querySelector('[data-theme-toggle]');
let requestedTheme = page.dataset.theme === 'day' ? 'day' : 'night';
let themeRequest = 0;
themeButton?.addEventListener('click', async () => {
  requestedTheme = requestedTheme === 'night' ? 'day' : 'night';
  const next = requestedTheme;
  const request = ++themeRequest;
  const image = document.querySelector(`[data-theme-image="${next}"]`);
  try {
    if (!image) throw new Error('missing image');
    if (typeof image.decode === 'function') await image.decode();
    else if (!image.complete || !image.naturalWidth) throw new Error('image not ready');
    if (request !== themeRequest) return;
    page.dataset.theme = next;
    themeButton.setAttribute('aria-pressed', String(next === 'day'));
    themeButton.setAttribute('aria-label', next === 'day' ? '밤 풍경으로 변경' : '낮 풍경으로 변경');
    themeButton.querySelector('.theme-button__label').textContent = next === 'day' ? 'NIGHT' : 'DAY';
    themeButton.querySelector('span[aria-hidden="true"]').textContent = next === 'day' ? '☀' : '☾';
  } catch {
    if (request === themeRequest) { requestedTheme = page.dataset.theme; announce('풍경을 불러오지 못했습니다.'); }
  }
});

function carouselStep(track, direction) {
  if (!track?.firstElementChild) return;
  const styles = getComputedStyle(track);
  const gap = parseFloat(styles.columnGap) || 0;
  const width = track.firstElementChild.getBoundingClientRect().width + gap;
  const max = Math.max(0, track.scrollWidth - track.clientWidth);
  const end = direction > 0 && track.scrollLeft >= max - 2;
  const start = direction < 0 && track.scrollLeft <= 2;
  const left = end ? 0 : start ? max : Math.min(max, Math.max(0, track.scrollLeft + width * direction));
  track.scrollTo({ left, behavior: reduced.matches ? 'auto' : 'smooth' });
}

for (const button of document.querySelectorAll('[data-carousel-prev], [data-carousel-next]')) {
  const isNext = button.hasAttribute('data-carousel-next');
  const id = isNext ? button.dataset.carouselNext : button.dataset.carouselPrev;
  button.addEventListener('click', () => carouselStep(document.getElementById(id), isNext ? 1 : -1));
}
for (const track of document.querySelectorAll('[data-carousel]')) {
  track.addEventListener('keydown', event => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    carouselStep(track, event.key === 'ArrowRight' ? 1 : -1);
  });
}

function refreshDates() {
  const now = new Date();
  const today = document.querySelector('[data-today]');
  if (today) today.textContent = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' }).format(now);
  const date = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'short', day: 'numeric' });
  for (const node of document.querySelectorAll('[data-days-ago]')) {
    const days = Number(node.dataset.daysAgo);
    if (!Number.isFinite(days) || days < 0) continue;
    const previous = new Date(now.getTime() - Math.floor(days) * 86400000);
    node.dateTime = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(previous);
    node.textContent = days === 0 ? '오늘 · 예시' : `${date.format(previous)} · 예시`;
  }
}
refreshDates();
window.setInterval(() => { if (!document.hidden) refreshDates(); }, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshDates(); });

function handleScroll() {
  const moved = window.scrollY > 60;
  header?.classList.toggle('is-scrolled', moved);
  backTop?.classList.toggle('is-visible', window.scrollY > 700);
}
let scrollPending = false;
window.addEventListener('scroll', () => {
  if (scrollPending || document.hidden) return;
  scrollPending = true;
  requestAnimationFrame(() => { scrollPending = false; handleScroll(); });
}, { passive: true });
handleScroll();
backTop?.addEventListener('click', () => window.scrollTo({ top: 0, behavior: reduced.matches ? 'auto' : 'smooth' }));

if ('IntersectionObserver' in window && !reduced.matches) {
  document.documentElement.classList.add('has-motion');
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target); }
  }, { threshold: 0.08, rootMargin: '0px 0px -4% 0px' });
  document.querySelectorAll('[data-reveal]').forEach(element => observer.observe(element));
}
