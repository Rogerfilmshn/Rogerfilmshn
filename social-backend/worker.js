const encoder = new TextEncoder();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hex = bytes => [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2, '0')).join('');
async function key(secret) {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
async function sign(secret, value) {
  return hex(await crypto.subtle.sign('HMAC', await key(secret), encoder.encode(value)));
}
async function identity(secret, token) {
  const [id, sig, extra] = (token || '').split('.');
  if (extra || !uuid.test(id || '') || !/^[0-9a-f]{64}$/.test(sig || '')) return null;
  const bytes = Uint8Array.from(sig.match(/../g), x => parseInt(x, 16));
  return await crypto.subtle.verify('HMAC', await key(secret), bytes, encoder.encode(`browser:${id}`)) ? id : null;
}
function json(data, status = 200, headers = {}) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}

// This is the only public entry point. No SQL or counter delta is accepted from clients.
export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    if (origin !== env.ALLOWED_ORIGIN) return json({ error: 'origin' }, 403);
    const cors = {
      'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin'
    };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return json({ error: 'method' }, 405, cors);
    if (!env.SIGNING_SECRET || env.SIGNING_SECRET.length < 32) return json({ error: 'configuration' }, 503, cors);
    const action = new URL(request.url).pathname.slice(1);
    if (!['session', 'visit', 'stats', 'like'].includes(action)) return json({ error: 'route' }, 404, cors);
    if (!request.headers.get('Content-Type')?.startsWith('application/json')) return json({ error: 'content_type' }, 415, cors);
    try {
      // Limit streamed body too; Content-Length alone is not trustworthy.
      const reader = request.body?.getReader();
      let size = 0, chunks = [];
      if (reader) while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 1024) { await reader.cancel(); return json({ error: 'body_too_large' }, 413, cors); }
        chunks.push(value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      let body;
      try { body = JSON.parse(new TextDecoder().decode(bytes)); } catch { return json({ error: 'json' }, 400, cors); }
      if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'body' }, 400, cors);
      const allowed = action === 'like' ? ['token', 'liked'] : ['token'];
      if (Object.keys(body).some(k => !allowed.includes(k))) return json({ error: 'fields' }, 400, cors);
      if (body.token != null && typeof body.token !== 'string') return json({ error: 'token' }, 400, cors);
      if (action === 'like' && typeof body.liked !== 'boolean') return json({ error: 'liked' }, 400, cors);
      const ip = request.headers.get('CF-Connecting-IP');
      if (!ip) return json({ error: 'network' }, 503, cors);
      // Daily keyed digest, never persist the raw IP or user agent.
      const now = Date.now();
      const network = await sign(env.SIGNING_SECRET, `network:${Math.floor(now / 86400000)}:${ip}`);
      let id = await identity(env.SIGNING_SECRET, body.token);
      if (action !== 'session' && !id) return json({ error: 'identity' }, 401, cors);
      const fresh = action === 'session' && !id;
      let token = body.token;
      if (fresh) {
        id = crypto.randomUUID();
        token = `${id}.${await sign(env.SIGNING_SECRET, `browser:${id}`)}`;
      }
      const stub = env.SOCIAL.get(env.SOCIAL.idFromName('rogerfilms-v1'));
      const result = await stub.fetch(new Request('https://internal/action', {
        method: 'POST', body: JSON.stringify({ action, id, network, now, fresh, liked: body.liked })
      }));
      const data = await result.json();
      if (result.ok && action === 'session') data.token = token;
      return json(data, result.status, { ...cors, ...(result.status === 429 ? { 'Retry-After': '60' } : {}) });
    } catch {
      return json({ error: 'unavailable' }, 503, cors);
    }
  }
};

export class SocialCounter {
  constructor(ctx) {
    this.ctx = ctx;
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS totals (id INTEGER PRIMARY KEY CHECK(id=1), visits INTEGER NOT NULL DEFAULT 0 CHECK(visits>=0), likes INTEGER NOT NULL DEFAULT 0 CHECK(likes>=0), revision INTEGER NOT NULL DEFAULT 0)`);
    this.sql.exec('INSERT OR IGNORE INTO totals(id) VALUES(1)');
    this.sql.exec(`CREATE TABLE IF NOT EXISTS browsers (id TEXT PRIMARY KEY, liked INTEGER NOT NULL DEFAULT 0 CHECK(liked IN(0,1)))`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS visits (id TEXT PRIMARY KEY, at INTEGER NOT NULL)`);
    this.sql.exec('CREATE INDEX IF NOT EXISTS visits_at ON visits(at)');
    this.sql.exec(`CREATE TABLE IF NOT EXISTS limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL)`);
    this.sql.exec('CREATE INDEX IF NOT EXISTS limits_expires ON limits(expires)');
  }
  first(query, ...args) { return this.sql.exec(query, ...args).toArray()[0]; }
  limit(key, max, expires) {
    const row = this.first('SELECT count FROM limits WHERE key=?', key);
    if (row && row.count >= max) return false;
    this.sql.exec('INSERT INTO limits(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1', key, expires);
    return true;
  }
  async fetch(request) {
    const input = await request.json();
    const { action, id, network, now, fresh, liked } = input;
    // Synchronous transaction: concurrent devices cannot lose increments or double-like.
    const result = this.ctx.storage.transactionSync(() => {
      this.sql.exec('DELETE FROM limits WHERE expires<=?', now);
      this.sql.exec('DELETE FROM visits WHERE at<=?', now - 1800000);
      const minute = Math.floor(now / 60000);
      if (!this.limit(`api:${network}:${minute}`, 120, (minute + 1) * 60000)) return { status: 429, error: 'rate' };
      if (fresh) {
        const hour = Math.floor(now / 3600000), day = Math.floor(now / 86400000);
        if (!this.limit(`new-hour:${network}:${hour}`, 10, (hour + 1) * 3600000) ||
            !this.limit(`new-day:${network}:${day}`, 60, (day + 1) * 86400000)) return { status: 429, error: 'rate' };
      }
      if (action === 'visit') {
        // One visit per anonymous browser in a rolling 30-minute window, across tabs/reloads.
        if (!this.first('SELECT id FROM visits WHERE id=?', id)) {
          this.sql.exec('INSERT INTO visits(id,at) VALUES(?,?)', id, now);
          this.sql.exec('UPDATE totals SET visits=visits+1, revision=revision+1 WHERE id=1');
        }
      }
      if (action === 'like') {
        if (!this.limit(`like:${id}:${minute}`, 15, (minute + 1) * 60000)) return { status: 429, error: 'rate' };
        const old = this.first('SELECT liked FROM browsers WHERE id=?', id)?.liked || 0;
        const desired = liked ? 1 : 0;
        if (old !== desired) {
          // Retain only active anonymous likes. Repeated same-state requests are idempotent.
          if (desired) this.sql.exec('INSERT INTO browsers(id,liked) VALUES(?,1)', id);
          else this.sql.exec('DELETE FROM browsers WHERE id=?', id);
          this.sql.exec('UPDATE totals SET likes=likes+?, revision=revision+1 WHERE id=1', desired - old);
        }
      }
      const totals = this.first('SELECT visits,likes,revision FROM totals WHERE id=1');
      return { ...totals, liked: !!this.first('SELECT liked FROM browsers WHERE id=?', id)?.liked };
    });
    // Clean temporary pseudonymous data even if the site stops receiving requests.
    if (!await this.ctx.storage.getAlarm()) await this.ctx.storage.setAlarm(Date.now() + 3600000);
    const { status = 200, ...data } = result;
    return json(data, status);
  }
  async alarm() {
    const now = Date.now();
    this.sql.exec('DELETE FROM limits WHERE expires<=?', now);
    this.sql.exec('DELETE FROM visits WHERE at<=?', now - 1800000);
    if (this.first('SELECT key FROM limits LIMIT 1') || this.first('SELECT id FROM visits LIMIT 1')) {
      await this.ctx.storage.setAlarm(now + 3600000);
    }
  }
}
