(() => {
  'use strict';
  const eye = document.querySelector('.signature-eye');
  if (!eye || eye.dataset.ready) return;
  eye.dataset.ready = 'true';
  document.body.append(eye);
  document.body.classList.add('has-living-eye');
  const floater = eye.querySelector('.signature-eye__float');
  const hero = document.querySelector('.hero');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const random = (min, max) => min + Math.random() * (max - min);
  const interactive = '.reel-card, a, button, input, select, textarea';
  const reading = `h1, h2, h3, p, label, .quote-panel, ${interactive}`;
  const editable = 'textarea, select, [contenteditable]:not([contenteditable="false"]), input:not([type="radio"]):not([type="checkbox"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="range"])';
  let frame = 0, previousTime = 0, needsLayout = true, suspended = false;
  let size = { width: 240, height: 148, right: 18, top: 120, dock: 18, hero: 800, small: false };
  let pose = { y: 120, scale: 1 }, placed = false, pointer = null, focused = null;
  let lastInput = -Infinity, holdUntil = 0, attention = 0, scrollImpulse = 0;
  let lastScrollY = window.scrollY, lastScrollTime = 0, checkAfter = 0;
  let gaze = { x: 0, y: 0, vx: 0, vy: 0 }, idle = { x: 0, y: 0 };
  let nextIdle = 0, idleReturns = false, nextBlink = 0, blinkStarted = 0, doubleBlink = false;

  function measure() {
    const css = getComputedStyle(eye);
    const small = matchMedia('(max-width: 760px)').matches;
    // Computed safe-area padding is read only when geometry changes.
    const safeTop = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--eye-safe-top')) || 0;
    size = { width: eye.offsetWidth, height: eye.offsetHeight, right: parseFloat(css.right),
      top: (small ? 86 : clamp(innerHeight * .15, 112, 154)) + safeTop,
      dock: 16 + safeTop, hero: hero?.offsetHeight || innerHeight, small };
    needsLayout = false;
  }

  function position(dt, immediate) {
    const progress = clamp(scrollY / Math.max(180, size.hero * .65), 0, 1);
    const eased = progress * progress * (3 - 2 * progress);
    const compact = (size.small ? 64 : 100) / size.width;
    const targetScale = 1 + (compact - 1) * eased;
    const targetY = size.top + (size.dock - size.top) * eased;
    const blend = immediate ? 1 : 1 - Math.exp(-10 * dt);
    pose.y += (targetY - pose.y) * blend;
    pose.scale += (targetScale - pose.scale) * blend;
    eye.style.transform = `translate3d(0, ${pose.y.toFixed(2)}px, 0) scale(${pose.scale.toFixed(4)})`;
    eye.classList.toggle('is-compact', progress > .45);
    placed = true;
  }

  function readObstruction(now) {
    if (now < checkAfter) return;
    checkAfter = now + 180;
    const width = size.width * pose.scale, height = size.height * pose.scale;
    const left = innerWidth - size.right - width;
    const samples = [[.5, .5], [.2, .3], [.8, .7]];
    const blocked = samples.some(([x, y]) => document.elementFromPoint(left + width * x, pose.y + height * y)?.closest(reading));
    eye.classList.toggle('is-obscuring', !!blocked);
  }

  function aim(now) {
    let x = 0, y = 0;
    if (pointer && now < holdUntil) {
      const cx = innerWidth - size.right - size.width * pose.scale / 2;
      const cy = pose.y + size.height * pose.scale / 2;
      x = (pointer.x - cx) / Math.max(180, innerWidth * .42);
      y = (pointer.y - cy) / Math.max(150, innerHeight * .42);
    } else {
      if (now > nextIdle && now - lastInput > 1800) {
        idle.x = idleReturns ? 0 : random(-.32, .32);
        idle.y = idleReturns ? 0 : random(-.24, .24);
        idleReturns = !idleReturns;
        nextIdle = now + random(1300, 2600);
      }
      x = idle.x + Math.sin(now * .00073) * .025;
      y = idle.y + Math.sin(now * .00091) * .02;
    }
    y += scrollImpulse;
    // An ellipse, not independent rectangular clamps, keeps diagonal gaze inside.
    const length = Math.max(1, Math.hypot(x, y));
    return { x: x / length, y: y / length };
  }

  function blink(now) {
    if (!nextBlink) nextBlink = now + random(3000, 7000);
    if (!blinkStarted && now >= nextBlink) blinkStarted = now;
    let close = 0;
    if (blinkStarted) {
      const elapsed = now - blinkStarted;
      close = elapsed < 85 ? Math.sin(elapsed / 85 * Math.PI / 2) :
        elapsed < 120 ? 1 : Math.max(0, Math.cos((elapsed - 120) / 160 * Math.PI / 2));
      if (elapsed >= 280) {
        blinkStarted = 0;
        const repeat = !doubleBlink && Math.random() < .14;
        nextBlink = now + (repeat ? 150 : random(3000, 7000));
        doubleBlink = repeat;
        close = 0;
      }
    }
    eye.style.setProperty('--lid', `${(close * 49.5).toFixed(2)}%`);
    eye.style.setProperty('--seam', Math.max(0, (close - .8) * 5).toFixed(2));
  }

  function tick(now) {
    frame = 0;
    if (document.hidden || suspended) return;
    const dt = Math.min((now - (previousTime || now - 16)) / 1000, .032);
    previousTime = now;
    if (needsLayout) measure();
    position(dt, !placed || motion.matches);
    readObstruction(now);
    if (motion.matches) return;
    const target = aim(now);
    for (const axis of ['x', 'y']) {
      const velocity = `v${axis}`;
      gaze[velocity] += ((target[axis] - gaze[axis]) * 155 - gaze[velocity] * 25) * dt;
      gaze[axis] = clamp(gaze[axis] + gaze[velocity] * dt, -1, 1);
    }
    const radius = Math.max(1, Math.hypot(gaze.x, gaze.y));
    eye.style.setProperty('--look-x', `${(gaze.x / radius * size.width * .072).toFixed(2)}px`);
    eye.style.setProperty('--look-y', `${(gaze.y / radius * size.height * .09).toFixed(2)}px`);
    eye.style.setProperty('--iris-scale', (1 + attention * .025).toFixed(3));
    floater.style.transform = `translateY(${(Math.sin(now * .00095) * 1.8).toFixed(2)}px) rotate(${(Math.sin(now * .00062) * .55).toFixed(2)}deg)`;
    attention *= Math.exp(-2.8 * dt);
    scrollImpulse *= Math.exp(-7 * dt);
    blink(now);
    frame = requestAnimationFrame(tick);
  }
  function wake() {
    if (!frame && !document.hidden && !suspended) frame = requestAnimationFrame(tick);
  }
  function resetMotion() {
    gaze = { x: 0, y: 0, vx: 0, vy: 0 };
    idle = { x: 0, y: 0 }; pointer = null; focused = null;
    blinkStarted = 0; nextBlink = 0; previousTime = 0; scrollImpulse = 0;
    for (const [name, value] of Object.entries({ '--look-x': '0px', '--look-y': '0px', '--lid': '0%', '--seam': '0', '--iris-scale': '1' })) eye.style.setProperty(name, value);
    floater.style.transform = '';
  }
  function syncActivity() {
    const editing = document.activeElement?.matches(editable);
    suspended = document.body.classList.contains('menu-open') || !!document.querySelector('dialog[open]') || !!document.fullscreenElement || !!editing;
    eye.classList.toggle('is-suspended', suspended);
    if (document.hidden || suspended || motion.matches) {
      cancelAnimationFrame(frame); frame = 0; resetMotion();
    }
    needsLayout = true;
    wake();
  }

  function track(event) {
    if (motion.matches || suspended || event.isPrimary === false) return;
    const now = performance.now();
    pointer = { x: event.clientX, y: event.clientY };
    lastInput = now; holdUntil = now + 2100;
    const item = event.target instanceof Element ? event.target.closest(interactive) : null;
    if (item && item !== focused) attention = 1;
    focused = item; idle.x = idle.y = 0; nextIdle = now + 2500;
    wake();
  }
  function release(event) {
    if (event.pointerType !== 'mouse') holdUntil = performance.now() + 450;
  }
  window.addEventListener('pointermove', track, { passive: true });
  window.addEventListener('pointerdown', track, { passive: true });
  window.addEventListener('pointerup', release, { passive: true });
  window.addEventListener('pointercancel', release, { passive: true });
  document.documentElement.addEventListener('pointerleave', () => { holdUntil = 0; });
  window.addEventListener('blur', () => { holdUntil = 0; });
  window.addEventListener('scroll', () => {
    const now = performance.now();
    const delta = scrollY - lastScrollY;
    const elapsed = Math.max(16, now - lastScrollTime);
    scrollImpulse = clamp(delta / elapsed * .08, -.22, .22);
    lastScrollY = scrollY; lastScrollTime = now;
    checkAfter = 0; wake();
  }, { passive: true });
  window.addEventListener('resize', () => { needsLayout = true; checkAfter = 0; wake(); }, { passive: true });
  window.visualViewport?.addEventListener('resize', () => { needsLayout = true; wake(); }, { passive: true });
  document.addEventListener('focusin', event => {
    syncActivity();
    const item = event.target.closest?.(interactive);
    if (!item || suspended || motion.matches) return;
    const rect = item.getBoundingClientRect();
    pointer = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    lastInput = performance.now(); holdUntil = lastInput + 2000; attention = 1;
  });
  document.addEventListener('focusout', () => queueMicrotask(syncActivity));
  document.addEventListener('visibilitychange', syncActivity);
  document.addEventListener('fullscreenchange', syncActivity);
  window.addEventListener('pageshow', syncActivity);
  window.addEventListener('pagehide', () => { cancelAnimationFrame(frame); frame = 0; });
  motion.addEventListener('change', syncActivity);
  new MutationObserver(syncActivity).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  document.querySelectorAll('dialog').forEach(dialog => {
    new MutationObserver(syncActivity).observe(dialog, { attributes: true, attributeFilter: ['open'] });
  });
  if ('ResizeObserver' in window && hero) new ResizeObserver(() => { needsLayout = true; wake(); }).observe(hero);
  syncActivity();
})();
