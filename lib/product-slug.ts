import { randomBytes } from 'node:crypto';

const MAX_BASE_LENGTH = 40;
const SUFFIX_BYTES = 4;

export function generateProductSlug(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_BASE_LENGTH)
    .replace(/-+$/g, '');

  const suffix = randomBytes(SUFFIX_BYTES).toString('hex');
  return base ? `${base}-${suffix}` : `product-${suffix}`;
}
