/**
 * Converts price in kobo (integer) to formatted Nigerian Naira display string (e.g., ₦15,000).
 */
export function formatNaira(kobo: number): string {
  const naira = Math.floor(kobo / 100);
  return `₦${naira.toLocaleString('en-NG')}`;
}

/**
 * Generates a clean URL slug from a product name with a random 4-character suffix.
 * Example: "Black Hoodie" -> "black-hoodie-8347"
 */
export function generateSlug(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

  const suffix = Math.floor(1000 + Math.random() * 9000).toString();
  return base ? `${base}-${suffix}` : `product-${suffix}`;
}

/**
 * Validates that an amount in kobo represents a whole Naira amount.
 * Flutterwave requires whole integer Naira.
 */
export function isWholeNaira(kobo: number): boolean {
  return Number.isInteger(kobo) && kobo > 0 && kobo % 100 === 0;
}
