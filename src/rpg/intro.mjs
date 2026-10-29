// Isolated promotional surface. Never import the game client or connect a socket.
import { clamp01, sectionProgress, pinnedProgress, actorPanelTop, heroSequenceSnapshot, carouselOffset, createDragGesture, createReadyTransition, createSectionReplayGate } from './intro-motion.mjs?v=20261022-1';
export const wrapIndex = (index, length) => length > 0 ? ((index % length) + length) % length : 0;

export function heroCopyOpacity(scroll, height) {
  const viewport = Math.max(1, Number(height) || 1);
  const position = Math.max(0, Number(scroll) || 0);
  if (position <= viewport * 0.12) return 1;
  if (position >= viewport * 0.4) return 0;
  return 1 - (position - viewport * 0.12) / (viewport * 0.28);
}

export function sequenceSnapshot(elapsed, count = 4, sceneMs = 6000) {
  const total = Math.max(1, count) * sceneMs;
  const time = Math.min(total, Math.max(0, Number(elapsed) || 0));
  return { index: Math.min(Math.max(0, count - 1), Math.floor(time / sceneMs)), progress: time / total, ended: time >= total, time, total };
}

export function spritePosition(sprite, elapsed = 0) {
  const frames = Math.max(1, Number(sprite.frames) || 1);
  const rows = Math.max(1, Number(sprite.rows) || 1);
  const frame = Math.floor(Math.max(0, elapsed) / Math.max(16, Number(sprite.frameMs) || 180)) % frames;
  return `${frames > 1 ? frame / (frames - 1) * 100 : 0}% ${rows > 1 ? Math.min(rows - 1, Math.max(0, Number(sprite.row) || 0)) / (rows - 1) * 100 : 0}%`;
}

export function showcaseSnapshot(clip, elapsed = 0, still = false) {
  const castMs = Math.max(16, Number(clip.castDurationMs) || (clip.sprite ? clip.sprite.frames * clip.sprite.frameMs : 0));
  const effectMs = Math.max(16, Number(clip.effectDurationMs) || clip.effect.frames * clip.effect.frameMs);
  const startMs = Math.max(0, Number(clip.effectStartMs) || 0);
  const cycleMs = Math.max(castMs, startMs + effectMs) + 1100;
  const phase = still ? startMs + effectMs * 0.45 : Math.max(0, Number(elapsed) || 0) % cycleMs;
  return {
    cycleMs,
    castTime: clip.sprite ? Math.min(phase, castMs - clip.sprite.frameMs) : 0,
    effectTime: Math.max(0, Math.min(effectMs - clip.effect.frameMs, phase - startMs)),
    effectVisible: phase >= startMs && phase < startMs + effectMs,
  };
}

export function elementVideoOffset(element, skillIndex = 0) {
  return (element?.skills || []).slice(0, Math.max(0, Math.floor(skillIndex)))
    .reduce((time, clip) => time + showcaseSnapshot(clip).cycleMs, 0) / 1000;
}

// Both the live page and a project-site export use the same isolated asset boundary.
export function isIntroAsset(value, assetBase = '/assets/') {
  const base = typeof assetBase === 'string' && assetBase.startsWith('/') && !assetBase.startsWith('//')
    ? `${assetBase.replace(/\/+$/, '')}/` : '/assets/';
  return typeof value === 'string' && value.startsWith(base) && !/["\n\r<>\\]/.test(value)
    && !value.split(/[/?#]/).some(part => /^(?:\.|%2e){1,2}$/i.test(part));
}

export function introServiceAction(data, actionId = 'play') {
  const defaults = { play: ['#', '예약 문의 ↗'], login: ['#', '안내'],
    clinic: ['#', '예약 문의 ↗'], staffBoard: ['#', '상담 문의'],
    logout: ['#', '안내'], admin: ['#', '안내'] };
  const id = Object.hasOwn(defaults, actionId) ? actionId : 'play';
  const item = data?.site?.actions?.[id] || {}, [href, label] = defaults[id];
  return { id, href: item.href || href, label: item.label || label,
    demo: data?.deployment?.mode === 'demo', demoMessage: item.demoMessage || `${item.label || label} 기능은 준비 중입니다.` };
}

export function elementVideoChapter(element, time = 0) {
  const skills = element?.skills || [];
  const current = Math.max(0, Number(time) || 0);
  let chapter = 0;
  for (let index = 1; index < skills.length; index++) {
    if (current + .001 < elementVideoOffset(element, index)) break;
    chapter = index;
  }
  return chapter;
}

export function elementVideoSegment(element, skillIndex = 0, time = 0, duration = Infinity) {
  const skills = element?.skills || [], index = Math.max(0, Math.min(skills.length - 1, Math.floor(skillIndex) || 0));
  const total = Number.isFinite(duration) && duration > 0 ? duration : Infinity;
  const start = Math.min(elementVideoOffset(element, index), Math.max(0, total - .05));
  const next = skills[index] ? elementVideoOffset(element, index) + showcaseSnapshot(skills[index]).cycleMs / 1000 : start;
  const end = Math.max(start, Math.min(next, total));
  return { start, end, shouldLoop: end > start && (time >= end - .035 || time < start - .035) };
}

export function suspendVideoPlayback(videos) {
  for (const video of videos) {
    if (!video.paused) video.dataset.resume = 'true';
    video.pause();
  }
}

export function resumeVideoPlayback(videos) {
  for (const video of videos) {
    if (video.dataset.resume !== 'true') continue;
    video.dataset.resume = 'false'; video.play()?.catch(() => {});
  }
}

export function createImageQueue({ load, limit = 2 }) {
  let running = 0, stopped = false;
  const pending = [], known = new Map();
  const drain = () => {
    while (!stopped && running < limit && pending.length) {
      const { src, resolve } = pending.shift();
      running++;
      Promise.resolve().then(() => load(src)).then(() => resolve(true), () => resolve(false)).finally(() => { running--; drain(); });
    }
  };
  return {
    get(src) {
      if (stopped) return Promise.resolve(false);
      if (!known.has(src)) {
        const result = new Promise(resolve => { pending.push({ src, resolve }); drain(); });
        known.set(src, result);
        result.then(ok => { if (!ok && known.get(src) === result) known.delete(src); });
      }
      return known.get(src);
    },
    stop() { stopped = true; pending.splice(0).forEach(job => job.resolve(false)); },
  };
}

// A closed panel or a newer selection must never receive an older decode result.
export function createLatestSelection({ load, commit }) {
  let generation = 0, stopped = false;
  return {
    async select(value) {
      if (stopped) return false;
      const current = ++generation;
      let loaded = false;
      try { loaded = await load(value.src); } catch { /* A failed portrait still has readable copy. */ }
      if (stopped || current !== generation) return false;
      commit(value, !!loaded);
      return true;
    },
    invalidate() { generation++; },
    stop() { stopped = true; generation++; },
  };
}

// An equipped pose becomes visible only after its body and all tools are ready.
export function createEncounterSelection({ load, commit, restore }) {
  let generation = 0, stopped = false;
  return {
    async play(clip) {
      if (stopped || !clip?.sprite?.src) return false;
      const current = ++generation;
      const sources = [...new Set([clip.sprite.src, ...(clip.tools || []).map(tool => tool.sprite?.src)].filter(Boolean))];
      const ready = await Promise.all(sources.map(src => Promise.resolve().then(() => load(src)).catch(() => false)));
      if (stopped || current !== generation || !ready.every(Boolean)) return false;
      commit(clip); return true;
    },
    rest() { generation++; if (!stopped) restore(); },
    stop() { stopped = true; generation++; },
  };
}

export function mountIntro(root, data) {
  if (root.__introCleanup) return root.__introCleanup;
  // The clinic introduces the two clinicians only. Keep their animated bodies,
  // but use the non-weapon idle motion when focused or hovered.
  data = { ...data, actors: (data.actors || []).slice(0, 2).map(actor => actor.encounter ? { ...actor, encounter: { ...actor.encounter, hover: actor.encounter.idle } } : actor) };
  const date = root.querySelector('[data-clinic-date]');
  if (date) {
    try { date.textContent = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' }).format(new Date()); } catch { date.textContent = '오늘의 예시'; }
  }
  const doc = root.ownerDocument, win = doc.defaultView;
  const abort = new AbortController();
  const on = (el, type, listener, options = {}) => el?.addEventListener(type, listener, { ...options, signal: abort.signal });
  const $ = selector => root.querySelector(selector);
  const $$ = selector => [...root.querySelectorAll(selector)];
  const motionPreference = win.matchMedia('(prefers-reduced-motion: reduce)');
  let motionPreview = false;
  try { motionPreview = win.sessionStorage.getItem('intro-motion-preview') === 'on'; } catch { /* Storage is optional. */ }
  const reduced = { get matches() { return motionPreference.matches && !motionPreview; } };
  const dialog = $('#intro-dialog'), content = $('[data-dialog-content]');
  const menu = $('[data-menu]'), menuButton = $('[data-action="menu"]');
  const header = $('[data-header]'), desktopNav = $('[data-desktop-nav]'), navPanel = $('[data-nav-panel]');
  const navTriggers = $$('[data-nav-trigger]');
  let navOpen = false, navReturn = null, navRestoring = false, navPointerType = 'mouse';
  let dead = false, raf = 0, dirty = true, drawerOpen = false, previousFocus = null;
  let actorKind = 'actors', actorIndex = -1, actorTrigger = null, actorArtTimer = 0, audio = null, soundWanted = false;
  let sequence = null, mediaElapsed = 0, productElapsed = 0, previousTick = null;
  let medicalClip = null, medicalElapsed = 0;
  let elementIndex = 0, elementSkillIndex = 0, elementClip = null, elementElapsed = 0, elementPlaying = !reduced.matches;
  const spriteStates = new Map(), visibleSprites = new Set(), activeSections = new Set(), carousels = new Map();
  const encounters = new Map(), visibleEncounters = new Set();
  const heroSequences = new Map(), visibleHeroSequences = new Set();
  const hero = $('[data-hero]'), parallaxLayers = $$('[data-parallax]');
  const leafCanvas = $('[data-leaf-canvas]');
  let leafContext = null;
  try { leafContext = leafCanvas?.getContext?.('2d'); } catch { /* Decorative Canvas has a static fallback. */ }
  const motionWindows = new Map(), photoAnimations = new Set();
  const replayGate = createSectionReplayGate();
  let elementVideoRequest = 0;
  let openingElapsed = 0, openingStarted = false, openingDone = reduced.matches;
  let heroReady = false, heroPreparing = false, heroRect = null, heroHidden = false, heroAccessHidden = null;
  let pointerX = 0, pointerY = 0, pointerTargetX = 0, pointerTargetY = 0;
  let leafElapsed = 0, leafDrawAt = -Infinity, leafWidth = 0, leafHeight = 0, leafRatio = 0, pendingMenuFocus = false;
  let elementPathsDirty = true, requestedTheme = root.dataset.theme || 'night', themeRequest = 0;
  let modalGeneration = 0, photoView = null, pendingPhotoFlip = null, closingPhoto = false;
  const leaves = Array.from({ length: 24 }, (_, index) => ({ x: (index * .61803398875) % 1, y: (index * .38196601125) % 1,
    size: 4 + index % 5, speed: 16 + index % 7 * 3, turn: index * 1.7, sway: 18 + index % 6 * 7 }));
  const notice = doc.createElement('p');
  notice.className = 'intro-status'; notice.setAttribute('role', 'status'); notice.setAttribute('aria-live', 'polite');
  root.append(notice);
  const motionButton = doc.createElement('button');
  motionButton.type = 'button'; motionButton.className = 'intro-motion'; motionButton.dataset.action = 'motion';
  motionButton.textContent = motionPreview ? '연출 끄기' : '연출 켜기'; motionButton.setAttribute('aria-pressed', String(motionPreview));
  motionButton.hidden = !motionPreference.matches;
  $('[data-hero] .intro-hero__scene')?.append(motionButton);
  let noticeTimer = 0;
  const announce = text => {
    // Modal dialogs live in the browser top layer, above every body z-index.
    const host = dialog?.open ? dialog : menu?.open ? menu : root;
    host.append(notice);
    notice.textContent = text;
    win.clearTimeout(noticeTimer);
    noticeTimer = win.setTimeout(() => { notice.textContent = ''; }, 4500);
  };
  const safeAsset = value => isIntroAsset(value, data.assetBase);
  const createServiceAction = actionId => {
    const action = introServiceAction(data, actionId), el = doc.createElement(action.demo ? 'button' : 'a');
    if (action.demo) el.type = 'button'; else el.href = action.href;
    el.dataset.serviceAction = action.id; el.textContent = action.label;
    return el;
  };
  const handleDemoAction = event => {
    const trigger = event.target.closest?.('[data-service-action]');
    if (!trigger || data.deployment?.mode !== 'demo') return false;
    event.preventDefault(); event.stopPropagation();
    announce(introServiceAction(data, trigger.dataset.serviceAction).demoMessage);
    return true;
  };
  function bindReadyImage(image, src) {
    if (image.classList.contains('is-missing')) image.removeAttribute('src');
    image.src = src; image.style.removeProperty('visibility');
    image.classList.remove('is-missing'); image.classList.add('is-loaded'); image.parentElement?.classList.remove('has-missing-art');
    const slide = image.closest('[data-slide]');
    if (slide && [...slide.querySelectorAll('[data-scene-src]')].every(item => item.classList.contains('is-loaded'))) {
      slide.classList.add('is-scene-ready');
      if (slide.classList.contains('is-active')) flash(slide, 'is-scene-entering', 1200);
    }
  }
  const queue = createImageQueue({ load: src => new Promise((resolve, reject) => {
    const image = new win.Image();
    const timer = win.setTimeout(() => reject(new Error('Image timeout')), 8000);
    image.onload = () => {
      (image.decode?.() || Promise.resolve()).then(() => { win.clearTimeout(timer); resolve(); }, error => { win.clearTimeout(timer); reject(error); });
    };
    image.onerror = () => { win.clearTimeout(timer); reject(new Error('Image unavailable')); };
    image.src = src;
  }) });
  const heroSources = theme => ['sky', 'stage', 'front'].map(layer => {
    const configured = data.sections?.visual?.assets?.layers?.[theme]?.[layer];
    return safeAsset(configured) ? configured : `${data.assetBase || '/assets/'}rpg/ui/intro/v1/hero-${layer}-${theme}.webp`;
  });
  const themeSelection = createReadyTransition({ load: src => queue.get(src), commit: theme => {
    if (dead) return;
    root.dataset.theme = theme; if (theme === 'day') root.classList.add('has-day');
    $$('[data-action="theme"]').forEach(button => {
      button.setAttribute('aria-pressed', String(theme === 'day'));
      button.setAttribute('aria-label', theme === 'day' ? '밤 풍경으로 변경' : '낮 풍경으로 변경');
    });
  } });
  async function selectTheme() {
    requestedTheme = requestedTheme === 'day' ? 'night' : 'day';
    const request = ++themeRequest, target = requestedTheme;
    $$('[data-action="theme"]').forEach(button => button.setAttribute('aria-busy', 'true'));
    const applied = await themeSelection.select(target, heroSources(target));
    if (dead || request !== themeRequest) return;
    $$('[data-action="theme"]').forEach(button => button.removeAttribute('aria-busy'));
    if (!applied) { requestedTheme = root.dataset.theme; announce('풍경을 준비하지 못했습니다. 현재 장면을 유지합니다.'); }
    schedule();
  }
  function prepareHero() {
    if (heroPreparing || heroReady) return;
    heroPreparing = true;
    Promise.all(heroSources(root.dataset.theme || 'night').map(src => queue.get(src))).then(() => {
      if (dead) return;
      // An unavailable decorative layer must never hold the title or CTA hostage.
      heroReady = true; dirty = true; schedule();
    });
  }
  function flash(el, className, duration = 600) {
    if (!el || reduced.matches) return;
    const previous = motionWindows.get(el);
    if (previous) el.classList.remove(previous.className);
    el.classList.remove(className);
    // Restart a selection reaction on the following shared paint, without another RAF.
    motionWindows.set(el, { className, remaining: duration, pending: true }); schedule();
  }
  function syncSuspension() {
    root.classList.toggle('is-motion-suspended', doc.hidden || !!dialog?.open || drawerOpen || !activeSections.has(hero));
    syncElementVideo();
  }
  function syncHeroAccess() {
    const hidden = heroHidden || (!openingDone && openingStarted);
    if (heroAccessHidden === hidden) return;
    heroAccessHidden = hidden;
    hero?.querySelectorAll('.intro-hero__title,.intro-hero__downloads').forEach(el => {
      el.inert = hidden; if (hidden) el.setAttribute('aria-hidden', 'true'); else el.removeAttribute('aria-hidden');
    });
  }
  function resizeLeaves() {
    if (!leafContext) return;
    const width = leafCanvas.clientWidth, height = leafCanvas.clientHeight;
    const ratio = Math.min(win.devicePixelRatio || 1, win.innerWidth <= 768 ? 1 : 1.5);
    if (width === leafWidth && height === leafHeight && ratio === leafRatio) return;
    leafWidth = width; leafHeight = height; leafRatio = ratio;
    leafCanvas.width = Math.max(1, Math.round(leafWidth * ratio)); leafCanvas.height = Math.max(1, Math.round(leafHeight * ratio));
    leafContext.setTransform(ratio, 0, 0, ratio, 0, 0); leafDrawAt = -Infinity;
  }
  function drawLeaves(now) {
    if (!leafContext || now - leafDrawAt < 1000 / 30) return;
    leafDrawAt = now; leafContext.clearRect(0, 0, leafWidth, leafHeight);
    const count = win.innerWidth <= 768 ? 10 : 24, seconds = leafElapsed / 1000;
    for (let index = 0; index < count; index++) {
      const leaf = leaves[index];
      const y = (leaf.y * (leafHeight + 80) + seconds * leaf.speed) % (leafHeight + 80) - 40;
      const x = leaf.x * leafWidth + Math.sin(seconds * .3 + leaf.turn) * leaf.sway;
      leafContext.save(); leafContext.translate(x, y); leafContext.rotate(leaf.turn + seconds * .24);
      leafContext.scale(1, .45 + Math.abs(Math.cos(seconds * .4 + leaf.turn)) * .4);
      leafContext.fillStyle = root.dataset.theme === 'day' ? '#b6925270' : '#d6b47f65';
      leafContext.beginPath(); leafContext.moveTo(-leaf.size, 0);
      leafContext.bezierCurveTo(-leaf.size * .3, -leaf.size, leaf.size * .8, -leaf.size * .8, leaf.size, 0);
      leafContext.bezierCurveTo(leaf.size * .3, leaf.size * .7, -leaf.size * .6, leaf.size * .6, -leaf.size, 0);
      leafContext.fill(); leafContext.restore();
    }
  }
  const sceneryObserver = new win.IntersectionObserver(entries => {
    for (const entry of entries) {
      const image = entry.target;
      const src = image.dataset.src || image.dataset.sceneSrc;
      if (!entry.isIntersecting || !safeAsset(src)) continue;
      sceneryObserver.unobserve(image);
      queue.get(src).then(ok => {
        if (dead || !image.isConnected) return;
        if (ok) bindReadyImage(image, src);
        else { image.classList.add('is-missing'); image.parentElement?.classList.add('has-missing-art'); }
      });
    }
  }, { rootMargin: '240px 0px' });
  $$('[data-section-scenery][data-src],[data-scene-src]').forEach(image => sceneryObserver.observe(image));

  const lockScroll = () => {
    root.classList.toggle('intro-scroll-locked', drawerOpen || !!dialog?.open);
    root.classList.toggle('is-overlay-open', drawerOpen || !!dialog?.open);
    if (drawerOpen || dialog?.open) cancelDrags();
    syncSuspension(); schedule();
  };
  const syncAudio = () => {
    const shouldPlay = soundWanted && !doc.hidden && !dialog?.open;
    if (!shouldPlay) { audio?.pause(); return; }
    if (!audio && safeAsset(data.ambientSrc)) { audio = new win.Audio(data.ambientSrc); audio.loop = true; audio.volume = 0.16; audio.preload = 'none'; }
    audio?.play().catch(() => {
      if (dead) return;
      soundWanted = false; updateSound(); announce('환경음을 재생하지 못했습니다. 사운드 버튼으로 다시 시도해 주세요.');
    });
  };
  const updateSound = () => {
    $$('[data-action="sound"]').forEach(button => { button.setAttribute('aria-pressed', String(soundWanted)); button.setAttribute('aria-label', soundWanted ? '환경음 끄기' : '환경음 켜기'); button.classList.toggle('is-active', soundWanted); });
  };
  const setMenu = open => {
    if (open) setNav(false);
    drawerOpen = open;
    menu?.classList.toggle('is-open', open); root.classList.toggle('is-menu-open', open);
    menu?.setAttribute('aria-hidden', String(!open)); if (menu) menu.inert = !open;
    menuButton?.setAttribute('aria-expanded', String(open)); menuButton?.setAttribute('aria-label', open ? '메뉴 닫기' : '메뉴 열기');
    if (menu?.showModal) { if (open && !menu.open) menu.showModal(); else if (!open && menu.open) menu.close(); }
    lockScroll();
    if (open) {
      pendingMenuFocus = true; schedule();
    } else menuButton?.focus({ preventScroll: true });
  };
  if (menu) menu.inert = true;

  function layoutNav() {
    if (!desktopNav || !navPanel || win.innerWidth <= 1280) return;
    const rect = desktopNav.getBoundingClientRect(), bounds = header.getBoundingClientRect();
    navPanel.style.setProperty('--nav-left', `${rect.left - bounds.left}px`);
    navPanel.style.setProperty('--nav-width', `${rect.width}px`);
    navPanel.style.setProperty('--nav-max-height', `${Math.max(120, win.innerHeight - bounds.bottom - 12)}px`);
  }
  function setNav(open, { trigger = null, enter = null, restoreFocus = false } = {}) {
    if (!navPanel) return;
    navOpen = !!open && win.innerWidth > 1280 && !drawerOpen && !dialog?.open;
    if (trigger) navReturn = trigger;
    navPanel.hidden = !navOpen; navPanel.inert = !navOpen;
    navPanel.setAttribute('aria-hidden', String(!navOpen));
    header.classList.toggle('is-nav-open', navOpen);
    navTriggers.forEach(link => link.setAttribute('aria-expanded', String(navOpen)));
    if (navOpen) {
      layoutNav();
      if (enter && navReturn) {
        const column = [...navPanel.querySelectorAll('[data-nav-column]')].find(el => el.dataset.navColumn === navReturn.dataset.navTrigger);
        const links = [...(column?.querySelectorAll('a[href]') || [])];
        (enter === 'last' ? links.at(-1) : links[0])?.focus({ preventScroll: true });
      }
    } else if (restoreFocus && navReturn?.isConnected && win.innerWidth > 1280) {
      navRestoring = true; navReturn.focus({ preventScroll: true }); navRestoring = false;
    }
  }
  on(desktopNav, 'pointerenter', event => { if (event.pointerType !== 'touch') setNav(true); });
  on(desktopNav, 'pointerover', event => {
    const trigger = event.target.closest('[data-nav-trigger]');
    if (trigger && event.pointerType !== 'touch') setNav(true, { trigger });
  });
  on(desktopNav, 'pointerdown', event => { navPointerType = event.pointerType; });
  on(header, 'pointerleave', () => { if (!navPanel?.contains(doc.activeElement)) setNav(false); });
  on(desktopNav, 'focusin', event => {
    if (navRestoring || (navPointerType === 'touch' && !navOpen)) return;
    const column = event.target.closest('[data-nav-column]');
    const trigger = event.target.closest('[data-nav-trigger]') || navTriggers.find(link => link.dataset.navTrigger === column?.dataset.navColumn);
    setNav(true, { trigger });
  });
  on(desktopNav, 'focusout', event => { if (!desktopNav.contains(event.relatedTarget)) setNav(false); });
  on(desktopNav, 'keydown', event => {
    const trigger = event.target.closest('[data-nav-trigger]');
    if (trigger && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
      event.preventDefault(); setNav(true, { trigger, enter: event.key === 'ArrowUp' ? 'last' : 'first' });
    }
  });
  on(doc, 'pointerdown', event => { if (navOpen && !header.contains(event.target)) setNav(false); });

  const spriteObserver = new win.IntersectionObserver(entries => {
    for (const entry of entries) {
      const heroSequence = heroSequences.get(entry.target);
      if (heroSequence) {
        if (entry.isIntersecting) { visibleHeroSequences.add(heroSequence); prepareHeroSequence(heroSequence); }
        else visibleHeroSequences.delete(heroSequence);
        continue;
      }
      const encounter = encounters.get(entry.target);
      if (encounter) {
        if (entry.isIntersecting) {
          visibleEncounters.add(encounter);
          if (!encounter.prepared && !encounter.overlay) { encounter.prepared = true; encounter.controller.play((encounter.hovered || encounter.focused) && !reduced.matches ? encounter.item.encounter.hover : encounter.item.encounter.idle); }
        } else visibleEncounters.delete(encounter);
        continue;
      }
      const el = entry.target, state = spriteStates.get(el);
      if (!state) continue;
      if (entry.isIntersecting) {
        visibleSprites.add(el);
        if (!state.requested) {
          state.requested = true;
          queue.get(state.meta.src).then(ok => {
            if (dead || !el.isConnected || spriteStates.get(el) !== state) return;
            if (ok) { el.style.backgroundImage = `url("${state.meta.src}")`; state.loaded = true; }
            else { el.classList.add('is-missing'); el.textContent = '✦'; }
            schedule();
          });
        }
      } else visibleSprites.delete(el);
    }
    schedule();
  }, { rootMargin: '180px 0px' });
  function registerSprites(scope) {
    for (const el of scope.querySelectorAll('[data-sprite]')) {
      if (spriteStates.has(el)) continue;
      let meta; try { meta = JSON.parse(el.dataset.sprite); } catch { continue; }
      if (!safeAsset(meta.src)) continue;
      const width = Number(meta.displayWidth) || 140;
      el.style.setProperty('--sprite-width', `${width}px`);
      el.style.setProperty('--sprite-height', `${width * meta.frameHeight / meta.frameWidth}px`);
      el.style.setProperty('--sprite-aspect', `${meta.frameWidth} / ${meta.frameHeight}`);
      el.style.backgroundSize = `${meta.frames * 100}% ${meta.rows * 100}%`;
      el.style.backgroundPosition = spritePosition(meta);
      spriteStates.set(el, { meta, loaded: false, requested: false, frame: '' }); spriteObserver.observe(el);
    }
  }
  function forgetSprites(scope) {
    for (const el of scope.querySelectorAll('[data-sprite]')) { spriteObserver.unobserve(el); visibleSprites.delete(el); spriteStates.delete(el); }
  }
  function makeSprite(meta, extraClass = '') {
    const el = doc.createElement('span'); el.className = `intro-sprite ${extraClass}`; el.dataset.sprite = JSON.stringify(meta); el.setAttribute('aria-hidden', 'true'); return el;
  }
  function makeImage(src, alt = '', className = '') {
    const image = doc.createElement('img'); image.alt = alt; image.className = className; image.decoding = 'async';
    if (safeAsset(src)) image.src = src;
    return image;
  }
  function prepareHeroSequence(state) {
    if (state.ready || state.preparing || reduced.matches) return;
    state.preparing = true;
    state.controller.select(state.meta, state.meta.steps.map(step => step.sprite.src)).then(ready => {
      if (dead || !state.host.isConnected || heroSequences.get(state.host) !== state) return;
      state.preparing = false;
      state.host.classList.toggle('has-sequence-fallback', !ready); schedule();
    });
  }
  function mountHeroSequence(host, item) {
    const meta = item?.heroSequence;
    if (!host || meta?.steps?.length !== 2 || !meta.steps.every(step => safeAsset(step.sprite?.src))) return;
    host.querySelectorAll('[data-sprite]').forEach((el, index) => {
      el.dataset.previewRole = 'hero-fallback'; el.dataset.heroStaticFrame = String(meta.staticFrame || 0); el.hidden = index > 0;
    });
    const state = { host, meta, elapsed: 0, ready: false, preparing: false, nodes: [], phase: -1, frame: -1 };
    state.controller = createReadyTransition({ load: src => queue.get(src), commit: () => {
      if (dead || !host.isConnected || heroSequences.get(host) !== state) return;
      forgetSprites(host); host.replaceChildren();
      const canvas = doc.createElement('span'); canvas.className = 'intro-encounter-canvas intro-hero-sequence__canvas';
      const first = meta.steps[0].sprite;
      host.style.aspectRatio = canvas.style.aspectRatio = `${first.frameWidth} / ${first.frameHeight}`;
      for (const [index, step] of meta.steps.entries()) {
        const el = makeSprite(step.sprite, 'intro-hero-sequence__sprite');
        // These two decoded sheets are sampled by the existing RAF, without
        // recreating encounter DOM or IO registrations at every clip boundary.
        el.removeAttribute('data-sprite'); el.hidden = index !== 0;
        el.style.backgroundImage = `url("${step.sprite.src}")`;
        el.style.backgroundSize = `${step.sprite.frames * 100}% ${step.sprite.rows * 100}%`;
        canvas.append(el); state.nodes.push(el);
      }
      host.append(canvas); host.classList.add('is-encounter-ready', 'is-hero-sequence-ready');
      state.ready = true; state.elapsed = 0; schedule();
    } });
    heroSequences.set(host, state); spriteObserver.observe(host);
  }
  function renderEncounter(encounter, clip) {
    if (dead || !encounter.host.isConnected) return;
    const { host } = encounter;
    forgetSprites(host); host.replaceChildren();
    encounter.clip = clip; encounter.elapsed = 0;
    const canvas = doc.createElement('span'); canvas.className = 'intro-encounter-canvas'; canvas.style.aspectRatio = `${clip.sprite.frameWidth} / ${clip.sprite.frameHeight}`; host.append(canvas);
    const layers = [{ sprite: clip.sprite }, ...(clip.tools || [])], nodes = [];
    layers.forEach((layer, index) => {
      const el = makeSprite(layer.sprite, 'intro-encounter-sprite');
      el.dataset.previewRole = 'encounter';
      el.style.zIndex = index === 0 ? '1' : '2';
      canvas.append(el); nodes.push(el);
    });
    host.style.aspectRatio = `${clip.sprite.frameWidth} / ${clip.sprite.frameHeight}`;
    host.classList.add('is-encounter-ready');
    host.classList.toggle('is-encounter-playing', clip === encounter.item.encounter.hover);
    registerSprites(host);
    nodes.forEach((el, index) => {
      const state = spriteStates.get(el);
      if (state) {
        state.encounter = encounter; state.placements = index ? layers[index].placements : null;
        state.loaded = true; state.requested = true; el.style.backgroundImage = `url("${state.meta.src}")`;
      }
    });
    schedule();
  }
  function mountEncounter(host, item, trigger = host.parentElement, overlay = false) {
    if (!host || !item?.encounter) return null;
    const encounter = { host, item, trigger, overlay, hovered: false, focused: false, prepared: false, clip: null, elapsed: 0, idleReady: false, listeners: [], loopIdle: host.hasAttribute('data-encounter-ambient') };
    if (!overlay) host.style.aspectRatio = `${item.encounter.idle.sprite.frameWidth} / ${item.encounter.idle.sprite.frameHeight}`;
    host.querySelectorAll('[data-sprite]').forEach(el => { el.dataset.previewRole = 'encounter-fallback'; });
    trigger.style.setProperty('--actor-frame-ratio', `${item.encounter.idle.sprite.frameWidth} / ${item.encounter.idle.sprite.frameHeight}`);
    encounter.controller = createEncounterSelection({
      load: src => safeAsset(src) ? queue.get(src) : Promise.resolve(false),
      commit: clip => {
        if (clip === item.encounter.idle) encounter.idleReady = true;
        renderEncounter(encounter, clip);
      },
      restore: () => {
        if (overlay) { host.classList.remove('is-encounter-playing'); encounter.elapsed = 0; schedule(); }
        else if (encounter.idleReady) renderEncounter(encounter, item.encounter.idle);
        else encounter.controller.play(item.encounter.idle);
      },
    });
    const sync = () => {
      const active = encounter.hovered || encounter.focused;
      host.dataset.encounterState = active && !reduced.matches ? 'hover' : 'idle';
      if (active && !reduced.matches) { encounter.prepared = true; encounter.controller.play(item.encounter.hover); }
      else encounter.controller.rest();
      schedule();
    };
    const listen = (type, listener) => { on(trigger, type, listener); encounter.listeners.push([type, listener]); };
    listen('pointerenter', event => { if (event.pointerType !== 'touch') { encounter.hovered = true; sync(); } });
    listen('pointerleave', () => { encounter.hovered = false; sync(); });
    listen('focusin', () => { encounter.focused = trigger.matches(':focus-visible'); sync(); });
    listen('focusout', event => { if (!trigger.contains(event.relatedTarget)) { encounter.focused = false; sync(); } });
    encounter.sync = sync;
    encounters.set(host, encounter); spriteObserver.observe(host);
    return encounter;
  }
  function releaseEncounter(host) {
    const encounter = encounters.get(host);
    if (!encounter) return;
    encounter.controller.stop(); visibleEncounters.delete(encounter); encounters.delete(host);
    encounter.listeners.forEach(([type, listener]) => encounter.trigger.removeEventListener(type, listener));
    spriteObserver.unobserve(host); forgetSprites(host);
  }
  const actorPanel = $('[data-actor-panel]'), actorSection = $('#character');
  const actorSelection = createLatestSelection({ load: src => safeAsset(src) ? queue.get(src) : Promise.resolve(false), commit: ({ item }, loaded) => {
    if (dead || !actorPanel || actorPanel.hidden) return;
    actorPanel.classList.remove('is-loading'); actorPanel.setAttribute('aria-busy', 'false');
    flash(actorPanel, 'is-revealing');
    const stage = $('[data-actor-stage]'), status = $('[data-actor-image-status]');
    if (!stage) return;
    win.clearTimeout(actorArtTimer);
    stage.querySelectorAll('.is-leaving').forEach(el => el.remove());
    const previous = stage.querySelector('.intro-actor-art.is-current');
    if (previous) { previous.classList.replace('is-current', 'is-leaving'); previous.setAttribute('aria-hidden', 'true'); previous.alt = ''; }
    stage.classList.remove('has-missing-art');
    if (loaded) {
      const image = makeImage(item.portrait || item.image, item.name, 'intro-actor-art is-current');
      stage.prepend(image);
      if (status) status.hidden = true;
    } else {
      stage.classList.add('has-missing-art');
      if (status) { status.hidden = false; status.textContent = '초상화를 불러오지 못했어요. 인물을 다시 선택하면 재시도할 수 있어요.'; }
    }
    if (reduced.matches || !activeSections.has(actorSection) || doc.hidden) previous?.remove();
    else actorArtTimer = win.setTimeout(() => previous?.remove(), 300);
    positionActorPanel();
  } });
  function syncActorButtons() {
    $$('[data-actor-index],[data-actor-scene-index]').forEach(el => {
      const kind = el.hasAttribute('data-actor-scene-index') ? 'actors' : el.closest('[data-actor-list]')?.dataset.actorList;
      const index = Number(el.dataset.actorSceneIndex ?? el.dataset.actorIndex);
      const active = kind === actorKind && index === actorIndex && !actorPanel?.hidden;
      el.classList.toggle('is-active', active); el.setAttribute('aria-pressed', String(active));
      if (el.hasAttribute('data-actor-scene-index')) el.setAttribute('aria-expanded', String(active));
    });
    actorSection?.classList.toggle('has-selected-actor', actorKind === 'actors' && !actorPanel?.hidden);
  }
  function finishActorTransition() {
    win.clearTimeout(actorArtTimer);
    $('[data-actor-stage]')?.querySelectorAll('.is-leaving').forEach(el => el.remove());
  }
  function closeActorPanel(restoreFocus = true) {
    actorSelection.invalidate(); finishActorTransition();
    const motion = $('[data-actor-motion]');
    if (motion) { releaseEncounter(motion); motion.remove(); }
    if (actorPanel) { actorPanel.hidden = true; actorPanel.classList.remove('is-loading'); actorPanel.setAttribute('aria-busy', 'false'); }
    actorIndex = -1; syncActorButtons();
    if (restoreFocus && actorTrigger?.isConnected && actorTrigger.getClientRects().length) actorTrigger.focus({ preventScroll: true });
  }
  function setActorKind(kind) {
    if (!['actors', 'monsters'].includes(kind)) return;
    closeActorPanel(false); actorKind = kind;
    if (actorSection) actorSection.dataset.actorView = kind;
    $$('[data-actor-kind]').forEach(el => {
      const active = el.dataset.actorKind === kind; el.classList.toggle('is-active', active);
      el.setAttribute('aria-selected', String(active)); el.tabIndex = active ? 0 : -1;
    });
    $$('[data-actor-list]').forEach(el => { el.hidden = el.dataset.actorList !== kind; });
    if ($('[data-actor-village]')) $('[data-actor-village]').hidden = kind !== 'actors';
    if (kind === 'monsters') chooseActor(kind, 0);
    schedule();
  }
  function centerActor(index, smooth = true) {
    const viewport = $('[data-actor-viewport]'), actor = $(`[data-actor-scene-index="${index}"]`);
    if (!viewport || !actor || viewport.scrollWidth <= viewport.clientWidth) return;
    const rect = actor.getBoundingClientRect(), frame = viewport.getBoundingClientRect();
    viewport.scrollTo({ left: viewport.scrollLeft + rect.left + rect.width / 2 - frame.left - viewport.clientWidth / 2, behavior: reduced.matches || !smooth ? 'instant' : 'smooth' });
  }
  function positionActorPanel() {
    if (!actorPanel || actorPanel.hidden || actorKind !== 'actors' || win.innerWidth <= 768) return;
    const frame = $('[data-actor-world]')?.getBoundingClientRect(), parent = actorPanel.parentElement.getBoundingClientRect();
    if (!frame) return;
    const headerBottom = $('[data-header]')?.getBoundingClientRect().bottom || 0;
    const top = actorPanelTop({ sceneTop: frame.top, sceneBottom: frame.bottom, panelHeight: actorPanel.offsetHeight,
      viewportHeight: win.innerHeight, headerBottom });
    actorPanel.style.setProperty('--actor-panel-top', `${(top - parent.top).toFixed(2)}px`);
  }
  function chooseActor(kind, index, trigger = null) {
    const items = data[kind] || [];
    if (!items.length || !actorPanel) return;
    actorKind = kind; actorIndex = wrapIndex(index, items.length);
    actorTrigger = trigger || actorTrigger;
    const item = items[actorIndex];
    actorPanel.hidden = false; actorPanel.classList.remove('is-revealing'); motionWindows.delete(actorPanel); actorPanel.classList.add('is-loading'); actorPanel.setAttribute('aria-busy', 'true');
    actorPanel.dataset.side = Number(item.scene?.x ?? 50) < 50 ? 'right' : 'left';
    finishActorTransition(); syncActorButtons();
    $$('[data-actor-name]').forEach(el => { el.textContent = item.name; });
    if ($('[data-actor-role]')) $('[data-actor-role]').textContent = item.role || item.tag || '';
    if ($('[data-actor-description]')) $('[data-actor-description]').textContent = item.description;
    const region = $('[data-actor-region]');
    if (region) { region.hidden = !item.regionName; region.textContent = item.regionName || ''; }
    if ($('[data-actor-category]')) $('[data-actor-category]').textContent = kind === 'monsters' ? '이야기' : '수안의 의료진';
    const stage = $('[data-actor-stage]');
    const oldMotion = $('[data-actor-motion]');
    if (oldMotion) { releaseEncounter(oldMotion); oldMotion.remove(); }
    if (kind === 'monsters' && item.encounter && stage) {
      const motion = doc.createElement('span'); motion.className = 'intro-actor-panel__motion intro-encounter-host';
      motion.dataset.actorMotion = ''; motion.setAttribute('aria-hidden', 'true'); stage.append(motion);
      mountEncounter(motion, item, stage, true);
    }
    stage?.classList.toggle('is-monster-portrait', kind === 'monsters');
    stage?.classList.add('is-portrait');
    const status = $('[data-actor-image-status]');
    if (status) { status.hidden = false; status.textContent = '초상화를 준비하고 있어요.'; }
    actorSelection.select({ src: item.portrait || item.image, item });
    if (kind === 'actors') centerActor(actorIndex);
    positionActorPanel();
    if (trigger && win.innerWidth <= 768) actorPanel.scrollIntoView({ block: 'nearest', behavior: reduced.matches ? 'instant' : 'smooth' });
    schedule();
  }
  function setPreviewSprite(host, meta, role) {
    if (!host || !meta) return;
    forgetSprites(host); host.replaceChildren();
    const el = makeSprite(meta); el.dataset.previewRole = role;
    // Both bodies and effects are anchored to a ground contact point. The
    // effect's authored origin meets the ground anchor selected for this skill.
    const originX = Number(meta.originX ?? meta.frameWidth / 2) / meta.frameWidth * 100;
    const originY = Number(meta.originY ?? meta.frameHeight * 0.9) / meta.frameHeight * 100;
    el.style.position = 'absolute'; el.style.left = '0'; el.style.top = '0';
    el.style.transform = `translate(-${originX}%, -${originY}%)`;
    host.append(el); registerSprites(host);
  }
  function syncMedicalControls() {
    $('[data-medical-arena]')?.setAttribute('data-play-state', reduced.matches ? 'still' : 'playing');
  }
  function selectMedicalSkill(index) {
    const item = data.medical?.skills?.[index]; if (!item) return;
    medicalElapsed = 0; previousTick = null;
    $$('[data-medical-skill-index]').forEach(el => { const active = Number(el.dataset.medicalSkillIndex) === index; el.classList.toggle('is-active', active); el.setAttribute('aria-selected', String(active)); el.tabIndex = active ? 0 : -1; });
    $('[data-medical-name]').textContent = item.name;
    $('[data-medical-description]').textContent = item.description;
    const performerIndex = wrapIndex(Number(item.performerIndex ?? index), item.performers.length);
    const performer = data.medical.performers[performerIndex];
    medicalClip = { ...item, sprite: item.performers[performerIndex] };
    const casterHost = $('[data-medical-caster="0"]');
    setPreviewSprite(casterHost, medicalClip.sprite, 'medical-caster');
    const tool = item.performerTools?.[performerIndex];
    if (casterHost && tool) {
      const toolHost = doc.createElement('span'); toolHost.className = 'intro-medical-tool';
      toolHost.style.position = 'absolute'; toolHost.style.inset = '0';
      toolHost.style.pointerEvents = 'none'; toolHost.style.zIndex = '2';
      casterHost.append(toolHost);
      // medical-tool samples the same castTime as medical-caster in the shared RAF.
      setPreviewSprite(toolHost, tool, 'medical-tool');
    }
    setPreviewSprite($('[data-medical-effect="0"]'), item.effect, 'medical-effect');
    if ($('[data-medical-performer]')) $('[data-medical-performer]').textContent = '의료 움직임 · 게임 이미지 연출';
    const arena = $('[data-medical-arena]');
    if (arena) {
      const self = item.demoMode === 'self';
      arena.setAttribute('aria-label', `${item.name} 게임 이미지 연출. 실제 시술 장면이 아닙니다.`);
      arena.dataset.performerBody = performer.body; arena.dataset.demoMode = self ? 'self' : 'target';
      const target = $('[data-medical-target="0"]');
      if (target) target.hidden = self;
    }
    flash($('[data-medical-arena]'), 'is-skill-changing', 450);
    syncMedicalControls(); schedule();
  }
  function selectElementSkill(index, userInitiated = false) {
    const item = data.elements?.[elementIndex]?.skills?.[index]; if (!item) return;
    elementSkillIndex = index; elementClip = item; elementElapsed = 0; previousTick = null;
    if (userInitiated) elementPlaying = !reduced.matches;
    $$('[data-element-skill-index]').forEach(el => {
      const active = Number(el.dataset.elementSkillIndex) === elementSkillIndex;
      el.dataset.chainSelected = String(active); el.classList.toggle('is-active', active);
      el.setAttribute('aria-selected', String(active)); el.tabIndex = active ? 0 : -1;
      if (active) $('#intro-element-skill-detail')?.setAttribute('aria-labelledby', el.id);
    });
    $('[data-element-skill-name]').textContent = item.name;
    $('[data-element-skill-description]').textContent = item.description;
    const image = $('[data-element-icon]'); if (image) { image.src = item.icon; image.alt = item.name; }
    const stage = $('[data-element-stage]');
    if (stage) {
      forgetSprites(stage); stage.replaceChildren();
      const host = doc.createElement('span'); host.className = 'intro-element-effect';
      stage.append(host); setPreviewSprite(host, item.effect, 'element-effect');
    }
    elementPathsDirty = true;
    if (userInitiated) flash($('#skill'), 'is-element-changing');
    syncElementVideo(userInitiated);
    schedule();
  }
  function selectCommunity(index) {
    const tabs = $$('[data-community-index]'), panels = $$('[data-community-panel]');
    if (!Number.isInteger(index) || index < 0 || index >= tabs.length) return;
    tabs.forEach((tab, i) => { const active = i === index; tab.setAttribute('aria-selected', String(active)); tab.tabIndex = active ? 0 : -1; });
    panels.forEach((panel, i) => { panel.hidden = i !== index; });
  }
  function syncElementVideo(seek = false) {
    const video = $('[data-element-video]'), item = data.elements?.[elementIndex];
    if (!video || !item) return;
    const visible = activeSections.has($('#skill')) && !doc.hidden && !drawerOpen && !dialog?.open && !reduced.matches;
    const label = $('[data-element-video-name]');
    if (label) label.textContent = `${item.name} · 실제 스킬 프레임 시연`;
    const trigger = $('[data-action="element-video"]');
    trigger?.setAttribute('aria-label', `${item.name} 스킬 시연 영상 크게 보기`);
    // Menu selections may happen before the section is visible or while its drawer is open.
    if (seek) video.dataset.seekTime = String(elementVideoOffset(item, elementSkillIndex));
    if (!visible) { video.pause(); return; }
    if (!safeAsset(item.videoSrc)) return;
    if (video.getAttribute('src') !== item.videoSrc) {
      video.pause(); elementVideoRequest++;
      video.dataset.videoState = 'loading'; video.src = item.videoSrc;
      if (safeAsset(item.videoPoster)) video.poster = item.videoPoster;
      video.preload = 'metadata'; video.muted = true; video.loop = false; video.playsInline = true;
      video.load(); seek = true;
    }
    if (seek) video.dataset.seekTime = String(elementVideoOffset(item, elementSkillIndex));
    if (video.readyState >= 1 && video.dataset.seekTime) {
      video.currentTime = Math.min(Number(video.dataset.seekTime), Math.max(0, video.duration - .05));
      delete video.dataset.seekTime;
    }
    if (video.readyState >= 1) {
      const segment = elementVideoSegment(item, elementSkillIndex, video.currentTime, video.duration);
      if (segment.shouldLoop && !video.seeking) video.currentTime = segment.start;
    }
    if (video.dataset.videoState === 'failed') return;
    const request = elementVideoRequest;
    video.play()?.then(() => {
      if (!dead && request === elementVideoRequest) video.dataset.videoState = 'playing';
    }, () => { if (!dead && request === elementVideoRequest) video.dataset.videoState = 'blocked'; });
  }
  function openElementVideo() {
    const item = data.elements?.[elementIndex];
    if (!item || !safeAsset(item.videoSrc) || !openDialog(`${item.name} 스킬 시연 영상`)) return;
    const player = doc.createElement('section'); player.className = 'intro-skill-film';
    const title = doc.createElement('h2'); title.textContent = `${item.name}, 여섯 갈래의 비전`;
    const description = doc.createElement('p'); description.textContent = '실제 의료진과 원소 스킬 프레임을 조합한 시연 영상';
    const video = doc.createElement('video'); video.controls = true; video.playsInline = true;
    video.preload = 'metadata'; video.src = item.videoSrc;
    if (safeAsset(item.videoPoster)) video.poster = item.videoPoster;
    video.setAttribute('aria-label', `${item.name} 원소 스킬 시연 영상`);
    let requestedChapter = elementSkillIndex;
    const syncChapters = () => {
      if (!video.isConnected) return;
      const selected = video.readyState >= 1 ? elementVideoChapter(item, video.currentTime) : requestedChapter;
      [...chapters.children].forEach((button, index) => {
        const active = index === selected;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', String(active));
        if (active) button.setAttribute('aria-current', 'true'); else button.removeAttribute('aria-current');
      });
    };
    video.addEventListener('loadedmetadata', () => {
      if (!video.isConnected) return;
      video.currentTime = elementVideoSegment(item, requestedChapter, 0, video.duration).start;
      syncChapters();
    }, { once: true });
    const chapters = doc.createElement('nav'); chapters.className = 'intro-skill-film__chapters'; chapters.setAttribute('aria-label', '시연 스킬 이동');
    (item.skills || []).forEach((skill, index) => {
      const button = doc.createElement('button'); button.type = 'button'; button.textContent = skill.name;
      button.addEventListener('click', () => {
        requestedChapter = index;
        if (video.readyState >= 1) video.currentTime = elementVideoSegment(item, index, 0, video.duration).start;
        syncChapters(); video.play()?.catch(() => {});
      });
      chapters.append(button);
    });
    video.addEventListener('timeupdate', syncChapters);
    video.addEventListener('seeked', syncChapters);
    video.addEventListener('error', () => { description.textContent = '영상을 불러오지 못했습니다. 원소 소개의 스킬과 효과 미리보기를 이용해 주세요.'; });
    player.append(title, description, video, chapters); content.append(player);
    syncChapters();
    if (!reduced.matches) video.play()?.catch(() => {});
  }
  function suspendModalVideos() {
    // pagehide and visibilitychange can arrive in either order; preserve the first intent.
    suspendVideoPlayback(content.querySelectorAll('video'));
  }
  function resumeModalVideos() {
    if (!dialog?.open || doc.hidden || reduced.matches) return;
    resumeVideoPlayback(content.querySelectorAll('video'));
  }
  function selectElement(index, userInitiated = false) {
    const item = data.elements?.[index]; if (!item) return;
    elementIndex = index; elementElapsed = 0; previousTick = null;
    $$('[data-element-index]').forEach(el => { const active = Number(el.dataset.elementIndex) === index; el.classList.toggle('is-active', active); el.setAttribute('aria-selected', String(active)); el.tabIndex = active ? 0 : -1; });
    $('[data-element-name]').textContent = item.name;
    $('[data-element-description]').textContent = item.description;
    const section = $('#skill'); section.dataset.element = item.id;
    if (/^#[\da-f]{3,8}$/i.test(item.accent || '')) section.style.setProperty('--element-accent', item.accent);
    if ($('[data-element-symbol]')) $('[data-element-symbol]').textContent = item.symbol;
    const chain = $('[data-element-chain]');
    if (chain) {
      chain.replaceChildren();
      chain.setAttribute('aria-label', `${item.name} 진료 항목`);
      for (const [skillIndex, skill] of (item.skills || []).entries()) {
        const button = doc.createElement('button'); button.type = 'button';
        button.className = 'intro-element-chain__skill'; button.dataset.elementSkillIndex = skillIndex;
        button.id = `intro-element-chain-${skill.growthNodeId}`;
        button.setAttribute('role', 'tab'); button.setAttribute('aria-controls', 'intro-element-skill-detail');
        const art = doc.createElement('span'); art.className = 'intro-element-chain__image';
        const image = makeImage(skill.icon, ''); image.loading = 'lazy'; art.append(image);
        const number = doc.createElement('span'); number.className = 'intro-element-chain__number'; number.textContent = String(skillIndex + 1).padStart(2, '0');
        const name = doc.createElement('span'); name.className = 'intro-element-chain__name'; name.textContent = skill.name;
        button.append(art, number, name); chain.append(button);
      }
    }
    selectElementSkill(item.defaultSkillIndex || 0, userInitiated);
  }
  function drawElementConnections() {
    const svg = $('[data-element-connections]'), network = $('[data-element-network]');
    if (!svg || !network) return;
    const rect = network.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    svg.setAttribute('viewBox', `0 0 ${rect.width} ${rect.height}`); svg.replaceChildren();
    const skills = data.elements[elementIndex].skills;
    const selectedBranch = new Set();
    const collectParents = skill => {
      if (!skill || selectedBranch.has(skill.growthNodeId)) return;
      selectedBranch.add(skill.growthNodeId);
      (skill.prerequisites || []).forEach(id => collectParents(skills.find(item => item.growthNodeId === id)));
    };
    collectParents(skills[elementSkillIndex]);
    const buttons = $$('[data-element-skill-index]');
    const centers = buttons.map(button => {
      const art = button.querySelector('.intro-element-chain__image') || button, box = art.getBoundingClientRect();
      return { x: box.left - rect.left + box.width / 2, y: box.top - rect.top + box.height / 2 };
    });
    for (const [index, skill] of skills.entries()) {
      for (const parent of skill.prerequisites || []) {
        const sourceIndex = skills.findIndex(item => item.growthNodeId === parent);
        const from = centers[sourceIndex], to = centers[index]; if (!from || !to) continue;
        const path = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
        const dx = to.x - from.x, dy = to.y - from.y;
        const arch = Math.max(10, Math.min(from.y, to.y) - 68 - (index % 2) * 8);
        const curve = Math.abs(dy) > 40
          ? `${from.x} ${from.y + dy * .55}, ${to.x} ${to.y - dy * .55}`
          : Math.abs(index - sourceIndex) > 1 ? `${from.x + dx * .25} ${arch}, ${to.x - dx * .25} ${arch}`
            : `${from.x + dx * .45} ${from.y}, ${to.x - dx * .45} ${to.y}`;
        path.setAttribute('d', `M ${from.x} ${from.y} C ${curve}, ${to.x} ${to.y}`);
        path.setAttribute('pathLength', '1'); path.classList.add('is-linked');
        path.classList.toggle('is-selected', selectedBranch.has(skill.growthNodeId));
        svg.append(path);
      }
    }
  }
  function cancelPhotoAnimations() {
    for (const animation of photoAnimations) animation.cancel();
    photoAnimations.clear(); pendingPhotoFlip = null; closingPhoto = false;
  }
  function animatePhoto(image, frames, duration = 360) {
    if (reduced.matches || !image?.animate) return null;
    const animation = image.animate(frames, { duration, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'both' });
    photoAnimations.add(animation);
    animation.finished.then(() => { photoAnimations.delete(animation); animation.cancel(); }, () => photoAnimations.delete(animation));
    return animation;
  }
  function photoTransform(from, to) {
    return `translate(${from.left + from.width / 2 - to.left - to.width / 2}px, ${from.top + from.height / 2 - to.top - to.height / 2}px) scale(${from.width / Math.max(1, to.width)}, ${from.height / Math.max(1, to.height)})`;
  }
  function closeDialog() {
    if (!dialog?.open || closingPhoto) return;
    const origin = photoView?.origin, image = photoView?.image;
    if (!reduced.matches && image && origin?.isConnected && origin.getClientRects().length) {
      const from = image.getBoundingClientRect(), to = origin.getBoundingClientRect();
      if (to.width && to.height && to.bottom > 0 && to.top < win.innerHeight) {
        cancelPhotoAnimations(); closingPhoto = true;
        const generation = modalGeneration;
        const animation = animatePhoto(image, [{ transform: 'none', opacity: 1 }, { transform: photoTransform(to, from), opacity: .25 }], 300);
        if (animation) {
          const finish = () => { if (!dead && generation === modalGeneration && dialog.open) dialog.close(); };
          animation.finished.then(finish, finish); return;
        }
      }
    }
    dialog.close();
  }
  function openDialog(label) {
    if (!dialog) return false;
    setNav(false);
    if (drawerOpen) setMenu(false);
    modalGeneration++; cancelPhotoAnimations(); photoView = null;
    previousFocus = doc.activeElement; content.querySelectorAll('video').forEach(video => video.pause()); forgetSprites(content); content.replaceChildren(); sequence = null;
    dialog.setAttribute('aria-label', label); if (!dialog.open) dialog.showModal();
    actorSection?.classList.add('is-dialog-paused'); finishActorTransition();
    lockScroll(); syncAudio(); mediaElapsed = 0; schedule(); return true;
  }
  function openPortrait() {
    const item = data[actorKind]?.[actorIndex]; if (!item || !openDialog(item.name)) return;
    const panel = doc.createElement('article'); panel.className = 'intro-portrait';
    const art = doc.createElement('div'); art.className = 'intro-portrait__art';
    art.append(makeImage(item.portrait || item.image, item.name));
    if (item.regionName) { const badge = doc.createElement('span'); badge.className = 'intro-portrait__region'; badge.textContent = item.regionName; art.append(badge); }
    panel.append(art);
    const copy = doc.createElement('div'), role = doc.createElement('p'), title = doc.createElement('h2'), description = doc.createElement('p');
    role.textContent = item.role || item.tag; title.textContent = item.name; description.textContent = item.description;
    copy.append(role, title, description); panel.append(copy); content.append(panel);
  }
  function openFeature(index) {
    const item = data.features?.[index]; if (!item || !openDialog(item.name)) return;
    const panel = doc.createElement('article'); panel.className = 'intro-feature-detail';
    panel.append(makeImage(item.image, item.name));
    const copy = doc.createElement('div'), tag = doc.createElement('span'), title = doc.createElement('h2'), description = doc.createElement('p');
    tag.textContent = item.tag; title.textContent = item.name; description.textContent = item.description;
    const link = createServiceAction(item.actionId); link.className = 'intro-button intro-button--ink';
    copy.append(tag, title, description, link); panel.append(copy); content.append(panel);
  }
  async function openPhoto({ src, title, alt, captionText, origin, original, originalLabel = '원본 크기로 보기 ↗' }) {
    if (!safeAsset(src)) return;
    const source = origin?.querySelector?.('img') || origin;
    const sourceRect = source?.getBoundingClientRect();
    if (!openDialog(title)) return;
    const generation = modalGeneration;
    const figure = doc.createElement('figure'); figure.className = 'intro-lightbox';
    const caption = doc.createElement('figcaption'); caption.textContent = captionText || title;
    if (safeAsset(original)) {
      const link = doc.createElement('a'); link.href = original; link.target = '_blank'; link.rel = 'noopener'; link.textContent = originalLabel;
      caption.append(doc.createTextNode(' · '), link);
    }
    figure.setAttribute('aria-busy', 'true'); figure.append(caption); content.append(figure);
    const loaded = await queue.get(src);
    if (dead || generation !== modalGeneration || !dialog.open || !content.contains(figure)) return;
    figure.setAttribute('aria-busy', 'false');
    if (!loaded) { figure.classList.add('has-missing-art'); caption.append(doc.createTextNode(' · 이미지를 불러오지 못했습니다. 닫은 뒤 다시 시도해 주세요.')); return; }
    const image = makeImage(src, alt || title); figure.prepend(image);
    photoView = { image, origin: source };
    pendingPhotoFlip = { image, sourceRect, generation }; schedule();
  }
  function openGallery(button) {
    const carousel = carousels.get('media'), item = data.gallery?.[carousel?.index || 0];
    if (item) openPhoto({ src: item.image, title: item.title, alt: item.alt, captionText: item.caption, original: item.originalImage, origin: carousel?.slides[carousel.index].querySelector('img') || button });
  }
  function openWorldCapture(button) {
    openPhoto({ src: button.dataset.worldImage, title: button.dataset.worldTitle || '수안의 이야기', origin: button,
      captionText: button.dataset.worldCaption || '실제 PLAY · 300·400 의료진 대화 연출 예시', original: button.dataset.worldOriginal, originalLabel: '플레이 원본 보기 ↗' });
  }
  function openClinicCapture(button) {
    openPhoto({ src: button.dataset.clinicCapture, title: '플레이와 연결된 진료 타이머', origin: button,
      captionText: '실제 플레이 화면 · 좌측 상단 진료 연동 · 예시 데이터 촬영', original: button.dataset.clinicCapture });
  }
  function openSequence() {
    if (!openDialog('수안의 이야기 감상')) return;
    const scenes = data.sequence || [];
    const player = doc.createElement('section'); player.className = 'intro-sequence';
    const screen = doc.createElement('div'); screen.className = 'intro-sequence__screen';
    for (const [index, scene] of scenes.entries()) {
      const frame = doc.createElement('article'); frame.className = 'intro-sequence__scene'; frame.classList.toggle('is-active', index === 0);
      frame.append(makeImage(scene.image, scene.title));
      const copy = doc.createElement('div'), number = doc.createElement('span'), title = doc.createElement('h2'), desc = doc.createElement('p');
      copy.className = 'intro-sequence__copy'; number.textContent = `CHAPTER 0${index + 1}`; title.textContent = scene.title; desc.textContent = scene.description;
      copy.append(number, title, desc); frame.append(copy);
      if (scene.sprite) frame.append(makeSprite(scene.sprite, 'intro-sequence__sprite'));
      screen.append(frame);
    }
    const controls = doc.createElement('div'); controls.className = 'intro-sequence__controls';
    const progress = doc.createElement('progress'); progress.max = 1; progress.value = 0; progress.setAttribute('aria-label', '이야기 진행률');
    const time = doc.createElement('span'); time.textContent = '0:00 / 0:24'; time.setAttribute('aria-live', 'off');
    const start = createServiceAction('play');
    controls.append(progress, time, start); player.append(screen, controls); content.append(player);
    sequence = { elapsed: 0, playing: !reduced.matches, frames: [...screen.children], progress, time, index: -1, second: -1, player };
    registerSprites(player); schedule();
  }

  function carouselSources(carousel, index) {
    const slide = carousel.slides[index];
    const images = [...slide.querySelectorAll('img')].map(image => image.dataset.sceneSrc || image.dataset.src || image.getAttribute('src'));
    const sprites = [...slide.querySelectorAll('[data-sprite]')].flatMap(el => {
      try { return [JSON.parse(el.dataset.sprite).src]; } catch { return []; }
    });
    return [...new Set([...images, ...sprites].filter(safeAsset))];
  }
  function prepareCarouselNeighbor(carousel, index) {
    const target = wrapIndex(index, carousel.slides.length), slide = carousel.slides[target];
    if (!slide || carousel.name === 'media') return;
    for (const src of carouselSources(carousel, target)) queue.get(src).then(loaded => {
      if (dead || !loaded || !carousel.el.isConnected) return;
      const clone = carousel.clones?.[target === 0 ? 1 : target === carousel.slides.length - 1 ? 0 : -1];
      for (const scope of [slide, clone].filter(Boolean)) scope.querySelectorAll('img').forEach(image => {
        if ((image.dataset.sceneSrc || image.dataset.src || image.getAttribute('src')) === src) bindReadyImage(image, src);
      });
    });
  }
  function layoutCarousel(carousel) {
    const { slides, track, name, index } = carousel;
    if (name === 'media' || !slides.length) return;
    if (name === 'features') track.parentElement.scrollLeft = 0;
    const first = slides[0], active = slides[index], gap = parseFloat(win.getComputedStyle(track).columnGap) || 0;
    carousel.center = carousel.align === 'center' ? (track.parentElement.clientWidth - active.offsetWidth) / 2 : 0;
    carousel.base = carouselOffset({ firstLeft: first.offsetLeft, activeLeft: active.offsetLeft, activeWidth: active.offsetWidth,
      viewportWidth: track.parentElement.clientWidth, center: carousel.align === 'center' });
    if (carousel.clones) {
      carousel.clones[0].style.left = `${-first.offsetWidth - gap}px`;
      carousel.clones[1].style.left = `${slides.at(-1).offsetLeft - first.offsetLeft + slides.at(-1).offsetWidth + gap}px`;
      carousel.clones.forEach(clone => { clone.style.width = `${first.offsetWidth}px`; });
    }
    if (!carousel.wrapRemaining) track.style.transform = `translate3d(${carousel.base + carousel.dragOffset}px,0,0)`;
  }
  function cancelDrag(carousel, restore = true) {
    const id = carousel.pointerId; carousel.pointerId = null; carousel.gesture.cancel(); carousel.dragOffset = 0; carousel.dragDirty = false;
    carousel.el.classList.remove('is-dragging');
    if (id !== null && carousel.el.hasPointerCapture?.(id)) carousel.el.releasePointerCapture(id);
    if (restore) layoutCarousel(carousel);
  }
  function cancelDrags() { for (const carousel of carousels.values()) cancelDrag(carousel); }
  function applyCarousel(carousel, next, immediate = false) {
    const restoreFocus = carousel.focusFrom && doc.activeElement === carousel.focusFrom; carousel.focusFrom = null;
    const previous = carousel.index, count = carousel.slides.length;
    carousel.index = wrapIndex(next, count); carousel.requestedIndex = carousel.index; carousel.pending = false;
    const { el, slides, track, index, name } = carousel;
    const changed = index !== previous;
    slides.forEach((slide, i) => {
      const active = i === index, neighbor = name === 'features' && [wrapIndex(index - 1, count), wrapIndex(index + 1, count)].includes(i);
      slide.classList.toggle('is-active', active); slide.setAttribute('aria-hidden', String(!active && !neighbor)); slide.inert = !active && !neighbor;
      const choice = slide.querySelector('[data-feature-select]');
      if (choice) { choice.tabIndex = active ? 0 : -1; choice.setAttribute('aria-pressed', String(active)); }
    });
    el.querySelectorAll('[data-index]').forEach(button => {
      const active = Number(button.dataset.index) === index; button.classList.toggle('is-active', active); button.setAttribute('aria-current', String(active));
      if (button.getAttribute('role') === 'tab') { button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1; }
    });
    const featureNav = el.querySelector('[data-feature-nav]');
    if (featureNav) {
      featureNav.style.setProperty('--feature-progress', String(count > 1 ? index / (count - 1) : 0));
      featureNav.style.setProperty('--feature-index', String(index));
      featureNav.style.setProperty('--feature-count', String(count));
    }
    if (changed && !immediate) flash(el, 'is-transitioning', 1200);
    const interruptedWrap = carousel.wrapRemaining > 0;
    const wraps = !interruptedWrap && !immediate && !reduced.matches && count > 1 && carousel.clones && ((previous === count - 1 && next === count) || (previous === 0 && next === -1));
    carousel.wrapRemaining = 0; carousel.resetFrames = 0; el.classList.remove('is-wrapping', 'is-track-reset');
    if (name === 'features') carousel.clones?.forEach(clone => clone.classList.remove('is-active'));
    layoutCarousel(carousel);
    if (wraps) {
      el.classList.add('is-wrapping'); carousel.wrapRemaining = 350;
      const clone = carousel.clones[next < 0 ? 0 : 1];
      if (name === 'features') clone.classList.add('is-active');
      track.style.transform = `translate3d(${carousel.center - clone.offsetLeft + slides[0].offsetLeft}px,0,0)`;
    } else if (interruptedWrap || immediate || reduced.matches || Math.abs(index - previous) > 1) {
      el.classList.add('is-track-reset'); carousel.resetFrames = 2;
    }
    if (name === 'media') {
      mediaElapsed = 0;
      const current = $('[data-media-current]'), total = $('[data-media-total]');
      if (current) current.textContent = String(index + 1).padStart(2, '0');
      if (total) total.textContent = String(count).padStart(2, '0');
      const download = $('[data-media-download]'); if (download) download.href = data.gallery[index].image;
    }
    if (name === 'products') productElapsed = 0;
    if (restoreFocus) slides[index].querySelector('[data-feature-select]')?.focus({ preventScroll: true });
    schedule();
  }
  async function updateCarousel(carousel, next, { focusFrom = null } = {}) {
    if (!carousel?.slides.length) return;
    const index = wrapIndex(next, carousel.slides.length), request = ++carousel.request;
    carousel.requestedIndex = index; carousel.pending = true; carousel.focusFrom = focusFrom;
    const ready = await carousel.selection.select(next, carouselSources(carousel, index));
    if (dead || request !== carousel.request) return;
    carousel.pending = false;
    if (!ready) { carousel.focusFrom = null; carousel.requestedIndex = carousel.index; if (carousel.name === 'media') mediaElapsed = 0; layoutCarousel(carousel); announce('이미지를 준비하지 못해 현재 장면을 유지합니다. 다시 선택해 주세요.'); }
    schedule();
  }
  async function selectProductTarget(target, focus = false) {
    const carousel = carousels.get('products');
    const index = carousel?.slides.indexOf(target) ?? -1;
    if (index < 0) return;
    await updateCarousel(carousel, index);
    if (dead || carousel.index !== index || win.location.hash !== `#${target.id}`) return;
    if (focus) { target.tabIndex = -1; target.focus({ preventScroll: true }); }
    target.scrollIntoView({ behavior: reduced.matches ? 'instant' : 'smooth', block: 'start' });
  }
  for (const el of $$('[data-carousel]')) {
    const carousel = { el, name: el.dataset.carousel, align: el.dataset.carouselAlign, track: el.querySelector('[data-track]'), slides: [...el.querySelectorAll('[data-slide]')],
      index: 0, requestedIndex: 0, request: 0, pending: false, base: 0, pointerId: null, dragOffset: 0, dragDirty: false,
      suppressUntil: 0, wrapRemaining: 0, resetFrames: 0, gesture: createDragGesture() };
    if (carousel.name !== 'media' && carousel.slides.length > 1) {
      carousel.track.style.position = 'relative';
      carousel.clones = [carousel.slides.at(-1), carousel.slides[0]].map(slide => {
        const clone = slide.cloneNode(true); clone.removeAttribute('data-slide'); clone.dataset.slideClone = '';
        clone.setAttribute('aria-hidden', 'true'); clone.inert = carousel.name !== 'features'; clone.classList.toggle('is-active', carousel.name !== 'features');
        clone.style.position = 'absolute'; clone.style.top = '0';
        for (const node of [clone, ...clone.querySelectorAll('*')]) { node.removeAttribute('id'); node.removeAttribute('data-reveal'); node.removeAttribute('aria-labelledby'); node.removeAttribute('aria-controls'); }
        clone.querySelectorAll('button,a,[tabindex]').forEach(node => { node.tabIndex = -1; });
        carousel.track.append(clone); return clone;
      });
    }
    carousel.selection = createReadyTransition({ load: src => queue.get(src), commit: next => {
      const slide = carousel.slides[wrapIndex(next, carousel.slides.length)];
      slide.querySelectorAll('img').forEach(image => { const src = image.dataset.sceneSrc || image.dataset.src || image.getAttribute('src'); if (safeAsset(src)) bindReadyImage(image, src); });
      const matchingClone = carousel.clones?.[wrapIndex(next, carousel.slides.length) === 0 ? 1 : wrapIndex(next, carousel.slides.length) === carousel.slides.length - 1 ? 0 : -1];
      matchingClone?.querySelectorAll('img').forEach(image => { const src = image.dataset.sceneSrc || image.dataset.src || image.getAttribute('src'); if (safeAsset(src)) bindReadyImage(image, src); });
      applyCarousel(carousel, next);
    } });
    carousels.set(carousel.name, carousel); applyCarousel(carousel, 0, true);
    if (carousel.name === 'media') continue;
    if (carousel.name === 'products') {
      on(el, 'pointerenter', event => { if (event.pointerType === 'mouse') carousel.hovered = true; });
      on(el, 'pointerleave', event => { if (event.pointerType === 'mouse') { carousel.hovered = false; schedule(); } });
      on(el, 'focusin', () => schedule());
      on(el, 'focusout', () => schedule());
    }
    const point = event => ({ id: event.pointerId, x: event.clientX, y: event.clientY, time: event.timeStamp });
    on(el, 'pointerdown', event => {
      if (event.isPrimary === false || event.button !== 0 || !event.target.closest('[data-track]')) return;
      const control = event.target.closest('button,a');
      if (control && control.dataset.action !== 'world-capture' && !control.hasAttribute('data-feature-select')) return;
      if (carousel.name === 'products') productElapsed = 0;
      carousel.selection.invalidate(); carousel.request++; carousel.pending = false; carousel.requestedIndex = carousel.index;
      cancelDrag(carousel); carousel.suppressUntil = 0;
      if (carousel.wrapRemaining) { carousel.wrapRemaining = 0; carousel.el.classList.add('is-track-reset'); carousel.resetFrames = 2; layoutCarousel(carousel); }
      carousel.pointerId = event.pointerId;
      prepareCarouselNeighbor(carousel, carousel.index - 1); prepareCarouselNeighbor(carousel, carousel.index + 1);
      carousel.gesture.start({ ...point(event), width: carousel.track.parentElement.clientWidth, index: carousel.index, count: carousel.slides.length });
    });
    on(el, 'pointermove', event => {
      if (carousel.pointerId !== event.pointerId) return;
      const move = carousel.gesture.move(point(event));
      if (!move.locked) return;
      if (!el.hasPointerCapture(event.pointerId)) el.setPointerCapture(event.pointerId);
      el.classList.add('is-dragging');
      const width = carousel.track.parentElement.clientWidth;
      carousel.dragOffset = Math.max(-width, Math.min(width, move.offset)); carousel.dragDirty = true; schedule();
      event.preventDefault();
    });
    on(el, 'pointerup', event => {
      if (carousel.pointerId !== event.pointerId) return;
      const result = carousel.gesture.end(point(event));
      cancelDrag(carousel, false);
      if (result.dragged) carousel.suppressUntil = win.performance.now() + 500;
      if (result.step) updateCarousel(carousel, result.index === 0 && result.step === 1 ? carousel.slides.length : result.index === carousel.slides.length - 1 && result.step === -1 ? -1 : result.index);
      else layoutCarousel(carousel);
    });
    on(el, 'pointercancel', () => cancelDrag(carousel));
    on(el, 'lostpointercapture', () => { if (carousel.pointerId !== null) cancelDrag(carousel); });
    on(el, 'click', event => {
      if (event.target.closest('[data-track]') && win.performance.now() <= carousel.suppressUntil) { carousel.suppressUntil = 0; event.preventDefault(); event.stopPropagation(); }
    }, { capture: true });
  }

  const sections = $$('[data-section]');
  function replaySection(el) {
    // Only ornamental wrappers replay; focusable content and actual sprite clocks stay intact.
    if (!el || reduced.matches || doc.hidden || drawerOpen || dialog?.open) return;
    el.dataset.replayCount = String(Number(el.dataset.replayCount || 0) + 1);
    flash(el, 'is-section-replaying', 1200);
  }
  const sectionObserver = new win.IntersectionObserver(entries => {
    for (const entry of entries) {
      const el = entry.target;
      el.classList.toggle('is-active', entry.isIntersecting);
      if (replayGate.visibility(el, entry.isIntersecting, win.performance.now(),
        reduced.matches || doc.hidden || drawerOpen || !!dialog?.open)) replaySection(el);
      if (entry.isIntersecting) {
        activeSections.add(el); el.classList.add('has-entered'); if (el === hero) prepareHero();
        for (const carousel of carousels.values()) if (carousel.el.closest('[data-section]') === el) {
          prepareCarouselNeighbor(carousel, carousel.index - 1); prepareCarouselNeighbor(carousel, carousel.index + 1);
        }
      }
      else { activeSections.delete(el); if (el === actorSection) finishActorTransition(); }
    }
    dirty = true; syncSuspension(); schedule();
  }, { threshold: 0, rootMargin: '-64px 0px 0px' });
  sections.forEach(el => sectionObserver.observe(el));
  const revealObserver = new win.IntersectionObserver(entries => {
    entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('is-visible'); revealObserver.unobserve(entry.target); } });
  }, { threshold: 0.08 });
  $$('[data-reveal]').forEach(el => revealObserver.observe(el));
  $$('[data-encounter-host]').forEach(host => {
    const [kind, index] = host.dataset.encounterHost.split(':');
    const trigger = host.closest('[data-actor-scene-index],.intro-subspecies-choice,.intro-hero__sprite') || host.parentElement;
    mountEncounter(host, data[kind]?.[Number(index)], trigger, host.hasAttribute('data-encounter-overlay'));
  });
  $$('[data-hero-sequence]').forEach(host => mountHeroSequence(host, data.heroMonsters?.[Number(host.dataset.heroSequence)]));
  registerSprites(root);
  setActorKind('actors');
  setPreviewSprite($('[data-medical-target="0"]'), data.medical.target.spriteSW, 'medical-target');
  selectMedicalSkill(0);
  selectElement(0);
  on($('[data-element-video]'), 'loadedmetadata', () => syncElementVideo());
  on($('[data-element-video]'), 'ended', () => syncElementVideo(true));
  on($('[data-element-video]'), 'error', () => {
    const video = $('[data-element-video]'); if (video) video.dataset.videoState = 'failed';
  });
  $$('[data-actor-kind]').forEach(el => { el.tabIndex = el.dataset.actorKind === actorKind ? 0 : -1; });

  function schedule() {
    if (!dead && !doc.hidden && !raf) raf = win.requestAnimationFrame(tick);
  }
  function tick(now) {
    raf = 0; if (dead || doc.hidden) return;
    root.classList.add('is-ready');
    if (pendingMenuFocus) { pendingMenuFocus = false; if (drawerOpen) menu?.querySelector('[data-drawer-close]')?.focus({ preventScroll: true }); }
    const delta = previousTick === null ? 0 : Math.min(80, now - previousTick); previousTick = now;
    if (dirty) {
      dirty = false;
      heroRect = hero?.getBoundingClientRect();
      const mobile = win.innerWidth <= 1024;
      if (heroRect) {
        const progress = pinnedProgress(heroRect.top, heroRect.height, win.innerHeight);
        for (const el of parallaxLayers) {
          const distance = ({ sky: mobile ? 32 : 60, stage: mobile ? 75 : 135, front: mobile ? 110 : 210 }[el.dataset.parallax] || 0);
          el.style.setProperty('--parallax-y', `${reduced.matches || win.innerHeight <= 600 ? 0 : -progress * distance}px`);
        }
        const scroll = Math.max(0, -heroRect.top), opacity = win.innerHeight <= 600 ? 1 : heroCopyOpacity(scroll, win.innerHeight);
        heroHidden = opacity <= .01;
        hero.style.setProperty('--hero-copy-opacity', opacity.toFixed(3));
        hero.classList.toggle('has-scroll-transition', scroll > 0 && win.innerHeight > 600); hero.classList.toggle('is-story-view', heroHidden);
      }
      for (const section of sections) {
        const rect = section.getBoundingClientRect(), progress = sectionProgress(rect.top, rect.height, win.innerHeight);
        section.style.setProperty('--scene-progress', progress.toFixed(4));
        section.style.setProperty('--scene-y', `${reduced.matches ? 0 : ((progress - .5) * (mobile ? 16 : 32)).toFixed(2)}px`);
        if (section.querySelector('[data-companion-doors]')) section.style.setProperty('--door-progress', String(reduced.matches ? 1 : clamp01((progress - .20) / .35)));
      }
      resizeLeaves();
      const current = sections.filter(el => el.getBoundingClientRect().top <= win.innerHeight * 0.5).at(-1) || sections[0];
      if (actorSection && activeSections.has(actorSection)) {
        const rect = actorSection.getBoundingClientRect();
        const shift = reduced.matches ? 0 : Math.max(-9, Math.min(9, (win.innerHeight / 2 - rect.top - rect.height / 2) * 0.018));
        $('[data-actor-world]')?.style.setProperty('--scene-shift', `${shift.toFixed(2)}px`);
        positionActorPanel();
      }
      if (navOpen) layoutNav();
      navTriggers.forEach(link => { const active = link.getAttribute('href') === `#${current?.id}`; link.classList.toggle('is-active', active); if (active) link.setAttribute('aria-current', 'location'); else link.removeAttribute('aria-current'); });
      $('[data-header]')?.classList.toggle('is-scrolled', win.scrollY > 24);
      $('[data-action="top"]')?.classList.toggle('is-visible', win.scrollY > win.innerHeight * 0.6);
    }
    let animating = false;
    const overlayOpen = drawerOpen || !!dialog?.open;
    const heroActive = activeSections.has(hero) && !overlayOpen;
    if (reduced.matches || win.innerHeight <= 600) {
      openingDone = true; root.classList.remove('is-opening'); root.classList.add('has-opened');
    } else if (heroActive && !openingDone) {
      openingStarted = true; openingElapsed += delta; animating = true;
      if (openingElapsed >= 3320) { openingDone = true; root.classList.remove('is-opening'); root.classList.add('has-opened'); }
    }
    syncHeroAccess();
    if (heroActive && !reduced.matches && win.innerHeight > 600) {
      if (leafContext) { leafElapsed += delta; drawLeaves(now); animating = true; }
      if (win.innerWidth > 1024) {
        const step = Math.min(1, delta / 85);
        pointerX += (pointerTargetX - pointerX) * step; pointerY += (pointerTargetY - pointerY) * step;
        for (const el of parallaxLayers) {
          const depth = ({ sky: 10, stage: 18, front: 26 }[el.dataset.parallax] || 0);
          el.style.setProperty('--pointer-x', `${(pointerX * depth).toFixed(2)}px`); el.style.setProperty('--pointer-y', `${(pointerY * depth).toFixed(2)}px`);
        }
        if (Math.abs(pointerTargetX - pointerX) + Math.abs(pointerTargetY - pointerY) > .001) animating = true;
      }
    }
    for (const [el, motion] of motionWindows) {
      if (!el.isConnected) { motionWindows.delete(el); continue; }
      const section = el.closest('[data-section]');
      if (overlayOpen || (section && !activeSections.has(section))) continue;
      if (motion.pending) { el.classList.add(motion.className); motion.pending = false; }
      motion.remaining -= delta; animating = true;
      if (motion.remaining <= 0 || reduced.matches) { el.classList.remove(motion.className); motionWindows.delete(el); }
    }
    for (const carousel of carousels.values()) {
      if (overlayOpen || !activeSections.has(carousel.el.closest('[data-section]'))) continue;
      if (carousel.dragDirty) { carousel.track.style.transform = `translate3d(${carousel.base + carousel.dragOffset}px,0,0)`; carousel.dragDirty = false; }
      if (carousel.wrapRemaining > 0) {
        carousel.wrapRemaining -= delta; animating = true;
        if (carousel.wrapRemaining <= 0) { carousel.wrapRemaining = 0; carousel.el.classList.add('is-track-reset'); carousel.resetFrames = 2; layoutCarousel(carousel); }
      } else if (carousel.resetFrames > 0) {
        carousel.resetFrames--; animating = true;
        if (!carousel.resetFrames) {
          carousel.el.classList.remove('is-track-reset', 'is-wrapping');
          if (carousel.name === 'features') carousel.clones?.forEach(clone => clone.classList.remove('is-active'));
        }
      }
    }
    if (elementPathsDirty) { elementPathsDirty = false; drawElementConnections(); }
    if (pendingPhotoFlip && dialog?.open) {
      const pending = pendingPhotoFlip; pendingPhotoFlip = null;
      const target = pending.image.getBoundingClientRect(), from = pending.sourceRect;
      if (pending.generation === modalGeneration && from?.width && target.width) {
        animatePhoto(pending.image, [{ transform: photoTransform(from, target), opacity: .35 }, { transform: 'none', opacity: 1 }]);
      }
    }
    const medicalActive = !overlayOpen && activeSections.has($('#gamefeatures'));
    if (medicalActive && !reduced.matches) { medicalElapsed += delta; animating = true; }
    const medicalFrame = medicalClip && showcaseSnapshot(medicalClip, medicalElapsed, reduced.matches);
    const elementActive = !overlayOpen && activeSections.has($('#skill'));
    if (elementActive && elementPlaying) { elementElapsed += delta; animating = true; }
    const elementFrame = elementClip && showcaseSnapshot(elementClip, elementElapsed, !elementPlaying && elementElapsed === 0);
    const elementVideo = $('[data-element-video]');
    if (elementActive && !reduced.matches && elementVideo?.readyState >= 1 && !elementVideo.paused && !elementVideo.seeking) {
      const segment = elementVideoSegment(data.elements?.[elementIndex], elementSkillIndex, elementVideo.currentTime, elementVideo.duration);
      if (segment.shouldLoop) elementVideo.currentTime = segment.start;
    }
    for (const state of visibleHeroSequences) {
      if (!state.ready || !state.host.isConnected || !heroActive) continue;
      if (!reduced.matches) { state.elapsed += delta; animating = true; }
      const sample = heroSequenceSnapshot(state.meta, state.elapsed, reduced.matches);
      if (sample.index !== state.phase) {
        state.nodes.forEach((node, index) => { node.hidden = index !== sample.index; });
        state.phase = sample.index; state.frame = -1; state.host.dataset.heroPhase = state.meta.steps[sample.index].id;
      }
      if (sample.frame !== state.frame) {
        state.nodes[sample.index].style.backgroundPosition = spritePosition(state.meta.steps[sample.index].sprite, sample.sampleTime);
        state.frame = sample.frame;
      }
    }
    for (const encounter of visibleEncounters) {
      if (!encounter.host.isConnected || encounter.host.closest('[hidden]') || overlayOpen || reduced.matches
          || !activeSections.has(encounter.host.closest('[data-section]'))) continue;
      if (encounter.hovered || encounter.focused || encounter.loopIdle) { encounter.elapsed += delta; animating = true; }
    }
    for (const el of visibleSprites) {
      if (!el.isConnected) { visibleSprites.delete(el); spriteStates.delete(el); continue; }
      if (drawerOpen || el.closest('[hidden],[data-slide]:not(.is-active),.intro-sequence__scene:not(.is-active)') || (dialog?.open && !dialog.contains(el)) || !el.getClientRects().length) continue;
      if (!el.closest('.intro-sequence') && !activeSections.has(el.closest('[data-section]'))) continue;
      const state = spriteStates.get(el); if (!state?.loaded) continue;
      const inSequence = !!sequence && el.closest('.intro-sequence');
      const previewRole = el.dataset.previewRole;
      let sampleTime = reduced.matches ? 0 : inSequence ? sequence.elapsed : now;
      if (state.encounter) {
        const encounter = state.encounter, body = encounter.clip.sprite;
        const duration = Math.max(16, body.durationMs || body.frames * body.frameMs);
        const moving = !reduced.matches && (encounter.hovered || encounter.focused || encounter.loopIdle);
        const frame = moving ? Math.min(body.frames - 1, Math.floor((encounter.elapsed % duration) / duration * body.frames)) : 0;
        sampleTime = frame * state.meta.frameMs + .001;
        const placement = state.placements?.[frame];
        if (placement) {
          el.style.transform = `translate(${Number(placement.x || 0) / body.frameWidth * 100}%, ${Number(placement.y || 0) / body.frameHeight * 100}%) rotate(${Number(placement.rotationDeg || 0)}deg)`;
          el.style.zIndex = ['behind', 'back'].includes(placement.layer) ? '0' : '2';
        }
      } else if (previewRole === 'hero-fallback') {
        sampleTime = Number(el.dataset.heroStaticFrame || 0) * state.meta.frameMs + .001;
      } else if (previewRole === 'encounter-fallback') {
        sampleTime = 0;
      } else if (previewRole?.startsWith('medical-')) {
        sampleTime = previewRole === 'medical-target' ? 0 : previewRole === 'medical-effect' ? medicalFrame?.effectTime || 0 : medicalFrame?.castTime || 0;
        if (previewRole === 'medical-effect') el.style.visibility = medicalFrame?.effectVisible ? 'visible' : 'hidden';
      } else if (previewRole?.startsWith('element-')) {
        sampleTime = previewRole === 'element-effect' ? elementFrame?.effectTime || 0 : elementFrame?.castTime || 0;
        if (previewRole === 'element-effect') el.style.visibility = elementFrame?.effectVisible ? 'visible' : 'hidden';
      }
      const position = spritePosition(state.meta, sampleTime);
      if (position !== state.frame) { el.style.backgroundPosition = position; state.frame = position; }
      if (!previewRole && !reduced.matches && state.meta.frames > 1 && (!inSequence || sequence.playing)) animating = true;
    }
    if (sequence && dialog.open) {
      if (sequence.playing) { sequence.elapsed += delta; animating = true; }
      const snap = sequenceSnapshot(sequence.elapsed, sequence.frames.length);
      if (snap.index !== sequence.index) { sequence.index = snap.index; sequence.frames.forEach((frame, index) => { frame.classList.toggle('is-active', index === snap.index); frame.setAttribute('aria-hidden', String(index !== snap.index)); }); }
      sequence.progress.value = snap.progress;
      const second = Math.floor(snap.time / 1000);
      if (second !== sequence.second) { sequence.second = second; sequence.time.textContent = `0:${String(second).padStart(2, '0')} / 0:${String(snap.total / 1000).padStart(2, '0')}`; }
      if (snap.ended) sequence.playing = false;
      sequence.player.classList.toggle('is-paused', !sequence.playing);
    }
    const media = carousels.get('media');
    if (!reduced.matches && !overlayOpen && media && activeSections.has(media.el.closest('[data-section]'))) {
      mediaElapsed = Math.min(5000, mediaElapsed + delta); animating = true;
      $('[data-media-progress]')?.style.setProperty('--media-progress', String(mediaElapsed / 5000));
      if (mediaElapsed >= 5000 && !media.pending) updateCarousel(media, media.index + 1);
    }
    const products = carousels.get('products');
    if (!reduced.matches && !overlayOpen && products && products.slides.length > 1 && activeSections.has(products.el.closest('[data-section]'))) {
      const box = products.el.getBoundingClientRect();
      const visible = box.bottom > 0 && box.top < win.innerHeight;
      if (visible && !products.hovered && !products.el.contains(doc.activeElement) && products.pointerId === null && !products.pending) {
        productElapsed += delta; animating = true;
        if (productElapsed >= 3000) { productElapsed = 0; updateCarousel(products, products.index + 1); }
      }
    }
    if (animating) schedule(); else previousTick = null;
  }

  on(root, 'click', event => {
    if (handleDemoAction(event)) return;
    const featureCard = event.target.closest('.intro-features-card');
    if (featureCard) {
      const carousel = carousels.get('features'), index = Number(featureCard.querySelector('[data-feature-select]')?.dataset.featureSelect);
      if (carousel && Number.isInteger(index) && index !== carousel.index) {
        const last = carousel.slides.length - 1;
        const next = carousel.index === 0 && index === last ? -1 : carousel.index === last && index === 0 ? last + 1 : index;
        updateCarousel(carousel, next);
      } else if (carousel && event.target.closest('[data-feature-select]') && index === carousel.index) {
        openFeature(index);
      }
      return;
    }
    const button = event.target.closest('button,a'); if (!button) return;
    if (button.hasAttribute('data-nav-trigger') && navPointerType === 'touch' && !navOpen && event.detail !== 0) {
      event.preventDefault(); setNav(true, { trigger: button }); return;
    }
    if (button.dataset.navCarousel) updateCarousel(carousels.get(button.dataset.navCarousel), Number(button.dataset.navIndex));
    if (button.dataset.navActorKind) setActorKind(button.dataset.navActorKind);
    if (button.hasAttribute('data-nav-medical-index')) selectMedicalSkill(Number(button.dataset.navMedicalIndex));
    if (button.hasAttribute('data-nav-element-index')) selectElement(Number(button.dataset.navElementIndex), true);
    if (button.closest('[data-desktop-nav]')) setNav(false);
    const action = button.dataset.action;
    if (action === 'theme') selectTheme();
    else if (action === 'menu') setMenu(!drawerOpen);
    else if (action === 'sound') { soundWanted = !soundWanted; updateSound(); syncAudio(); }
    else if (action === 'motion') {
      motionPreview = !motionPreview;
      try { win.sessionStorage.setItem('intro-motion-preview', motionPreview ? 'on' : 'off'); } catch { /* The view works without persistence. */ }
      root.classList.toggle('is-motion-preview', motionPreview);
      motionButton.textContent = motionPreview ? '연출 끄기' : '연출 켜기'; motionButton.setAttribute('aria-pressed', String(motionPreview));
      elementPlaying = !reduced.matches;
      encounters.forEach(encounter => encounter.sync());
      visibleHeroSequences.forEach(prepareHeroSequence);
      syncMedicalControls(); syncElementVideo();
      dirty = true; previousTick = null; schedule();
    }
    else if (action === 'sequence') openSequence();
    else if (action === 'element-video') openElementVideo();
    else if (action === 'close-dialog') closeDialog();
    else if (action === 'actor-detail') openPortrait();
    else if (action === 'actor-close') {
      if (actorKind === 'monsters') { setActorKind('actors'); $('[data-actor-kind="actors"]')?.focus({ preventScroll: true }); }
      else closeActorPanel();
    }
    else if (action === 'actor-prev' || action === 'actor-next') chooseActor(actorKind, actorIndex + (action === 'actor-next' ? 1 : -1));
    else if (action === 'image') openGallery(button);
    else if (action === 'world-capture') openWorldCapture(button);
    else if (action === 'clinic-capture') openClinicCapture(button);
    if (button.dataset.actorKind) setActorKind(button.dataset.actorKind);
    if (button.hasAttribute('data-actor-index')) chooseActor(actorKind, Number(button.dataset.actorIndex), button);
    if (button.hasAttribute('data-actor-scene-index')) chooseActor('actors', Number(button.dataset.actorSceneIndex), button);
    if (button.hasAttribute('data-community-index')) selectCommunity(Number(button.dataset.communityIndex));
    if (button.hasAttribute('data-element-index')) selectElement(Number(button.dataset.elementIndex), true);
    if (button.hasAttribute('data-element-skill-index')) selectElementSkill(Number(button.dataset.elementSkillIndex), true);
    if (button.hasAttribute('data-medical-skill-index')) selectMedicalSkill(Number(button.dataset.medicalSkillIndex));
    const carousel = carousels.get(button.closest('[data-carousel]')?.dataset.carousel);
    if (carousel && button.hasAttribute('data-step')) updateCarousel(carousel, carousel.requestedIndex + Number(button.dataset.step));
    if (carousel && button.hasAttribute('data-index')) updateCarousel(carousel, Number(button.dataset.index));
    if (button.matches('a[href^="#"]')) {
      const target = doc.getElementById(button.getAttribute('href').slice(1));
      if (target) {
        if (carousels.get('products')?.slides.includes(target)) {
          event.preventDefault(); if (drawerOpen) setMenu(false);
          win.history.replaceState(null, '', `#${target.id}`); selectProductTarget(target, true); return;
        }
        if (target.hasAttribute('data-community-index')) selectCommunity(Number(target.dataset.communityIndex));
        event.preventDefault(); if (drawerOpen) setMenu(false);
        if (button.closest('[data-nav-panel],.intro-drawer-group__links')) {
          if (!target.hasAttribute('data-community-index')) target.tabIndex = -1; target.focus({ preventScroll: true });
        }
        target.scrollIntoView({ behavior: reduced.matches ? 'instant' : 'smooth', block: 'start' });
        win.history.replaceState(null, '', `#${target.id}`);
      }
    }
  });
  on(root, 'submit', handleDemoAction, { capture: true });
  on(hero, 'pointermove', event => {
    if (reduced.matches || win.innerWidth <= 1024 || event.pointerType === 'touch' || !heroRect) return;
    const interactive = event.target.closest('a,button,.intro-hero__sprite');
    pointerTargetX = interactive ? 0 : (event.clientX / Math.max(1, heroRect.width) - .5) * 2;
    pointerTargetY = interactive ? 0 : (event.clientY / Math.max(1, win.innerHeight) - .5) * 2; schedule();
  }, { passive: true });
  on(hero, 'pointerleave', () => { pointerTargetX = pointerTargetY = 0; schedule(); });
  on(root, 'dragstart', event => { if (event.target.closest('img,[data-sprite]')) event.preventDefault(); });
  on($('[data-actor-viewport]'), 'focusin', event => {
    const actor = event.target.closest('[data-actor-scene-index]');
    if (actor) centerActor(Number(actor.dataset.actorSceneIndex), false);
  });
  on(dialog, 'click', event => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeDialog(); } });
  on(dialog, 'cancel', event => { event.preventDefault(); closeDialog(); });
  on(dialog, 'close', () => { modalGeneration++; cancelPhotoAnimations(); photoView = null; sequence = null; content.querySelectorAll('video').forEach(video => video.pause()); forgetSprites(content); content.replaceChildren(); actorSection?.classList.remove('is-dialog-paused'); lockScroll(); syncAudio(); syncElementVideo(); previousFocus?.focus?.({ preventScroll: true }); previousTick = null; schedule(); });
  on(menu, 'cancel', event => { event.preventDefault(); setMenu(false); });
  on(doc, 'focusin', event => {
    if (drawerOpen && menu && !menu.contains(event.target)) menu.querySelector('[data-drawer-close]')?.focus({ preventScroll: true });
  });
  on(doc, 'keydown', event => {
    navPointerType = 'keyboard';
    if (event.key === 'Escape' && navOpen) { event.preventDefault(); setNav(false, { restoreFocus: navPanel.contains(doc.activeElement) }); return; }
    const featureChoice = event.target.closest?.('[data-feature-select]');
    if (featureChoice && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      const carousel = carousels.get('features');
      if (carousel) {
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? carousel.slides.length - 1 : carousel.requestedIndex + (event.key === 'ArrowRight' ? 1 : -1);
        updateCarousel(carousel, next, { focusFrom: featureChoice });
      }
    }
    const actorChoice = event.target.closest?.('[data-actor-scene-index],[data-actor-index]');
    if (actorChoice && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      const scene = actorChoice.hasAttribute('data-actor-scene-index');
      const choices = scene ? $$('[data-actor-scene-index]') : [...actorChoice.closest('[data-actor-list]').querySelectorAll('[data-actor-index]')];
      const index = choices.indexOf(actorChoice);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? choices.length - 1 : wrapIndex(index + (event.key === 'ArrowRight' ? 1 : -1), choices.length);
      event.preventDefault(); choices[next]?.focus({ preventScroll: true });
      if (!actorPanel?.hidden) choices[next]?.click();
    }
    const list = event.target.closest?.('[role="tablist"]');
    if (list && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      const tabs = [...list.querySelectorAll('[role="tab"]')];
      const index = tabs.indexOf(event.target);
      if (index >= 0) {
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : wrapIndex(index + (event.key === 'ArrowRight' ? 1 : -1), tabs.length);
        tabs[next].click(); tabs[next].focus();
      }
    }
    if (event.key === 'Escape' && !dialog?.open && !drawerOpen && !actorPanel?.hidden) {
      event.preventDefault();
      if (actorKind === 'actors') closeActorPanel();
      else { setActorKind('actors'); $('[data-actor-kind="actors"]')?.focus({ preventScroll: true }); }
    }
    if (event.key === 'Escape' && drawerOpen) { event.preventDefault(); setMenu(false); }
    if (event.key === 'Tab' && drawerOpen) {
      const focusable = [...menu.querySelectorAll('a,button,summary')].filter(el => el.tabIndex >= 0 && el.getClientRects().length), first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && doc.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && doc.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  });
  on(doc, 'visibilitychange', () => {
    root.classList.toggle('is-paused', doc.hidden); syncSuspension();
    if (doc.hidden) { setNav(false); cancelDrags(); finishActorTransition(); win.cancelAnimationFrame(raf); raf = 0; previousTick = null; photoAnimations.forEach(animation => animation.pause()); }
    else { photoAnimations.forEach(animation => animation.play()); dirty = true; schedule(); }
    if (doc.hidden) suspendModalVideos(); else resumeModalVideos();
    syncAudio();
  });
  on(win, 'wheel', event => {
    const blocked = reduced.matches || doc.hidden || drawerOpen || !!dialog?.open
      || event.ctrlKey || event.target?.closest?.('input,textarea,select,video,[contenteditable="true"]')
      || [...carousels.values()].some(carousel => carousel.pointerId !== null);
    const center = win.innerHeight * .5;
    const section = [...activeSections].reduce((best, el) => {
      const box = el.getBoundingClientRect();
      const distance = Math.abs(Math.max(box.top, Math.min(center, box.bottom)) - center);
      return !best || distance < best.distance ? { el, distance } : best;
    }, null)?.el;
    if (replayGate.wheel(section, { time: win.performance.now(), deltaX: event.deltaX,
      deltaY: event.deltaY, blocked: !!blocked })) replaySection(section);
  }, { passive: true });
  on(win, 'scroll', () => { dirty = true; schedule(); }, { passive: true });
  on(win, 'resize', () => {
    cancelDrags(); cancelPhotoAnimations(); pointerX = pointerY = pointerTargetX = pointerTargetY = 0;
    parallaxLayers.forEach(el => { el.style.setProperty('--pointer-x', '0px'); el.style.setProperty('--pointer-y', '0px'); });
    dirty = elementPathsDirty = true;
    for (const carousel of carousels.values()) { carousel.wrapRemaining = 0; carousel.el.classList.add('is-track-reset'); carousel.resetFrames = 2; layoutCarousel(carousel); }
    if (win.innerWidth > 1280 && drawerOpen) setMenu(false);
    if (win.innerWidth <= 1280) {
      const hadFocus = desktopNav?.contains(doc.activeElement); setNav(false);
      if (hadFocus) menuButton?.focus({ preventScroll: true });
    } else if (navOpen) layoutNav();
    schedule();
  }, { passive: true });
  on(motionPreference, 'change', () => { motionButton.hidden = !motionPreference.matches; if (reduced.matches) { elementPlaying = false; if (sequence) sequence.playing = false; content.querySelectorAll('video').forEach(video => { video.dataset.resume = 'false'; video.pause(); }); } encounters.forEach(encounter => encounter.sync()); visibleHeroSequences.forEach(prepareHeroSequence); syncMedicalControls(); syncElementVideo(); dirty = true; schedule(); });
  on(root, 'error', event => { const image = event.target; if (image?.tagName === 'IMG') { image.classList.add('is-missing'); image.removeAttribute('srcset'); image.style.visibility = 'hidden'; image.parentElement?.classList.add('has-missing-art'); } }, { capture: true });

  const selectCommunityHash = () => { const target = doc.getElementById(win.location.hash.slice(1)); if (target?.hasAttribute('data-community-index')) selectCommunity(Number(target.dataset.communityIndex)); };
  on(win, 'hashchange', selectCommunityHash);
  selectCommunityHash();
  const selectProductHash = () => { const target = doc.getElementById(win.location.hash.slice(1)); if (target && carousels.get('products')?.slides.includes(target)) selectProductTarget(target); };
  on(win, 'hashchange', selectProductHash);
  selectProductHash();

  root.classList.add('is-enhanced', 'has-motion');
  root.classList.toggle('is-motion-preview', motionPreview);
  root.classList.add(openingDone ? 'has-opened' : 'is-opening'); openingStarted = !openingDone;
  if (leafContext) root.classList.add('has-leaf-canvas');
  syncSuspension(); syncHeroAccess();
  schedule();
  const cleanup = () => {
    if (dead) return; setNav(false); cancelDrags(); themeSelection.stop(); modalGeneration++; cancelPhotoAnimations();
    carousels.forEach(carousel => carousel.selection.stop());
    heroSequences.forEach(state => state.controller.stop()); heroSequences.clear(); visibleHeroSequences.clear();
    dead = true; actorSelection.stop(); finishActorTransition(); encounters.forEach(encounter => encounter.controller.stop()); encounters.clear(); visibleEncounters.clear(); abort.abort(); win.cancelAnimationFrame(raf); win.clearTimeout(noticeTimer);
    sectionObserver.disconnect(); revealObserver.disconnect(); spriteObserver.disconnect(); sceneryObserver.disconnect(); queue.stop(); audio?.pause();
    replayGate.clear(); elementVideoRequest++; $$('video').forEach(video => { video.pause(); video.removeAttribute('src'); video.load(); });
    if (dialog?.open) dialog.close(); if (menu?.open) menu.close();
    menu?.classList.remove('is-open'); menu?.setAttribute('aria-hidden', 'true');
    root.classList.remove('intro-scroll-locked', 'is-menu-open', 'is-motion-preview', 'has-motion', 'is-enhanced', 'is-opening', 'has-opened', 'has-leaf-canvas', 'is-motion-suspended', 'is-overlay-open');
    motionWindows.forEach((motion, el) => el.classList.remove(motion.className)); motionWindows.clear();
    leafContext?.clearRect(0, 0, leafWidth, leafHeight);
    const hero = $('[data-hero]');
    hero?.classList.remove('has-scroll-transition', 'is-story-view'); hero?.style.removeProperty('--hero-copy-opacity');
    hero?.querySelectorAll('.intro-hero__title,.intro-hero__downloads').forEach(el => { el.inert = false; el.removeAttribute('aria-hidden'); });
    notice.remove(); motionButton.remove();
    for (const carousel of carousels.values()) carousel.clones?.forEach(el => el.remove());
    spriteStates.clear(); visibleSprites.clear(); activeSections.clear(); root.__introCleanup = null;
  };
  root.__introCleanup = cleanup;
  on(win, 'pagehide', event => { setNav(false); if (event.persisted) { suspendModalVideos(); $('[data-element-video]')?.pause(); cancelDrags(); photoAnimations.forEach(animation => animation.pause()); finishActorTransition(); win.cancelAnimationFrame(raf); raf = 0; previousTick = null; audio?.pause(); } else cleanup(); });
  on(win, 'pageshow', event => { if (event.persisted) { photoAnimations.forEach(animation => animation.play()); dirty = true; syncSuspension(); syncAudio(); resumeModalVideos(); schedule(); } });
  return cleanup;
}

if (typeof document !== 'undefined') {
  const root = document.querySelector('[data-rpg-intro]'), config = document.getElementById('intro-data');
  if (root && config) {
    try { mountIntro(root, JSON.parse(config.textContent)); }
    catch (error) { root.classList.add('is-ready'); console.error('Intro could not initialize:', error); }
  }
}
