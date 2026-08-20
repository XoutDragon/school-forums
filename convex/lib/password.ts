/**
 * Password hashing.
 *
 * Express used bcrypt. bcrypt is a native module and cannot run inside a Convex
 * query or mutation, which execute in a V8 isolate. The options were a Node action
 * (an extra network hop on every login, and actions cannot write transactionally)
 * or a pure-JS KDF that runs in the isolate. This uses PBKDF2 via Web Crypto,
 * which is available in the isolate and is a legitimate password KDF.
 *
 * Existing bcrypt hashes from the SQLite database will not verify against this.
 * Anyone migrating real accounts has to force a password reset.
 *
 * Lives in lib/ rather than auth.ts because first-run setup and admin-issued
 * resets need it too, and three copies of a KDF is how one of them drifts.
 */

const PBKDF2_ITERATIONS = 210_000; // OWASP 2023 guidance for PBKDF2-SHA512
const SALT_BYTES = 16;

export function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hashPassword(password: string, saltHex?: string): Promise<string> {
  const salt = saltHex
    ? Uint8Array.from(saltHex.match(/.{2}/g)!.map((byte) => parseInt(byte, 16)))
    : crypto.getRandomValues(new Uint8Array(SALT_BYTES));

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-512' },
    key,
    512,
  );

  const saltOut = saltHex ?? toHex(salt.buffer as ArrayBuffer);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${saltOut}$${toHex(bits)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, , saltHex] = stored.split('$');
  if (scheme !== 'pbkdf2' || !saltHex) return false;
  const candidate = await hashPassword(password, saltHex);
  // Constant-time-ish: compare full strings of equal length rather than bailing early.
  if (candidate.length !== stored.length) return false;
  let diff = 0;
  for (let i = 0; i < candidate.length; i++) {
    diff |= candidate.charCodeAt(i) ^ stored.charCodeAt(i);
  }
  return diff === 0;
}

export function newToken(): string {
  return toHex(crypto.getRandomValues(new Uint8Array(32)).buffer as ArrayBuffer);
}

/** Human-transcribable reset code. Ambiguous glyphs (0/O, 1/I) are left out. */
export function newResetCode(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const chars = [...bytes].map((b) => alphabet[b % alphabet.length]);
  return `${chars.slice(0, 4).join('')}-${chars.slice(4, 8).join('')}-${chars.slice(8, 12).join('')}`;
}

export const PASSWORD_RULES = {
  minLength: 8,
  message: 'Password must be at least 8 characters',
};

export function assertPasswordOk(password: string): void {
  if (password.length < PASSWORD_RULES.minLength) {
    throw new Error(`BAD_REQUEST: ${PASSWORD_RULES.message}`);
  }
}
