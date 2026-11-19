export const MAX_PRODUCT_IMAGE_BYTES = 2 * 1024 * 1024;

export type ProductImageValidation =
  | { ok: true }
  | { ok: false; message: string };

const DATA_URL_PATTERN =
  /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/;

function isPng(buffer: Buffer): boolean {
  return (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  );
}

function isJpeg(buffer: Buffer): boolean {
  return (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  );
}

function isWebp(buffer: Buffer): boolean {
  return (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  );
}

export function validateProductImageDataUrl(
  value: string
): ProductImageValidation {
  const match = DATA_URL_PATTERN.exec(value);
  if (!match) {
    return {
      ok: false,
      message: 'Upload a PNG, JPEG, or WebP image.',
    };
  }

  const mime = match[1];
  const base64 = match[2];
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  const byteLength = Math.floor((base64.length * 3) / 4) - padding;

  if (byteLength <= 0) {
    return { ok: false, message: 'The image file is empty.' };
  }

  if (byteLength > MAX_PRODUCT_IMAGE_BYTES) {
    return {
      ok: false,
      message: 'Image must be 2MB or smaller.',
    };
  }

  const buffer = Buffer.from(base64, 'base64');
  const matchesMime =
    (mime === 'image/png' && isPng(buffer)) ||
    (mime === 'image/jpeg' && isJpeg(buffer)) ||
    (mime === 'image/webp' && isWebp(buffer));

  if (!matchesMime) {
    return {
      ok: false,
      message: 'The image file is not a valid PNG, JPEG, or WebP image.',
    };
  }

  return { ok: true };
}
