// Keeps this phone's copy and the online copy the same, so everyone with the link sees one list.
// The phone's own copy is always saved first, so nothing is lost while offline.

import { fingerprint, merge } from './store.js';

const TOKEN_KEY = 'guestlist.cloud';
const API = '/api/list';
const FAST_POLL = 20000;
const SLOW_POLL = 60000;
const IDLE_AFTER = 5 * 60000;
const UNAVAILABLE_FOR = 5 * 60000;

export const isToken = (t) => typeof t === 'string' && /^[A-Za-z0-9_-]{24,64}$/.test(t);

export function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const online = () => globalThis.navigator?.onLine !== false;
const visible = () => globalThis.document?.visibilityState !== 'hidden';

// status: 'saving' | 'saved' | 'offline' | 'local' (online saving unavailable) | 'error'
export function createSync(store, { onStatus = () => {}, onToken = () => {}, storage = globalThis.localStorage, fetchImpl = (...a) => fetch(...a) } = {}) {
  let token = null;
  try {
    const saved = storage?.getItem(TOKEN_KEY);
    if (isToken(saved)) token = saved;
  } catch {
    /* no storage: the list still works, it just can't remember its link */
  }
  let version = null;
  let dirty = false;
  let busy = false;
  let pushTimer = null;
  let pollTimer = null;
  let retryDelay = 0;
  let unavailableUntil = 0;
  let lastActivity = Date.now();
  let status = '';

  const setStatus = (next) => {
    if (next !== status) {
      status = next;
      onStatus(next);
    }
  };

  const remember = () => {
    try {
      storage?.setItem(TOKEN_KEY, token);
    } catch {
      /* see above */
    }
  };

  const hasContent = () => {
    const s = store.state;
    return s.guests.length > 0 || Object.keys(s.removed).length > 0 || Boolean(s.names || s.date || s.capacity);
  };

  function ensureToken() {
    if (!token) {
      token = newToken();
      remember();
      onToken(token);
    }
    return token;
  }

  function schedulePush(ms) {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => {
      pushTimer = null;
      push();
    }, ms);
    pushTimer.unref?.(); // in tests, a pending save shouldn't hold the process open
  }

  function unavailable() {
    unavailableUntil = Date.now() + UNAVAILABLE_FOR;
    setStatus('local');
    if (dirty) schedulePush(UNAVAILABLE_FOR + 1000);
  }

  // Fold the server's copy into ours; report whether the server still lacks something of ours.
  function takeServerCopy(remote, nextVersion) {
    version = nextVersion;
    const local = store.state;
    const merged = merge(local, remote, { dedupe: false }).state;
    if (fingerprint(merged) !== fingerprint(local)) store.adopt(merged);
    if (fingerprint(merged) !== fingerprint(remote)) dirty = true;
  }

  async function push() {
    clearTimeout(pushTimer);
    pushTimer = null;
    if (busy) {
      dirty = true;
      return;
    }
    ensureToken();
    if (!online()) return setStatus('offline');
    if (Date.now() < unavailableUntil) return setStatus('local');
    busy = true;
    dirty = false;
    setStatus('saving');
    try {
      const body = JSON.stringify({ state: store.state });
      const res = await fetchImpl(API, {
        method: 'PUT',
        cache: 'no-store',
        headers: { 'content-type': 'application/json', 'x-list-token': token },
        body,
        keepalive: body.length < 60000, // lets the last save finish as the page closes
      });
      if (res.status === 503) {
        dirty = true;
        return unavailable();
      }
      if (!res.ok) throw new Error(`save failed: ${res.status}`);
      const data = await res.json();
      retryDelay = 0;
      takeServerCopy(data.state, data.version);
      setStatus(dirty ? 'saving' : 'saved');
    } catch {
      dirty = true;
      retryDelay = Math.min(60000, (retryDelay || 2500) * 2);
      setStatus(online() ? 'error' : 'offline');
      schedulePush(retryDelay);
    } finally {
      busy = false;
      if (dirty && !pushTimer) schedulePush(400);
    }
  }

  async function pull() {
    if (!token || busy || !online() || Date.now() < unavailableUntil) return;
    busy = true;
    try {
      const res = await fetchImpl(API, {
        cache: 'no-store',
        headers: { 'x-list-token': token, ...(version ? { 'if-none-match': version } : {}) },
      });
      if (res.status === 304) {
        if (!dirty) setStatus('saved');
        return;
      }
      if (res.status === 503) return unavailable();
      if (!res.ok) throw new Error(`load failed: ${res.status}`);
      const data = await res.json();
      if (!data.state) {
        if (hasContent()) dirty = true; // a list made offline, or before online saving existed
        else setStatus('saved');
        return;
      }
      takeServerCopy(data.state, data.version);
      if (!dirty) setStatus('saved');
    } catch {
      if (!online()) setStatus('offline');
    } finally {
      busy = false;
      if (dirty && !pushTimer) schedulePush(300);
    }
  }

  function poll() {
    clearTimeout(pollTimer);
    const wait = Date.now() - lastActivity > IDLE_AFTER ? SLOW_POLL : FAST_POLL;
    pollTimer = setTimeout(async () => {
      if (visible()) await pull();
      poll();
    }, wait);
  }

  return {
    get token() {
      return token;
    },
    get status() {
      return status;
    },
    ensureToken,
    push,
    pull,

    // Something changed here: save it online shortly. Typing waits a little longer.
    changed(reason) {
      lastActivity = Date.now();
      dirty = true;
      if (!token && !hasContent()) return;
      setStatus(online() ? 'saving' : 'offline');
      schedulePush(reason === 'edit' ? 1500 : 500);
    },

    // Switch to a list opened from a link.
    open(nextToken) {
      token = nextToken;
      version = null;
      dirty = false;
      remember();
    },

    start() {
      if (token) pull();
      else if (hasContent()) this.changed('migrate'); // lists made before online saving get uploaded
      poll();
      globalThis.addEventListener?.('online', () => (dirty ? push() : pull()));
      globalThis.addEventListener?.('offline', () => setStatus('offline'));
      globalThis.addEventListener?.('focus', () => pull());
      globalThis.document?.addEventListener('visibilitychange', () => {
        if (visible()) {
          lastActivity = Date.now();
          pull();
        } else if (dirty) push();
      });
    },
  };
}
