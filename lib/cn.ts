/**
 * CSS Modules class name joiner.
 * Filters out falsy values and joins with a space.
 */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
