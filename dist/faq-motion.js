/** Enhance native details without hiding answers before JavaScript is ready. */
export function initFaqMotion() {
  if (!Element.prototype.animate) return () => {};
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const states = Array.from(document.querySelectorAll('.faq > details')).flatMap(details => {
    const summary = Array.from(details.children).find(child => child.tagName === 'SUMMARY');
    if (!summary) return [];
    return [{details, summary, answers: Array.from(details.children).filter(child => child !== summary),
      animation: null, fades: [], desiredOpen: details.open, targetHeight: 0}];
  });
  const pixels = value => Number.parseFloat(value) || 0;

  function sizes(state) {
    const border = getComputedStyle(state.details);
    const closed = state.summary.getBoundingClientRect().height + pixels(border.borderTopWidth) + pixels(border.borderBottomWidth);
    const expanded = closed + state.answers.reduce((height, answer) => {
      const style = getComputedStyle(answer);
      return height + answer.getBoundingClientRect().height + pixels(style.marginTop) + pixels(style.marginBottom);
    }, 0);
    return {closed, expanded};
  }

  function cancel(state) {
    const animation = state.animation;
    state.animation = null;
    animation?.cancel();
    state.fades.forEach(fade => fade.cancel());
    state.fades = [];
  }

  function settle(state) {
    state.details.open = state.desiredOpen;
    cancel(state);
    delete state.details.dataset.faqMotion;
  }

  function animate(state, opening) {
    const from = state.details.getBoundingClientRect().height;
    const continuing = !!state.animation;
    const wasOpen = state.details.open;
    const opacity = state.answers.map(answer => continuing || wasOpen ? pixels(getComputedStyle(answer).opacity) : 0);
    cancel(state);
    state.desiredOpen = opening;
    // Closing keeps native content in flow until the last frame. Reversals
    // start at the currently displayed height, never at a previous endpoint.
    state.details.open = true;
    const {closed, expanded} = sizes(state);
    const target = opening ? expanded : closed;
    state.targetHeight = target;
    if (motion.matches || Math.abs(target - from) < .5) {
      settle(state);
      return;
    }
    try {
      const duration = Math.max(100, Math.round(320 * Math.min(1, Math.abs(target - from) / Math.max(1, expanded - closed))));
      const animation = state.details.animate([{height: `${from}px`}, {height: `${target}px`}], {
        duration, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'both'
      });
      state.animation = animation;
      const complete = () => { if (state.animation === animation) settle(state); };
      animation.finished.then(complete, complete);
      state.details.dataset.faqMotion = opening ? 'opening' : 'closing';
      state.answers.forEach((answer, index) => {
        const fade = answer.animate([{opacity: opacity[index]}, {opacity: opening ? 1 : 0}], {
          duration: Math.min(duration, opening ? 200 : 150), easing: 'ease-out', fill: 'both'
        });
        state.fades.push(fade);
        fade.finished.catch(() => {});
      });
    } catch {
      // If the browser rejects an animation, retain the requested native state.
      settle(state);
    }
  }

  function refresh(state) {
    if (!state.animation) return;
    const measured = sizes(state);
    const target = state.desiredOpen ? measured.expanded : measured.closed;
    if (Math.abs(target - state.targetHeight) > .5) animate(state, state.desiredOpen);
  }

  for (const state of states) {
    state.click = event => {
      const control = event.target.closest?.('a, button, input, select, textarea');
      if (event.defaultPrevented || event.button > 0 || motion.matches || (control && state.summary.contains(control))) return;
      event.preventDefault();
      animate(state, state.animation ? !state.desiredOpen : !state.details.open);
    };
    state.toggle = () => {
      if (!state.animation) state.desiredOpen = state.details.open;
      else if (!state.details.open) {
        state.desiredOpen = false;
        settle(state);
      }
    };
    state.summary.addEventListener('click', state.click);
    state.details.addEventListener('toggle', state.toggle);
  }
  const finishActive = () => states.forEach(state => {
    if (state.animation) settle(state);
    else state.desiredOpen = state.details.open;
  });
  const onMotion = event => { if (event.matches) finishActive(); };
  const onResize = () => states.forEach(refresh);
  const onVisibility = () => { if (document.hidden) finishActive(); };
  motion.addEventListener?.('change', onMotion);
  window.addEventListener('resize', onResize, {passive: true});
  document.addEventListener('visibilitychange', onVisibility);
  // Observe the content, not the animated box: changing its height must not
  // create a resize-feedback loop. This also handles a late-loading font.
  let observer;
  if (typeof ResizeObserver !== 'undefined') {
    try {
      const owners = new Map(states.flatMap(state => [state.summary, ...state.answers].map(element => [element, state])));
      observer = new ResizeObserver(entries => new Set(entries.map(entry => owners.get(entry.target))).forEach(state => state && refresh(state)));
      owners.forEach((state, element) => observer.observe(element));
    } catch { observer?.disconnect(); }
  }
  return () => {
    observer?.disconnect();
    states.forEach(state => {
      if (state.animation) settle(state);
      state.summary.removeEventListener('click', state.click);
      state.details.removeEventListener('toggle', state.toggle);
    });
    motion.removeEventListener?.('change', onMotion);
    window.removeEventListener('resize', onResize);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}

if (typeof document !== 'undefined') {
  const start = () => { try { initFaqMotion(); } catch { /* Native details remain available. */ } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once: true});
  else start();
}
