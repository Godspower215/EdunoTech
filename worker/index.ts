/**
 * Cloudflare Workers entry point.
 *   POST /api/submit   website forms (functions/api/submit.ts): saved to D1, optionally emailed
 *   /dashboard/*       private submissions dashboard behind Cloudflare Access (worker/admin.ts)
 *   everything else    the built static site from ./dist
 */
import { onRequestPost } from '../functions/api/submit';
import { handleDashboard } from './admin';

interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  [key: string]: unknown;
}

const app = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/submit') {
      if (request.method !== 'POST') {
        return new Response(JSON.stringify({ ok: false, error: 'Method not allowed.' }), {
          status: 405,
          headers: { 'Content-Type': 'application/json', Allow: 'POST' },
        });
      }
      return onRequestPost({ request, env: env as any });
    }
    if (url.pathname === '/dashboard' || url.pathname.startsWith('/dashboard/')) {
      return handleDashboard(request, env as any);
    }
    return env.ASSETS.fetch(request);
  },
};

// The same site is also reachable on other addresses: *.workers.dev and the
// preview links Cloudflare makes for each branch (e.g. <branch>.www.edunotech.com.ng).
// Tell search engines not to index those copies, so only the real domain shows in results.
const INDEXABLE_HOSTS = new Set(['edunotech.com.ng', 'www.edunotech.com.ng']);

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const res = await app.fetch(request, env);
    if (INDEXABLE_HOSTS.has(new URL(request.url).hostname)) return res;
    const tagged = new Response(res.body, res);
    tagged.headers.set('X-Robots-Tag', 'noindex');
    return tagged;
  },
};
