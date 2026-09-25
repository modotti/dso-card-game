import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const TERMS_VERSION = '2026-09-25-v1';
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MIN_DIMENSION = 800;
const MAX_DIMENSION = 1500;
const ALLOWED_TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/webp', 'webp'],
]);
const ALLOWED_TARGETS = new Set([
  'emission_nebula',
  'reflection_nebula',
  'dark_nebula',
  'planetary_nebula',
  'galaxy',
  'open_cluster',
  'globular_cluster',
  'other',
]);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function response(status: number, payload: Record<string, unknown>): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function jpegDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const sofMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let offset = 2;
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset++;
      continue;
    }
    const marker = bytes[offset + 1];
    if (marker === 0xd9 || marker === 0xda) break;
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (length < 2 || offset + length + 2 > bytes.length) return null;
    if (sofMarkers.has(marker)) {
      return {
        height: (bytes[offset + 5] << 8) | bytes[offset + 6],
        width: (bytes[offset + 7] << 8) | bytes[offset + 8],
      };
    }
    offset += length + 2;
  }
  return null;
}

function webpDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  const text = (offset: number, length: number) => String.fromCharCode(...bytes.slice(offset, offset + length));
  if (bytes.length < 30 || text(0, 4) !== 'RIFF' || text(8, 4) !== 'WEBP') return null;
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const type = text(offset, 4);
    const size = bytes[offset + 4] | (bytes[offset + 5] << 8) | (bytes[offset + 6] << 16) | (bytes[offset + 7] << 24);
    const data = offset + 8;
    if (type === 'VP8X' && data + 10 <= bytes.length) {
      return {
        width: 1 + bytes[data + 4] + (bytes[data + 5] << 8) + (bytes[data + 6] << 16),
        height: 1 + bytes[data + 7] + (bytes[data + 8] << 8) + (bytes[data + 9] << 16),
      };
    }
    if (
      type === 'VP8 ' &&
      data + 10 <= bytes.length &&
      bytes[data + 3] === 0x9d &&
      bytes[data + 4] === 0x01 &&
      bytes[data + 5] === 0x2a
    ) {
      return {
        width: (bytes[data + 6] | (bytes[data + 7] << 8)) & 0x3fff,
        height: (bytes[data + 8] | (bytes[data + 9] << 8)) & 0x3fff,
      };
    }
    if (type === 'VP8L' && data + 5 <= bytes.length && bytes[data] === 0x2f) {
      return {
        width: 1 + bytes[data + 1] + ((bytes[data + 2] & 0x3f) << 8),
        height: 1 + (bytes[data + 2] >> 6) + (bytes[data + 3] << 2) + ((bytes[data + 4] & 0x0f) << 10),
      };
    }
    offset = data + size + (size % 2);
  }
  return null;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return response(405, { error: 'METHOD_NOT_ALLOWED' });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const authorization = request.headers.get('Authorization') ?? '';
    const authClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
    const { data: userData, error: userError } = await authClient.auth.getUser();
    if (userError || !userData.user) return response(401, { error: 'AUTH_REQUIRED' });

    // Turnstile and rate-limit verification can be inserted here before
    // parsing and storing the submission when the public launch is enabled.
    const form = await request.formData();
    const photographerName = String(form.get('photographerName') ?? '').trim();
    const instagramValue = String(form.get('instagram') ?? '').trim();
    const instagram = instagramValue || null;
    const targetName = String(form.get('targetName') ?? '').trim();
    const targetType = String(form.get('targetType') ?? '');
    const termsAccepted = form.get('termsAccepted') === 'true';
    const termsVersion = String(form.get('termsVersion') ?? '');
    const photo = form.get('photo');

    if (!photographerName || photographerName.length > 100)
      return response(400, { error: 'INVALID_PHOTOGRAPHER_NAME' });
    if (instagram && !/^@[A-Za-z0-9._]{1,30}$/.test(instagram)) return response(400, { error: 'INVALID_INSTAGRAM' });
    if (!targetName || targetName.length > 120) return response(400, { error: 'INVALID_TARGET_NAME' });
    if (!ALLOWED_TARGETS.has(targetType)) return response(400, { error: 'INVALID_TARGET_TYPE' });
    if (!termsAccepted || termsVersion !== TERMS_VERSION) return response(400, { error: 'TERMS_REQUIRED' });
    if (!(photo instanceof File)) return response(400, { error: 'PHOTO_REQUIRED' });
    const extension = ALLOWED_TYPES.get(photo.type);
    if (!extension) return response(400, { error: 'INVALID_PHOTO_TYPE' });
    if (photo.size <= 0 || photo.size > MAX_FILE_SIZE) return response(400, { error: 'INVALID_PHOTO_SIZE' });

    const bytes = new Uint8Array(await photo.arrayBuffer());
    const dimensions = photo.type === 'image/jpeg' ? jpegDimensions(bytes) : webpDimensions(bytes);
    if (!dimensions) return response(400, { error: 'INVALID_PHOTO_DATA' });
    if (
      dimensions.width < MIN_DIMENSION ||
      dimensions.height < MIN_DIMENSION ||
      dimensions.width > MAX_DIMENSION ||
      dimensions.height > MAX_DIMENSION
    ) {
      return response(400, { error: 'INVALID_PHOTO_DIMENSIONS' });
    }

    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const id = crypto.randomUUID();
    const storagePath = `${id}/original.${extension}`;
    const { error: uploadError } = await admin.storage.from('photo-submissions').upload(storagePath, bytes, {
      contentType: photo.type,
      upsert: false,
    });
    if (uploadError) return response(500, { error: 'UPLOAD_FAILED' });

    const { error: insertError } = await admin.from('photo_submissions').insert({
      id,
      submitter_id: userData.user.id,
      photographer_name: photographerName,
      instagram,
      target_name: targetName,
      target_type: targetType,
      storage_path: storagePath,
      status: 'pending',
      terms_version: TERMS_VERSION,
    });
    if (insertError) {
      await admin.storage.from('photo-submissions').remove([storagePath]);
      return response(500, { error: 'SUBMISSION_FAILED' });
    }
    return response(201, { id, status: 'pending' });
  } catch {
    return response(500, { error: 'SUBMISSION_FAILED' });
  }
});
