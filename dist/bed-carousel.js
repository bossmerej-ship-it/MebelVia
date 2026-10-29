export function initBedCarousel() {
  const track = document.querySelector('#bed-grid');
  if (!track) return;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let destination = track.scrollLeft;
  let scrollTimer;
  let restoreSnap;
  let moving = false;
  let nativeGesture = false;
  let pointerActive = false;
  let wheelScrolling = false;
  let wheelTimer;
  let rebasing = false;
  let layoutWidth = track.clientWidth;
  let anchor;
  let anchorOffset = 0;

  const limit = () => Math.max(0, track.scrollWidth - track.clientWidth);
  const stride = () => track.firstElementChild ? track.firstElementChild.getBoundingClientRect().width + (parseFloat(getComputedStyle(track).columnGap) || 0) : 0;

  // Keep real cards on either side of the viewport. Moving existing nodes
  // preserves their photo handlers and the product dialog's return target.
  function jump(left) {
    track.classList.add('is-recentering');
    track.scrollTo({left, behavior: 'instant'});
    cancelAnimationFrame(restoreSnap);
    restoreSnap = requestAnimationFrame(() => {
      if (!wheelScrolling && !nativeGesture) track.classList.remove('is-recentering');
    });
  }

  function rememberPosition() {
    const step = stride();
    if (!step || layoutWidth !== track.clientWidth) return;
    const index = Math.floor((track.scrollLeft + 1) / step);
    anchor = track.children[index];
    anchorOffset = track.scrollLeft / step - index;
  }

  function recenter(recycleFocused = false, position = track.scrollLeft) {
    const step = stride();
    if (!step || limit() <= 1) return;
    const focus = document.activeElement;
    // Tab navigation must be able to leave the finite set of real cards.
    if (!recycleFocused && focus !== track && track.contains(focus)) return;
    const visible = Math.ceil((track.clientWidth + (parseFloat(getComputedStyle(track).columnGap) || 0) - 1) / step);
    const buffer = Math.floor((track.children.length - visible) / 2);
    if (buffer < 1) return;
    const shift = buffer - Math.floor((position + 1) / step);
    if (!shift && Math.abs(position - track.scrollLeft) < .01) return;
    const rotations = Math.abs(shift) % track.children.length;
    rebasing = true;
    track.classList.add('is-recentering');
    if (shift > 0) {
      for (let i = 0; i < rotations; i++) track.prepend(track.lastElementChild);
    } else {
      for (let i = 0; i < rotations; i++) track.append(track.firstElementChild);
    }
    jump(position + shift * step);
    if (focus !== document.activeElement && track.contains(focus)) focus.focus({preventScroll: true});
    destination = track.scrollLeft;
    rebasing = false;
  }

  function move(direction) {
    if (limit() <= 1) return;
    clearTimeout(wheelTimer);
    wheelScrolling = nativeGesture = pointerActive = false;
    clearTimeout(scrollTimer);
    if (!moving) {
      recenter(true);
      destination = track.scrollLeft;
    }
    // Repeated key presses can exhaust the buffer before smooth scrolling
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

  track.addEventListener('keydown', event => {
    if (event.key === 'Tab') nativeGesture = false;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      move(event.key === 'ArrowLeft' ? -1 : 1);
    }
  });

  function syncPosition() {
    if (wheelScrolling || pointerActive) return;
    clearTimeout(scrollTimer);
    moving = false;
    recenter(nativeGesture);
    nativeGesture = false;
    track.classList.remove('is-recentering');
    destination = track.scrollLeft;
    rememberPosition();
  }

  track.addEventListener('scroll', () => {
    if (rebasing) return;
    // Replenish the buffer during a swipe, before a finger or inertia can
    // reach a physical endpoint. No scrollend is required to continue.
    if (nativeGesture && !moving && !wheelScrolling) recenter(true);
    rememberPosition();
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(syncPosition, 150);
  }, {passive: true});
  track.addEventListener('scrollend', syncPosition);
  function prepareNativeScroll() {
    clearTimeout(wheelTimer);
    wheelScrolling = false;
    nativeGesture = pointerActive = true;
    clearTimeout(scrollTimer);
    moving = false;
    // A manual gesture takes over immediately from keyboard scrolling.
    track.scrollTo({left: track.scrollLeft, behavior: 'instant'});
    recenter(true);
    destination = track.scrollLeft;
    rememberPosition();
  }
  track.addEventListener('pointerdown', prepareNativeScroll, {passive: true});
  track.addEventListener('touchstart', prepareNativeScroll, {passive: true});
  function finishPointer() {
    if (!pointerActive && !nativeGesture) return;
    pointerActive = false;
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(syncPosition, 150);
  }
  // Releases outside the track must finish a mouse drag too. A browser
  // cancels touch PointerEvents when native panning begins, so TouchEvents
  // own the actual finger release instead of ending the gesture early.
  document.addEventListener('pointerup', event => {
    if (event.pointerType !== 'touch') finishPointer();
  }, {passive: true});
  document.addEventListener('pointercancel', event => {
    if (event.pointerType !== 'touch') finishPointer();
  }, {passive: true});
  document.addEventListener('touchend', event => {
    if (!event.touches.length) finishPointer();
  }, {passive: true});
  document.addEventListener('touchcancel', finishPointer, {passive: true});
  track.addEventListener('wheel', event => {
    // Only own horizontal navigation. Page scrolling and browser zoom keep
    // their native behavior, including diagonal gestures dominated by Y.
    if (event.ctrlKey || event.metaKey || limit() <= 1) return;
    const horizontal = event.shiftKey && !event.deltaX ? event.deltaY : event.deltaX;
    if (!horizontal || (!event.shiftKey && Math.abs(horizontal) <= Math.abs(event.deltaY || 0))) return;
    event.preventDefault();
    clearTimeout(scrollTimer);
    clearTimeout(wheelTimer);
    moving = nativeGesture = pointerActive = false;
    wheelScrolling = true;
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? track.clientWidth : 1;
    // Apply the complete delta in cyclic coordinates, even when one event
    // travels several full catalogues. Native scrollLeft would clamp it.
    recenter(true, track.scrollLeft + horizontal * unit);
    rememberPosition();
    wheelTimer = setTimeout(() => {
      wheelScrolling = false;
      // Keep the exact fractional position where the gesture ended.
      syncPosition();
    }, 160);
  }, {passive: false});
  new ResizeObserver(() => {
    if (layoutWidth !== track.clientWidth) {
      clearTimeout(scrollTimer);
      clearTimeout(wheelTimer);
      wheelScrolling = nativeGesture = pointerActive = false;
      moving = false;
      const index = Array.from(track.children).indexOf(anchor);
      if (index >= 0) jump((index + anchorOffset) * stride());
      layoutWidth = track.clientWidth;
    }
    syncPosition();
  }).observe(track);
  recenter();
  rememberPosition();
}
