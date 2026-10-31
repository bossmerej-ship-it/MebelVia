/** Native restoration is instant; user-followed section links remain smooth. */
export function initNavigationMotion() {
  const root = document.documentElement;
  let frame = 0;
  const reset = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    delete root.dataset.scrollReady;
  };
  const ready = () => {
    reset();
    // pageshow follows initial fragment/history restoration. Leave two paints
    // for that native position before enabling optional link transitions.
    frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        frame = 0;
        root.dataset.scrollReady = '';
      });
    });
  };
  window.addEventListener('pageshow', ready);
  window.addEventListener('pagehide', reset);
  if (document.readyState === 'complete') ready();
  return () => {
    reset();
    window.removeEventListener('pageshow', ready);
    window.removeEventListener('pagehide', reset);
  };
}

if (typeof document !== 'undefined') initNavigationMotion();
