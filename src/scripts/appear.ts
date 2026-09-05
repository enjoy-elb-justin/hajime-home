function revealImmediately(elements: HTMLElement[]) {
  elements.forEach((element) => {
    element.classList.remove('appear', 'appear-active');
    element.dataset.appearState = 'done';
  });
}

function reveal(element: HTMLElement) {
  if (element.dataset.appearState === 'done') return;
  element.dataset.appearState = 'running';

  requestAnimationFrame(() => {
    element.classList.add('appear-active');
    element.classList.remove('appear');

    requestAnimationFrame(() => {
      element.classList.remove('appear-active');
      element.dataset.appearState = 'done';
    });
  });
}

export function initAppear(root: ParentNode = document) {
  const elements = Array.from(root.querySelectorAll<HTMLElement>('.appear')).filter(
    (element) =>
      !element.matches(
        '[data-home-loader], [data-home-content], [data-s-781552d3-2b09-48aa-8fa4-d3c79fa027fd], [data-s-fc4fdcb9-b360-481b-af55-a37f302dadf0]',
      ),
  );
  if (!elements.length) return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reducedMotion || !('IntersectionObserver' in window)) {
    revealImmediately(elements);
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        observer.unobserve(entry.target);
        reveal(entry.target as HTMLElement);
      });
    },
    { rootMargin: '0px 0px -5% 0px', threshold: 0.01 },
  );

  elements.forEach((element) => {
    element.dataset.appearState = 'pending';
    observer.observe(element);
  });

  window.setTimeout(() => {
    elements
      .filter((element) => element.dataset.appearState === 'pending' && element.getClientRects().length === 0)
      .forEach((element) => {
        observer.unobserve(element);
        revealImmediately([element]);
      });
  }, 4000);
}
