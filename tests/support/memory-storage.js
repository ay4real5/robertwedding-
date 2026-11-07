// Stands in for Vercel Blob in tests and the local preview, with the same etag rules.

import { Conflict } from '../../api/_lists.js';

export function memoryStorage() {
  const blobs = new Map();
  let counter = 0;
  const stats = { reads: 0, writes: 0 };
  return {
    stats,
    blobs,
    async read(path, etag) {
      stats.reads += 1;
      const blob = blobs.get(path);
      if (!blob) return null;
      if (etag && etag === blob.etag) return { notModified: true };
      return { text: blob.text, etag: blob.etag };
    },
    async write(path, text, etag) {
      const blob = blobs.get(path);
      if (etag ? !blob || blob.etag !== etag : blob) throw new Conflict();
      stats.writes += 1;
      counter += 1;
      const next = `"etag-${counter}"`;
      blobs.set(path, { text, etag: next });
      return next;
    },
    async remove(path) {
      blobs.delete(path);
    },
  };
}
