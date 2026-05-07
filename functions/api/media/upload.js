// POST /api/media/upload
// Upload a file (video, audio, image) to R2
// Accepts multipart/form-data with a "file" field
// Returns { ok, url, key }

import { getCurrentMember, json, unauthorized, badRequest } from '../../_lib.js';

const MAX_SIZE = 100 * 1024 * 1024; // 100MB
const ALLOWED_TYPES = [
  'video/mp4', 'video/webm', 'video/quicktime', 'video/mov',
  'audio/mp3', 'audio/mpeg', 'audio/webm', 'audio/ogg', 'audio/wav', 'audio/mp4', 'audio/x-m4a',
  'image/jpeg', 'image/png', 'image/webp', 'image/gif'
];

export async function onRequestPost({ request, env }) {
  const member = await getCurrentMember(request, env);
  if (!member) return unauthorized();

  const contentType = request.headers.get('Content-Type') || '';
  if (!contentType.includes('multipart/form-data')) {
    return badRequest('Expected multipart/form-data');
  }

  const formData = await request.formData();
  const file = formData.get('file');
  if (!file || !file.size) return badRequest('No file uploaded');
  if (file.size > MAX_SIZE) return badRequest('File too large (max 100MB)');

  const mimeType = file.type || 'application/octet-stream';
  if (!ALLOWED_TYPES.some(t => mimeType.startsWith(t.split('/')[0]))) {
    return badRequest('File type not allowed. Use video, audio, or image files.');
  }

  // Generate unique key
  const ext = mimeType.split('/')[1]?.split(';')[0] || 'bin';
  const key = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  // Upload to R2
  await env.MEDIA.put(key, file.stream(), {
    httpMetadata: { contentType: mimeType },
    customMetadata: { uploadedBy: String(member.id), originalName: file.name || 'unknown' }
  });

  return json({ ok: true, key, url: `/api/media/${key}` });
}
