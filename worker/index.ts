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
    if (url.pathname === '/dashboard' || url.pathname.startsWith('/dashboard/')) {
      return handleDashboard(request, env as any);
    }
    return env.ASSETS.fetch(request);
  },
};
