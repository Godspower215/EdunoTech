# Edunotech website

Astro static site, hosted on Cloudflare Pages, with one Pages Function for form delivery and a git-based content manager (Sveltia CMS, Decap-compatible) at `/admin`.

## Run locally

```bash
npm install
npm run dev            # http://localhost:4321 (forms won't send: no Functions in astro dev)
npm run build
npx wrangler pages dev dist   # full site + /api/submit at http://localhost:8788
```

## Where things live

| What | File |
| --- | --- |
| Contact details, logo, socials, analytics token | `src/data/site.json` |
| Page copy | `src/data/home.json`, `about.json`, `services.json`, `pse.json`, `ecic.json`, `contact.json` |
| Page templates | `src/pages/*.astro` |
| Design tokens (colours, type, spacing) | `src/styles/global.css` (top of file) |
| Shared components | `src/components/` |
| Form endpoint | `functions/api/submit.ts` |
| Insights articles (future) | `src/content/insights/*.md` (section appears automatically once a post exists) |
| CMS config | `public/admin/config.yml` |
| Security headers | `public/_headers` |

Empty contact fields render a visible yellow `[placeholder]`. Find every gap with:

```bash
npm run build && grep -o 'data-placeholder[^>]*>[^<]*' dist/*.html | sort | uniq -c
```

See `HANDOVER.md` for deployment, form setup, CMS sign-in and the launch checklist.
