type AccordionItem = {
  button: HTMLButtonElement;
  content: HTMLElement;
  wrapper: HTMLElement;
  group: Element | null;
  stateNodes: HTMLElement[];
};

const activeAnimations = new WeakMap<HTMLElement, () => void>();

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function setOpenState(item: AccordionItem, open: boolean) {
  item.stateNodes.forEach((node) => node.classList.toggle('_isClose', !open));
  item.wrapper.dataset.accordionState = open ? 'open' : 'closed';
  item.button.setAttribute('aria-expanded', String(open));
  item.content.setAttribute('aria-hidden', String(!open));
  item.content.inert = !open;
  item.content.toggleAttribute('inert', !open);
}

function clearAnimation(content: HTMLElement) {
  activeAnimations.get(content)?.();
  activeAnimations.delete(content);
}

function transitionItem(item: AccordionItem, open: boolean) {
  clearAnimation(item.content);

  if (prefersReducedMotion()) {
    setOpenState(item, open);
    item.content.style.removeProperty('height');
    item.content.style.removeProperty('overflow');
    item.content.style.removeProperty('transition');
    return;
  }

  const startHeight = item.content.getBoundingClientRect().height;
  item.content.style.height = `${startHeight}px`;
  item.content.style.overflow = 'hidden';
  item.content.style.transition = 'none';

  setOpenState(item, open);
  const targetHeight = open ? item.content.scrollHeight : 0;

  // Commit the starting height before restoring the original site's timing.
  void item.content.offsetHeight;
  item.content.style.transition = 'height 300ms cubic-bezier(0.4, 0.4, 0, 1)';
  item.content.style.height = `${targetHeight}px`;

  let timeoutId = 0;
  const finish = () => {
    window.clearTimeout(timeoutId);
    item.content.removeEventListener('transitionend', onTransitionEnd);
    item.content.style.removeProperty('height');
    item.content.style.removeProperty('overflow');
    item.content.style.removeProperty('transition');
    activeAnimations.delete(item.content);
  };
  const onTransitionEnd = (event: TransitionEvent) => {
    if (event.target === item.content && event.propertyName === 'height') finish();
  };

  item.content.addEventListener('transitionend', onTransitionEnd);
  timeoutId = window.setTimeout(finish, 380);
  activeAnimations.set(item.content, finish);
}

export function initAccordions(root: ParentNode = document) {
  const items: AccordionItem[] = [];

  root.querySelectorAll<HTMLButtonElement>('button[id^="studio-toggle-button-"]').forEach((button) => {
    const contentId = button.getAttribute('aria-controls');
    const content = contentId ? document.getElementById(contentId) : null;
    const wrapper = button.parentElement;
    if (!contentId || !content || !wrapper || wrapper.dataset.accordionReady === 'true') return;

    wrapper.dataset.accordionReady = 'true';
    content.setAttribute('aria-labelledby', button.id);

    const stateNodes = Array.from(wrapper.querySelectorAll<HTMLElement>('._isClose'));
    if (!stateNodes.includes(wrapper)) stateNodes.unshift(wrapper);
    if (!stateNodes.includes(button)) stateNodes.push(button);
    if (!stateNodes.includes(content)) stateNodes.push(content);

    const item: AccordionItem = {
      button,
      content,
      wrapper,
      group: button.closest('ul'),
      stateNodes,
    };
    items.push(item);

    const initiallyOpen = button.getAttribute('aria-expanded') === 'true';
    setOpenState(item, initiallyOpen);

    button.addEventListener('click', () => {
      const shouldOpen = button.getAttribute('aria-expanded') !== 'true';
      if (shouldOpen) {
        items
          .filter((candidate) => candidate !== item && candidate.group === item.group)
          .filter((candidate) => candidate.button.getAttribute('aria-expanded') === 'true')
          .forEach((candidate) => transitionItem(candidate, false));
      }
      transitionItem(item, shouldOpen);
    });
  });
}
