/** Optional entrance effects. Natural styles always remain visible. */
export function initReveals() {
  const main = document.querySelector('main');
  if (!main || !window.IntersectionObserver || !Element.prototype.animate) return () => {};

  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const records = new Map();
  const seen = new WeakSet();
  const active = new Map();
  let observer;
  let lastY = window.scrollY;
  const startedAt = performance.now();
  let sampleStart = startedAt;
  let sampleDistance = 0;
  let skipUntil = 0;
  const playIntro = startedAt < 900 && window.scrollY < 2 && !window.location.hash && !document.hidden;

  function add(selector, kind = 'text', delay = 0) {
    main.querySelectorAll(selector).forEach(element => {
      records.set(element, {element, kind, delay});
    });
  }
  add('#hero-title');
  add('.hero-actions > a', 'action', 70);
  add('.bed-photo', 'image');
  add('.collection-copy > .eyebrow, .collection-copy > h2');
  add('.collection-copy > p', 'text', 60);
  add('.collection-link', 'action', 110);
  add('#beds-title, #mattresses-title, #delivery-title, .faq > h2, .consultation > h2');
  add('#mattresses .section-subtitle', 'text', 60);
  add('#bed-grid', 'bed-list');
  add('#mattress-grid > .product-card', 'card');
  add('.delivery-porter', 'image', 60);
  add('.faq > details', 'row', 50);
  add('.consultation > p', 'text', 60);
  add('.consultation > .button', 'action', 110);
  add('.consultation > .contact-lines', 'text', 120);

  function mark(element) {
    seen.add(element);
    element.dataset.revealState = 'done';
    observer?.unobserve(element);
  }

  function finish(element) {
    const animation = active.get(element);
    active.delete(element);
    animation?.cancel();
    element.dataset.revealState = 'done';
  }

  function animate(element, kind, delay) {
    const image = kind === 'image';
    const distance = kind === 'action' || kind === 'row' ? 14 : 20;
    const from = image ? {opacity: 0} : {opacity: 0, translate: `0 ${distance}px`};
    const to = image ? {opacity: 1} : {opacity: 1, translate: '0 0'};
    try {
      // Individual translate composes with the existing card hover transform.
      const animation = element.animate([from, to], {
        duration: kind === 'action' ? 520 : 650,
        delay: Math.min(delay, 140),
        easing: 'cubic-bezier(.22,.75,.24,1)',
        fill: 'backwards'
      });
      active.set(element, animation);
      element.dataset.revealState = 'running';
      const release = () => {
        if (active.get(element) === animation) finish(element);
      };
      animation.finished.then(release, release);
    } catch {
      finish(element);
    }
  }

  function enter(record, play, delay = record.delay) {
    const {element, kind} = record;
    if (seen.has(element)) return;
    mark(element);
    if (kind === 'bed-list') {
      const cards = Array.from(element.children);
      // Mark the entire original set first. Recycled or newly scrolled-in
      // cards remain visible and never start another entrance animation.
      cards.forEach(mark);
      if (!play) return;
      const bounds = element.getBoundingClientRect();
      cards.filter(card => {
        const rect = card.getBoundingClientRect();
        return rect.right > bounds.left + 1 && rect.left < bounds.right - 1;
      }).sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left)
        .forEach((card, index) => animate(card, 'card', Math.min(index, 2) * 70));
    } else if (play) animate(element, kind, delay);
  }

  function finishActive() {
    Array.from(active.keys()).forEach(finish);
  }

  function settleAll() {
    records.forEach(record => enter(record, false));
    finishActive();
  }

  function onScroll() {
    const now = performance.now();
    const distance = Math.abs(window.scrollY - lastY);
    if (now - sampleStart > 120) {
      sampleStart = now;
      sampleDistance = 0;
    }
    sampleDistance += distance;
    // A normal wheel notch can be fast within one frame. Cancel only when
    // a substantial part of the viewport is passed in a short gesture.
    if (sampleDistance > window.innerHeight * .75 || distance > window.innerHeight * .85) {
      skipUntil = now + 220;
      finishActive();
    }
    lastY = window.scrollY;
  }

  function onInteraction(event) {
    const target = event.target;
    if (!target) return;
    records.forEach(record => {
      if (record.element === target || record.element.contains(target)) enter(record, false);
    });
    Array.from(active.keys()).forEach(element => {
      if (element === target || element.contains(target)) finish(element);
    });
  }

  function revealAnchor() {
    skipUntil = performance.now() + 900;
    finishActive();
    let anchor;
    try {
      anchor = document.getElementById(decodeURIComponent(window.location.hash.slice(1)));
    } catch { return; }
    if (anchor) records.forEach(record => {
      if (anchor === record.element || anchor.contains(record.element)) enter(record, false);
    });
  }

  function onLink(event) {
    if (event.target.closest?.('a[href^="#"]')) {
      skipUntil = performance.now() + 900;
      finishActive();
    }
  }

  function onVisibility() {
    if (document.hidden) finishActive();
  }

  function onMotion(event) {
    if (event.matches) {
      observer?.disconnect();
      settleAll();
    }
  }

  function dispose() {
    observer?.disconnect();
    settleAll();
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('hashchange', revealAnchor);
    document.removeEventListener('click', onLink, true);
    document.removeEventListener('focusin', onInteraction);
    document.removeEventListener('pointerdown', onInteraction, true);
    document.removeEventListener('visibilitychange', onVisibility);
    motion.removeEventListener?.('change', onMotion);
  }

  if (motion.matches) {
    settleAll();
    return () => {};
  }

  try {
    observer = new IntersectionObserver(entries => {
      const counts = new Map();
      entries.filter(entry => entry.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top || a.boundingClientRect.left - b.boundingClientRect.left)
        .forEach(entry => {
          const record = records.get(entry.target);
          if (!record || seen.has(record.element)) return;
          const grouped = record.kind === 'card' || record.kind === 'row';
          const count = counts.get(record.kind) || 0;
          if (grouped) counts.set(record.kind, count + 1);
          const delay = grouped ? Math.min(record.delay + count * 70, 140) : record.delay;
          enter(record, !motion.matches && !document.hidden && performance.now() >= skipUntil, delay);
        });
    }, {rootMargin: '0px 0px -32px', threshold: .06});

    records.forEach(record => {
      const bounds = record.element.getBoundingClientRect();
      // A fresh top-of-page visit gets a short hero introduction. Restored
      // positions, late initialization and section links stay readable.
      if (bounds.top < window.innerHeight) {
        const intro = playIntro && bounds.bottom > 0 && !!record.element.closest('.hero');
        enter(record, intro);
      }
      else {
        record.element.dataset.revealState = 'pending';
        observer.observe(record.element);
      }
    });
    window.addEventListener('scroll', onScroll, {passive: true});
    window.addEventListener('hashchange', revealAnchor);
    document.addEventListener('click', onLink, true);
    document.addEventListener('focusin', onInteraction);
    document.addEventListener('pointerdown', onInteraction, {capture: true, passive: true});
    document.addEventListener('visibilitychange', onVisibility);
    motion.addEventListener?.('change', onMotion);
    return dispose;
  } catch {
    dispose();
    return () => {};
  }
}

// Independent of app.js: an optional effect must not block the catalogue.
if (typeof document !== 'undefined') {
  const start = () => { try { initReveals(); } catch { /* Natural styles remain visible. */ } };
  if (document.readyState !== 'complete') document.addEventListener('DOMContentLoaded', start, {once: true});
  else start();
}
