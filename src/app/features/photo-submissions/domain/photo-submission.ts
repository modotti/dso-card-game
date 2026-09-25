export const PHOTO_TERMS_VERSION = '2026-09-25-v1';
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const PHOTO_MIN_DIMENSION = 800;
export const PHOTO_MAX_DIMENSION = 1500;
export const PHOTO_MIME_TYPES = ['image/jpeg', 'image/webp'] as const;

export type PhotoTargetType =
  | 'emission_nebula'
  | 'reflection_nebula'
  | 'dark_nebula'
  | 'planetary_nebula'
  | 'galaxy'
  | 'open_cluster'
  | 'globular_cluster'
  | 'other';
export type PhotoValidationError = 'type' | 'size' | 'dimensions' | null;

export function validatePhoto(
  file: Pick<File, 'type' | 'size'>,
  dimensions?: { readonly width: number; readonly height: number },
): PhotoValidationError {
  if (!(PHOTO_MIME_TYPES as readonly string[]).includes(file.type)) return 'type';
  if (file.size <= 0 || file.size > PHOTO_MAX_BYTES) return 'size';
  if (
    dimensions &&
    (dimensions.width < PHOTO_MIN_DIMENSION ||
      dimensions.height < PHOTO_MIN_DIMENSION ||
      dimensions.width > PHOTO_MAX_DIMENSION ||
      dimensions.height > PHOTO_MAX_DIMENSION)
  ) {
    return 'dimensions';
  }
  return null;
}
