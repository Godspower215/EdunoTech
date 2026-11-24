// Progressive enhancement for every <form data-form>. Validates on the client,
// posts JSON to the form's action (/api/submit), and shows a clear result.
// The server re-validates everything; this is only for a better experience.

type Status = 'success' | 'error';

const messages: Record<string, string> = {
  valueMissing: 'This field is required.',
  typeMismatch: 'Please enter a valid email address.',
  tooShort: 'This is a little short. Please add more detail.',
  tooLong: 'This is too long.',
  patternMismatch: 'Please check the format.',
};

function fieldError(el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement) {
  const v = el.validity;
  if (v.valid) return '';
  if (el.type === 'checkbox' && v.valueMissing) return el.dataset.requiredMsg || 'Please tick this box to continue.';
  for (const k of Object.keys(messages)) if ((v as any)[k]) return messages[k];
  return 'Please check this field.';
}

function showError(el: HTMLElement, msg: string) {
  const id = el.getAttribute('aria-describedby')?.split(' ').find((x) => x.endsWith('-error'));
  const out = id ? document.getElementById(id) : null;
  if (out) out.textContent = msg;
  el.setAttribute('aria-invalid', msg ? 'true' : 'false');
}

function validateGroup(group: HTMLElement) {
  const boxes = group.querySelectorAll<HTMLInputElement>('input[type=checkbox]');
  const ok = Array.from(boxes).some((b) => b.checked);
  const out = group.querySelector<HTMLElement>('.field-error');
  if (out) out.textContent = ok ? '' : group.dataset.requiredMsg || 'Please choose at least one option.';
  return ok;
}

function setStatus(form: HTMLFormElement, kind: Status, msg: string) {
  const box = form.querySelector<HTMLElement>('[data-form-status]');
  if (!box) return;
  box.className = `form-status form-status--${kind}`;
  box.textContent = msg;
  box.focus();
}

function track(name: string) {
  const w = window as any;
  try { w.zaraz?.track?.(name); w.plausible?.(name); w.gtag?.('event', name); } catch {}
}

function resetTurnstile(form: HTMLFormElement) {
  const box = form.querySelector('.cf-turnstile');
  try { if (box) (window as any).turnstile?.reset?.(box); } catch {}
}

export function initForms() {
  document.querySelectorAll<HTMLFormElement>('form[data-form]').forEach((form) => {
    if (form.dataset.bound) return;
    form.dataset.bound = '1';
    form.setAttribute('novalidate', '');
    const startedAt = Date.now();
    const fields = form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input:not([type=hidden]):not(.hp input), select, textarea');

    fields.forEach((el) => {
      el.addEventListener('blur', () => { if (el.closest('[data-required-group]')) return; showError(el, fieldError(el)); });
      el.addEventListener('input', () => { if (el.getAttribute('aria-invalid') === 'true') showError(el, fieldError(el)); });
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      let firstBad: HTMLElement | null = null;
      fields.forEach((el) => {
        if (el.closest('[data-required-group]')) return;
        const msg = fieldError(el);
        showError(el, msg);
        if (msg && !firstBad) firstBad = el;
      });
      form.querySelectorAll<HTMLElement>('[data-required-group]').forEach((g) => {
        if (!validateGroup(g) && !firstBad) firstBad = g.querySelector('input');
      });
      if (firstBad) { (firstBad as HTMLElement).focus(); return; }

      const btn = form.querySelector<HTMLButtonElement>('button[type=submit]');
      const label = btn?.textContent;
      if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }

      const fd = new FormData(form);
      const payload: Record<string, unknown> = { elapsedMs: Date.now() - startedAt };
      for (const [k, v] of fd.entries()) {
        if (k in payload) payload[k] = ([] as unknown[]).concat(payload[k], v);
        else payload[k] = v;
      }
      // Multi-select checkboxes always send an array.
      form.querySelectorAll<HTMLElement>('[data-required-group]').forEach((g) => {
        const name = g.querySelector<HTMLInputElement>('input[type=checkbox]')?.name;
        if (name) payload[name] = fd.getAll(name);
      });

      try {
        const res = await fetch(form.action, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) throw new Error(data.error || 'We could not send your message.');
        form.reset();
        resetTurnstile(form);
        setStatus(form, 'success', form.dataset.success || 'Thank you. Your message has been received.');
        track(form.dataset.event || 'form_submit');
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Something went wrong.';
        setStatus(form, 'error', `${msg} Please try again in a moment.`);
        resetTurnstile(form);
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = label ?? 'Send'; }
      }
    });
  });

  // Pre-select the enquiry type from ?enquiry=… links across the site.
  const preset = new URLSearchParams(location.search).get('enquiry');
  if (preset) {
    const sel = document.querySelector<HTMLSelectElement>('select[name=enquiryType]');
    if (sel && Array.from(sel.options).some((o) => o.value === preset)) sel.value = preset;
  }
}
