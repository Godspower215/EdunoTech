// The dashboard page and script, served by the Worker only after the
// Cloudflare Access check passes. Plain HTML/JS, no build step, no libraries.
// All submission data is written with textContent, never as HTML.

export const DASHBOARD_HTML = `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Submissions · Edunotech</title>
<link rel="icon" href="/favicon-48.png" type="image/png">
<style>
  :root {
    --forest: #123b2a; --forest-2: #0d2d20; --emerald: #16834a; --lime: #b7d957;
    --bg: #f5f7f4; --card: #ffffff; --ink: #14231b; --muted: #5b6b62; --line: #dfe6e0;
    --new-bg: #e8f5ec; --new-ink: #0f6a3a; --done-bg: #eef0ee; --done-ink: #5b6b62; --danger: #b42318;
  }
  * { box-sizing: border-box; }
  body { margin: 0; font: 15px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; background: var(--bg); color: var(--ink); }
  button, input, select { font: inherit; }
  a { color: var(--emerald); }
  .top { background: var(--forest); color: #fff; }
  .top .wrap { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .75rem; padding-block: .9rem; }
  .top h1 { font-size: 1.1rem; margin: 0; font-weight: 750; }
  .top h1 span { color: var(--lime); }
  .top .who { font-size: .88rem; opacity: .9; display: flex; gap: 1rem; align-items: center; flex-wrap: wrap; }
  .top a { color: #fff; }
  .top .out { margin: 0; }
  .top .out button { background: none; border: 0; color: #fff; text-decoration: underline; cursor: pointer; padding: 0; font-size: inherit; }
  .wrap { max-width: 1200px; margin: 0 auto; padding-inline: 16px; }
  main { padding-block: 1.25rem 3rem; }
  .tabs { display: flex; gap: .5rem; flex-wrap: wrap; margin-bottom: 1rem; }
  .tab { border: 1px solid var(--line); background: var(--card); color: var(--ink); border-radius: 999px; padding: .45rem .9rem; cursor: pointer; display: inline-flex; gap: .45rem; align-items: center; }
  .tab[aria-pressed="true"] { background: var(--forest); border-color: var(--forest); color: #fff; }
  .tab .n { font-size: .8rem; opacity: .75; }
  .tab .fresh { background: var(--lime); color: var(--forest); border-radius: 999px; font-size: .72rem; font-weight: 700; padding: 0 .45rem; }
  .filters { display: grid; gap: .6rem; grid-template-columns: 1fr; background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: .8rem; margin-bottom: 1rem; }
  @media (min-width: 820px) { .filters { grid-template-columns: 2fr 1fr 1fr 1fr auto; align-items: end; } }
  .filters label { display: grid; gap: .2rem; font-size: .78rem; font-weight: 650; color: var(--muted); }
  .filters input, .filters select { border: 1px solid var(--line); border-radius: 8px; padding: .5rem .6rem; background: #fff; color: var(--ink); min-width: 0; width: 100%; }
  .btn { border: 0; border-radius: 8px; padding: .55rem .9rem; cursor: pointer; font-weight: 650; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; gap: .35rem; }
  .btn-primary { background: var(--emerald); color: #fff; }
  .btn-primary:hover { background: var(--forest); }
  .btn-ghost { background: transparent; border: 1px solid var(--line); color: var(--ink); }
  .btn-ghost:hover { border-color: var(--emerald); }
  .btn-danger { background: transparent; border: 1px solid #f1c6c2; color: var(--danger); }
  .summary { color: var(--muted); font-size: .88rem; margin: 0 0 .6rem; }
  .list { display: grid; gap: .5rem; }
  .item { background: var(--card); border: 1px solid var(--line); border-radius: 12px; overflow: hidden; }
  .item.is-new { border-left: 4px solid var(--emerald); }
  .row { display: grid; grid-template-columns: 1fr; gap: .25rem .9rem; padding: .75rem .9rem; cursor: pointer; width: 100%; text-align: left; background: none; border: 0; color: inherit; }
  @media (min-width: 820px) { .row { grid-template-columns: 9.5rem 7rem 1.3fr 1.6fr 6rem; align-items: center; } }
  .row:hover { background: #fafcfa; }
  .date { color: var(--muted); font-size: .85rem; font-variant-numeric: tabular-nums; }
  .who-cell strong { display: block; overflow-wrap: anywhere; }
  .who-cell span { color: var(--muted); font-size: .85rem; overflow-wrap: anywhere; }
  .what { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ink); }
  .what small { color: var(--muted); }
  .pill { display: inline-block; font-size: .75rem; font-weight: 700; border-radius: 999px; padding: .1rem .55rem; white-space: nowrap; justify-self: start; }
  .cat-newsletter { background: #fdf3d7; color: #7a5a00; }
  .cat-inquiry { background: #e3eefc; color: #1d4f91; }
  .cat-partnership { background: #efe6fb; color: #5b2f99; }
  .cat-ecic { background: #e7f6d5; color: #3f6212; }
  .st-new { background: var(--new-bg); color: var(--new-ink); }
  .st-handled { background: var(--done-bg); color: var(--done-ink); }
  .detail { border-top: 1px solid var(--line); padding: .9rem; display: grid; gap: .8rem; background: #fcfdfc; }
  .detail dl { display: grid; grid-template-columns: 8.5rem 1fr; gap: .3rem .8rem; margin: 0; }
  .detail dt { color: var(--muted); font-size: .85rem; }
  .detail dd { margin: 0; overflow-wrap: anywhere; }
  .msg { white-space: pre-wrap; background: #fff; border: 1px solid var(--line); border-radius: 8px; padding: .75rem; margin: 0; overflow-wrap: anywhere; }
  .actions { display: flex; flex-wrap: wrap; gap: .5rem; }
  .pager { display: flex; gap: .5rem; align-items: center; justify-content: center; margin-top: 1rem; color: var(--muted); font-size: .9rem; }
  .empty, .error { background: var(--card); border: 1px dashed var(--line); border-radius: 12px; padding: 2rem 1rem; text-align: center; color: var(--muted); }
  .error { color: var(--danger); border-color: #f1c6c2; }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  :focus-visible { outline: 3px solid rgba(22,131,74,.45); outline-offset: 2px; }
</style>
</head>
<body>
<header class="top"><div class="wrap">
  <h1>Edunotech <span>Submissions</span></h1>
  <div class="who"><span id="me"></span><a href="/">View website</a><form method="post" action="/dashboard/logout" class="out"><button type="submit">Sign out</button></form></div>
</div></header>
<main class="wrap">
  <div class="tabs" id="tabs" role="group" aria-label="Category"></div>
  <form class="filters" id="filters">
    <label>Search<input type="search" name="q" placeholder="Name, email, organisation, message…" maxlength="100"></label>
    <label>Status<select name="status"><option value="">All</option><option value="new">New</option><option value="handled">Handled</option></select></label>
    <label>From<input type="date" name="from"></label>
    <label>To<input type="date" name="to"></label>
    <a class="btn btn-primary" id="export" href="/dashboard/api/export.csv">Download CSV</a>
  </form>
  <p class="summary" id="summary" aria-live="polite"></p>
  <div class="list" id="list"></div>
  <nav class="pager" id="pager" aria-label="Pages"></nav>
</main>
<script src="/dashboard/app.js" defer></script>
</body>
</html>`;

export const DASHBOARD_JS = `(() => {
  const LABELS = { newsletter: 'Newsletter', inquiry: 'Inquiry', partnership: 'Partnership', ecic: 'ECIC' };
  const ORDER = ['', 'newsletter', 'inquiry', 'partnership', 'ecic'];
  const state = { category: '', status: '', q: '', from: '', to: '', page: 1 };
  const $ = (id) => document.getElementById(id);
  const form = $('filters');

  // Restore filters from the address bar so a refresh keeps your place.
  const p = new URLSearchParams(location.search);
  for (const k of Object.keys(state)) if (p.has(k)) state[k] = k === 'page' ? Number(p.get(k)) || 1 : p.get(k);
  for (const k of ['q', 'status', 'from', 'to']) form.elements[k].value = state[k];

  const el = (tag, attrs, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'class') n.className = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v);
    }
    for (const c of kids) if (c != null && c !== false) n.append(c);
    return n;
  };

  const query = (extra) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...state, ...extra })) if (v && !(k === 'page' && v === 1)) q.set(k, v);
    return q;
  };

  const fmtDate = (iso) => {
    const d = new Date(iso);
    return isNaN(d) ? iso : d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  async function api(path, opts) {
    const r = await fetch(path, { credentials: 'same-origin', ...opts, headers: { 'X-Requested-With': 'dashboard', 'Content-Type': 'application/json', ...(opts && opts.headers) } });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.ok) throw new Error(data.error || 'Request failed (' + r.status + ').');
    return data;
  }

  function renderTabs(counts) {
    const by = {}; let all = 0, allFresh = 0;
    for (const c of counts) { by[c.category] = c; all += c.n; allFresh += c.fresh || 0; }
    const tabs = $('tabs'); tabs.replaceChildren();
    for (const cat of ORDER) {
      const n = cat ? (by[cat] ? by[cat].n : 0) : all;
      const fresh = cat ? (by[cat] ? by[cat].fresh || 0 : 0) : allFresh;
      tabs.append(el('button', { type: 'button', class: 'tab', 'aria-pressed': String(state.category === cat), onclick: () => { state.category = cat; state.page = 1; load(); } },
        cat ? LABELS[cat] : 'All', el('span', { class: 'n' }, String(n)), fresh ? el('span', { class: 'fresh', title: 'New' }, fresh + ' new') : null));
    }
  }

  function detail(r, item) {
    const rows = [
      ['Received', fmtDate(r.created_at)],
      ['Category', LABELS[r.category] || r.category],
      ['Form', r.form],
      r.topic && [r.category === 'ecic' && r.form === 'ECIC interest' ? 'Interested in' : 'Type', r.topic],
      ['Name', r.name || '(not given)'],
      ['Email', el('a', { href: 'mailto:' + r.email }, r.email)],
      r.phone && ['Phone', el('a', { href: 'tel:' + r.phone.replace(/[^0-9+]/g, '') }, r.phone)],
      r.organisation && ['Organisation', r.organisation],
      r.subject && ['Subject', r.subject],
      ['Consent given', r.consent ? 'Yes' : 'No'],
    ].filter(Boolean);
    const dl = el('dl');
    for (const [k, v] of rows) dl.append(el('dt', null, k), el('dd', null, v));
    const statusBtn = el('button', { type: 'button', class: 'btn btn-ghost', onclick: async () => {
      statusBtn.disabled = true;
      try { await api('/dashboard/api/submissions/' + r.id, { method: 'PATCH', body: JSON.stringify({ status: r.status === 'new' ? 'handled' : 'new' }) }); load(r.id); }
      catch (e) { alert(e.message); statusBtn.disabled = false; }
    } }, r.status === 'new' ? 'Mark as handled' : 'Mark as new');
    const reply = el('a', { class: 'btn btn-primary', href: 'mailto:' + r.email + '?subject=' + encodeURIComponent('Re: ' + (r.subject || 'Your message to Edunotech')) }, 'Reply by email');
    const del = el('button', { type: 'button', class: 'btn btn-danger', onclick: async () => {
      if (!confirm('Permanently delete this submission from ' + (r.name || r.email) + '? This cannot be undone.')) return;
      try { await api('/dashboard/api/submissions/' + r.id, { method: 'DELETE' }); load(); } catch (e) { alert(e.message); }
    } }, 'Delete');
    return el('div', { class: 'detail', id: 'd' + r.id }, dl, r.message ? el('p', { class: 'msg' }, r.message) : null, el('div', { class: 'actions' }, reply, statusBtn, del));
  }

  function renderList(data, openId) {
    const list = $('list'); list.replaceChildren();
    const from = data.total ? (data.page - 1) * data.pageSize + 1 : 0;
    const to = Math.min(data.total, data.page * data.pageSize);
    $('summary').textContent = data.total ? 'Showing ' + from + ' to ' + to + ' of ' + data.total : '';
    if (!data.rows.length) { list.append(el('div', { class: 'empty' }, 'No submissions match these filters yet.')); return; }
    for (const r of data.rows) {
      const item = el('article', { class: 'item' + (r.status === 'new' ? ' is-new' : '') });
      const what = r.category === 'newsletter' ? 'Newsletter signup' : (r.subject || r.topic || r.message);
      const row = el('button', { type: 'button', class: 'row', 'aria-expanded': 'false', 'aria-controls': 'd' + r.id },
        el('span', { class: 'date' }, fmtDate(r.created_at)),
        el('span', { class: 'pill cat-' + r.category }, LABELS[r.category] || r.category),
        el('span', { class: 'who-cell' }, el('strong', null, r.name || r.email), r.name ? el('span', null, r.email) : null),
        el('span', { class: 'what' }, what, r.topic && r.subject ? el('small', null, ' · ' + r.topic) : null),
        el('span', { class: 'pill st-' + r.status }, r.status === 'new' ? 'New' : 'Handled'));
      let open = null;
      const toggle = () => {
        if (open) { open.remove(); open = null; row.setAttribute('aria-expanded', 'false'); return; }
        open = detail(r, item); item.append(open); row.setAttribute('aria-expanded', 'true');
      };
      row.addEventListener('click', toggle);
      item.append(row);
      list.append(item);
      if (openId === r.id) toggle();
    }
    const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
    const pager = $('pager'); pager.replaceChildren();
    if (pages > 1) {
      const go = (n) => () => { state.page = n; load(); scrollTo(0, 0); };
      pager.append(
        el('button', { type: 'button', class: 'btn btn-ghost', onclick: go(data.page - 1), ...(data.page <= 1 ? { disabled: '' } : {}) }, 'Previous'),
        el('span', null, 'Page ' + data.page + ' of ' + pages),
        el('button', { type: 'button', class: 'btn btn-ghost', onclick: go(data.page + 1), ...(data.page >= pages ? { disabled: '' } : {}) }, 'Next'));
    }
  }

  let seq = 0;
  async function load(openId) {
    const mine = ++seq;
    const q = query();
    history.replaceState(null, '', q.toString() ? '?' + q : location.pathname);
    const ex = query({ page: 1 }); ex.delete('page');
    $('export').href = '/dashboard/api/export.csv' + (ex.toString() ? '?' + ex : '');
    try {
      const data = await api('/dashboard/api/submissions?' + q, { method: 'GET' });
      if (mine !== seq) return;
      if (data.email) $('me').textContent = data.email;
      renderTabs(data.counts);
      renderList(data, openId);
    } catch (e) {
      if (mine !== seq) return;
      $('list').replaceChildren(el('div', { class: 'error' }, e.message));
      $('summary').textContent = '';
    }
  }

  let t;
  form.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(() => {
      for (const k of ['q', 'status', 'from', 'to']) state[k] = form.elements[k].value;
      state.page = 1; load();
    }, 250);
  });
  form.addEventListener('submit', (e) => e.preventDefault());
  load();
})();
`;
