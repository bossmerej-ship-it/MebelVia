const stage = document.querySelector('.bed-stage');
const viewer = stage.querySelector('#hero-bed');
const modelLayer = stage.querySelector('.bed-model-layer');
const open = stage.querySelector('.bed-open');
const close = stage.querySelector('.bed-close');
const status = stage.querySelector('.bed-status');
const initialOrbit = viewer.getAttribute('camera-orbit');
let timer;
let deadline;
let requested = false;
let failed = false;
let importAttempt = 0;
let assetAttempt = 0;
let returnTransition;

viewer.setAttribute('a11y', JSON.stringify({
  'interaction-prompt': 'Поверните мышью, пальцем или клавишами со стрелками.',
  front: 'Вид спереди', back: 'Вид сзади', left: 'Вид слева', right: 'Вид справа',
  'upper-front': 'Вид спереди сверху', 'upper-back': 'Вид сзади сверху',
  'upper-left': 'Вид слева сверху', 'upper-right': 'Вид справа сверху',
  'lower-front': 'Вид спереди снизу', 'lower-back': 'Вид сзади снизу',
  'lower-left': 'Вид слева снизу', 'lower-right': 'Вид справа снизу'
}));

function clearLoading() {
  clearTimeout(timer);
  clearTimeout(deadline);
  open.removeAttribute('aria-busy');
  status.hidden = true;
}

function cancelReturn() {
  const pending = returnTransition;
  returnTransition = null;
  if (!pending) return;
  clearTimeout(pending.timeout);
  modelLayer.removeEventListener('transitionend', pending.onEnd);
}

function finishPhoto(pending) {
  if (pending && pending !== returnTransition) return;
  cancelReturn();
  // Keep the last 3D frame through the fade, then stop renderer visibility.
  // The GLB stays cached for an immediate subsequent opening.
  viewer.showPoster?.();
  stage.dataset.state = 'photo';
  open.hidden = false;
  open.removeAttribute('aria-hidden');
  open.tabIndex = 0;
  close.hidden = true;
  close.disabled = false;
  modelLayer.setAttribute('aria-hidden', 'true');
  viewer.setAttribute('aria-hidden', 'true');
  viewer.tabIndex = -1;
}

function showPhoto({immediate = false} = {}) {
  if (stage.dataset.state === 'closing') return;
  const visibleModel = stage.dataset.state === 'model' && viewer.loaded;
  requested = false;
  clearLoading();
  open.hidden = false;
  open.removeAttribute('aria-hidden');
  open.tabIndex = 0;
  viewer.setAttribute('aria-hidden', 'true');
  viewer.tabIndex = -1;
  modelLayer.setAttribute('aria-hidden', 'true');
  close.disabled = true;
  if (immediate || !visibleModel) {
    finishPhoto();
    open.focus({preventScroll: true});
    return;
  }
  const pending = {timeout: 0, onEnd: null};
  pending.onEnd = event => {
    if (event.target === modelLayer && event.propertyName === 'opacity') finishPhoto(pending);
  };
  returnTransition = pending;
  modelLayer.addEventListener('transitionend', pending.onEnd);
  stage.dataset.state = 'closing';
  open.focus({ preventScroll: true });
  // A cancelled CSS transition or a browser without transition events must
  // still release the viewer. The visual fade itself lasts 450 ms.
  pending.timeout = setTimeout(() => finishPhoto(pending), 600);
}

function modelReady() {
  clearLoading();
  failed = false;
  if (!requested) {
    // Loading may finish after the visitor has returned to the photograph.
    // reveal="auto" dismisses the poster on completion, so block it again.
    if (stage.dataset.state !== 'closing') viewer.showPoster?.();
    return;
  }
  cancelReturn();
  viewer.dismissPoster();
  stage.dataset.state = 'model';
  // Keep the photograph underneath the model layer throughout both fades.
  open.hidden = false;
  open.setAttribute('aria-hidden', 'true');
  open.tabIndex = -1;
  close.hidden = false;
  close.disabled = false;
  modelLayer.removeAttribute('aria-hidden');
  viewer.removeAttribute('aria-hidden');
  viewer.tabIndex = 0;
  viewer.focus({ preventScroll: true });
}

function modelUnavailable() {
  clearLoading();
  failed = true;
  if (!requested) return;
  showPhoto({immediate: true});
  status.textContent = 'Не удалось открыть 3D. Нажмите на фото, чтобы попробовать ещё раз.';
  status.hidden = false;
}

async function openModel() {
  if (requested) return;
  const reversing = stage.dataset.state === 'closing';
  cancelReturn();
  requested = true;
  if (reversing && viewer.loaded && !failed) {
    // Reverse the opacity transition from its current value. Resetting the
    // orbit here would visibly snap a rotated bed in the middle of the fade.
    modelReady();
    return;
  }
  stage.dataset.state = 'loading';
  open.setAttribute('aria-busy', 'true');
  status.hidden = true;
  close.hidden = false;
  close.disabled = false;
  timer = setTimeout(() => {
    status.textContent = 'Загружаем 3D…';
    status.hidden = false;
  }, 600);
  deadline = setTimeout(modelUnavailable, 45000);
  try {
    if (!customElements.get('model-viewer')) {
      const suffix = importAttempt++ ? `?retry=${importAttempt}` : '';
      await import(`./assets/vendor/model-viewer-4.4.0.min.js${suffix}`);
    }
    if (!requested) return;
    viewer.cameraOrbit = initialOrbit;
    viewer.jumpCameraToGoal();
    if (viewer.loaded && !failed) {
      modelReady();
    } else if (failed || !viewer.hasAttribute('src')) {
      // Failed asset promises are cached by the viewer: a retry needs a new URL.
      viewer.setAttribute('src', viewer.dataset.src + (failed ? `?retry=${++assetAttempt}` : ''));
    }
  } catch {
    modelUnavailable();
  }
}

open.addEventListener('click', openModel);
close.addEventListener('click', showPhoto);
viewer.addEventListener('load', modelReady);
viewer.addEventListener('error', modelUnavailable);
stage.addEventListener('keydown', event => {
  if (event.key === 'Escape' && requested) {
    event.preventDefault();
    showPhoto();
  }
});
