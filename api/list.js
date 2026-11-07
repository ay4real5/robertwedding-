// GET reads a list, PUT saves (merging with whatever another phone saved), DELETE removes it.
// The list's secret token travels in a header, never in the address.

import { blobStorage } from './_blob.js';
import { handleList } from './_lists.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  let body = null;
  if (req.method === 'PUT') {
    try {
      body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch {
      return res.status(400).json({ error: 'bad-body' });
    }
  }
  try {
    const result = await handleList(
      { method: req.method, token: req.headers['x-list-token'], version: req.headers['if-none-match'], body },
      blobStorage
    );
    if (!result.json) return res.status(result.status).end();
    return res.status(result.status).json(result.json);
  } catch (err) {
    // Never log the list itself: it holds people's names and numbers.
    const message = String(err?.message || '');
    const unavailable = /token|credential|store|suspended|not configured|BLOB_READ_WRITE/i.test(message) || err?.name === 'BlobStoreNotFoundError';
    console.error('list error:', err?.name, message.slice(0, 200));
    return res.status(unavailable ? 503 : 500).json({ error: unavailable ? 'storage-unavailable' : 'failed' });
  }
}
