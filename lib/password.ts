/**
 * Password policy shared by the browser (live feedback) and the server
 * (authoritative check). Deliberately free of Node-only imports so client
 * components can use it without pulling bcrypt into the client bundle.
 */

export const MIN_PASSWORD_LENGTH = 8;

export type PasswordRule = {
  message: string;
  isMet: (value: string) => boolean;
};

export const PASSWORD_RULES: PasswordRule[] = [
  { message: 'Password must contain an uppercase letter.', isMet: (v) => /[A-Z]/.test(v) },
  { message: 'Password must contain a lowercase letter.', isMet: (v) => /[a-z]/.test(v) },
  { message: 'Password must contain a number.', isMet: (v) => /\d/.test(v) },
  { message: 'Password must contain a special character.', isMet: (v) => /[^A-Za-z0-9]/.test(v) },
  {
    message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    isMet: (v) => v.length >= MIN_PASSWORD_LENGTH,
  },
];

/**
 * Returns the first rule the value fails, or undefined when it satisfies all
 * of them. An empty string fails the length rule, so it is never "strong".
 */
export function getPasswordError(value: string): string | undefined {
  return PASSWORD_RULES.find((rule) => !rule.isMet(value))?.message;
}
