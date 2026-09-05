export function initHomeSplash(root: ParentNode = document) {
  const loader = root.querySelector<HTMLElement>(
    '[data-home-loader], [data-s-781552d3-2b09-48aa-8fa4-d3c79fa027fd]',
  );
  const content = root.querySelector<HTMLElement>(
    '[data-home-content], [data-s-fc4fdcb9-b360-481b-af55-a37f302dadf0]',
  );
  if (!loader || !content) return;

  const finish = () => {
    loader.hidden = true;
    loader.dataset.splashState = 'done';
    loader.classList.remove('appear', 'appear-active');
    content.classList.remove('appear', 'appear-active');
    content.dataset.splashState = 'done';
    content.inert = false;
    content.removeAttribute('inert');
    content.removeAttribute('aria-hidden');
    document.documentElement.classList.remove('home-splash-active');
    document.documentElement.classList.remove('home-splash-pending');
  };

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    finish();
    return;
  }

  document.documentElement.classList.add('home-splash-active');
  loader.dataset.homeLoader = '';
  content.dataset.homeContent = '';
  loader.classList.add('appear');
  content.classList.add('appear');
  loader.hidden = false;
  loader.dataset.splashState = 'running';
  content.dataset.splashState = 'running';
  content.inert = true;
  content.setAttribute('inert', '');
  content.setAttribute('aria-hidden', 'true');

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      loader.classList.add('appear-active');
      content.classList.add('appear-active');
      loader.classList.remove('appear');
      content.classList.remove('appear');
    });
  });

  // Original timing: 1600ms delay + 600/800ms fade, with a small safety margin.
  window.setTimeout(finish, 2500);
  window.setTimeout(finish, 3200);
}
