/** Optional entrance effects. Natural styles always remain visible. */
export function initReveals() {
  const main = document.querySelector('main');
  if (!main || !window.IntersectionObserver || !Element.prototype.animate) return () => {};

  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const records = new Map();
  const seen = new WeakSet();
  const active = new Map();
  const prepared = new Map();
  let observer;
  let preparationObserver;
  let releaseObserver;
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
    preparationObserver?.unobserve(element);
    releaseObserver?.unobserve(element);
  }

  function finish(element) {
    const animation = active.get(element);
    active.delete(element);
    animation?.cancel();
    element.dataset.revealState = 'done';
  }

  function createAnimation(element, kind, delay, direction) {
    const horizontal = kind === 'delivery-copy' || kind === 'delivery-truck';
    const distance = kind === 'action' || kind === 'row' ? 18 : kind === 'card' ? 28 : 24;
    const offset = horizontal ? `${kind === 'delivery-copy' ? -44 : 44}px 0` : `0 ${distance * direction}px`;
    const from = {opacity: .5, translate: offset};
    const to = {opacity: 1, translate: '0 0'};
    let animation;
    try {
      // Individual translate composes with the existing card hover transform.
      animation = element.animate([from, to], {
        duration: kind === 'action' || kind === 'row' ? 650 : 700,
        delay: Math.min(delay, 120),
        easing: 'cubic-bezier(.22,.68,.28,1)',
        fill: 'both'
      });
      // Install the offset while the target is safely offscreen. Nothing
      // advances until the exact-viewport observer plays this same animation.
      animation.finished.catch(() => {});
      animation.pause();
      animation.currentTime = 0;
      return animation;
    } catch {
      animation?.cancel();
      throw new Error('Entrance preparation failed');
    }
  }

  function plan(record, delay = record.delay) {
    const {element, kind} = record;
    if (kind === 'delivery-group') {
      const copy = element.querySelector('.delivery-copy');
      const truck = element.querySelector('.delivery-porter');
      return {members: [copy, truck].filter(Boolean), targets: [
        ...(copy ? [{element: copy, kind: 'delivery-copy', delay: 0}] : []),
        ...(truck ? [{element: truck, kind: 'delivery-truck', delay: 0}] : [])
      ]};
    } else if (kind === 'bed-list') {
      const cards = Array.from(element.children);
      const bounds = element.getBoundingClientRect();
      // Snapshot geometry before creating any animations, avoiding interleaved
      // style writes/measurements and repeated rect reads inside the sort.
      const visible = cards.map(card => ({element: card, bounds: card.getBoundingClientRect()}))
        .filter(card => card.bounds.right > bounds.left + 1 && card.bounds.left < bounds.right - 1)
        .sort((a, b) => a.bounds.left - b.bounds.left);
      return {members: cards, targets: visible.map((card, index) => ({element: card.element, kind: 'card', delay: Math.min(index, 2) * 60}))};
    }
    return {members: [], targets: [{element, kind, delay}]};
  }

  function cancelPrepared(record) {
    const batch = prepared.get(record.element);
    if (!batch) return;
    prepared.delete(record.element);
    batch.effects.forEach(({element, animation}) => {
      animation.cancel();
      if (!seen.has(element)) delete element.dataset.revealState;
    });
    if (!seen.has(record.element)) record.element.dataset.revealState = 'pending';
    releaseObserver?.unobserve(record.element);
    preparationObserver?.observe(record.element);
  }

  function cancelPreparations() {
    records.forEach(cancelPrepared);
  }

  function settle(record) {
    if (seen.has(record.element)) return;
    cancelPrepared(record);
    const batch = plan(record);
    mark(record.element);
    batch.members.forEach(mark);
  }

  function prepare(record, bounds, delay = record.delay) {
    if (seen.has(record.element) || prepared.has(record.element) || motion.matches || document.hidden || performance.now() < skipUntil) return;
    // The above-screen gap also covers the largest vertical offset (28px),
    // so preparing a reverse entrance cannot paint pixels into the viewport.
    const below = bounds.top >= window.innerHeight && bounds.top < window.innerHeight + 240;
    const above = bounds.bottom <= -32 && bounds.bottom > -240;
    if (!below && !above) return;
    const batch = {...plan(record, delay), effects: []};
    prepared.set(record.element, batch);
    try {
      for (const target of batch.targets) {
        const animation = createAnimation(target.element, target.kind, target.delay, below ? 1 : -1);
        batch.effects.push({element: target.element, animation});
        target.element.dataset.revealState = 'prepared';
      }
      record.element.dataset.revealState = 'prepared';
      // Staging changes this element's bounds. A larger release band gives
      // enough hysteresis that its own offset cannot undo the preparation.
      preparationObserver.unobserve(record.element);
      releaseObserver.observe(record.element);
    } catch {
      // A rejected pause/animation must leave the whole group naturally visible.
      settle(record);
    }
  }

  function play(record) {
    const batch = prepared.get(record.element);
    if (!batch) {
      // It is already painted: starting from a fresh offset would move it
      // backwards in one frame. Late observer delivery simply keeps it still.
      settle(record);
      return;
    }
    prepared.delete(record.element);
    mark(record.element);
    // Mark the complete original set before playing either child/card. Moving
    // nodes around the infinite catalogue must never restart their entrances.
    batch.members.forEach(mark);
    for (const {element, animation} of batch.effects) {
      active.set(element, animation);
      element.dataset.revealState = 'running';
      const release = () => { if (active.get(element) === animation) finish(element); };
      animation.finished.then(release, release);
      try { animation.play(); } catch { finish(element); }
    }
  }

  function finishActive() {
    Array.from(active.keys()).forEach(finish);
  }

  function settleAll() {
    records.forEach(settle);
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
      cancelPreparations();
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
      if (record.element === target || record.element.contains(target)) settle(record);
    });
    Array.from(active.keys()).forEach(element => {
      if (element === target || element.contains(target)) finish(element);
    });
  }

  function revealAnchor() {
    skipUntil = performance.now() + 900;
    cancelPreparations();
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
        if (record.element.closest('.hero') || (bounds.top < window.innerHeight && bounds.bottom > 0)) settle(record);
      } else if (anchor === record.element || anchor.contains(record.element) || record.element.contains(anchor)) settle(record);
    });
  }

  function onLink(event) {
    if (event.target.closest?.('a[href^="#"]')) {
      skipUntil = performance.now() + 900;
      cancelPreparations();
      finishActive();
    }
  }

  function onVisibility() {
    if (document.hidden) {
      cancelPreparations();
      finishActive();
    }
  }

  function onMotion(event) {
    if (event.matches) {
      observer?.disconnect();
      preparationObserver?.disconnect();
      releaseObserver?.disconnect();
      settleAll();
    }
  }

  function dispose() {
    observer?.disconnect();
    preparationObserver?.disconnect();
    releaseObserver?.disconnect();
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
      // Read all current bounds before playing/cancelling any effects. The
      // observer's queued bounds may describe an earlier scroll position.
      const incoming = entries.filter(entry => entry.isIntersecting)
        .map(entry => ({record: records.get(entry.target), bounds: entry.target.getBoundingClientRect()}))
        .filter(({record}) => record && !seen.has(record.element))
        .sort((a, b) => a.bounds.top - b.bounds.top || a.bounds.left - b.bounds.left);
      incoming.forEach(({record, bounds}) => {
          if (motion.matches) {
            settle(record);
            return;
          }
          // A native anchor jump may cross several sections on its way to
          // the target. Skipping that transit must not count as a first visit:
          // keep the natural content visible and observe its next real entry.
          if (document.hidden || performance.now() < skipUntil) {
            cancelPrepared(record);
            return;
          }
          if (bounds.bottom <= 0 || bounds.top >= window.innerHeight) return;
          play(record);
        });
    }, {rootMargin: '0px', threshold: .00001});

    preparationObserver = new IntersectionObserver(entries => {
      const counts = new Map();
      const batches = entries.map(entry => ({entry, record: records.get(entry.target), bounds: entry.target.getBoundingClientRect()}))
        .sort((a, b) => a.bounds.top - b.bounds.top || a.bounds.left - b.bounds.left);
      for (const {entry, record, bounds} of batches) {
        if (!record || seen.has(record.element)) continue;
        if (entry.isIntersecting) {
          const grouped = record.kind === 'card' || record.kind === 'row';
          const count = counts.get(record.kind) || 0;
          if (grouped) counts.set(record.kind, count + 1);
          prepare(record, bounds, grouped ? Math.min(record.delay + count * 60, 120) : record.delay);
        }
      }
    }, {rootMargin: '240px 0px', threshold: .00001});

    releaseObserver = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const record = records.get(entry.target);
        if (record && !entry.isIntersecting) cancelPrepared(record);
      }
    }, {rootMargin: '320px 0px', threshold: .00001});

    records.forEach(record => {
      const bounds = record.element.getBoundingClientRect();
      // Leave the hero and actually visible restored content untouched. A
      // section above a deep-link viewport may still be unvisited: observe it
      // so scrolling back up can show its first entrance.
      if (record.element.closest('.hero') || (bounds.top < window.innerHeight && bounds.bottom > 0)) {
        settle(record);
      }
      else {
        record.element.dataset.revealState = 'pending';
        observer.observe(record.element);
        preparationObserver.observe(record.element);
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
