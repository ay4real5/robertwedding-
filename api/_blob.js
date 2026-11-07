// Vercel Blob as the storage behind api/_lists.js. Blobs are private: only this server reads them.

import { BlobPreconditionFailedError, del, get, put } from '@vercel/blob';
import { Conflict } from './_lists.js';

export const blobStorage = {
  async read(path, etag) {
    const res = await get(path, { access: 'private', useCache: false, ...(etag ? { ifNoneMatch: etag } : {}) });
    if (!res) return null;
    if (res.statusCode === 304) return { notModified: true };
    return { text: await new Response(res.stream).text(), etag: res.blob.etag };
  },

  async write(path, text, etag) {
    try {
      const result = await put(path, text, {
        access: 'private',
        contentType: 'application/json',
        addRandomSuffix: false,
        // A new list must not exist yet; an existing one must be exactly what we read.
        allowOverwrite: Boolean(etag),
        ...(etag ? { ifMatch: etag } : {}),
      });
      return result.etag;
    } catch (err) {
      if (err instanceof BlobPreconditionFailedError || /already exists/i.test(err?.message || '')) throw new Conflict();
      throw err;
    }
  },

  async remove(path) {
    await del(path);
  },
};
