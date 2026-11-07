// The online copy of each list. Kept apart from Vercel so it can be tested with any storage.
//
// A list is found by a secret token that lives only in its link (after the #, so it never
// appears in server logs as part of a URL). The storage name is a hash of that token, so
// knowing a storage name is no help in finding a list, and the token itself is never stored.

import { createHash } from 'node:crypto';
import { clean, fingerprint, merge } from '../js/store.js';

export const TOKEN_RE = /^[A-Za-z0-9_-]{24,64}$/;
const MAX_BYTES = 2_000_000;
const ATTEMPTS = 6;

export class Conflict extends Error {}

const pathFor = (token) => `lists/${createHash('sha256').update(token).digest('hex')}.json`;

// Storage may hand back a compressed copy marked as a weak version (W/"…"); saving must name the exact one.
const exact = (etag) => (etag ? String(etag).replace(/^W\//, '') : etag);

const parse = (text) => {
  try {
    return clean(JSON.parse(text).state);
  } catch {
    return clean(null);
  }
};

// storage: read(path, etag?) -> null | { notModified: true } | { text, etag }
//          write(path, text, etag | null) -> etag, throwing Conflict if someone else wrote first
//          remove(path)
export async function handleList({ method, token, version, body }, storage) {
  if (!TOKEN_RE.test(token || '')) return { status: 400, json: { error: 'bad-token' } };
  const path = pathFor(token);

  if (method === 'GET') {
    const found = await storage.read(path, exact(version) || null);
    // Not saved online yet is normal for a new list, not an error.
    if (!found) return { status: 200, json: { state: null, version: null } };
    if (found.notModified) return { status: 304 };
    return { status: 200, json: { state: parse(found.text), version: exact(found.etag) } };
  }

  if (method === 'PUT') {
    if (!body || typeof body !== 'object' || !body.state || typeof body.state !== 'object') {
      return { status: 400, json: { error: 'bad-body' } };
    }
    const incoming = clean(body.state);
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      const found = await storage.read(path, null);
      const current = found ? parse(found.text) : null;
      const merged = current ? merge(current, incoming, { dedupe: false }).state : incoming;
      // Nothing new: skip the write, which is the costly operation on Vercel's free plan.
      if (current && fingerprint(merged) === fingerprint(current)) {
        return { status: 200, json: { state: current, version: exact(found.etag) } };
      }
      const text = JSON.stringify({ v: 1, state: merged });
      if (text.length > MAX_BYTES) return { status: 413, json: { error: 'too-big' } };
      try {
        const etag = await storage.write(path, text, found ? exact(found.etag) : null);
        return { status: 200, json: { state: merged, version: etag } };
      } catch (err) {
        if (!(err instanceof Conflict)) throw err;
        // Another phone saved between our read and write: read theirs and merge again,
        // after a short random pause so phones saving together don't keep colliding.
        await new Promise((resolve) => setTimeout(resolve, 20 + Math.random() * 100 * (attempt + 1)));
      }
    }
    return { status: 409, json: { error: 'busy' } };
  }

  if (method === 'DELETE') {
    await storage.remove(path);
    return { status: 204 };
  }

  return { status: 405, json: { error: 'method' } };
}
