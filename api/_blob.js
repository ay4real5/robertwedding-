// Vercel Blob as the storage behind api/_lists.js. Blobs are private: only this server reads them.

import { BlobPreconditionFailedError, BlobUnknownError, del, get, put } from '@vercel/blob';
import { Conflict } from './_lists.js';

// Vercel compresses bigger blobs on the way out and then marks their version as weak (W/"…").
// A save can only be matched against the exact version, so ask for the plain bytes, and
// drop the W/ in case it comes back anyway (the value inside is the same).
const exact = (etag) => String(etag || '').replace(/^W\//, '');

export const blobStorage = {
  async read(path, etag) {
    const res = await get(path, {
      access: 'private',
      useCache: false,
      headers: { 'accept-encoding': 'identity' },
      ...(etag ? { ifNoneMatch: exact(etag) } : {}),
    });
    if (!res) return null;
    if (res.statusCode === 304) return { notModified: true };
    return { text: await new Response(res.stream).text(), etag: exact(res.blob.etag) };
  },

  async write(path, text, etag) {
    try {
      const result = await put(path, text, {
        access: 'private',
        contentType: 'application/json',
        addRandomSuffix: false,
        // A new list must not exist yet; an existing one must be exactly what we read.
        allowOverwrite: Boolean(etag),
        ...(etag ? { ifMatch: exact(etag) } : {}),
      });
      return exact(result.etag);
    } catch (err) {
      if (err instanceof BlobPreconditionFailedError || /already exists/i.test(err?.message || '')) throw new Conflict();
      // Two phones saving the same list at the same instant can get an unnamed error back
      // instead of a clean "someone else saved first". Reading again and merging is safe either way.
      if (err instanceof BlobUnknownError) throw new Conflict();
      throw err;
    }
  },

  async remove(path) {
    await del(path);
  },
};
