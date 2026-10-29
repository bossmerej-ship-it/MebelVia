export function initBedCarousel() {
  const track = document.querySelector('#bed-grid');
  const previous = document.querySelector('.catalog-arrow-prev');
  const next = document.querySelector('.catalog-arrow-next');
  if (!track || !previous || !next) return;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let destination = track.scrollLeft;
  let scrollTimer;
  let restoreSnap;
  let moving = false;
  let layoutWidth = track.clientWidth;
  let anchor;
  let anchorOffset = 0;

  const limit = () => Math.max(0, track.scrollWidth - track.clientWidth);
  const stride = () => track.firstElementChild ? track.firstElementChild.getBoundingClientRect().width + (parseFloat(getComputedStyle(track).columnGap) || 0) : 0;

  function updateControls() {
    previous.disabled = next.disabled = limit() <= 1;
  }

  // Keep real cards on either side of the viewport. Moving existing nodes
  // preserves their photo handlers and the product dialog's return target.
  function jump(left) {
    track.classList.add('is-recentering');
    track.scrollTo({left, behavior: 'instant'});
    track.getBoundingClientRect();
    cancelAnimationFrame(restoreSnap);
    restoreSnap = requestAnimationFrame(() => track.classList.remove('is-recentering'));
  }

  function rememberPosition() {
    const step = stride();
    if (!step || layoutWidth !== track.clientWidth) return;
    const index = Math.floor((track.scrollLeft + 1) / step);
    anchor = track.children[index];
    anchorOffset = track.scrollLeft / step - index;
  }

  function recenter(recycleFocused = false) {
    const step = stride();
    if (!step || limit() <= 1) return;
    const focus = document.activeElement;
    // Tab navigation must be able to leave the finite set of real cards.
    if (!recycleFocused && focus !== track && track.contains(focus)) return;
    const visible = Math.ceil((track.clientWidth + (parseFloat(getComputedStyle(track).columnGap) || 0) - 1) / step);
    const buffer = Math.floor((track.children.length - visible) / 2);
    if (buffer < 1) return;
    const shift = buffer - Math.floor((track.scrollLeft + 1) / step);
    if (!shift) return;
    const position = track.scrollLeft + shift * step;
    track.classList.add('is-recentering');
    if (shift > 0) {
      for (let i = 0; i < shift; i++) track.prepend(track.lastElementChild);
    } else {
      for (let i = 0; i > shift; i--) track.append(track.firstElementChild);
    }
    jump(position);
    if (focus !== document.activeElement && track.contains(focus)) focus.focus({preventScroll: true});
    destination = track.scrollLeft;
  }

  function move(direction) {
    if (limit() <= 1) return;
    clearTimeout(scrollTimer);
    if (!moving) {
      recenter(true);
      destination = track.scrollLeft;
    }
    // Rapid clicks can exhaust the physical buffer before smooth scrolling
    // finishes. Settle the requested card, then replenish that buffer.
    if (destination + direction * stride() < 0 || destination + direction * stride() > limit()) {
      track.scrollTo({left: destination, behavior: 'instant'});
      recenter(true);
    }
    destination = direction < 0 && destination <= 1 ? limit()
      : direction > 0 && destination >= limit() - 1 ? 0
      : Math.min(limit(), Math.max(0, destination + direction * stride()));
    moving = true;
    track.scrollTo({left: destination, behavior: reducedMotion.matches ? 'instant' : 'smooth'});
  }

  previous.addEventListener('click', () => move(-1));
  next.addEventListener('click', () => move(1));
  track.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      move(event.key === 'ArrowLeft' ? -1 : 1);
    }
  });

  function syncPosition() {
    clearTimeout(scrollTimer);
    moving = false;
    recenter();
    destination = track.scrollLeft;
    rememberPosition();
    updateControls();
  }

  track.addEventListener('scroll', () => {
    updateControls();
    rememberPosition();
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(syncPosition, 150);
  }, {passive: true});
  track.addEventListener('scrollend', syncPosition);
  function prepareNativeScroll() {
    clearTimeout(scrollTimer);
    moving = false;
    recenter(true);
    destination = track.scrollLeft;
    rememberPosition();
  }
  track.addEventListener('pointerdown', prepareNativeScroll, {passive: true});
  track.addEventListener('wheel', () => {
    // Leave vertical wheel input to the page; native horizontal scrolling
    // remains in charge of distance, momentum and touch gestures.
    if (track.scrollLeft < stride() || track.scrollLeft > limit() - stride()) prepareNativeScroll();
    else moving = false;
  }, {passive: true});
  new ResizeObserver(() => {
    if (layoutWidth !== track.clientWidth) {
      clearTimeout(scrollTimer);
      moving = false;
      const index = Array.from(track.children).indexOf(anchor);
      if (index >= 0) jump((index + anchorOffset) * stride());
      layoutWidth = track.clientWidth;
    }
    syncPosition();
  }).observe(track);
  recenter();
  rememberPosition();
  updateControls();
}
