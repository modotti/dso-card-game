import { PHOTO_MAX_BYTES, validatePhoto } from './photo-submission';

describe('validatePhoto', () => {
  const file = (type: string, size = 1024): Pick<File, 'type' | 'size'> => ({ type, size });

  it('accepts JPEG and WebP files', () => {
    expect(validatePhoto(file('image/jpeg'), { width: 800, height: 1500 })).toBeNull();
    expect(validatePhoto(file('image/webp'), { width: 1500, height: 800 })).toBeNull();
  });

  it('rejects unsupported file types', () => {
    expect(validatePhoto(file('image/png'))).toBe('type');
  });

  it('rejects files larger than 5 MB', () => {
    expect(validatePhoto(file('image/jpeg', PHOTO_MAX_BYTES + 1))).toBe('size');
  });

  it('rejects dimensions below the minimum', () => {
    expect(validatePhoto(file('image/jpeg'), { width: 799, height: 1000 })).toBe('dimensions');
    expect(validatePhoto(file('image/jpeg'), { width: 1000, height: 799 })).toBe('dimensions');
  });

  it('rejects dimensions above the maximum', () => {
    expect(validatePhoto(file('image/jpeg'), { width: 1501, height: 1000 })).toBe('dimensions');
    expect(validatePhoto(file('image/jpeg'), { width: 1000, height: 1501 })).toBe('dimensions');
  });
});
