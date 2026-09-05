const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function initMobileNav(root: ParentNode = document) {
  const modal = root.querySelector<HTMLElement>('#mobile-drawer');
  const drawer = modal?.querySelector<HTMLElement>('.mobile-nav-drawer');
  const closeButton = modal?.querySelector<HTMLButtonElement>('#mobile-drawer-close');
  const openButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('#mobile-drawer-open, button[aria-controls="mobile-drawer"]'));
  const siteRoot = document.getElementById('__site-root');
  if (!modal || !drawer || !closeButton || !siteRoot || !openButtons.length) return;

  let activeOpener: HTMLButtonElement | null = null;
  let previousOverflow = '';
  let closeTimer = 0;

  const setExpanded = (expanded: boolean) => {
    openButtons.forEach((button) => button.setAttribute('aria-expanded', String(expanded)));
  };

  const completeClose = (restoreFocus = true) => {
    window.clearTimeout(closeTimer);
    modal.hidden = true;
    modal.dataset.state = 'closed';
    siteRoot.inert = false;
    document.body.style.overflow = previousOverflow;
    setExpanded(false);
    if (restoreFocus) activeOpener?.focus();
    activeOpener = null;
  };

  const close = (restoreFocus = true) => {
    if (modal.hidden || modal.dataset.state === 'closing') return;
    modal.dataset.state = 'closing';
    closeTimer = window.setTimeout(() => completeClose(restoreFocus), 430);
  };

  const open = (opener: HTMLButtonElement) => {
    window.clearTimeout(closeTimer);
    activeOpener = opener;
    previousOverflow = document.body.style.overflow;
    modal.hidden = false;
    modal.dataset.state = 'opening';
    siteRoot.inert = true;
    document.body.style.overflow = 'hidden';
    setExpanded(true);

    requestAnimationFrame(() => {
      modal.dataset.state = 'open';
      closeButton.focus();
    });
  };

  openButtons.forEach((button) => button.addEventListener('click', () => open(button)));
  closeButton.addEventListener('click', () => close());
  modal.addEventListener('click', (event) => {
    if (event.target === modal) close();
  });
  modal.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((link) => {
    link.addEventListener('click', () => completeClose(false));
  });

  document.addEventListener('keydown', (event) => {
    if (modal.hidden) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== 'Tab') return;

    const focusable = Array.from(modal.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (element) => !element.hidden && element.getClientRects().length > 0,
    );
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  const desktopMedia = window.matchMedia('(min-width: 1061px)');
  desktopMedia.addEventListener('change', (event) => {
    if (event.matches && !modal.hidden) completeClose(false);
  });
}
