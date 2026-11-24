/**
 * Cloudflare Access check for the submissions dashboard.
 *
 * Cloudflare Access sits in front of /dashboard on the custom domain and makes
 * people log in (one-time code to an approved email). Access then adds a signed
 * token (JWT) to every request. We verify that token here as well, so the data
 * stays locked even if someone reaches the Worker another way (the workers.dev
 * URL, a preview URL, or an Access policy that was edited by mistake).
 *
 * Fails closed: if ACCESS_TEAM_DOMAIN or ACCESS_AUD is not set, nobody gets in.
 * Docs: https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/
 */

export interface AccessEnv {
  ACCESS_TEAM_DOMAIN?: string; // e.g. https://edunotech.cloudflareaccess.com
  ACCESS_AUD?: string; // Application Audience (AUD) tag
}

export type AccessResult = { ok: true; email: string } | { ok: false; status: number; reason: string };

interface Jwk { kid: string; kty: string; n: string; e: string; alg?: string }

let keyCache: { domain: string; at: number; keys: Jwk[] } | null = null;

async function getKeys(domain: string, force = false): Promise<Jwk[]> {
  if (!force && keyCache && keyCache.domain === domain && Date.now() - keyCache.at < 10 * 60_000) return keyCache.keys;
  const r = await fetch(`${domain}/cdn-cgi/access/certs`);
  if (!r.ok) throw new Error(`certs ${r.status}`);
  const data = (await r.json()) as { keys?: Jwk[] };
  keyCache = { domain, at: Date.now(), keys: data.keys || [] };
  return keyCache.keys;
}

function b64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const decodeJson = (s: string) => JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));

function getCookie(req: Request, name: string) {
  const c = req.headers.get('Cookie') || '';
  const m = c.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? m[1] : '';
}

export async function verifyAccess(req: Request, env: AccessEnv): Promise<AccessResult> {
  const domain = (env.ACCESS_TEAM_DOMAIN || '').trim().replace(/\/+$/, '');
  const aud = (env.ACCESS_AUD || '').trim();
  if (!domain || !aud) return { ok: false, status: 503, reason: 'not-configured' };

  const token = req.headers.get('Cf-Access-Jwt-Assertion') || getCookie(req, 'CF_Authorization');
  if (!token) return { ok: false, status: 401, reason: 'no-token' };

  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, status: 401, reason: 'malformed' };

  let header: { kid?: string; alg?: string };
  let payload: { aud?: string | string[]; iss?: string; exp?: number; nbf?: number; email?: string };
  try {
    header = decodeJson(parts[0]);
    payload = decodeJson(parts[1]);
  } catch {
    return { ok: false, status: 401, reason: 'malformed' };
  }
  if (header.alg !== 'RS256' || !header.kid) return { ok: false, status: 401, reason: 'bad-alg' };

  let keys: Jwk[];
  try {
    keys = await getKeys(domain);
    if (!keys.some((k) => k.kid === header.kid)) keys = await getKeys(domain, true); // key rotation
  } catch {
    return { ok: false, status: 503, reason: 'certs-unavailable' };
  }
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) return { ok: false, status: 401, reason: 'unknown-key' };

  const key = await crypto.subtle.importKey(
    'jwk',
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    b64urlToBytes(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
  );
  if (!valid) return { ok: false, status: 401, reason: 'bad-signature' };

  const now = Math.floor(Date.now() / 1000);
  const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!auds.includes(aud)) return { ok: false, status: 403, reason: 'wrong-aud' };
  if (payload.iss !== domain) return { ok: false, status: 403, reason: 'wrong-iss' };
  if (!payload.exp || payload.exp < now) return { ok: false, status: 401, reason: 'expired' };
  if (payload.nbf && payload.nbf > now + 60) return { ok: false, status: 401, reason: 'not-yet-valid' };

  return { ok: true, email: payload.email || '' };
}
