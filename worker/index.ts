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

const PRIMARY_HOST = 'edunotech.com.ng';

// Search engine housekeeping, applied to every request (wrangler.jsonc sends
// all requests through the Worker first, so this also covers the static pages):
//   - www.edunotech.com.ng redirects permanently to edunotech.com.ng, so Google
//     sees one address per page instead of two.
//   - Every other address (*.workers.dev, branch preview links such as
//     <branch>.www.edunotech.com.ng) is marked noindex.
//   - The private dashboard is never indexed, and /404 itself returns a real 404.
//   - /page.html and /page/ redirect permanently (301) to /page.
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.hostname === `www.${PRIMARY_HOST}`) {
      url.hostname = PRIMARY_HOST;
      url.protocol = 'https:';
      return Response.redirect(url.toString(), 301);
    }
    let res = await app.fetch(request, env);
    // Visiting /404 directly used to return the "page not found" page with a
    // 200 OK status, which Google reports as a "Soft 404". Send a real 404.
    if (/^\/404(\.html)?$/.test(url.pathname) && res.status === 200) {
      res = new Response(res.body, { status: 404, headers: res.headers });
    }
    // Cloudflare tidies /page.html and /page/ to /page with a temporary (307)
    // redirect. Make it permanent so Google only keeps /page.
    if (res.status === 307 && res.headers.has('Location')) {
      res = new Response(res.body, { status: 301, headers: res.headers });
    }
    const privatePath = url.pathname === '/dashboard' || url.pathname.startsWith('/dashboard/');
    if (url.hostname === PRIMARY_HOST && !privatePath) return res;
    const tagged = new Response(res.body, res);
    tagged.headers.set('X-Robots-Tag', 'noindex');
    return tagged;
  },
};
