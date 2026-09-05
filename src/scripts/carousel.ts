const SLIDE_SELECTOR = '[data-s-8547a618-0363-45a8-98c7-11b6a695804c]';
const TRANSITION_MS = 1600;
const AUTOPLAY_MS = 5200;

export function initCarousels(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>('[data-type="carousel"]').forEach((carousel) => {
    if (carousel.dataset.carouselReady === 'true') return;
    const slides = Array.from(carousel.querySelectorAll<HTMLElement>(`:scope > ${SLIDE_SELECTOR}`));
    const previousButton = carousel.querySelector<HTMLButtonElement>('button[aria-label="Prev Slide"]');
    const nextButton = carousel.querySelector<HTMLButtonElement>('button[aria-label="Next Slide"]');
    if (slides.length < 3 || !previousButton || !nextButton) return;

    carousel.dataset.carouselReady = 'true';
    carousel.setAttribute('role', 'region');
    carousel.setAttribute('aria-label', 'お客様の声');

    const controls = previousButton.parentElement;
    controls?.querySelectorAll<HTMLElement>('.__ariaHidden').forEach((node) => node.classList.remove('__ariaHidden'));
    controls?.classList.remove('__ariaHidden');
    previousButton.classList.remove('__ariaHidden');
    nextButton.classList.remove('__ariaHidden');

    let index = slides.findIndex((slide) => !slide.classList.contains('__ariaHidden'));
    if (index < 0) index = Math.floor(slides.length / 2);
    let animating = false;
    let pausedByPointer = false;
    let pausedByFocus = false;
    let autoplayTimer = 0;
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

    const updateAccessibility = () => {
      slides.forEach((slide, slideIndex) => {
        const current = slideIndex === index;
        slide.setAttribute('aria-hidden', String(!current));
        slide.inert = !current;
        slide.classList.toggle('__ariaHidden', !current);
      });
      carousel.dataset.carouselIndex = String(index);
    };

    const applyPosition = (animate: boolean) => {
      slides.forEach((slide) => {
        slide.style.transitionProperty = 'transform';
        slide.style.transitionDuration = animate && !motionQuery.matches ? `${TRANSITION_MS}ms` : '0ms';
        slide.style.transitionTimingFunction = 'cubic-bezier(0.16, 0.57, 0.05, 1)';
        slide.style.transform = `translate3d(${-100 * index}%, 0, 0)`;
      });
      updateAccessibility();
    };

    const scheduleAutoplay = () => {
      window.clearTimeout(autoplayTimer);
      if (motionQuery.matches || pausedByPointer || pausedByFocus || document.hidden) return;
      autoplayTimer = window.setTimeout(() => move(1), AUTOPLAY_MS);
    };

    const normalize = () => {
      if (index === slides.length - 1) index = Math.floor(slides.length / 2);
      if (index === 0) index = Math.floor(slides.length / 2);
      applyPosition(false);
      animating = false;
      scheduleAutoplay();
    };

    const move = (direction: -1 | 1) => {
      if (animating) return;
      animating = true;
      index += direction;
      applyPosition(true);

      const duration = motionQuery.matches ? 0 : TRANSITION_MS;
      window.setTimeout(normalize, duration + 40);
    };

    previousButton.addEventListener('click', () => move(-1));
    nextButton.addEventListener('click', () => move(1));
    carousel.addEventListener('pointerenter', () => {
      pausedByPointer = true;
      scheduleAutoplay();
    });
    carousel.addEventListener('pointerleave', () => {
      pausedByPointer = false;
      scheduleAutoplay();
    });
    carousel.addEventListener('focusin', () => {
      pausedByFocus = true;
      scheduleAutoplay();
    });
    carousel.addEventListener('focusout', (event) => {
      if (event.relatedTarget instanceof Node && carousel.contains(event.relatedTarget)) return;
      pausedByFocus = false;
      scheduleAutoplay();
    });
    document.addEventListener('visibilitychange', scheduleAutoplay);
    motionQuery.addEventListener('change', () => {
      applyPosition(false);
      scheduleAutoplay();
    });

    applyPosition(false);
    scheduleAutoplay();
  });
}
