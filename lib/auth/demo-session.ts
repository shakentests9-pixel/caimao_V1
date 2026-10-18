/**
 * Signed session cookie for local demo mode (no Supabase configured).
 * Uses Web Crypto so it runs in both the proxy and route handlers.
 * Format: base64url(userId).expiryEpochSeconds.hmacSha256
 */
export const DEMO_COOKIE = "uf_demo_session";
const TTL_SECONDS = 60 * 60 * 12;

/**
 * The HMAC key. Set DEMO_SESSION_SECRET in production.
 *
 * Without it we fall back to a fixed key rather than a random one: on serverless hosts
 * (Vercel) the proxy and the route handlers run in different processes, and a per-process
 * random key made every sign-in fail verification ("Get started" looped back). A fixed
 * fallback doesn't weaken anything that matters here: demo mode already lets anyone sign in
 * as the demo student with one tap, so a forged demo cookie grants nothing extra. Supabase
 * mode never uses this cookie.
 */
const FALLBACK_SECRET = "caimao-demo-session-fallback-v1::set-DEMO_SESSION_SECRET-in-production";

function secret(): string {
  return process.env.DEMO_SESSION_SECRET || FALLBACK_SECRET;
}

const enc = new TextEncoder();
const b64url = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s: string) => atob(s.replace(/-/g, "+").replace(/_/g, "/"));

async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function signDemoSession(userId: string): Promise<{ value: string; maxAge: number }> {
  const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const body = `${b64url(enc.encode(userId))}.${exp}`;
  return { value: `${body}.${await hmac(body)}`, maxAge: TTL_SECONDS };
}

export async function verifyDemoSession(value: string | undefined | null): Promise<string | null> {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  const [uid, exp, sig] = parts;
  if (!safeEqual(sig, await hmac(`${uid}.${exp}`))) return null;
  if (Number(exp) < Date.now() / 1000) return null;
  try {
    return fromB64url(uid);
  } catch {
    return null;
  }
}
