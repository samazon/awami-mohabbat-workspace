/**
 * Browser behaviour shared by the admin's printable card pages (press card,
 * business card):
 *
 *   - inputs marked data-field="k" mirror into every [data-out="k"] as you
 *     type (textContent only — typed text is never parsed as HTML); date
 *     inputs show as dd/mm/yyyy
 *   - "Changes not saved yet" and a leave-page warning while edits are unsaved
 *   - the "saved" note fades and ?saved=1 leaves the address bar
 *   - Print, and Download PDF: each card side rendered at 600 dpi onto its own
 *     page of exactly the card's size. Made in the browser; the libraries load
 *     only when asked for.
 */

export interface CardPageOptions {
  /** Card size in mm, as printed (landscape when width > height). */
  widthMm: number;
  heightMm: number;
  /** Selector for the card sides, in page order. */
  sides: string;
  /** File name without extension; slugified before saving. */
  fileName: () => string;
  dpi?: number;
}

const fmtDate = (v: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
};

export function initCardPage(o: CardPageOptions) {
  const outs = (key: string) => document.querySelectorAll<HTMLElement>(`[data-out="${key}"]`);
  const dirty = document.querySelector<HTMLElement>('[data-dirty]');
  const initial = new Map<HTMLInputElement, string>();
  const markDirty = () => {
    if (dirty) dirty.hidden = ![...initial].some(([el, v]) => el.value !== v);
  };
  document.querySelectorAll<HTMLInputElement>('input[data-field]').forEach((input) => {
    initial.set(input, input.value);
    input.addEventListener('input', () => {
      const shown = input.type === 'date' ? fmtDate(input.value) : input.value.trim();
      outs(input.dataset.field!).forEach((el) => (el.textContent = shown));
      markDirty();
    });
  });
  window.addEventListener('beforeunload', (e) => {
    if (dirty && !dirty.hidden) e.preventDefault();
  });
  document.querySelector('[data-card-form]')?.addEventListener('submit', () => {
    if (dirty) dirty.hidden = true;
  });

  const savedAlert = document.querySelector<HTMLElement>('[data-saved-alert]');
  if (savedAlert) {
    history.replaceState(null, '', location.pathname);
    setTimeout(() => {
      savedAlert.classList.add('is-leaving');
      savedAlert.addEventListener('transitionend', () => savedAlert.remove(), { once: true });
    }, 3500);
  }

  document.querySelector('[data-print]')?.addEventListener('click', async () => {
    await document.fonts.ready; // print only once the card's fonts are in
    window.print();
  });

  const dpi = o.dpi ?? 600;
  const orientation = o.widthMm > o.heightMm ? 'landscape' : 'portrait';
  const download = document.querySelector<HTMLButtonElement>('[data-download]');
  const status = document.querySelector<HTMLElement>('[data-status]');
  download?.addEventListener('click', async () => {
    if (download.disabled) return;
    download.disabled = true;
    if (status) status.textContent = 'Preparing PDF…';
    try {
      const [{ domToCanvas }, { jsPDF }] = await Promise.all([import('modern-screenshot'), import('jspdf')]);
      await document.fonts.ready;
      const title = o.fileName();
      const pdf = new jsPDF({ unit: 'mm', format: [o.widthMm, o.heightMm], orientation, compress: true });
      pdf.setProperties({ title, creator: 'Awami Mohabbat admin' });
      for (const [i, side] of [...document.querySelectorAll<HTMLElement>(o.sides)].entries()) {
        // Layout size (offset* ignore the preview's CSS zoom; the bounding rect doesn't).
        const cssW = side.offsetWidth;
        const canvas = await domToCanvas(side, {
          width: cssW,
          height: side.offsetHeight,
          scale: ((o.widthMm / 25.4) * dpi) / cssW,
          backgroundColor: '#ffffff',
          // Full bleed: square corners, no preview shadow.
          style: { borderRadius: '0', boxShadow: 'none', zoom: '1' },
        });
        if (i > 0) pdf.addPage([o.widthMm, o.heightMm], orientation);
        pdf.addImage(canvas, 'PNG', 0, 0, o.widthMm, o.heightMm, undefined, 'FAST');
      }
      const name = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      pdf.save(`${name || 'card'}.pdf`);
      if (status) status.textContent = '';
    } catch (err) {
      console.error('card pdf failed', err);
      if (status) status.textContent = 'The PDF could not be made. Try again, or use Print.';
    } finally {
      download.disabled = false;
    }
  });
}
