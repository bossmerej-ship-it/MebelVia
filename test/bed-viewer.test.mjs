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
    getAttribute(key) { return this.attrs.get(key) ?? null; }
    setAttribute(key, value) { this.attrs.set(key, String(value)); }
    removeAttribute(key) { this.attrs.delete(key); }
    hasAttribute(key) { return this.attrs.has(key); }
    focus() { document.activeElement = this; }
    jumpCameraToGoal() {}
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
  const loaded = () => { viewer.loaded = true; viewer.dispatchEvent(new Event('load')); };
  return {stage, viewer, open, close, status, document, click, loaded};
}

test('3D starts on photo activation and reopens immediately after closing', () => {
  const f = fixture();
  assert.equal(f.viewer.hasAttribute('src'), false, 'initial photo must not load the model');
  f.click(f.open);
  assert.equal(f.stage.dataset.state, 'loading');
  f.loaded();
  assert.equal(f.stage.dataset.state, 'model');
  f.click(f.close);
  assert.equal(f.stage.dataset.state, 'photo');
  assert.equal(f.document.activeElement, f.open);
  f.click(f.open);
  assert.equal(f.stage.dataset.state, 'model', 'cached model must not wait for a second load event');
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
