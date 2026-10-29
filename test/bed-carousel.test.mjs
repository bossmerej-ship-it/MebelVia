import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../dist/bed-carousel.js', import.meta.url), 'utf8')
  .replace('export function initBedCarousel', 'function initBedCarousel');
const models = ['violetta', 'hanna', 'konor', 'tatlin', 'milano', 'silvia', 'seda', 'soul', 'monika'];

// Model native scroll geometry and event delivery; no DOM library or GPU is needed.
function fixture({ names = models, width = 354, cardWidth = width * .88, gap = 16, reduced = false } = {}) {
  const document = { activeElement: null };
  const frames = new Map(), timers = new Map(), requests = [];
  let token = 0, resized;
  class Element extends EventTarget {
    disabled = false;
    classes = new Set();
    classList = { add: value => this.classes.add(value), remove: value => this.classes.delete(value) };
    focus(options) { document.activeElement = this; this.focusOptions = options; }
    contains(element) { return element === this || this.button === element; }
  }
  const track = new Element(), previous = new Element(), next = new Element();
  let children = names.map(id => {
    const card = new Element();
    card.id = id;
    card.button = new Element();
    card.getBoundingClientRect = () => {
      const left = children.indexOf(card) * (cardWidth + gap) - scrollLeft;
      return { left, right: left + cardWidth, width: cardWidth };
    };
    return card;
  });
  const originals = [...children];
  let scrollLeft = 0;
  track.clientWidth = width;
  Object.defineProperties(track, {
    children: { get: () => children },
    firstElementChild: { get: () => children[0] ?? null },
    lastElementChild: { get: () => children.at(-1) ?? null },
    scrollWidth: { get: () => Math.max(0, children.length * (cardWidth + gap) - gap) },
    scrollLeft: { get: () => scrollLeft }
  });
  track.contains = element => element === track || children.some(card => card.contains(element));
  track.getBoundingClientRect = () => ({ left: 0, right: track.clientWidth, width: track.clientWidth });
  function relocate(card, before) {
    if (card.contains(document.activeElement)) document.activeElement = null;
    children.splice(children.indexOf(card), 1);
    if (before) children.unshift(card); else children.push(card);
  }
  track.prepend = card => relocate(card, true);
  track.append = card => relocate(card, false);
  function nativeScroll(left) {
    const nextLeft = Math.max(0, Math.min(Math.max(0, track.scrollWidth - track.clientWidth), left));
    if (nextLeft !== scrollLeft) {
      scrollLeft = nextLeft;
      track.dispatchEvent(new Event('scroll'));
    }
  }
  track.scrollTo = options => { requests.push(options); nativeScroll(options.left); };
  document.querySelector = selector => ({ '#bed-grid': track, '.catalog-arrow-prev': previous, '.catalog-arrow-next': next })[selector];
  vm.runInNewContext(`${source}\ninitBedCarousel();`, {
    document,
    matchMedia: () => ({ matches: reduced }),
    getComputedStyle: () => ({ columnGap: String(gap) }),
    requestAnimationFrame: callback => { frames.set(++token, callback); return token; },
    cancelAnimationFrame: id => frames.delete(id),
    setTimeout: callback => { timers.set(++token, callback); return token; },
    clearTimeout: id => timers.delete(id),
    ResizeObserver: class { constructor(callback) { resized = callback; } observe() {} }
  });
  function flushFrames() {
    for (const [id, callback] of [...frames]) { frames.delete(id); callback(); }
  }
  function settle() {
    track.dispatchEvent(new Event('scrollend'));
    for (let pass = 0; timers.size && pass < 10; pass++) {
      for (const [id, callback] of [...timers]) { timers.delete(id); callback(); }
    }
    assert.equal(timers.size, 0, 'scroll settling must not loop');
    flushFrames();
  }
  function first() {
    return children.find(card => card.getBoundingClientRect().right > 1)?.id;
  }
  function visible() {
    return children.filter(card => {
      const rect = card.getBoundingClientRect();
      return rect.right > 1 && rect.left < track.clientWidth - 1;
    }).map(card => card.id);
  }
  function event(type, properties = {}) {
    const result = new Event(type, { cancelable: true });
    Object.assign(result, properties);
    track.dispatchEvent(result);
    return result;
  }
  function move(direction, finish = true) {
    (direction < 0 ? previous : next).dispatchEvent(new Event('click'));
    if (finish) settle();
  }
  flushFrames();
  return {
    track, previous, next, originals, document, requests, first, visible, settle, move, event, nativeScroll,
    step: () => cardWidth + gap,
    resize(newWidth, newCardWidth) { track.clientWidth = newWidth; cardWidth = newCardWidth; resized(); settle(); }
  };
}

test('first bed wraps backwards to Monika and forwards to Violetta without cloned cards', () => {
  const f = fixture();
  assert.equal(f.first(), 'violetta');
  assert.equal(f.previous.disabled, false);
  assert.equal(f.next.disabled, false);
  f.move(-1);
  assert.equal(f.first(), 'monika');
  f.move(1);
  assert.equal(f.first(), 'violetta');
  assert.equal(f.track.children.length, models.length);
  assert.deepEqual(new Set(f.track.children), new Set(f.originals));
});

test('each bed remains reachable through repeated cycles in both directions and rapid clicks', () => {
  const f = fixture();
  let index = 0;
  for (const direction of [-1, 1]) {
    for (let count = 0; count < models.length * 3; count++) {
      f.move(direction, false);
      index = (index + direction + models.length) % models.length;
      assert.equal(f.first(), models[index]);
      assert.equal(f.previous.disabled || f.next.disabled, false);
    }
    f.settle();
    assert.equal(f.first(), models[index]);
  }
});

test('keyboard arrows wrap, modifiers retain their native behavior, and reduced motion is instant', () => {
  const f = fixture({ reduced: true });
  assert.equal(f.event('keydown', { key: 'ArrowLeft' }).defaultPrevented, true);
  f.settle();
  assert.equal(f.first(), 'monika');
  for (const modifier of ['altKey', 'ctrlKey', 'metaKey', 'shiftKey']) {
    assert.equal(f.event('keydown', { key: 'ArrowRight', [modifier]: true }).defaultPrevented, false);
    assert.equal(f.first(), 'monika');
  }
  assert.equal(f.event('keydown', { key: 'Tab' }).defaultPrevented, false);
  assert.equal(f.event('keydown', { key: 'ArrowRight' }).defaultPrevented, true);
  f.settle();
  assert.equal(f.first(), 'violetta');
  assert.ok(f.requests.every(request => request.behavior === 'instant'));
});

test('empty, single-card and fully visible catalogues stay stable with disabled arrows', () => {
  for (const names of [[], ['violetta'], ['violetta', 'hanna', 'konor']]) {
    const f = fixture({ names, width: 1000, cardWidth: 300 });
    assert.equal(f.previous.disabled, true);
    assert.equal(f.next.disabled, true);
    f.move(-1); f.move(1);
    assert.deepEqual(f.track.children, f.originals);
    assert.equal(f.track.scrollLeft, 0);
  }
});

test('native scroll settles by recycling invisible cards without changing the visible products', () => {
  for (const boundary of ['start', 'end']) {
    const f = fixture();
    f.nativeScroll(boundary === 'start' ? 0 : f.track.scrollWidth - f.track.clientWidth);
    const visible = f.visible();
    f.settle();
    assert.deepEqual(f.visible(), visible);
    assert.ok(f.track.scrollLeft > 0 && f.track.scrollLeft < f.track.scrollWidth - f.track.clientWidth);
    assert.equal(f.event('wheel', { deltaX: 0, deltaY: -100 }).defaultPrevented, false);
  }
});

test('focused product buttons are retained and native Tab navigation does not endlessly recycle', () => {
  const f = fixture();
  const focused = f.track.lastElementChild.button;
  focused.focus();
  f.nativeScroll(0);
  const order = [...f.track.children];
  f.settle();
  assert.deepEqual(f.track.children, order, 'settling must not recycle around keyboard focus');
  assert.equal(f.document.activeElement, focused);
  f.event('keydown', { key: 'ArrowLeft' });
  f.settle();
  assert.equal(f.document.activeElement, focused, 'explicit navigation preserves a moved button focus');
  assert.equal(f.track.children.length, f.originals.length);
});

test('responsive resize preserves the selected bed while recalculating its physical offset', () => {
  const f = fixture();
  f.move(1); f.move(1); f.move(1);
  assert.equal(f.first(), 'tatlin');
  f.resize(1100, (1100 - 44) / 3);
  assert.equal(f.first(), 'tatlin');
  f.resize(354, 354 * .88);
  assert.equal(f.first(), 'tatlin');
  f.move(-1);
  assert.equal(f.first(), 'konor');
});
