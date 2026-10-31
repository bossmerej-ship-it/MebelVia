import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Exercise the photo/loading/model transitions without a GPU or network.
const source = readFileSync(new URL('../dist/bed-viewer.js', import.meta.url), 'utf8');
function fixture() {
  class Element extends EventTarget {
    attrs = new Map();
    dataset = {};
    hidden = false;
    loaded = false;
    posterVisible = true;
    assetRequests = 0;
    getAttribute(key) { return this.attrs.get(key) ?? null; }
    setAttribute(key, value) { this.attrs.set(key, String(value)); if (key === 'src') this.assetRequests++; }
    removeAttribute(key) { this.attrs.delete(key); }
    hasAttribute(key) { return this.attrs.has(key); }
    focus() { document.activeElement = this; }
    jumpCameraToGoal() {}
    showPoster() { this.posterVisible = true; }
    dismissPoster() { this.posterVisible = false; }
    // The viewer considers a loaded, revealed model in the viewport visible
    // even when the host's CSS visibility is hidden.
    get modelIsVisible() { return this.loaded && !this.posterVisible; }
  }
  const stage = new Element(), viewer = new Element(), open = new Element();
  const close = new Element(), status = new Element();
  stage.dataset.state = 'photo';
  viewer.dataset.src = 'assets/models/violetta.glb';
  viewer.setAttribute('camera-orbit', '-32deg 78deg 105%');
  const elements = {'#hero-bed': viewer, '.bed-open': open, '.bed-close': close, '.bed-status': status};
  stage.querySelector = selector => elements[selector];
  const document = {querySelector: () => stage, activeElement: null};
  vm.runInNewContext(source, {
    document, customElements: {get: () => Element},
    setTimeout: () => 1, clearTimeout: () => {}
  });
  const click = element => element.dispatchEvent(new Event('click'));
  const loaded = () => {
    viewer.loaded = true;
    viewer.posterVisible = false; // model-viewer's reveal="auto" behavior
    viewer.dispatchEvent(new Event('load'));
  };
  return {stage, viewer, open, close, status, document, click, loaded};
}

test('3D starts on photo activation and reopens immediately after closing', () => {
  const f = fixture();
  assert.equal(f.viewer.hasAttribute('src'), false, 'initial photo must not load the model');
  f.click(f.open);
  assert.equal(f.stage.dataset.state, 'loading');
  f.loaded();
  assert.equal(f.stage.dataset.state, 'model');
  assert.equal(f.viewer.modelIsVisible, true);
  const requests = f.viewer.assetRequests;
  f.click(f.close);
  assert.equal(f.stage.dataset.state, 'photo');
  assert.equal(f.viewer.modelIsVisible, false, 'the closed viewer must also stop renderer visibility');
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
  assert.equal(f.stage.dataset.state, 'photo');
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
    const event = new Event('keydown', {cancelable: true});
    Object.defineProperty(event, 'key', {value: 'Escape'});
    f.stage.dispatchEvent(event);
    assert.equal(event.defaultPrevented, true);
    if (beforeLoad) f.loaded();
    assert.equal(f.stage.dataset.state, 'photo');
    assert.equal(f.viewer.modelIsVisible, false);
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
