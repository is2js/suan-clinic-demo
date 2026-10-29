// Pure promotional motion state. Scheduling, image loading and DOM belong to the mount.
const numberOr = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const wrap = (index, count) => count > 0 ? ((index % count) + count) % count : 0;

export const clamp01 = value => Math.min(1, Math.max(0, Number(value) || 0));

export function heroSequenceSnapshot(sequence, elapsed = 0, still = false) {
  const steps = sequence?.steps || [];
  if (!steps.length) return { index: 0, frame: 0, sampleTime: 0, cycleMs: 0 };
  const durations = steps.map(step => Math.max(1, numberOr(step.sprite?.durationMs,
    Math.max(1, numberOr(step.sprite?.frames, 1)) * Math.max(1, numberOr(step.sprite?.frameMs, 150)))));
  const cycleMs = durations.reduce((sum, duration) => sum + duration, 0);
  let phase = Math.max(0, numberOr(elapsed)) % cycleMs, index = 0;
  if (!still) while (index < steps.length - 1 && phase >= durations[index]) phase -= durations[index++];
  const sprite = steps[index].sprite || {}, frames = Math.max(1, Math.floor(numberOr(sprite.frames, 1)));
  const frame = still ? Math.min(frames - 1, Math.max(0, Math.floor(numberOr(sequence.staticFrame))))
    : Math.min(frames - 1, Math.floor(phase / durations[index] * frames));
  return { index, frame, sampleTime: frame * Math.max(1, numberOr(sprite.frameMs, 150)) + .001, cycleMs };
}

export function carouselOffset({ firstLeft = 0, activeLeft = 0, activeWidth = 0, viewportWidth = 0, center = false }) {
  return numberOr(firstLeft) - numberOr(activeLeft)
    + (center ? (Math.max(0, numberOr(viewportWidth)) - Math.max(0, numberOr(activeWidth))) / 2 : 0);
}

export function sectionProgress(top, height, vh) {
  const viewport = Math.max(0, numberOr(vh));
  const span = Math.max(0, numberOr(height)) + viewport;
  return clamp01((viewport - numberOr(top)) / (span || 1));
}

export function pinnedProgress(top, height, vh) {
  return clamp01(-numberOr(top) / Math.max(1, numberOr(height) - numberOr(vh)));
}

export function actorPanelTop({ sceneTop, sceneBottom, panelHeight, viewportHeight, headerBottom }) {
  const top = numberOr(sceneTop), bottom = numberOr(sceneBottom, top);
  const height = Math.max(0, numberOr(panelHeight)), viewport = Math.max(0, numberOr(viewportHeight));
  const minTop = top + 16, maxTop = Math.max(minTop, bottom - height - 16);
  const preferred = Math.min(Math.max(minTop, numberOr(headerBottom) + 16), viewport - height - 16);
  // Scene bounds take priority when the panel cannot also fit inside the viewport.
  return Math.min(maxTop, Math.max(minTop, preferred));
}

export function createDragGesture({ distance = 8, axisRatio = 1.3, snapRatio = .18, velocity = .35 } = {}) {
  const threshold = Math.max(0, numberOr(distance, 8));
  const ratio = Math.max(0, numberOr(axisRatio, 1.3));
  const snap = Math.max(0, numberOr(snapRatio, .18));
  const speedThreshold = Math.max(0, numberOr(velocity, .35));
  const velocityWindowMs = 100;
  let active = null, restingIndex = 0;

  const snapshot = () => ({
    axis: active?.axis || 'pending',
    offset: active?.axis === 'x' ? active.last.x - active.x : 0,
    locked: active?.axis === 'x',
  });

  function update(point) {
    const last = active.last;
    active.last = {
      x: numberOr(point.x, last.x),
      y: numberOr(point.y, last.y),
      time: Math.max(last.time, numberOr(point.time, last.time)),
    };
    const dx = active.last.x - active.x, dy = active.last.y - active.y;
    if (active.axis === 'pending' && Math.max(Math.abs(dx), Math.abs(dy)) >= threshold) {
      active.axis = Math.abs(dx) > Math.abs(dy) * ratio ? 'x' : 'y';
    }
    if (active.axis === 'x') active.dragged = true;

    const sample = { x: active.last.x, time: active.last.time };
    const samples = active.samples;
    if (samples.at(-1).time === sample.time) samples[samples.length - 1] = sample;
    else samples.push(sample);
    const cutoff = sample.time - velocityWindowMs;
    // Keep the sample before the cutoff so sparse events can be interpolated.
    while (samples.length > 2 && samples[1].time <= cutoff) samples.shift();
  }

  function releaseVelocity() {
    const samples = active.samples, last = samples.at(-1);
    let first = samples[0];
    const cutoff = last.time - velocityWindowMs;
    if (first.time < cutoff && samples.length > 1) {
      const next = samples[1];
      const fraction = (cutoff - first.time) / (next.time - first.time);
      first = { x: first.x + (next.x - first.x) * fraction, time: cutoff };
    }
    return last.time > first.time ? (last.x - first.x) / (last.time - first.time) : 0;
  }

  return {
    start({ id, x, y, time, width, index, count }) {
      const point = { x: numberOr(x), y: numberOr(y), time: numberOr(time) };
      const length = Math.max(0, Math.floor(numberOr(count)));
      restingIndex = wrap(Math.floor(numberOr(index)), length);
      active = { id, x: point.x, y: point.y, last: point, samples: [{ x: point.x, time: point.time }],
        width: Math.max(1, numberOr(width, 1)), index: restingIndex, count: length,
        axis: 'pending', dragged: false };
      return snapshot();
    },
    move(point) {
      if (active && point.id === active.id) update(point);
      return snapshot();
    },
    end(point) {
      if (!active || point.id !== active.id) return { step: 0, index: restingIndex, dragged: false };
      update(point);
      const offset = active.last.x - active.x;
      let step = 0;
      if (active.dragged && active.count > 1) {
        const speed = releaseVelocity();
        const direction = Math.abs(offset) >= active.width * snap ? offset
          : Math.abs(speed) >= speedThreshold ? speed : 0;
        step = -Math.sign(direction) || 0;
      }
      const result = { step, index: wrap(active.index + step, active.count), dragged: active.dragged };
      restingIndex = result.index; active = null;
      return result;
    },
    cancel() { if (active) restingIndex = active.index; active = null; },
  };
}

export function createReadyTransition({ load, commit }) {
  let generation = 0, stopped = false;
  return {
    async select(value, sources = []) {
      if (stopped) return false;
      const current = ++generation;
      const unique = [...new Set(sources.filter(Boolean))];
      const ready = await Promise.all(unique.map(src => Promise.resolve().then(() => load(src)).catch(() => false)));
      if (stopped || current !== generation || !ready.every(result => result === true)) return false;
      commit(value); return true;
    },
    invalidate() { generation++; },
    stop() { stopped = true; generation++; },
  };
}

// Restart once per vertical wheel burst, never once per high-resolution wheel event.
// Visibility edges share the cooldown so an intersection boundary cannot flicker.
export function createSectionReplayGate({ cooldownMs = 1400, wheelIdleMs = 240 } = {}) {
  const visible = new Set(), started = new Map();
  let lastWheel = -Infinity;
  const request = (key, time, blocked) => {
    if (blocked || !visible.has(key) || !Number.isFinite(time)
        || time - (started.get(key) ?? -Infinity) < cooldownMs) return false;
    started.set(key, time); return true;
  };
  return {
    visibility(key, isVisible, time, blocked = false) {
      const wasVisible = visible.has(key);
      if (!isVisible) { visible.delete(key); return false; }
      visible.add(key);
      return !wasVisible && request(key, time, blocked);
    },
    wheel(key, { time, deltaX = 0, deltaY = 0, blocked = false }) {
      if (!Number.isFinite(time) || !Number.isFinite(deltaY) || !Number.isFinite(deltaX)) return false;
      const vertical = Math.abs(deltaY) >= 4 && Math.abs(deltaY) > Math.abs(deltaX) * 1.3;
      if (!vertical) return false;
      const freshBurst = time - lastWheel >= wheelIdleMs;
      lastWheel = time;
      return freshBurst && request(key, time, blocked);
    },
    clear() { visible.clear(); started.clear(); lastWheel = -Infinity; },
  };
}
