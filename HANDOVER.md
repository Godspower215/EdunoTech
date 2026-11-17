# Edunotech website: handover and launch checklist

Status: built and tested locally. Not deployed. No GitHub repo, Cloudflare project or email account has been created.

## 1. Stack, and why

- **Astro (static) on Cloudflare Pages.** Static HTML is fast on mobile networks, cheap (Pages free tier), has almost nothing to hack, and matches the setup already used for Pen of Wonder.
- **Hosting:** the Cloudflare project was created as a Worker, so the repo includes `wrangler.jsonc` and `worker/index.ts` (build command `npm run build`, deploy command `npx wrangler deploy`). The same code still works as a Pages project.
- **One form handler** (`functions/api/submit.ts`, used by both) receives both forms, validates them, checks spam protection and emails the submission. No database.
- **Sveltia CMS at `/admin`.** A maintained, drop-in replacement for Decap CMS (same `config.yml`). Edits commit to GitHub and Cloudflare rebuilds the site in about a minute. No extra server or monthly fee.
- **WordPress was not chosen** even though the services list mentions it: it needs paid hosting, plugin updates and security patching, which is more than a six-page company site needs.

## 2. Pages built

Home, About Us, Services, The Problem-Solving Experience, ECIC, Contact, Privacy Policy (draft), Terms of Use (draft), 404. Insights and Resources is ready but hidden until the first article is published.

Every page has a unique title and description (blueprint section 14), canonical URL, Open Graph tags, a single H1, and Organization structured data. There's also an XML sitemap and robots.txt. Tested at 1440px and 390px wide with no horizontal overflow and no console errors.

## 3. Forms

- **Contact form:** all fields from blueprint 11.4, with the exact dropdown options and success message. Links such as "Discuss an AI Project" pre-select the right enquiry type.
- **ECIC 2027 interest form:** the nine participation categories (choose one or more), contact details, a description and consent.
- ECIC emails arrive with the subject prefix `[ECIC 2027 Interest]`. Contact emails arrive as `[Website Enquiry: <type>]`. ECIC can go to a separate inbox (`MAIL_TO_ECIC`).
- **Spam protection:** a hidden honeypot field, a too-fast-submission check, a same-origin check and Cloudflare Turnstile (once keys are added). All input is validated and escaped on the server.
- **Until the email service is connected, the endpoint returns "The form is not connected to an inbox yet."** The form shows that error honestly instead of pretending to send.

Recommended setup (needs your go-ahead before any accounts are created):

1. Create a Resend account and verify the sending domain (a few DNS records).
2. In Cloudflare Turnstile, create a widget for the domain to get a site key and a secret key.
3. In the Cloudflare project > Settings > Variables and Secrets, add the variables listed in `.env.example`.
4. Submit both forms on the live site and confirm both emails arrive.

## 4. Content manager (CMS)

1. The CMS points at `Godspower215/edunotech` (set in `public/admin/config.yml`).
2. Go to `https://<domain>/admin` and sign in with a GitHub personal access token (fine-grained, limited to this repo, Contents read/write). For a smoother "Sign in with GitHub" button, deploy the free `sveltia-cms-auth` Cloudflare Worker and set `base_url`.

Editable in the CMS: contact details, logo, socials, homepage copy, all service categories, the DIRES block (off by default), About story, mission, vision and team, ECIC 2026 copy, impact statistics, gallery, announcements, ECIC 2027 copy, and Insights articles.

## 5. Analytics

Cloudflare Web Analytics is wired in. Paste its token into `site.json` and it starts working. It uses no cookies, so no consent banner is needed. It only counts page views.

Buttons and forms carry `data-event` names such as `cta_hero_services`, `contact_form_submit`, `ecic_interest_submit` and `whatsapp_click`. These are sent automatically if Cloudflare Zaraz, Plausible or GA4 is added later. GA4 would need a cookie consent banner.

## 6. What's missing before launch

Done since the first build: logo (transparent PNG, header and footer), favicon cut from the logo mark, email (edunotech.edu@gmail.com), WhatsApp (+234 816 377 6911, which shows a floating button and a link in the contact page and footer), hero photo, ECIC photos (homepage, ECIC header, and an 8-photo gallery picked from the ECIC'26 Drive folder).

| # | Item | Where it goes |
| --- | --- | --- |
| 1 | Name decided 2026-11-17: company "Edunotech", initiative "Edunotech Community Innovation Challenge (ECIC)". Applied site-wide. | Done |
| 3 | **Photo consent.** Some of the people pictured appear to be secondary school students. Confirm that the school, parents or guardians agreed to these photos being published. | Swap or remove photos in CMS > ECIC |
| 4 | Higher-resolution or SVG logo. The supplied PNG is 512px wide, which is fine on screens but soft on large retina displays | `public/images/brand/` |
| 5 | Domain-based email (in progress). Once it's ready, change one value | `site.json` `contact.email` |
| 6 | Business phone. Is it the same as the WhatsApp number? | `site.json` `contact.phone` |
| 7 | Office address, if one should be public (no map is shown without one) | `site.json` `contact.address` |
| 8 | Verified social media links | `site.json` `socials` |
| 9 | Domain name | `SITE_URL` build variable; connect the domain in Cloudflare Pages |
| 10 | Approval to set up Resend and Turnstile. Resend needs a domain to send from, so this waits for the domain | Section 3 above |
| 11 | Verified ECIC 2026 statistics (five figures) | `ecic.json` `stats` |
| 12 | DIRES: confirm whether it should be public, its status, description and screenshots | `services.json` `dires` |
| 13 | Founder approval of the bio, and an optional portrait | `about.json` `team` |
| 14 | Review of the Privacy Policy and Terms of Use, including approval date, data retention period, providers and analytics | `src/pages/privacy.astro`, `terms.astro` |
| 15 | Testimonials and portfolio images, only if approved | Not built yet; nothing invented |

## 7. Judgement calls made during the build (check these)

- **"Explore Our Work"** (homepage final CTA) links to Services, because there is no portfolio page yet.
- **Contact form enquiry types:** the blueprint's dropdown has no option for Digital Communication or Education Management. Those services pre-select "General Enquiry". Innovation pre-selects "Institutional Partnership".
- **Short connecting lines I wrote** that aren't in the blueprint. Edit or remove them if they don't fit:
  - The Problem-Solving Experience page: "Not a technology seminar. Not a coding class...", the framework heading "From a feeling that something could be better, to real impact." and "Students in tertiary institutions, across every discipline."
  - ECIC page: "Building young people who see problems and act on them." and "A three-stage journey."
- **DIRES** is hidden until it's switched on in the CMS. The Education Management section still describes the service area in general terms.
- **The ECIC form consent line** includes "If I am under 18, a parent, guardian or teacher knows I am submitting this form", because ECIC involves secondary school students.
- **On dark backgrounds** (footer), the logo sits on a white tile instead of being recoloured. Supply a white version if you'd prefer it directly on green.
- **The homepage hero photo** is from the ECIC 2026 awards, because the Drive folder only has event photos. The blueprint suggested a learning or technology setting. Swap it when you have one.
- **Photo captions** are generic ("Award presentation, ECIC 2026") because I can't identify the people pictured. Add names in the CMS only with consent.
