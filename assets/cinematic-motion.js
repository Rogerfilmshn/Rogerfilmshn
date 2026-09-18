(() => {
  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  if (preference.matches) return;
  const style = document.createElement('style');
  style.textContent = `
    .cine-focus { position: fixed; top: 0; left: 0; width: 52px; height: 52px;
      z-index: 80; pointer-events: none; opacity: 0; color: #dfb879;
      transition: opacity .2s; }
    .cine-focus svg { width: 100%; height: 100%; overflow: visible;
      transition: transform .35s cubic-bezier(.2,.7,.2,1); }
    .cine-focus.is-link svg { transform: scale(.7) rotate(90deg); }
    .cine-focus.is-title svg { transform: scale(1.55) rotate(-12deg); }
    .services-grid[data-reveal] { transform: translateY(34px); }
    .services-grid.is-visible .service { animation: cine-rise .8s both; }
    .services-grid.is-visible .service:nth-child(2) { animation-delay: .12s; }
    .services-grid.is-visible .service:nth-child(3) { animation-delay: .24s; }
    .portfolio-row[data-reveal] { transform: translateX(35px); }
    .portfolio-row[data-reveal]:nth-child(2) { transform: translateX(-35px); }
    .statement-grid[data-reveal] { transform: translateY(25px) scale(.97); filter: blur(5px);
      transition: opacity .9s, transform 1s, filter 1s; }
    .contact-inner[data-reveal] { transform: translateY(40px); }
    [data-reveal].is-visible { transform: none; filter: none; }
    .portfolio-row[data-reveal].is-visible { transform: none; }
    @keyframes cine-rise { from { opacity: 0; transform: translateY(22px); } to { opacity: 1; transform: none; } }
    @media(prefers-reduced-motion: reduce) { .cine-focus { display: none; }
      [data-reveal] { opacity: 1 !important; transform: none !important; filter: none !important; } }
  `;
  document.head.append(style);
  if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  const focus = document.createElement('div');
  focus.className = 'cine-focus';
  focus.setAttribute('aria-hidden', 'true');
  focus.innerHTML = '<svg viewBox="0 0 52 52" fill="none" stroke="currentColor" stroke-width="1"><path d="M4 15V4h11 M37 4h11v11 M48 37v11H37 M15 48H4V37"/><circle cx="26" cy="26" r="14" opacity=".3"/><path d="M23 26h6M26 23v6" opacity=".6"/></svg>';
  document.body.append(focus);
  let frame = 0, x = 0, y = 0, targetX = 0, targetY = 0, active = false;
  const tick = () => {
    x += (targetX - x) * .2; y += (targetY - y) * .2;
    focus.style.transform = `translate3d(${x - 26}px,${y - 26}px,0)`;
    if (active && Math.abs(targetX - x) + Math.abs(targetY - y) > .2) frame = requestAnimationFrame(tick);
    else frame = 0;
  };
  document.addEventListener('pointermove', event => {
    if (event.pointerType !== 'mouse' || preference.matches) return;
    targetX = event.clientX; targetY = event.clientY;
    if (!active) { x = targetX; y = targetY; }
    active = true; focus.style.opacity = '.65';
    focus.classList.toggle('is-link', !!event.target.closest('a, button'));
    focus.classList.toggle('is-title', !!event.target.closest('.lens-title'));
    if (!frame) frame = requestAnimationFrame(tick);
  }, { passive: true });
  const hide = () => { active = false; focus.style.opacity = '0'; cancelAnimationFrame(frame); frame = 0; };
  document.documentElement.addEventListener('pointerleave', hide);
  window.addEventListener('blur', hide);
  preference.addEventListener('change', () => { if (preference.matches) hide(); });
})();
