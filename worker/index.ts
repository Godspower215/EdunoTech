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
    return env.ASSETS.fetch(request);
  },
};
