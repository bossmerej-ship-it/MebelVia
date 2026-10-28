import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { liftProgress } from '../dist/hanna-lift.js';

test('lift stays closed and open during the two 12% scroll holds', () => {
  const sectionHeight = 2400, viewportHeight = 1000, travel = 1400;
  for (const offset of [-1000, 0, travel * 0.12]) {
    assert.equal(liftProgress(-offset, sectionHeight, viewportHeight), 0);
  }
  for (const offset of [travel * 0.88, travel, travel + 1000]) {
    assert.equal(liftProgress(-offset, sectionHeight, viewportHeight), 1);
  }
  assert.equal(liftProgress(-travel * 0.5, sectionHeight, viewportHeight), 0.5);
});

test('scrolling backwards revisits exactly the same positions without history', () => {
  const points = Array.from({ length: 101 }, (_, index) => index * 10);
  const forward = points.map(offset => liftProgress(-offset, 1800, 800));
  const backward = points.toReversed().map(offset => liftProgress(-offset, 1800, 800));
  assert.deepEqual(backward.toReversed(), forward);
  assert.ok(forward.every((value, index) => index === 0 || value >= forward[index - 1]));
  assert.ok(forward.every(value => value >= 0 && value <= 1));
});

test('a static fallback or temporarily zero-height viewport cannot produce a bad pose', () => {
  assert.equal(liftProgress(-500, 700, 700), 0);
  assert.equal(liftProgress(-500, 0, 700), 0);
});

// Exercise failure and preference changes without a GPU or network. The real
// model-viewer is checked in the browser; this fixture covers our lifecycle.
function fixture(reduced = false) {
  class Element extends EventTarget {
    attrs = new Map();
    dataset = {};
    setAttribute(key, value) { this.attrs.set(key, String(value)); }
    getAttribute(key) { return this.attrs.get(key) ?? null; }
    removeAttribute(key) { this.attrs.delete(key); }
    pause() { this.paused = true; }
    jumpCameraToGoal() {}
  }
  const section = new Element(), viewer = new Element(), photo = new Element();
  const sticky = { clientHeight: 1000 };
  section.dataset.liftState = 'photo';
  section.top = 0;
  section.getBoundingClientRect = () => ({ top: section.top, height: 2400 });
  section.querySelector = selector => ({ '#hanna-bed': viewer, '.collection-image': photo, '.collection-sticky': sticky })[selector];
  viewer.dataset.src = 'assets/models/hanna.glb';
  viewer.availableAnimations = ['Lift'];
  viewer.duration = 1;
  const document = new EventTarget();
  document.querySelector = () => section;
  document.hidden = false;
  const window = new EventTarget();
  const motion = new EventTarget();
  motion.matches = reduced;
  const frames = new Map(), timers = new Map();
  let frameId = 0, timerId = 0, intersect;
  class IntersectionObserver {
    constructor(callback) { intersect = callback; }
    observe() {}
  }
  window.IntersectionObserver = IntersectionObserver;
  const source = readFileSync(new URL('../dist/hanna-lift.js', import.meta.url), 'utf8').replaceAll('export function ', 'function ');
  vm.runInNewContext(source, {
    document, window, IntersectionObserver,
    matchMedia: () => motion,
    customElements: { get: () => Element },
    requestAnimationFrame: callback => { frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame: id => frames.delete(id),
    setTimeout: callback => { timers.set(++timerId, callback); return timerId; },
    clearTimeout: id => timers.delete(id)
  });
  const flush = () => {
    for (const [id, callback] of frames) { frames.delete(id); callback(); }
  };
  return {
    section, viewer, photo, window, document, motion, frames, timers, flush,
    near: value => intersect([{ isIntersecting: value }]),
    loaded: () => viewer.dispatchEvent(new Event('load')),
    preference: value => { motion.matches = value; motion.dispatchEvent(new Event('change')); }
  };
}

test('asset loading is lazy and failure keeps the accessible photo in normal flow', () => {
  const f = fixture();
  assert.equal(f.viewer.getAttribute('src'), null);
  f.near(true);
  assert.equal(f.section.dataset.liftState, 'loading');
  assert.equal(f.viewer.getAttribute('src'), 'assets/models/hanna.glb');
  f.viewer.dispatchEvent(new Event('error'));
  assert.equal(f.section.dataset.liftState, 'unavailable');
  assert.equal(f.viewer.getAttribute('aria-hidden'), 'true');
  assert.equal(f.photo.getAttribute('aria-hidden'), null);
  f.loaded();
  assert.equal(f.section.dataset.liftState, 'unavailable', 'a late response must not replace the fallback');
  assert.equal(f.frames.size, 0);
});

test('a missing response times out without activating a tall scroll section', () => {
  const f = fixture();
  f.near(true);
  for (const callback of f.timers.values()) callback();
  assert.equal(f.section.dataset.liftState, 'unavailable');
  assert.equal(f.frames.size, 0);
});

test('scroll renders only on demand, holds its pose, and reverses from the open end', () => {
  const f = fixture();
  f.near(true);
  f.loaded();
  f.flush();
  assert.equal(f.section.dataset.liftState, 'ready');
  assert.equal(f.viewer.currentTime, 0);
  assert.equal(f.viewer.paused, true);
  f.section.top = -1400;
  f.window.dispatchEvent(new Event('scroll'));
  f.flush();
  assert.ok(f.viewer.currentTime > 0.9999 && f.viewer.currentTime < 1);
  assert.equal(f.frames.size, 0, 'there must be no animation loop after scroll stops');
  f.section.top = -700;
  f.window.dispatchEvent(new Event('scroll'));
  f.flush();
  assert.ok(Math.abs(f.viewer.currentTime - 0.5) < 0.00001);
  f.near(false);
  f.window.dispatchEvent(new Event('scroll'));
  assert.equal(f.frames.size, 0, 'offscreen content must not schedule frames');
});

test('reduced motion avoids download and can be changed during the session', () => {
  const f = fixture(true);
  f.near(true);
  assert.equal(f.section.dataset.liftState, 'reduced');
  assert.equal(f.viewer.getAttribute('src'), null);
  f.preference(false);
  f.loaded();
  f.flush();
  assert.equal(f.section.dataset.liftState, 'ready');
  f.preference(true);
  assert.equal(f.section.dataset.liftState, 'reduced');
  assert.equal(f.photo.getAttribute('aria-hidden'), null);
  f.window.dispatchEvent(new Event('scroll'));
  assert.equal(f.frames.size, 0);
  f.preference(false);
  f.flush();
  assert.equal(f.section.dataset.liftState, 'ready');
});

test('a late response preserves a visible catalogue anchor through height changes', () => {
  const f = fixture();
  let scroll = 0;
  const anchor = {getBoundingClientRect: () => ({top:116 + (f.section.dataset.liftState === 'ready' ? 1400 : 0) - scroll})};
  f.window.location = {hash:'#beds'};
  f.window.innerHeight = 1000;
  f.window.scrollBy = ({top}) => { scroll += top; };
  f.document.getElementById = () => anchor;
  f.section.contains = () => false;
  f.near(true);
  f.loaded();
  assert.equal(anchor.getBoundingClientRect().top,116);
  assert.equal(scroll,1400);
  f.preference(true);
  assert.equal(anchor.getBoundingClientRect().top,116);
  assert.equal(scroll,0);
});
