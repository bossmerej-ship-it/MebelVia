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

  function add(selector, kind = 'text', delay = 0) {
    main.querySelectorAll(selector).forEach(element => {
      records.set(element, {element, kind, delay});
    });
  }
  add('#hero-title');
  add('.hero-actions > a', 'action', 70);
  add('.collection-copy > .eyebrow, .collection-copy > h2');
  add('.collection-copy > p', 'text', 60);
  add('.collection-link', 'action', 110);
  add('#beds-title, #mattresses-title, .faq > h2, .consultation > h2');
  add('#mattresses .section-subtitle', 'text', 60);
  add('#bed-grid', 'bed-list');
  add('#mattress-grid > .product-card', 'card');
  add('.delivery-inner', 'delivery-group');
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

  function animate(element, kind, delay, opacity = 1) {
    const horizontal = kind === 'delivery-copy' || kind === 'delivery-truck';
    const distance = kind === 'action' || kind === 'row' ? 18 : kind === 'card' ? 28 : 24;
    const offset = horizontal ? `${kind === 'delivery-copy' ? -44 : 44}px 0` : `0 ${distance}px`;
    // Only a genuinely incoming edge may fade. Late callbacks retain full
    // opacity, so readable text cannot disappear before its entrance plays.
    const from = {opacity, translate: offset};
    const to = {opacity: 1, translate: '0 0'};
    try {
      // Individual translate composes with the existing card hover transform.
      const animation = element.animate([from, to], {
        duration: kind === 'action' || kind === 'row' ? 650 : 700,
        delay: Math.min(delay, 120),
        easing: 'cubic-bezier(.22,.68,.28,1)',
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

  function enter(record, play, delay = record.delay, opacity = 1) {
    const {element, kind} = record;
    if (seen.has(element)) return;
    mark(element);
    if (kind === 'delivery-group') {
      const copy = element.querySelector('.delivery-copy');
      const truck = element.querySelector('.delivery-porter');
      // One observer entry starts both sides together. Mark both first, so
      // reduced motion, failed animation or revisiting never hides either.
      [copy, truck].filter(Boolean).forEach(mark);
      if (play) {
        if (copy) animate(copy, 'delivery-copy', 0, opacity);
        if (truck) animate(truck, 'delivery-truck', 0, opacity);
      }
    } else if (kind === 'bed-list') {
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
        .forEach((card, index) => animate(card, 'card', Math.min(index, 2) * 60, opacity));
    } else if (play) animate(element, kind, delay, opacity);
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
    // Skip upcoming entrances during a large gesture, but let effects already
    // on screen finish naturally rather than snapping to their final frame.
    if (sampleDistance > window.innerHeight * .75 || distance > window.innerHeight * .85) {
      skipUntil = now + 220;
    }
    lastY = window.scrollY;
  }

  function onInteraction(event) {
    const target = event.target;
    if (!target) return;
    // A finger touching text or a card's blank area may begin a page swipe.
    // Only an actual control needs its effect settled before pointer input.
    if (event.type === 'pointerdown' && !target.closest?.('a, button, input, select, textarea, summary')) return;
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
      if (anchor === main) {
        // #top belongs to the main wrapper. Treating all its descendants as
        // the target would consume every still-unvisited section entrance.
        const bounds = record.element.getBoundingClientRect();
        if (record.element.closest('.hero') || (bounds.top < window.innerHeight && bounds.bottom > 0)) enter(record, false);
      } else if (anchor === record.element || anchor.contains(record.element) || record.element.contains(anchor)) enter(record, false);
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
          if (motion.matches) {
            enter(record, false);
            return;
          }
          // A native anchor jump may cross several sections on its way to
          // the target. Skipping that transit must not count as a first visit:
          // keep the natural content visible and observe its next real entry.
          const bounds = record.element.getBoundingClientRect();
          if (document.hidden || performance.now() < skipUntil || bounds.bottom <= 0) return;
          const grouped = record.kind === 'card' || record.kind === 'row';
          const count = counts.get(record.kind) || 0;
          if (grouped) counts.set(record.kind, count + 1);
          const delay = grouped ? Math.min(record.delay + count * 60, 120) : record.delay;
          // Start at the actual viewport, so a slow scroll cannot consume the
          // whole effect offscreen. Entries from either edge can move without
          // hiding any content that has already been painted.
          const edge = (bounds.top >= window.innerHeight - 96 && bounds.top < window.innerHeight)
            || (bounds.bottom > 0 && bounds.bottom <= 96);
          enter(record, true, delay, edge ? .5 : 1);
        });
    }, {rootMargin: '0px', threshold: 0});

    records.forEach(record => {
      const bounds = record.element.getBoundingClientRect();
      // Leave the hero and actually visible restored content untouched. A
      // section above a deep-link viewport may still be unvisited: observe it
      // so scrolling back up can show its first entrance.
      if (record.element.closest('.hero') || (bounds.top < window.innerHeight && bounds.bottom > 0)) {
        enter(record, false);
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
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once: true});
  else start();
}
