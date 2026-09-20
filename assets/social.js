(() => {
  'use strict';
  const root = document.getElementById('rf-social');
  if (!root) return;
  const like = root.querySelector('[data-rf-like]');
  const share = root.querySelector('[data-rf-share]');
  const visits = root.querySelector('[data-rf-visits]');
  const likes = root.querySelector('[data-rf-likes]');
  const status = root.querySelector('[data-rf-status]');
  const manual = root.querySelector('[data-rf-copy]');
  const official = 'https://rogerfilmshn.github.io/Rogerfilmshn/';
  let timer;
  function announce(text) {
    clearTimeout(timer);
    status.textContent = text;
    timer = setTimeout(() => { status.textContent = ''; }, 5000);
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(official);
      announce('Enlace copiado');
    } catch {
      manual.hidden = false;
      manual.value = official;
      manual.focus();
      manual.select();
      let copied = false;
      try { copied = document.execCommand('copy'); } catch (_) { /* Manual selection remains. */ }
      if (copied) { manual.hidden = true; share.focus(); announce('Enlace copiado'); }
      else announce('Mantén pulsado o usa Ctrl+C para copiar el enlace.');
    }
  }
  share.addEventListener('click', async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'ROGERFILMS', text: 'Conoce el portafolio audiovisual de ROGERFILMS. Historias que se convierten en experiencias.', url: official });
        return;
      } catch (error) { if (error.name === 'AbortError') return; }
    }
    await copy();
  });

  const api = (window.ROGERFILMS_SOCIAL?.apiUrl || '').replace(/\/$/, '');
  if (!api) return; // Sharing works independently; no invented numbers while unconfigured.
  try { if (new URL(api).protocol !== 'https:') return; } catch { return; }
  const storageKey = 'rogerfilms-social-token-v1';
  function readToken() {
    try { const value = localStorage.getItem(storageKey); if (value) return value; } catch (_) { /* Try first-party cookie. */ }
    const cookie = document.cookie.split('; ').find(value => value.startsWith(`${storageKey}=`));
    return cookie ? decodeURIComponent(cookie.slice(storageKey.length + 1)) : '';
  }
  function saveToken(value) {
    try { localStorage.setItem(storageKey, value); if (localStorage.getItem(storageKey) === value) return; } catch (_) { /* Try first-party cookie. */ }
    document.cookie = `${storageKey}=${encodeURIComponent(value)}; Max-Age=31536000; Path=/Rogerfilmshn/; SameSite=Lax; Secure`;
    if (readToken() !== value) throw new Error('Persistent storage unavailable');
  }
  let token = '', liked = false, busy = false, revision = -1, initialized = false, inView = false;
  let lastRefresh = 0, retryAt = 0;
  const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
  const exact = new Intl.NumberFormat('es-HN');
  async function call(action, extra = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(`${api}/${action}`, {
        method: 'POST', mode: 'cors', credentials: 'omit', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, ...extra }), signal: controller.signal
      });
      if (!response.ok) {
        retryAt = Date.now() + (response.status === 429 ? 60000 : 15000);
        throw new Error('No se pudo conectar');
      }
      return await response.json();
    } finally { clearTimeout(timeout); }
  }
  function render(data) {
    if (!Number.isSafeInteger(data.visits) || !Number.isSafeInteger(data.likes) || data.visits < 0 || data.likes < 0 || !Number.isSafeInteger(data.revision) || data.revision < revision) return;
    revision = data.revision;
    liked = data.liked === true;
    visits.textContent = compact.format(data.visits);
    visits.parentElement.title = `${exact.format(data.visits)} visitas desde la activación; una por navegador cada 30 minutos`;
    visits.parentElement.setAttribute('aria-label', `${exact.format(data.visits)} visitas`);
    likes.textContent = compact.format(data.likes);
    like.title = `${exact.format(data.likes)} likes`;
    like.setAttribute('aria-pressed', String(liked));
    like.setAttribute('aria-label', `${liked ? 'Quitar' : 'Dar'} like. ${exact.format(data.likes)} likes`);
    visits.parentElement.hidden = false;
    like.hidden = false;
    like.disabled = busy;
  }
  async function initialize() {
    if (busy || Date.now() < retryAt) return;
    busy = true;
    try {
      // Lock across tabs so simultaneous first opens reuse one anonymous identity.
      const establish = async () => {
        token = readToken() || token;
        const session = await call('session');
        token = session.token;
        saveToken(token); // Do not count or enable likes if no persistent identity can be saved.
      };
      if (navigator.locks) await navigator.locks.request(storageKey, establish);
      else await establish();
      render(await call('visit'));
      initialized = true;
      lastRefresh = Date.now();
    } catch (_) { /* The page and sharing remain usable; never display a fabricated zero. */ }
    finally { busy = false; like.disabled = false; }
  }
  async function refresh() {
    if (document.hidden || busy || Date.now() < retryAt) return;
    if (!initialized) { await initialize(); return; }
    if (!inView || Date.now() - lastRefresh < 15000) return;
    busy = true;
    try { render(await call('stats')); lastRefresh = Date.now(); }
    catch (_) { announce('No se pudieron actualizar los contadores.'); }
    finally { busy = false; like.disabled = false; }
  }
  like.addEventListener('click', async () => {
    if (busy || !initialized) return;
    busy = true;
    like.disabled = true;
    const desired = !liked;
    try {
      render(await call('like', { liked: desired }));
      if (liked) {
        like.classList.remove('rf-social__pulse');
        void like.offsetWidth;
        like.classList.add('rf-social__pulse');
      }
      announce(liked ? 'Gracias por tu like' : 'Like retirado');
    } catch (_) { announce('No se pudo guardar. Inténtalo de nuevo en un momento.'); }
    finally { busy = false; like.disabled = false; }
  });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => { inView = entries[0].isIntersecting; if (inView) refresh(); }).observe(root);
  } else inView = true;
  document.addEventListener('visibilitychange', refresh);
  window.addEventListener('online', refresh);
  window.addEventListener('storage', event => {
    if (event.key === storageKey) { token = event.newValue || ''; initialized = false; revision = -1; refresh(); }
  });
  setInterval(refresh, 20000); // Only visible social blocks poll. Polling never counts a visit.
  if (!document.hidden) initialize();
})();
