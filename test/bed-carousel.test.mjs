import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../dist/bed-carousel.js', import.meta.url), 'utf8')
  .replace('export function initBedCarousel', 'function initBedCarousel');
const models = ['violetta', 'hanna', 'konor', 'tatlin', 'milano', 'silvia', 'seda', 'soul', 'monika'];

// Model native scroll geometry and event delivery; no DOM library or GPU is needed.
function fixture({ names = models, width = 354, cardWidth = width * .88, gap = 16, reduced = false } = {}) {
  const document = new EventTarget();
  document.activeElement = null;
  const frames = new Map(), timers = new Map(), requests = [];
  let token = 0, resized;
  class Element extends EventTarget {
    classes = new Set();
    classList = { add: value => this.classes.add(value), remove: value => this.classes.delete(value) };
    focus(options) { document.activeElement = this; this.focusOptions = options; }
    contains(element) { return element === this || this.button === element; }
  }
  const track = new Element();
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
  document.querySelector = selector => selector === '#bed-grid' ? track : null;
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
  function event(type, properties = {}, target = track) {
    const result = new Event(type, { cancelable: true, bubbles: true });
    Object.assign(result, properties);
    target.dispatchEvent(result);
    // EventTarget has no DOM ancestry; model bubbling to the document for
    // release events whose target is the carousel or one of its children.
    if (target !== document && !result.cancelBubble) document.dispatchEvent(result);
    return result;
  }
  function move(direction, finish = true) {
    event('keydown', { key: direction < 0 ? 'ArrowLeft' : 'ArrowRight' });
    if (finish) settle();
  }
  flushFrames();
  return {
    track, originals, document, requests, first, visible, settle, move, event, nativeScroll,
    step: () => cardWidth + gap,
    resize(newWidth, newCardWidth) { track.clientWidth = newWidth; cardWidth = newCardWidth; resized(); settle(); }
  };
}

test('without UI arrow controls the first bed wraps backwards to Monika and forwards to Violetta', () => {
  const f = fixture();
  assert.equal(f.first(), 'violetta');
  f.move(-1);
  assert.equal(f.first(), 'monika');
  f.move(1);
  assert.equal(f.first(), 'violetta');
  assert.equal(f.track.children.length, models.length);
  assert.deepEqual(new Set(f.track.children), new Set(f.originals));
});

test('each bed remains reachable through repeated cycles in both directions and rapid key presses', () => {
  const f = fixture();
  let index = 0;
  for (const direction of [-1, 1]) {
    for (let count = 0; count < models.length * 3; count++) {
      f.move(direction, false);
      index = (index + direction + models.length) % models.length;
      assert.equal(f.first(), models[index]);
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

test('empty, single-card and fully visible catalogues ignore horizontal keyboard navigation', () => {
  for (const names of [[], ['violetta'], ['violetta', 'hanna', 'konor']]) {
    const f = fixture({ names, width: 1000, cardWidth: 300 });
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

test('horizontal wheel continues through both joins without waiting for scrollend', () => {
  const f = fixture();
  let index = 0;
  for (const direction of [1, -1]) {
    for (let count = 0; count < models.length * 3; count++) {
      const wheel = f.event('wheel', { deltaX: direction * f.step(), deltaY: 0, deltaMode: 0 });
      index = (index + direction + models.length) % models.length;
      assert.equal(wheel.defaultPrevented, true);
      assert.equal(f.first(), models[index], 'the wheel event itself must cross the join');
      assert.ok(f.track.scrollLeft > 0 && f.track.scrollLeft < f.track.scrollWidth - f.track.clientWidth);
    }
  }
  assert.equal(f.first(), 'violetta');
  assert.deepEqual(new Set(f.track.children), new Set(f.originals));
  f.settle();
});

test('one oversized wheel event consumes complete cycles without losing its remainder to clamping', () => {
  for (const direction of [1, -1]) {
    const f = fixture({ cardWidth: 300 });
    const distance = (models.length * 123 + 1) * f.step();
    const wheel = f.event('wheel', { deltaX: direction * distance, deltaY: 0, deltaMode: 0 });
    assert.equal(wheel.defaultPrevented, true);
    assert.equal(f.first(), direction > 0 ? 'hanna' : 'monika');
    assert.deepEqual(new Set(f.track.children), new Set(f.originals));
    assert.equal(f.track.children.length, models.length);
    assert.ok(f.track.scrollLeft > 0 && f.track.scrollLeft < f.track.scrollWidth - f.track.clientWidth);
    f.settle();
    assert.equal(f.first(), direction > 0 ? 'hanna' : 'monika');
  }
});

test('focused products cannot stop uninterrupted wheel and pointer scrolling at a physical edge', () => {
  const f = fixture();
  const focused = f.originals[0].button;
  focused.focus();
  let index = 0;
  for (const direction of [-1, 1]) {
    for (let count = 0; count < models.length * 2; count++) {
      f.event('wheel', { deltaX: direction * f.step(), deltaY: 0 });
      index = (index + direction + models.length) % models.length;
      assert.equal(f.first(), models[index]);
      assert.equal(f.document.activeElement, focused);
    }
  }
  f.event('pointerdown');
  for (const direction of [-1, 1]) {
    for (let count = 0; count < models.length * 2; count++) {
      f.nativeScroll(f.track.scrollLeft + direction * f.step());
      index = (index + direction + models.length) % models.length;
      assert.equal(f.first(), models[index], 'native scrolling must recycle before scrollend');
      assert.equal(f.document.activeElement, focused, 'moving a focused original must restore its focus');
      assert.ok(f.track.scrollLeft > 0 && f.track.scrollLeft < f.track.scrollWidth - f.track.clientWidth);
    }
  }
  assert.deepEqual(new Set(f.track.children), new Set(f.originals));
  f.settle();
});

test('a pause or premature scrollend during a held pointer cannot end continuous cycling', () => {
  for (const releaseEvent of ['pointerup', 'pointercancel']) {
    const f = fixture();
    f.event('pointerdown');
    f.nativeScroll(f.track.scrollLeft + f.step());
    assert.equal(f.first(), 'hanna');
    // Deliver scrollend and all idle timers while the pointer is still held.
    f.settle();
    assert.equal(f.track.classes.has('is-recentering'), true, 'gesture compensation stays active until release');
    let index = 1;
    for (const direction of [-1, 1]) {
      for (let count = 0; count < models.length * 2; count++) {
        f.nativeScroll(f.track.scrollLeft + direction * f.step());
        index = (index + direction + models.length) % models.length;
        assert.equal(f.first(), models[index], 'the same held gesture must continue after its pause');
        assert.ok(f.track.scrollLeft > 0 && f.track.scrollLeft < f.track.scrollWidth - f.track.clientWidth);
      }
    }
    f.event(releaseEvent);
    const visible = f.visible();
    f.settle();
    assert.equal(f.track.classes.has('is-recentering'), false, 'release completes gesture compensation');
    assert.deepEqual(f.visible(), visible, 'release does not change the visible products');
    assert.deepEqual(new Set(f.track.children), new Set(f.originals));
  }
});

test('releasing the mouse outside the carousel finishes its gesture cleanup', () => {
  const f = fixture();
  f.event('pointerup', { pointerType: 'mouse' }, f.document);
  f.event('pointerdown', { pointerType: 'mouse' });
  f.nativeScroll(f.track.scrollLeft + f.step());
  f.settle();
  assert.equal(f.first(), 'hanna');
  assert.equal(f.track.classes.has('is-recentering'), true);
  const visible = f.visible();
  // This release never visits the carousel's own EventTarget.
  f.event('pointerup', { pointerType: 'mouse' }, f.document);
  f.settle();
  assert.equal(f.track.classes.has('is-recentering'), false);
  assert.deepEqual(f.visible(), visible);
  f.move(-1);
  assert.equal(f.first(), 'violetta');
});

test('native touch pointercancel does not end a held pan before the actual finger release', () => {
  for (const releaseEvent of ['touchend', 'touchcancel']) {
    const f = fixture();
    f.event('pointerdown', { pointerType: 'touch' });
    f.event('touchstart', { touches: [{ identifier: 1 }] });
    f.nativeScroll(f.track.scrollLeft + f.step());
    f.event('pointercancel', { pointerType: 'touch' });
    f.settle();
    assert.equal(f.track.classes.has('is-recentering'), true, 'browser ownership of panning is not a finger release');
    let index = 1;
    for (let count = 0; count < models.length * 2; count++) {
      f.nativeScroll(f.track.scrollLeft + f.step());
      index = (index + 1) % models.length;
      assert.equal(f.first(), models[index], 'the same touch must keep cycling after its pause');
    }
    // A second finger ending must not finish the still-active first touch.
    f.event('pointerup', { pointerType: 'touch' }, f.document);
    f.event('touchend', { touches: [{ identifier: 1 }] }, f.document);
    f.settle();
    assert.equal(f.track.classes.has('is-recentering'), true);
    const visible = f.visible();
    f.event(releaseEvent, { touches: [] }, f.document);
    f.settle();
    assert.equal(f.track.classes.has('is-recentering'), false, 'the actual touch release finishes gesture compensation');
    assert.deepEqual(f.visible(), visible);
    assert.deepEqual(new Set(f.track.children), new Set(f.originals));
  }
});

test('vertical, vertically dominant and browser zoom wheel gestures retain browser behavior', () => {
  const f = fixture();
  const position = f.track.scrollLeft;
  for (const properties of [
    { deltaX: 0, deltaY: 200 },
    { deltaX: 30, deltaY: -200 },
    { deltaX: 100, deltaY: 0, ctrlKey: true },
    { deltaX: 100, deltaY: 0, metaKey: true }
  ]) {
    assert.equal(f.event('wheel', properties).defaultPrevented, false);
    assert.equal(f.track.scrollLeft, position);
    assert.equal(f.first(), 'violetta');
  }
});

test('line and page wheel units and Shift plus vertical wheel preserve their horizontal distances', () => {
  for (const deltaMode of [0, 1, 2]) {
    const f = fixture({ width: 316, cardWidth: 300 });
    const unit = deltaMode === 1 ? 16 : deltaMode === 2 ? f.track.clientWidth : 1;
    assert.equal(f.event('wheel', { deltaX: f.step() / unit, deltaY: 0, deltaMode }).defaultPrevented, true);
    assert.equal(f.first(), 'hanna');
    f.event('wheel', { deltaX: -f.step() / unit, deltaY: 0, deltaMode });
    assert.equal(f.first(), 'violetta');
    f.settle();
  }
  const f = fixture({ cardWidth: 300 });
  assert.equal(f.event('wheel', { deltaX: 0, deltaY: -f.step(), shiftKey: true }).defaultPrevented, true);
  assert.equal(f.first(), 'monika');
  f.event('wheel', { deltaX: 0, deltaY: f.step(), shiftKey: true });
  assert.equal(f.first(), 'violetta');
  f.settle();
});

function visibleGeometry(f) {
  return f.visible().map(id => {
    const card = f.originals.find(original => original.id === id);
    return { id, left: card.getBoundingClientRect().left };
  });
}

function assertSameGeometry(actual, expected, message) {
  assert.deepEqual(actual.map(card => card.id), expected.map(card => card.id), message);
  for (let index = 0; index < expected.length; index++) {
    assert.ok(Math.abs(actual[index].left - expected[index].left) < 1e-7,
      `${message}: ${expected[index].id} moved from ${expected[index].left} to ${actual[index].left}`);
  }
}

test('fractional wheel stops remain unchanged after timers and scrollend in both directions across the join', () => {
  for (const sample of [
    { start: -1, distance: 1.37, first: 'violetta' },
    { start: 0, distance: -.37, first: 'monika' },
    { start: 0, distance: .47, first: 'violetta' }
  ]) {
    const f = fixture();
    if (sample.start) f.move(sample.start);
    f.event('wheel', { deltaX: sample.distance * f.step(), deltaY: 0, deltaMode: 0 });
    assert.equal(f.first(), sample.first);
    const stopped = visibleGeometry(f);
    assert.ok(Math.abs(stopped[0].left) > 1, 'the user stopped between cards');
    const requestCount = f.requests.length;
    f.settle();
    assertSameGeometry(visibleGeometry(f), stopped, 'idle wheel cleanup must preserve the exact visual offset');
    assert.ok(f.requests.slice(requestCount).every(request => request.behavior === 'instant'),
      'cleanup must never start a smooth correction');
    f.settle();
    assertSameGeometry(visibleGeometry(f), stopped, 'a later scrollend must leave that offset alone too');
  }
});

test('native pointer release preserves a fractional stop without adjusting either direction', () => {
  for (const direction of [-1, 1]) {
    const f = fixture();
    f.event('pointerdown', { pointerType: 'mouse' });
    f.nativeScroll(f.track.scrollLeft + direction * f.step() * .41);
    const stopped = visibleGeometry(f);
    assert.ok(Math.abs(stopped[0].left) > 1);
    f.event('pointerup', { pointerType: 'mouse' }, f.document);
    f.settle();
    assertSameGeometry(visibleGeometry(f), stopped, 'pointer release and idle cleanup must keep the user position');
  }
});

test('each keyboard arrow advances exactly one stride from a fractional stop and preserves that offset', () => {
  for (const direction of [-1, 1]) {
    const f = fixture();
    f.event('wheel', { deltaX: f.step() * .41, deltaY: 0 });
    f.settle();
    const stopped = visibleGeometry(f);
    assert.ok(Math.abs(stopped[0].left) > 1, 'keyboard navigation starts from an unsnapped position');
    const position = f.track.scrollLeft;
    f.move(direction, false);
    assert.ok(Math.abs(f.requests.at(-1).left - position - direction * f.step()) < 1e-7,
      'keyboard movement is relative to the exact current position');
    f.settle();
    assert.equal(f.first(), direction > 0 ? 'hanna' : 'monika');
    assert.ok(Math.abs(visibleGeometry(f)[0].left - stopped[0].left) < 1e-7);
    f.move(-direction);
    assertSameGeometry(visibleGeometry(f), stopped, 'opposite keyboard arrows return to the same visual position');
  }
});

test('pointer takeover cancels an unfinished smooth keyboard movement at its current offset', () => {
  const f = fixture();
  f.move(1, false);
  assert.equal(f.requests.at(-1).behavior, 'smooth');
  // The fixture scrolls immediately by default; this represents a browser
  // animation observed before its previously requested destination is reached.
  f.nativeScroll(f.track.scrollLeft - f.step() * .46);
  const position = f.track.scrollLeft;
  const stopped = visibleGeometry(f);
  const requestCount = f.requests.length;
  f.event('pointerdown', { pointerType: 'mouse' });
  const cancellation = f.requests.slice(requestCount).find(request =>
    request.behavior === 'instant' && Math.abs(request.left - position) < 1e-7);
  assert.ok(cancellation, 'native pointer input must cancel the pending animation at its current position');
  assertSameGeometry(visibleGeometry(f), stopped, 'cancelling the animation must not jump to its old destination');
  f.event('pointerup', { pointerType: 'mouse' }, f.document);
  f.settle();
  assertSameGeometry(visibleGeometry(f), stopped, 'the cancelled animation stays cancelled after release');
});

test('zero-gap cards keep fractional wheel stops through both joins and support one-step keyboard navigation', () => {
  const f = fixture({ gap: 0, cardWidth: 300 });
  assert.equal(f.step(), 300);
  for (const { distance, first } of [
    { distance: -.37, first: 'monika' },
    { distance: 1, first: 'violetta' },
    { distance: -1, first: 'monika' },
    { distance: 1, first: 'violetta' }
  ]) {
    f.event('wheel', { deltaX: distance * f.step(), deltaY: 0, deltaMode: 0 });
    assert.equal(f.first(), first, 'each wheel event crosses the join without waiting for idle');
    assert.ok(Math.abs(visibleGeometry(f)[0].left + .63 * f.step()) < 1e-7);
    assert.deepEqual(new Set(f.track.children), new Set(f.originals));
  }
  const stopped = visibleGeometry(f);
  f.settle();
  assertSameGeometry(visibleGeometry(f), stopped, 'zero-gap idle cleanup keeps the fractional position');
  f.move(1);
  assert.equal(f.first(), 'hanna');
  assert.ok(Math.abs(visibleGeometry(f)[0].left - stopped[0].left) < 1e-7);
  f.move(-1);
  assertSameGeometry(visibleGeometry(f), stopped, 'opposite keyboard movement restores the zero-gap stop');
  assert.equal(f.track.children.length, models.length);
  assert.deepEqual(new Set(f.track.children), new Set(f.originals));
});
