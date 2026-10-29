export function initBedCarousel() {
  const track = document.querySelector('#bed-grid');
  const previous = document.querySelector('.catalog-arrow-prev');
  const next = document.querySelector('.catalog-arrow-next');
  if (!track || !previous || !next) return;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let destination = track.scrollLeft;
  let scrollTimer;

  const limit = () => Math.max(0, track.scrollWidth - track.clientWidth);
  const stride = () => track.firstElementChild ? track.firstElementChild.getBoundingClientRect().width + (parseFloat(getComputedStyle(track).columnGap) || 0) : 0;

  function updateControls() {
    previous.disabled = next.disabled = limit() <= 1;
  }

  function move(direction) {
    if (limit() <= 1) return;
    destination = direction < 0 && destination <= 1 ? limit()
      : direction > 0 && destination >= limit() - 1 ? 0
      : Math.min(limit(), Math.max(0, destination + direction * stride()));
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
    destination = track.scrollLeft;
    updateControls();
  }

  track.addEventListener('scroll', () => {
    updateControls();
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(syncPosition, 150);
  }, {passive: true});
  track.addEventListener('scrollend', syncPosition);
  track.addEventListener('pointerdown', syncPosition, {passive: true});
  track.addEventListener('wheel', syncPosition, {passive: true});
  new ResizeObserver(syncPosition).observe(track);
  updateControls();
}
