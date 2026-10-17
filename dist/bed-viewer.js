const stage = document.querySelector('.bed-stage');
const viewer = document.querySelector('#hero-bed');
const photo = stage.querySelector('.bed-photo');
const controls = stage.querySelector('.bed-tools');
const loading = stage.querySelector('.bed-loading');
const retry = stage.querySelector('.bed-retry');
const reset = stage.querySelector('.bed-reset');
const hint = stage.querySelector('.bed-hint');
const modes = [...stage.querySelectorAll('[data-bed-view]')];
const initialOrbit = viewer.getAttribute('camera-orbit');
const initialTarget = viewer.getAttribute('camera-target');
let timer;
let deadline;
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

function showView(mode) {
  stage.dataset.state = mode;
  photo.setAttribute('aria-hidden', String(mode === 'model'));
  viewer.setAttribute('aria-hidden', String(mode !== 'model'));
  viewer.tabIndex = mode === 'model' ? 0 : -1;
  reset.disabled = mode !== 'model';
  modes.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.bedView === mode)));
  hint.textContent = mode === 'model' ? 'Потяните, чтобы повернуть · 3D-эскиз' : 'Кровать Виолетта · фото';
}

function modelReady() {
  clearTimeout(timer);
  clearTimeout(deadline);
  loading.hidden = true;
  retry.hidden = true;
  controls.hidden = false;
  showView('model');
}

function modelUnavailable() {
  clearTimeout(timer);
  clearTimeout(deadline);
  loading.hidden = true;
  controls.hidden = true;
  retry.hidden = false;
  showView('error');
}

viewer.addEventListener('load', modelReady);
viewer.addEventListener('error', modelUnavailable);
modes.forEach(button => button.addEventListener('click', () => showView(button.dataset.bedView)));
reset.addEventListener('click', () => {
  viewer.cameraOrbit = initialOrbit;
  viewer.cameraTarget = initialTarget;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) viewer.jumpCameraToGoal();
});

async function loadViewer() {
  stage.dataset.state = 'loading';
  viewer.tabIndex = -1;
  viewer.setAttribute('aria-hidden', 'true');
  retry.hidden = true;
  timer = setTimeout(() => { loading.hidden = false; }, 800);
  deadline = setTimeout(modelUnavailable, 45000);
  try {
    if (!customElements.get('model-viewer')) {
      const suffix = importAttempt++ ? `?retry=${importAttempt}` : '';
      await import(`./assets/vendor/model-viewer-4.4.0.min.js${suffix}`);
    }
    // The photo remains available if either WebGL or the asset cannot load.
    if (viewer.loaded) modelReady();
  } catch {
    modelUnavailable();
  }
}

retry.addEventListener('click', () => {
  // Restart the failed asset request without disturbing the catalog or page.
  if (customElements.get('model-viewer')) {
    // model-viewer caches asset promises, including a failed request.
    viewer.setAttribute('src', `assets/models/violetta.glb?retry=${++assetAttempt}`);
  }
  loadViewer();
});
loadViewer();
