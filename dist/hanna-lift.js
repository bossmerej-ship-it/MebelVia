/** A deterministic position: the same scroll offset always gives the same pose. */
export function liftProgress(sectionTop, sectionHeight, viewportHeight) {
  const travel = sectionHeight - viewportHeight;
  if (!(travel > 0)) return 0;
  const position = Math.max(0, Math.min(1, (-sectionTop / travel - 0.12) / 0.76));
  return position * position * (3 - 2 * position);
}

export function initHannaLift() {
  const section = document.querySelector('.collection-section');
  const viewer = section?.querySelector('#hanna-bed');
  if (!viewer) return;

  const sticky = section.querySelector('.collection-sticky');
  const photo = section.querySelector('.collection-image');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let requested = false;
  let failed = false;
  let loaded = false;
  let near = false;
  let frame = 0;
  let deadline;
  let loadDelay;
  let lastProgress = -1;
  let targetProgress = 0;
  let targetDirty = true;
  let previousTime = null;
  let duration = 0;

  // Keep both ends of the lift inside the closer product framing. A narrow
  // canvas needs slightly more distance; scroll never changes the camera.
  function frameBed() {
    const radius = matchMedia('(max-width: 760px)').matches ? '5.65m' : '5.2m';
    const orbit = `0deg 85deg ${radius}`;
    if (viewer.getAttribute('camera-orbit') !== orbit) {
      viewer.setAttribute('camera-orbit', orbit);
      if (loaded) viewer.jumpCameraToGoal();
    }
  }
  frameBed();
  window.addEventListener('resize', frameBed, { passive: true });

  // Preference changes and fallback recovery can change this section's height.
  // Keep actual visible content below it in place, including reloads without a
  // URL fragment. Ignore horizontally clipped cards in the infinite catalogue.
  function visibleFollowingAnchor() {
    const viewport = { right: window.innerWidth, bottom: window.innerHeight };
    for (let sibling = section.nextElementSibling; sibling; sibling = sibling.nextElementSibling) {
      const candidates = [...sibling.querySelectorAll('h2, h3, .product-card, details, p, a, img'), sibling];
      for (const element of candidates) {
        const bounds = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        if (style.visibility === 'hidden' || style.display === 'none' || !(bounds.width > 0 && bounds.height > 0)) continue;
        const carousel = element.closest('.bed-carousel');
        const clip = carousel?.getBoundingClientRect();
        const left = Math.max(0, clip?.left ?? 0);
        const right = Math.min(viewport.right, clip?.right ?? viewport.right);
        if (bounds.top < viewport.bottom && bounds.bottom > 0 && bounds.right > left && bounds.left < right) return element;
      }
    }
  }

  function changeLayout(change) {
    const anchor = visibleFollowingAnchor();
    const before = anchor?.getBoundingClientRect().top;
    change();
    if (anchor) {
      const shift = anchor.getBoundingClientRect().top - before;
      if (shift) window.scrollBy({ top: shift, behavior: 'instant' });
    }
  }

  function reserveLayout() {
    if (section.dataset.liftLayout !== 'reserved') {
      changeLayout(() => { section.dataset.liftLayout = 'reserved'; });
    }
  }

  function cancelFrame() {
    cancelAnimationFrame(frame);
    frame = 0;
    previousTime = null;
    targetDirty = true;
  }

  function showPhoto(state) {
    clearTimeout(loadDelay);
    cancelFrame();
    changeLayout(() => {
      section.dataset.liftState = state;
      delete section.dataset.liftLayout;
    });
    delete section.dataset.liftProgress;
    viewer.setAttribute('aria-hidden', 'true');
    photo.removeAttribute('aria-hidden');
    viewer.pause?.();
    window.removeEventListener('scroll', schedule);
    window.removeEventListener('resize', onResize);
    lastProgress = -1;
  }

  function unavailable() {
    failed = true;
    clearTimeout(deadline);
    showPhoto('unavailable');
  }

  function readTarget() {
    const bounds = section.getBoundingClientRect();
    targetProgress = liftProgress(bounds.top, bounds.height, sticky.clientHeight);
    targetDirty = false;
  }

  function writePose(progress) {
    if (progress === lastProgress) return;
    // LoopRepeat wraps at exactly duration. Stay on its final pose so reverse
    // scrolling keeps working after the fully-open hold, without restarting it.
    viewer.currentTime = progress * Math.max(0, duration - 0.00001);
    const reported = progress.toFixed(5);
    if (section.dataset.liftProgress !== reported) section.dataset.liftProgress = reported;
    lastProgress = progress;
  }

  function updatePose() {
    cancelFrame();
    readTarget();
    writePose(targetProgress);
  }

  function canRender() {
    return near && !document.hidden && section.dataset.liftState === 'ready';
  }

  function queueFrame() {
    if (!frame && canRender()) {
      if (previousTime === null) previousTime = performance.now();
      frame = requestAnimationFrame(render);
    }
  }

  function render(time) {
    frame = 0;
    if (!canRender()) return;
    // Read layout only once for the newest scroll event. The short settling
    // tail reuses that target rather than measuring the page on every frame.
    if (targetDirty) readTarget();
    const difference = targetProgress - lastProgress;
    if (Math.abs(difference) <= .0005) {
      writePose(targetProgress);
      previousTime = null;
      return;
    }
    const elapsed = previousTime === null ? 1000 / 60 : Math.max(0, Math.min(32, time - previousTime));
    previousTime = time;
    // A small time-based damper fills the gaps between wheel notches. It
    // follows reversals from the displayed pose without overshooting.
    const progress = lastProgress + difference * (1 - Math.exp(-elapsed / 68));
    const settled = Math.abs(targetProgress - progress) <= .0005;
    writePose(settled ? targetProgress : progress);
    if (settled) previousTime = null;
    else queueFrame();
  }

  function schedule() {
    targetDirty = true;
    queueFrame();
  }

  function resume() {
    if (canRender()) updatePose();
  }

  function onResize() {
    // Resizing and native restoration change geometry, not user intent. Do
    // not animate through an old viewport's pose when returning to the scene.
    if (canRender()) updatePose();
    else targetDirty = true;
  }

  function activate() {
    if (!loaded || failed || motion.matches) return;
    viewer.pause();
    reserveLayout();
    // Set the restored scroll pose before CSS can reveal the model. Loading
    // and ready already share their geometry, so no closed frame flashes.
    updatePose();
    section.dataset.liftState = 'ready';
    photo.setAttribute('aria-hidden', 'true');
    viewer.removeAttribute('aria-hidden');
    viewer.jumpCameraToGoal();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });
  }

  function modelReady() {
    if (failed) return;
    clearTimeout(deadline);
    if (!viewer.availableAnimations.includes('Lift') || !(viewer.duration > 0)) {
      unavailable();
      return;
    }
    duration = viewer.duration;
    loaded = true;
    activate();
  }

  async function requestModel() {
    if (requested || failed || motion.matches || !near || document.hidden) return;
    requested = true;
    section.dataset.liftState = 'loading';
    deadline = setTimeout(unavailable, 30000);
    try {
      // This exact URL is shared with the existing Violetta viewer.
      if (!customElements.get('model-viewer')) {
        await import('./assets/vendor/model-viewer-4.4.0.min.js');
      }
      if (failed) return;
      if (!near || document.hidden || motion.matches) {
        requested = false;
        clearTimeout(deadline);
        section.dataset.liftState = 'photo';
        return;
      }
      viewer.setAttribute('src', viewer.dataset.src);
    } catch {
      unavailable();
    }
  }

  function queueModel() {
    clearTimeout(loadDelay);
    if (requested || failed || motion.matches || !near || document.hidden) return;
    // Passing the scene during a fast gesture or native restoration must not
    // start GLB decoding and shader compilation. Load only after a brief,
    // sustained visit to the real sticky viewport, never a large preload area.
    loadDelay = setTimeout(() => {
      const bounds = sticky.getBoundingClientRect();
      if (bounds.top < window.innerHeight && bounds.bottom > 0) requestModel();
    }, 160);
  }

  viewer.addEventListener('load', modelReady);
  viewer.addEventListener('error', unavailable);
  motion.addEventListener('change', () => {
    if (motion.matches) showPhoto('reduced');
    else if (!failed) {
      reserveLayout();
      if (loaded) activate();
      else if (near) queueModel();
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      clearTimeout(loadDelay);
      cancelFrame();
    } else {
      queueModel();
      resume();
    }
  });
  window.addEventListener('pageshow', resume);

  if (motion.matches) showPhoto('reduced');
  else reserveLayout();
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      const wasNear = near;
      near = entries[0].isIntersecting;
      if (near) {
        queueModel();
        if (!wasNear) resume();
      } else {
        clearTimeout(loadDelay);
        cancelFrame();
      }
    }, { rootMargin: '0px', threshold: 0 });
    observer.observe(sticky);
  } else {
    near = true;
    queueModel();
  }
}

if (typeof document !== 'undefined') initHannaLift();
