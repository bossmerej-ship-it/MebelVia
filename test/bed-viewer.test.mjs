import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Exercise lifecycle, interruption and accessibility without a GPU or network.
const source = readFileSync(new URL('../dist/bed-viewer.js', import.meta.url), 'utf8');
function fixture(options = {}) {
  const document = new EventTarget();
  document.activeElement = null;
  document.hidden = options.hidden ?? false;
  const window = new EventTarget();
  const motion = new EventTarget();
  motion.matches = options.reduced ?? false;
  const timers = new Map();
  let time = 0, nextTimer = 0;
  class Element extends EventTarget {
    attrs = new Map();
    dataset = {};
    hidden = false;
    disabled = false;
    loaded = false;
    posterVisible = true;
    assetRequests = 0;
    cameraAssignments = 0;
    cameraJumps = 0;
    posterShows = 0;
    posterDismissals = 0;
    getAttribute(key) { return this.attrs.get(key) ?? null; }
    setAttribute(key, value) { this.attrs.set(key, String(value)); if (key === 'src') this.assetRequests++; }
    removeAttribute(key) { this.attrs.delete(key); }
    hasAttribute(key) { return this.attrs.has(key); }
    focus() { document.activeElement = this; }
    get cameraOrbit() { return this.getAttribute('camera-orbit'); }
    set cameraOrbit(value) { this.cameraAssignments++; this.setAttribute('camera-orbit', value); }
    jumpCameraToGoal() { this.cameraJumps++; }
    showPoster() { this.posterShows++; this.posterVisible = true; }
    dismissPoster() { this.posterDismissals++; this.posterVisible = false; }
    // The viewer considers a loaded, revealed model in the viewport visible
    // even when the host's CSS visibility is hidden.
    get modelIsVisible() { return this.loaded && !this.posterVisible; }
  }
  const stage = new Element(), viewer = new Element(), modelLayer = new Element(), open = new Element();
  const close = new Element(), status = new Element(), otherControl = new Element();
  stage.dataset.state = 'photo';
  close.hidden = true;
  viewer.dataset.src = 'assets/models/violetta.glb';
  viewer.setAttribute('camera-orbit', '-32deg 78deg 105%');
  viewer.setAttribute('aria-hidden', 'true');
  viewer.tabIndex = -1;
  modelLayer.setAttribute('aria-hidden', 'true');
  const elements = {'#hero-bed': viewer, '.bed-model-layer': modelLayer, '.bed-open': open, '.bed-close': close, '.bed-status': status};
  stage.querySelector = selector => elements[selector];
  document.querySelector = () => stage;
  vm.runInNewContext(source, {
    document, window, customElements: {get: () => Element}, matchMedia: () => motion,
    setTimeout(callback, delay) {
      const id = ++nextTimer;
      timers.set(id, {callback, delay, at: time + delay});
      return id;
    },
    clearTimeout: id => timers.delete(id)
  });
  const click = element => element.dispatchEvent(new Event('click'));
  const loaded = () => {
    viewer.loaded = true;
    viewer.posterVisible = false; // model-viewer's reveal="auto" behavior
    viewer.dispatchEvent(new Event('load'));
  };
  const tick = elapsed => {
    const target = time + elapsed;
    for (;;) {
      const next = [...timers.entries()].filter(([, item]) => item.at <= target)
        .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!next) break;
      time = next[1].at;
      timers.delete(next[0]);
      next[1].callback();
    }
    time = target;
  };
  const transition = (propertyName = 'opacity', target = modelLayer) => {
    const event = new Event('transitionend');
    Object.defineProperties(event, {propertyName: {value: propertyName}, target: {value: target}});
    modelLayer.dispatchEvent(event);
  };
  const escape = () => {
    const event = new Event('keydown', {cancelable: true});
    Object.defineProperty(event, 'key', {value: 'Escape'});
    stage.dispatchEvent(event);
    return event;
  };
  return {stage, viewer, modelLayer, open, close, status, otherControl, document, window, motion, timers,
    click, loaded, tick, transition, escape};
}

function assertPhoto(f) {
  assert.equal(f.stage.dataset.state, 'photo');
  assert.equal(f.viewer.modelIsVisible, false, 'the finished return must stop native renderer visibility');
  assert.equal(f.open.hidden, false);
  assert.equal(f.open.getAttribute('aria-hidden'), null);
  assert.equal(f.open.tabIndex, 0);
  assert.equal(f.close.hidden, true);
  assert.equal(f.close.disabled, false);
  assert.equal(f.modelLayer.getAttribute('aria-hidden'), 'true');
  assert.equal(f.viewer.getAttribute('aria-hidden'), 'true');
  assert.equal(f.viewer.tabIndex, -1);
}

test('3D starts on photo activation and reopens immediately after closing', () => {
  const f = fixture();
  assert.equal(f.viewer.hasAttribute('src'), false, 'initial photo must not load the model');
  f.click(f.open);
  assert.equal(f.stage.dataset.state, 'loading');
  f.loaded();
  assert.equal(f.stage.dataset.state, 'model');
  assert.equal(f.viewer.modelIsVisible, true);
  assert.equal(f.open.hidden, false, 'the photograph remains in the layer stack');
  assert.equal(f.open.getAttribute('aria-hidden'), 'true');
  assert.equal(f.open.tabIndex, -1);
  const requests = f.viewer.assetRequests;
  f.click(f.close);
  assert.equal(f.stage.dataset.state, 'closing');
  assert.equal(f.viewer.modelIsVisible, true, 'retain the 3D pixels until the fade finishes');
  f.transition();
  assertPhoto(f);
  assert.equal(f.document.activeElement, f.open);
  f.click(f.open);
  assert.equal(f.stage.dataset.state, 'model', 'cached model must not wait for a second load event');
  assert.equal(f.viewer.modelIsVisible, true, 'the cached poster must be dismissed when reopening');
  assert.equal(f.viewer.assetRequests, requests, 'reopening must not download the GLB again');
});

test('a completion after closing cannot reveal the hidden model or steal focus', () => {
  const f = fixture();
  f.click(f.open);
  f.click(f.close);
  f.loaded();
  assertPhoto(f);
  assert.equal(f.viewer.modelIsVisible, false, 'late automatic poster dismissal must be reversed');
  assert.equal(f.document.activeElement, f.open);
  assert.equal(f.viewer.getAttribute('aria-hidden'), 'true');
  f.click(f.open);
  assert.equal(f.viewer.modelIsVisible, true);
  assert.equal(f.viewer.assetRequests, 1);
});

test('Escape returns an open or loading viewer to a renderer-hidden cached state', () => {
  for (const beforeLoad of [true, false]) {
    const f = fixture();
    f.click(f.open);
    if (!beforeLoad) f.loaded();
    assert.equal(f.escape().defaultPrevented, true);
    if (beforeLoad) f.loaded();
    else {
      assert.equal(f.stage.dataset.state, 'closing');
      const timerId = [...f.timers.keys()][0];
      assert.equal(f.escape().defaultPrevented, false, 'repeated Escape cannot restart closing');
      assert.equal([...f.timers.keys()][0], timerId);
      f.transition();
    }
    assertPhoto(f);
    assert.equal(f.document.activeElement, f.open);
    f.click(f.open);
    assert.equal(f.stage.dataset.state, 'model');
    assert.equal(f.viewer.assetRequests, 1);
  }
});

test('a failed model keeps the photo available and can retry with a fresh asset URL', () => {
  const f = fixture();
  f.click(f.open);
  const initialUrl = f.viewer.getAttribute('src');
  f.viewer.dispatchEvent(new Event('error'));
  assert.equal(f.stage.dataset.state, 'photo');
  assert.equal(f.open.hidden, false);
  assert.equal(f.status.hidden, false);
  f.click(f.open);
  assert.notEqual(f.viewer.getAttribute('src'), initialUrl);
  f.loaded();
  assert.equal(f.stage.dataset.state, 'model');
  assert.equal(f.status.hidden, true);
});

test('only the model-layer opacity completion releases the poster and closing controls', () => {
  const f = fixture();
  f.click(f.open); f.loaded();
  const posterShows = f.viewer.posterShows;
  f.click(f.close);
  assert.equal(f.close.disabled, true);
  assert.equal(f.close.hidden, false, 'the close control remains present while its layer fades');
  assert.equal(f.viewer.getAttribute('aria-hidden'), 'true');
  assert.equal(f.viewer.tabIndex, -1);
  assert.equal(f.modelLayer.getAttribute('aria-hidden'), 'true');
  assert.equal(f.document.activeElement, f.open, 'keyboard focus returns as soon as closing begins');
  f.transition('transform');
  f.transition('opacity', f.viewer);
  assert.equal(f.stage.dataset.state, 'closing', 'bubbling child and unrelated-property events cannot end the fade');
  assert.equal(f.viewer.posterShows, posterShows);
  f.transition();
  assertPhoto(f);
  assert.equal(f.viewer.posterShows, posterShows + 1);
  assert.equal(f.timers.size, 0);
});

test('a missing CSS completion falls back once and repeated close cannot extend the deadline', () => {
  const f = fixture();
  f.click(f.open); f.loaded(); f.click(f.close);
  assert.equal(f.timers.size, 1);
  const pending = [...f.timers.entries()][0];
  assert.equal(pending[1].delay, 600);
  f.tick(300);
  f.click(f.close); // Exercise the controller guard as well as the native disabled UI.
  assert.equal([...f.timers.keys()][0], pending[0]);
  f.tick(299);
  assert.equal(f.stage.dataset.state, 'closing');
  assert.equal(f.viewer.modelIsVisible, true);
  f.tick(1);
  assertPhoto(f);
  assert.equal(f.timers.size, 0);
  const posterShows = f.viewer.posterShows;
  f.transition(); f.tick(1000);
  assert.equal(f.viewer.posterShows, posterShows, 'completion after fallback must be harmless');
});

test('reopening midway preserves the rotated camera and cancels stale completion without reloading', () => {
  const f = fixture();
  f.click(f.open); f.loaded();
  f.viewer.cameraOrbit = '-67deg 65deg 98%';
  f.click(f.close);
  const staleCompletion = [...f.timers.values()][0].callback;
  f.tick(210);
  const assignments = f.viewer.cameraAssignments, jumps = f.viewer.cameraJumps, requests = f.viewer.assetRequests;
  f.click(f.open);
  assert.equal(f.stage.dataset.state, 'model');
  assert.equal(f.viewer.cameraOrbit, '-67deg 65deg 98%');
  assert.equal(f.viewer.cameraAssignments, assignments, 'a reversal must not assign the default orbit');
  assert.equal(f.viewer.cameraJumps, jumps);
  assert.equal(f.viewer.assetRequests, requests);
  assert.equal(f.timers.size, 0);
  assert.equal(f.viewer.modelIsVisible, true);
  assert.equal(f.close.disabled, false);
  assert.equal(f.close.hidden, false);
  assert.equal(f.viewer.getAttribute('aria-hidden'), null);
  assert.equal(f.viewer.tabIndex, 0);
  assert.equal(f.modelLayer.getAttribute('aria-hidden'), null);
  assert.equal(f.document.activeElement, f.viewer);
  staleCompletion(); f.transition(); f.tick(1000);
  assert.equal(f.stage.dataset.state, 'model', 'an old timer/event must not finish the interrupted return');
  assert.equal(f.viewer.modelIsVisible, true);
});

test('the old completion cannot terminate a newer return after rapid reopen and close', () => {
  const f = fixture();
  f.click(f.open); f.loaded(); f.click(f.close);
  const firstCompletion = [...f.timers.values()][0].callback;
  f.click(f.open); f.click(f.close);
  firstCompletion();
  assert.equal(f.stage.dataset.state, 'closing');
  assert.equal(f.viewer.modelIsVisible, true);
  f.transition();
  assertPhoto(f);
});

test('finishing the return does not steal focus after the visitor moves to another control', () => {
  const f = fixture();
  f.click(f.open); f.loaded(); f.click(f.close);
  f.otherControl.focus();
  f.transition();
  assertPhoto(f);
  assert.equal(f.document.activeElement, f.otherControl);
});

test('a late load during the fade keeps the final 3D frame until opacity completion', () => {
  const f = fixture();
  f.click(f.open); f.loaded(); f.click(f.close);
  const posterShows = f.viewer.posterShows;
  f.loaded();
  assert.equal(f.stage.dataset.state, 'closing');
  assert.equal(f.viewer.modelIsVisible, true);
  assert.equal(f.viewer.posterShows, posterShows, 'a late native load cannot blank an active fade');
  assert.equal(f.document.activeElement, f.open);
  assert.equal(f.timers.size, 1);
  f.transition();
  assertPhoto(f);
});

test('an active renderer error returns immediately rather than waiting for a fade', () => {
  const f = fixture();
  f.click(f.open); f.loaded();
  f.viewer.dispatchEvent(new Event('error'));
  assertPhoto(f);
  assert.equal(f.status.hidden, false);
  assert.equal(f.timers.size, 0);
});
