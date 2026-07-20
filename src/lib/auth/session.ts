/**
 * Shared-password session gate for the whole app (see middleware.ts). Not
 * per-user auth -- this is a private single-user tool being shared behind
 * one passphrase, not a multi-account system. Built on Web Crypto (not
 * Node's `crypto` module) so the same code runs in both Next.js middleware
 * (Edge runtime) and API routes (Node runtime) without a runtime split.
 */

export const SESSION_COOKIE_NAME = "sybaubetting_session";

const encoder = new TextEncoder();
const SESSION_PAYLOAD = "sybaubetting-authenticated-session";

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Constant-time comparison of two equal-length hex strings. */
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return toHex(signature);
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(input));
  return toHex(digest);
}

/** Deterministic session token derived from the app password -- knowing the cookie is equivalent to knowing the password, which is fine for a single shared-passphrase gate served over HTTPS with an HttpOnly cookie. */
export async function createSessionToken(appPassword: string): Promise<string> {
  return hmacSha256Hex(appPassword, SESSION_PAYLOAD);
}

export async function isValidSessionToken(token: string | undefined, appPassword: string): Promise<boolean> {
  if (!token) return false;
  const expected = await createSessionToken(appPassword);
  return timingSafeEqualHex(token, expected);
}

/** Constant-time password comparison (hashes both sides first so length differences don't leak via timing). */
export async function verifyPassword(candidate: string, appPassword: string): Promise<boolean> {
  const [candidateHash, expectedHash] = await Promise.all([sha256Hex(candidate), sha256Hex(appPassword)]);
  return timingSafeEqualHex(candidateHash, expectedHash);
}
