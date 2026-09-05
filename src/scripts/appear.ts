const APPEAR_CLASS = /\.appear(?![-\w])/g;
const SPLASH_SELECTOR = [
  '[data-home-loader]',
  '[data-home-content]',
  '[data-s-781552d3-2b09-48aa-8fa4-d3c79fa027fd]',
  '[data-s-fc4fdcb9-b360-481b-af55-a37f302dadf0]',
].join(', ');
const MOTION_PROPERTIES = ['opacity', 'transform', 'translate', 'scale', 'color'] as const;

type MotionSnapshot = {
  from: Keyframe;
  duration: number;
  delay: number;
  easing: string;
};

const snapshots = new WeakMap<HTMLElement, MotionSnapshot>();

function collectAppearSelectors(rules: CSSRuleList, selectors: Set<string>) {
  Array.from(rules).forEach((rule) => {
    if (rule instanceof CSSStyleRule) {
      const hasVisualStart = MOTION_PROPERTIES.some((property) => rule.style.getPropertyValue(property));
      if (!hasVisualStart) return;

      rule.selectorText.split(',').forEach((selector) => {
        if (!APPEAR_CLASS.test(selector)) return;
        APPEAR_CLASS.lastIndex = 0;
        const targetSelector = selector.replace(APPEAR_CLASS, '').trim();
        APPEAR_CLASS.lastIndex = 0;
        if (targetSelector) selectors.add(targetSelector);
      });
      return;
    }

    if ('cssRules' in rule) {
      collectAppearSelectors((rule as CSSGroupingRule).cssRules, selectors);
    }
  });
}

function findMotionTargets(root: ParentNode): HTMLElement[] {
  const selectors = new Set<string>();

  Array.from(document.styleSheets).forEach((sheet) => {
    try {
      collectAppearSelectors(sheet.cssRules, selectors);
    } catch {
      // A future cross-origin stylesheet may block CSSOM access. Local styles continue to work.
    }
  });

  const targets = new Set<HTMLElement>();
  selectors.forEach((selector) => {
    try {
      root.querySelectorAll<HTMLElement>(selector).forEach((element) => targets.add(element));
    } catch {
      // Ignore a malformed selector from the captured STUDIO stylesheet.
    }
  });

  return Array.from(targets).filter((element) => !element.matches(SPLASH_SELECTOR));
}

function firstCssListValue(value: string): string {
  let depth = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === '(') depth += 1;
    if (value[index] === ')') depth = Math.max(0, depth - 1);
    if (value[index] === ',' && depth === 0) return value.slice(0, index).trim();
  }
  return value.trim();
}

function parseCssTime(value: string): number {
  const first = firstCssListValue(value) || '0s';
  const amount = Number.parseFloat(first);
  if (!Number.isFinite(amount)) return 0;
  return first.endsWith('ms') ? amount : amount * 1000;
}

function readFrame(style: CSSStyleDeclaration): Keyframe {
  return Object.fromEntries(
    MOTION_PROPERTIES.map((property) => [property, style.getPropertyValue(property)]),
  );
}

function prepareMotionTargets(root: ParentNode): HTMLElement[] {
  const targets = findMotionTargets(root);
  const targetSet = new Set(targets);

  root.querySelectorAll<HTMLElement>('.appear, .appear-active').forEach((element) => {
    if (element.matches(SPLASH_SELECTOR) || targetSet.has(element)) return;
    element.classList.remove('appear', 'appear-active');
    element.dataset.appearState = 'done';
  });

  targets.forEach((element) => {
    element.classList.remove('appear-active');
    element.classList.add('appear');
    element.dataset.appearState = 'pending';
  });

  // Commit every captured start style before the page becomes visible.
  void document.documentElement.offsetHeight;
  targets.forEach((element) => {
    const style = getComputedStyle(element);
    snapshots.set(element, {
      from: readFrame(style),
      duration: parseCssTime(style.transitionDuration),
      delay: parseCssTime(style.transitionDelay),
      easing: firstCssListValue(style.transitionTimingFunction) || 'ease',
    });
  });

  return targets;
}

function revealImmediately(elements: HTMLElement[]) {
  elements.forEach((element) => {
    element.classList.remove('appear', 'appear-active', 'motion-measuring');
    element.dataset.appearState = 'done';
  });
}

function reveal(element: HTMLElement) {
  if (element.dataset.appearState !== 'pending') return;
  const snapshot = snapshots.get(element);
  element.dataset.appearState = 'running';
  element.classList.add('motion-measuring');
  element.classList.remove('appear', 'appear-active');

  const finalFrame = readFrame(getComputedStyle(element));
  const hasVisibleChange = MOTION_PROPERTIES.some(
    (property) => snapshot?.from[property] !== finalFrame[property],
  );

  if (!snapshot || !hasVisibleChange || snapshot.duration <= 0) {
    revealImmediately([element]);
    return;
  }

  let animation: Animation;
  try {
    animation = element.animate([snapshot.from, finalFrame], {
      duration: snapshot.duration,
      delay: snapshot.delay,
      easing: snapshot.easing,
      fill: 'backwards',
    });
  } catch {
    revealImmediately([element]);
    return;
  } finally {
    element.classList.remove('motion-measuring');
  }

  animation.finished
    .catch(() => undefined)
    .then(() => {
      element.dataset.appearState = 'done';
      snapshots.delete(element);
    });
}

function releaseFirstPaint(onReady?: () => void) {
  requestAnimationFrame(() => {
    document.documentElement.classList.remove('motion-preparing');
    requestAnimationFrame(() => onReady?.());
  });
}

export function initAppear(root: ParentNode = document) {
  const elements = prepareMotionTargets(root);
  if (!elements.length) {
    releaseFirstPaint();
    return;
  }

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reducedMotion || !('IntersectionObserver' in window) || !('animate' in Element.prototype)) {
    revealImmediately(elements);
    releaseFirstPaint();
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

  releaseFirstPaint(() => elements.forEach((element) => observer.observe(element)));
}
