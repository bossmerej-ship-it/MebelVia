const stage = document.querySelector('.bed-stage');
const viewer = stage.querySelector('#hero-bed');
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

function showPhoto() {
  requested = false;
  clearLoading();
  stage.dataset.state = 'photo';
  open.hidden = false;
  close.hidden = true;
  viewer.setAttribute('aria-hidden', 'true');
  viewer.tabIndex = -1;
  open.focus({ preventScroll: true });
}

function modelReady() {
  clearLoading();
  failed = false;
  if (!requested) return;
  stage.dataset.state = 'model';
  open.hidden = true;
  close.hidden = false;
  viewer.removeAttribute('aria-hidden');
  viewer.tabIndex = 0;
  viewer.focus({ preventScroll: true });
}

function modelUnavailable() {
  clearLoading();
  failed = true;
  if (!requested) return;
  showPhoto();
  status.textContent = 'Не удалось открыть 3D. Нажмите на фото, чтобы попробовать ещё раз.';
  status.hidden = false;
}

async function openModel() {
  if (requested) return;
  requested = true;
  stage.dataset.state = 'loading';
  open.setAttribute('aria-busy', 'true');
  status.hidden = true;
  close.hidden = false;
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
    if (failed || !viewer.hasAttribute('src')) {
      // Failed asset promises are cached by the viewer: a retry needs a new URL.
      viewer.src = viewer.dataset.src + (failed ? `?retry=${++assetAttempt}` : '');
    } else if (viewer.loaded) modelReady();
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
