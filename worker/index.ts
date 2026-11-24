/**
 * Cloudflare Workers entry point. Serves the built static site from ./dist
 * and routes POST /api/submit to the same form handler used on Pages
 * (functions/api/submit.ts), so the site works on either product.
 */
import { onRequestPost } from '../functions/api/submit';

interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  [key: string]: unknown;
}

export default {
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
    const res = await env.ASSETS.fetch(request);
    // The same site is also reachable on *.workers.dev addresses. Tell search
    // engines not to index those copies, so only edunotech.com.ng shows in results.
    if (url.hostname.endsWith('.workers.dev')) {
      const tagged = new Response(res.body, res);
      tagged.headers.set('X-Robots-Tag', 'noindex');
      return tagged;
    }
    return res;
  },
};
