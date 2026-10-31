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
function fixture(reduced = false, options = {}) {
  class Element extends EventTarget {
    attrs = new Map();
    dataset = {};
    assetRequests = 0;
    setAttribute(key, value) { this.attrs.set(key, String(value)); if (key === 'src') this.assetRequests++; }
    getAttribute(key) { return this.attrs.get(key) ?? null; }
    removeAttribute(key) { this.attrs.delete(key); }
    querySelectorAll() { return []; }
    closest() { return null; }
    pause() { this.paused = true; }
    jumpCameraToGoal() {}
  }
  const section = new Element(), viewer = new Element(), photo = new Element();
  const sticky = { clientHeight: 1000, getBoundingClientRect: () => ({top:0,bottom:1000}) };
  const hasVisualBounds = options.visualTop !== undefined || options.visualBottom !== undefined;
  const visual = {top:options.visualTop ?? 2200,bottom:options.visualBottom ?? 3200,
    getBoundingClientRect() {return {top:this.top,bottom:this.bottom};}};
  section.dataset.liftState = 'photo';
  section.top = options.sectionTop ?? 0;
  section.querySelector = selector => ({ '#hanna-bed': viewer, '.collection-image': photo, '.collection-sticky': sticky, '.collection-visual': visual })[selector];
  viewer.dataset.src = 'assets/models/hanna.glb';
  viewer.availableAnimations = ['Lift'];
  viewer.duration = 1;
  const document = new EventTarget();
  document.querySelector = () => section;
  document.hidden = options.hidden ?? false;
  document.readyState = options.startupPending ? 'interactive' : 'complete';
  const window = new EventTarget();
  window.innerWidth = 1440;
  window.innerHeight = 1000;
  window.scrollY = options.scrollY ?? 0;
  window.location = { hash: '' };
  window.scrolls = [];
  window.scrollBy = ({ top }) => { window.scrolls.push(top); window.scrollY += top; };
  const reservedHeight = () => section.dataset.liftLayout === 'reserved' ? 1400 : 0;
  let boundsReads = 0;
  section.getBoundingClientRect = () => {
    boundsReads++;
    return { top: section.top - window.scrollY, height: 1000 + reservedHeight() };
  };
  const poses = [];
  let displayedTime = 0;
  Object.defineProperty(viewer, 'currentTime', {
    get: () => displayedTime,
    set: value => { displayedTime = value; poses.push(value); }
  });
  const catalogue = new Element();
  catalogue.getBoundingClientRect = () => {
    const top = (options.followingTop ?? 4000) + reservedHeight() - window.scrollY;
    return { top, bottom: top + 700, left: 0, right: 1440, width: 1440, height: 700 };
  };
  section.nextElementSibling = catalogue;
  const motion = new EventTarget();
  motion.matches = reduced;
  const narrow = { matches: false };
  const frames = new Map(), timers = new Map(), idle = new Map();
  let frameId = 0, timerId = 0, idleId = 0, intersect, warmIntersect, intersectionOptions, observedTarget, now = 0;
  class IntersectionObserver {
    constructor(callback, configuration) {
      if (configuration.rootMargin === '0px') {intersect = callback; intersectionOptions = configuration;}
      else warmIntersect = callback;
    }
    observe(target) { observedTarget = target; }
  }
  if (!options.noObserver) window.IntersectionObserver = IntersectionObserver;
  if (!options.noIdle) {
    window.requestIdleCallback = (callback, configuration) => {idle.set(++idleId,{callback,configuration});return idleId;};
    window.cancelIdleCallback = id => idle.delete(id);
  }
  let registered = !options.deferImport, resolveImport;
  const pendingImport = new Promise(resolve => {resolveImport = () => {registered = true; resolve();};});
  const source = readFileSync(new URL('../dist/hanna-lift.js', import.meta.url), 'utf8')
    .replaceAll('export function ', 'function ')
    .replace("await import('./assets/vendor/model-viewer-4.4.0.min.js');", 'await importViewer();');
  vm.runInNewContext(source, {
    document, window, IntersectionObserver,
    matchMedia: query => query.includes('max-width') ? narrow : motion,
    customElements: { get: () => registered ? Element : undefined },
    importViewer: () => pendingImport,
    getComputedStyle: element => ({ visibility: element.visibility ?? 'visible', display: 'block' }),
    performance: { now: () => now },
    requestAnimationFrame: callback => { frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame: id => frames.delete(id),
    setTimeout: (callback, delay) => { callback.delay = delay; timers.set(++timerId, callback); return timerId; },
    clearTimeout: id => timers.delete(id)
  });
  const flush = (elapsed = 1000 / 60) => {
    now += elapsed;
    for (const [id, callback] of Array.from(frames)) { frames.delete(id); callback(now); }
  };
  const settle = () => {
    for (let i = 0; frames.size && i < 120; i++) flush();
    assert.equal(frames.size, 0, 'the damper must settle without an idle frame loop');
  };
  const finishStartup = () => {flush();flush();};
  const waitForVisit = () => {
    for (const [id, item] of [...idle]) {idle.delete(id);item.callback();}
    for (const [id, callback] of [...timers]) if (callback.delay === 300) {timers.delete(id);callback();}
  };
  if (!options.startupPending && !options.hidden) finishStartup();
  return {
    section, viewer, photo, catalogue, visual, window, document, motion, frames, timers, idle, flush, settle, poses,
    intersectionOptions, observedTarget,
    advance: elapsed => {now += elapsed;}, resolveImport,
    reads: () => boundsReads,
    near(value) {
      if (!hasVisualBounds) {visual.top = value ? 0 : 2200; visual.bottom = value ? 1000 : 3200;}
      intersect([{ isIntersecting: value }]);
    },
    warm() {warmIntersect([{isIntersecting:true}]);},
    waitForVisit, finishStartup,
    loaded: () => viewer.dispatchEvent(new Event('load')),
    narrow: value => { narrow.matches = value; window.dispatchEvent(new Event('resize')); },
    preference: value => { motion.matches = value; motion.dispatchEvent(new Event('change')); waitForVisit(); }
  };
}

test('closer camera stays fixed through forward and reverse lift, with room on narrow screens', () => {
  const f = fixture();
  f.near(true); f.loaded(); f.flush();
  const camera = f.viewer.getAttribute('camera-orbit');
  assert.equal(camera, '0deg 85deg 5.2m');
  for (const top of [-700, -1400, -700, 0]) {
    f.section.top = top;
    f.window.dispatchEvent(new Event('scroll')); f.settle();
    assert.equal(f.viewer.getAttribute('camera-orbit'), camera);
  }
  f.section.top = -700;
  f.window.dispatchEvent(new Event('scroll')); f.settle();
  const time = f.viewer.currentTime;
  f.narrow(true); f.flush();
  assert.equal(f.viewer.getAttribute('camera-orbit'), '0deg 85deg 5.65m');
  assert.equal(f.viewer.currentTime, time);
  f.narrow(false); f.flush();
  assert.equal(f.viewer.getAttribute('camera-orbit'), camera);
  assert.equal(f.viewer.currentTime, time);
});

test('asset loading is lazy and failure keeps the accessible photo in normal flow', () => {
  const f = fixture();
  assert.equal(f.section.dataset.liftLayout, 'reserved', 'reserve scroll geometry before the model is requested');
  assert.equal(f.section.dataset.liftState, 'photo');
  assert.equal(f.viewer.getAttribute('src'), null);
  f.near(true);
  assert.equal(f.section.dataset.liftState, 'loading');
  assert.equal(f.viewer.getAttribute('src'), 'assets/models/hanna.glb');
  f.viewer.dispatchEvent(new Event('error'));
  assert.equal(f.section.dataset.liftState, 'unavailable');
  assert.equal(f.section.dataset.liftLayout, undefined);
  assert.equal(f.viewer.getAttribute('aria-hidden'), 'true');
  assert.equal(f.photo.getAttribute('aria-hidden'), null);
  f.loaded();
  assert.equal(f.section.dataset.liftState, 'unavailable', 'a late response must not replace the fallback');
  assert.equal(f.frames.size, 0);
});

test('brief restoration intersections do not start WebGL or download a model', () => {
  const f = fixture(false, {startupPending:true});
  f.near(true);
  assert.equal(f.viewer.getAttribute('src'), null);
  assert.equal(f.section.dataset.liftState, 'photo');
  f.near(false);
  f.window.dispatchEvent(new Event('pageshow'));
  f.finishStartup();
  f.waitForVisit();
  assert.equal(f.viewer.getAttribute('src'), null, 'restoration below the scene cancels transient preparation');
  assert.equal(f.timers.size, 0);
  f.near(true);
  assert.equal(f.viewer.getAttribute('src'), 'assets/models/hanna.glb', 'a visible visit expedites preparation');
});

test('ahead-of-screen preparation is bounded and continuous scrolling cannot starve it', () => {
  const f = fixture(false, {visualTop:1400,visualBottom:2100});
  assert.equal(f.viewer.getAttribute('src'), null);
  const firstIdle = [...f.idle.keys()][0];
  assert.equal(f.idle.get(firstIdle).configuration.timeout,500);
  for (let index = 0; index < 30; index++) {
    f.advance(16);
    f.window.dispatchEvent(new Event('scroll'));
    f.flush();
    assert.equal([...f.idle.keys()][0], firstIdle, 'scrolling must not replace the preparatory deadline');
  }
  f.waitForVisit();
  assert.equal(f.viewer.getAttribute('src'), 'assets/models/hanna.glb', 'prepare before the canvas enters the screen');
  f.window.dispatchEvent(new Event('scroll'));
  f.flush();
  f.waitForVisit();
  assert.equal(f.viewer.assetRequests, 1, 'subsequent scrolls must not restart the requested asset');
  f.visual.top = 0;
  f.visual.bottom = 1000;
  f.near(true);
  f.loaded();
  f.section.top = -700;
  f.window.dispatchEvent(new Event('scroll')); f.settle();
  assert.ok(Math.abs(f.viewer.currentTime - .499995) < .000001, 'the loaded mechanism still follows scrolling');
});

test('leaving the ahead range cancels pending preparation before any import', () => {
  const f = fixture(false, {visualTop:1400,visualBottom:2100});
  assert.equal(f.idle.size,1);
  f.visual.top = -1800;
  f.visual.bottom = -100;
  f.warm();
  f.waitForVisit();
  assert.equal(f.idle.size,0);
  assert.equal(f.viewer.getAttribute('src'),null);
  assert.equal(f.section.dataset.liftState,'photo');
});

test('missing requestIdleCallback uses one bounded timer instead of a scroll debounce', () => {
  const f = fixture(false, {visualTop:1400,visualBottom:2100,noIdle:true});
  const pending = [...f.timers.entries()].find(([,callback]) => callback.delay===300);
  assert.ok(pending);
  for(let i=0;i<20;i++) {f.window.dispatchEvent(new Event('scroll'));f.flush();}
  assert.equal(f.timers.get(pending[0]),pending[1],'input cannot move the original timer');
  f.waitForVisit();
  assert.equal(f.viewer.getAttribute('src'),'assets/models/hanna.glb');
  assert.equal(f.viewer.assetRequests,1);
});

test('history restoration cancels old ahead work and resamples the new position', () => {
  const f = fixture(false, {visualTop:1400,visualBottom:2100});
  f.window.dispatchEvent(new Event('pagehide'));
  assert.equal(f.idle.size,0);
  f.visual.top = -1800;
  f.visual.bottom = -100;
  f.window.dispatchEvent(new Event('pageshow'));
  f.waitForVisit();
  assert.equal(f.viewer.getAttribute('src'),null);
  f.finishStartup();
  f.waitForVisit();
  assert.equal(f.viewer.getAttribute('src'),null);
  assert.equal(f.frames.size,0,'restoration must not leave a permanent frame loop');
});

test('reduced motion prevents ahead downloads and cancels a queued idle slot', () => {
  const initial = fixture(true,{visualTop:1400,visualBottom:2100});
  initial.waitForVisit();
  assert.equal(initial.viewer.getAttribute('src'),null);
  assert.equal(initial.idle.size,0);
  const changed = fixture(false,{visualTop:1400,visualBottom:2100});
  assert.equal(changed.idle.size,1);
  changed.preference(true);
  changed.waitForVisit();
  assert.equal(changed.viewer.getAttribute('src'),null);
  assert.equal(changed.idle.size,0);
});

test('leaving the warm range during a delayed viewer import cancels GLB initialization', async () => {
  const f = fixture(false, {deferImport:true,visualTop:1400,visualBottom:2100});
  f.waitForVisit();
  assert.equal(f.section.dataset.liftState, 'loading');
  assert.equal(f.viewer.getAttribute('src'), null);
  f.advance(40);
  f.visual.top = -1500;
  f.visual.bottom = -500;
  f.window.dispatchEvent(new Event('scroll'));
  f.flush();
  f.resolveImport();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.viewer.getAttribute('src'), null, 'the imported viewer must recheck the current destination');
  assert.equal(f.section.dataset.liftState, 'photo');
  f.visual.top = 1400;
  f.visual.bottom = 2100;
  f.warm();
  f.waitForVisit();
  assert.equal(f.viewer.getAttribute('src'), 'assets/models/hanna.glb');
  assert.equal(f.viewer.assetRequests, 1);
});

test('background loads wait for visibility and current scene intersection', () => {
  const f = fixture(false, {hidden:true});
  f.near(true);
  assert.equal(f.viewer.getAttribute('src'), null);
  f.document.hidden = false;
  f.document.dispatchEvent(new Event('visibilitychange'));
  f.finishStartup();
  f.waitForVisit();
  assert.equal(f.viewer.getAttribute('src'), 'assets/models/hanna.glb');
  const leave = fixture(false, {visualTop:1400,visualBottom:2100});
  leave.document.hidden = true;
  leave.document.dispatchEvent(new Event('visibilitychange'));
  leave.waitForVisit();
  assert.equal(leave.viewer.getAttribute('src'), null);
  assert.equal(leave.timers.size, 0);
});

test('a distant mobile canvas or a restored sliver above the catalogue stays dormant', () => {
  const f = fixture(false, {visualTop:1800,visualBottom:2400});
  f.warm();
  f.waitForVisit();
  assert.equal(f.viewer.getAttribute('src'), null, 'only prepare within the bounded ahead range');
  assert.equal(f.section.dataset.liftState, 'photo');
  const behind = fixture(false, {visualTop:-900,visualBottom:100});
  behind.near(true);
  behind.waitForVisit();
  assert.equal(behind.viewer.getAttribute('src'), null, 'a catalogue reload must not initialize a remnant behind it');
});

test('an edge-adjacent canvas can queue a new visit when its first pixels enter', () => {
  const f = fixture(false, {visualTop:1000,visualBottom:1700});
  assert.equal(f.observedTarget, f.visual, 'observe the canvas area rather than the heading');
  assert.ok(f.intersectionOptions.threshold > 0 && f.intersectionOptions.threshold < .01,
    'zero-area intersections need a distinct threshold from actually visible pixels');
  assert.equal(f.viewer.getAttribute('src'), null, 'offscreen preparation waits for its bounded idle slot');
  f.visual.top = 999;
  f.near(true);
  assert.equal(f.viewer.getAttribute('src'), 'assets/models/hanna.glb');
  assert.equal(f.idle.size,0,'actual visibility expedites and cancels the idle wait');
});

test('without IntersectionObserver the bed remains lazy and activates on a later visit', () => {
  const f = fixture(false, {noObserver:true,visualTop:1800,visualBottom:2400});
  assert.equal(f.viewer.getAttribute('src'), null);
  assert.equal(f.timers.size, 0);
  f.visual.top = 1400;
  f.window.dispatchEvent(new Event('scroll'));
  f.flush();
  assert.equal(f.viewer.getAttribute('src'), null, 'ahead preparation is still scheduled, not immediate');
  f.visual.top = 1800;
  f.window.dispatchEvent(new Event('scroll'));
  f.flush();
  f.waitForVisit();
  assert.equal(f.viewer.getAttribute('src'), null, 'a passing gesture must cancel loading');
  f.visual.top = 0;
  f.window.dispatchEvent(new Event('resize'));
  f.flush();
  f.waitForVisit();
  assert.equal(f.viewer.getAttribute('src'), 'assets/models/hanna.glb');
  f.loaded();
  f.section.top = -700;
  f.window.dispatchEvent(new Event('scroll')); f.settle();
  assert.ok(Math.abs(f.viewer.currentTime - .499995) < .000001);
  f.visual.top = -1800; f.visual.bottom = -100;
  f.window.dispatchEvent(new Event('scroll'));
  f.flush();
  assert.equal(f.frames.size, 0);
  f.section.top = -1400;
  f.window.dispatchEvent(new Event('scroll'));
  f.flush();
  assert.equal(f.frames.size, 0, 'the fallback must also stop offscreen GPU updates');
  f.visual.top = 0; f.visual.bottom = 1000;
  f.window.dispatchEvent(new Event('pageshow'));
  assert.ok(f.viewer.currentTime > .9999, 'reentry samples the current pose');
  assert.equal(f.frames.size, 0, 'no permanent fallback frame loop');
});

test('a missing response times out without activating a tall scroll section', () => {
  const f = fixture();
  f.near(true);
  for (const callback of f.timers.values()) callback();
  assert.equal(f.section.dataset.liftState, 'unavailable');
  assert.equal(f.section.dataset.liftLayout, undefined);
  assert.equal(f.frames.size, 0);
});

test('one wheel step produces intermediate poses, settles exactly, and reverses from the open end', () => {
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
  assert.ok(f.viewer.currentTime > 0 && f.viewer.currentTime < .9999, 'a wheel notch must not seek directly to its final pose');
  assert.equal(f.frames.size, 1, 'fill the gap between discrete scroll inputs');
  f.settle();
  assert.ok(f.viewer.currentTime > 0.9999 && f.viewer.currentTime < 1);
  assert.equal(f.frames.size, 0, 'there must be no animation loop after scroll stops');
  f.section.top = -700;
  f.window.dispatchEvent(new Event('scroll'));
  f.flush();
  assert.ok(f.viewer.currentTime > .5 && f.viewer.currentTime < .9999);
  f.settle();
  assert.ok(Math.abs(f.viewer.currentTime - 0.5) < 0.00001);
  f.near(false);
  f.window.dispatchEvent(new Event('scroll'));
  assert.equal(f.frames.size, 0, 'offscreen content must not schedule frames');
});

test('reduced motion avoids download and can be changed during the session', () => {
  const f = fixture(true);
  f.near(true);
  assert.equal(f.section.dataset.liftState, 'reduced');
  assert.equal(f.section.dataset.liftLayout, undefined);
  assert.equal(f.viewer.getAttribute('src'), null);
  f.preference(false);
  assert.equal(f.section.dataset.liftLayout, 'reserved');
  f.loaded();
  f.flush();
  assert.equal(f.section.dataset.liftState, 'ready');
  f.preference(true);
  assert.equal(f.section.dataset.liftState, 'reduced');
  assert.equal(f.section.dataset.liftLayout, undefined);
  assert.equal(f.photo.getAttribute('aria-hidden'), null);
  f.window.dispatchEvent(new Event('scroll'));
  assert.equal(f.frames.size, 0);
  f.preference(false);
  f.flush();
  assert.equal(f.section.dataset.liftState, 'ready');
});

test('a reload restored before initialization keeps visible catalogue content without a fragment', () => {
  const f = fixture(false, { scrollY: 4200, followingTop: 4300 });
  assert.equal(f.window.location.hash, '');
  assert.equal(f.catalogue.getBoundingClientRect().top, 100);
  assert.deepEqual(f.window.scrolls, [1400]);
  assert.equal(f.viewer.getAttribute('src'), null, 'reserving geometry must not eagerly download the model');
  f.near(true); f.loaded();
  assert.equal(f.catalogue.getBoundingClientRect().top, 100);
  assert.deepEqual(f.window.scrolls, [1400], 'a late successful load must not change geometry again');
});

test('a reload restored after initialization remains stable when the lazy model finishes', () => {
  const f = fixture(false, { followingTop: 4300 });
  f.window.scrollY = 5600;
  assert.equal(f.catalogue.getBoundingClientRect().top, 100);
  f.near(true); f.loaded();
  assert.equal(f.catalogue.getBoundingClientRect().top, 100);
  assert.deepEqual(f.window.scrolls, []);
  assert.ok(f.viewer.currentTime > .9999, 'the fully open restored pose is ready before the next animation frame');
});

test('a load failure shrinks the reserved section without moving the visible catalogue', () => {
  const f = fixture(false, { followingTop: 4300 });
  f.window.scrollY = 5600;
  f.near(true);
  f.viewer.dispatchEvent(new Event('error'));
  assert.equal(f.catalogue.getBoundingClientRect().top, 100);
  assert.deepEqual(f.window.scrolls, [-1400]);
  assert.equal(f.section.dataset.liftLayout, undefined);
  f.preference(true); f.preference(false);
  assert.equal(f.section.dataset.liftLayout, undefined, 'a failed scene must keep its normal-flow fallback');
});

test('preference changes preserve visible content when removing and restoring the reserved layout', () => {
  const f = fixture(false, { followingTop: 4300 });
  f.near(true); f.loaded(); f.flush();
  f.window.scrollY = 5600;
  f.preference(true);
  assert.equal(f.catalogue.getBoundingClientRect().top, 100);
  assert.equal(f.section.dataset.liftLayout, undefined);
  f.preference(false);
  assert.equal(f.catalogue.getBoundingClientRect().top, 100);
  assert.equal(f.section.dataset.liftLayout, 'reserved');
  assert.deepEqual(f.window.scrolls, [-1400, 1400]);
  assert.ok(f.viewer.currentTime > .9999);
});

test('layout preservation ignores hidden and horizontally clipped carousel cards', () => {
  const f = fixture(false, { followingTop: 4300 });
  f.near(true); f.loaded(); f.flush();
  f.window.scrollY = 5600;
  const fixedCard = (left, visibility = 'visible', clipLeft = 0) => ({
    visibility,
    getBoundingClientRect: () => ({ top: 50, bottom: 250, left, right: left + 200, width: 200, height: 200 }),
    closest: () => ({ getBoundingClientRect: () => ({ left: clipLeft, right: 1440 }) })
  });
  const visibleCard = {
    getBoundingClientRect: () => ({ ...f.catalogue.getBoundingClientRect(), left: 100, right: 500, width: 400 }),
    closest: () => ({ getBoundingClientRect: () => ({ left: 0, right: 1440 }) })
  };
  f.catalogue.querySelectorAll = () => [fixedCard(1600), fixedCard(100, 'hidden'), fixedCard(100, 'visible', 500), visibleCard];
  f.preference(true);
  assert.equal(visibleCard.getBoundingClientRect().top, 100);
  assert.deepEqual(f.window.scrolls, [-1400]);
});

test('activation samples a halfway restored lift before revealing the model', () => {
  const f = fixture(false, { sectionTop: -700 });
  f.near(true); f.loaded();
  assert.equal(f.section.dataset.liftState, 'ready');
  assert.ok(Math.abs(f.viewer.currentTime - .5) < .00001);
});

test('scroll events coalesce layout reads and settling frames reuse the latest target', () => {
  const f = fixture();
  f.near(true); f.loaded();
  const before = f.reads();
  for (const top of [-350, -550, -700]) {
    f.section.top = top;
    f.window.dispatchEvent(new Event('scroll'));
  }
  assert.equal(f.frames.size, 1, 'several inputs before a paint share one frame');
  assert.equal(f.reads(), before, 'scroll listeners do not force layout');
  f.flush();
  assert.equal(f.reads(), before + 1);
  const first = f.viewer.currentTime;
  assert.ok(first > 0 && first < .5);
  f.settle();
  assert.equal(f.reads(), before + 1, 'settling must not keep measuring the page');
  assert.ok(Math.abs(f.viewer.currentTime - .499995) < .000001, 'the latest input, not the first one, wins');
  const writes = f.poses.length;
  f.flush(1000);
  assert.equal(f.poses.length, writes, 'no idle GPU updates after settling');
});

test('damping uses elapsed time consistently across display refresh rates', () => {
  const atRate = step => {
    const f = fixture();
    f.near(true); f.loaded();
    f.section.top = -1400;
    f.window.dispatchEvent(new Event('scroll'));
    for (let elapsed = 0; elapsed < 160; elapsed += step) f.flush(step);
    return f.viewer.currentTime;
  };
  assert.ok(Math.abs(atRate(16) - atRate(8)) < .000001, '60Hz and 120Hz must not change the response speed');
});

test('a quick reversal starts from the displayed pose and never overshoots either target', () => {
  const f = fixture();
  f.near(true); f.loaded();
  f.section.top = -1400;
  f.window.dispatchEvent(new Event('scroll'));
  f.flush(); f.flush();
  const turningPoint = f.viewer.currentTime;
  assert.ok(turningPoint > 0 && turningPoint < .99999);
  const start = f.poses.length;
  f.section.top = 0;
  f.window.dispatchEvent(new Event('scroll'));
  assert.equal(f.viewer.currentTime, turningPoint, 'input must not snap the current frame');
  f.flush();
  assert.ok(f.viewer.currentTime > 0 && f.viewer.currentTime < turningPoint);
  f.settle();
  const reversed = [turningPoint, ...f.poses.slice(start)];
  assert.ok(reversed.every((value, index) => value >= 0 && (!index || value <= reversed[index - 1])));
  assert.equal(f.viewer.currentTime, 0);
});

test('hidden and offscreen scenes cancel settling and resume at the current scroll pose', () => {
  for (const hidden of [true, false]) {
    const f = fixture();
    f.near(true); f.loaded();
    f.section.top = -1400;
    f.window.dispatchEvent(new Event('scroll')); f.flush();
    assert.equal(f.frames.size, 1);
    if (hidden) {
      f.document.hidden = true;
      f.document.dispatchEvent(new Event('visibilitychange'));
    } else f.near(false);
    assert.equal(f.frames.size, 0);
    f.section.top = -700;
    f.window.dispatchEvent(new Event('scroll'));
    assert.equal(f.frames.size, 0, 'an invisible scene cannot request more GPU work');
    if (hidden) {
      f.document.hidden = false;
      f.document.dispatchEvent(new Event('visibilitychange'));
    } else f.near(true);
    assert.ok(Math.abs(f.viewer.currentTime - .499995) < .000001, 'reentry samples the current position directly');
    assert.equal(f.frames.size, 0, 'reentry must not replay missed movement');
  }
});

test('resize, page restoration and reduced motion replace a pending wheel tail without replay', () => {
  const f = fixture();
  f.near(true); f.loaded();
  f.section.top = -1400;
  f.window.dispatchEvent(new Event('scroll')); f.flush();
  assert.equal(f.frames.size, 1);
  f.section.top = -700;
  f.narrow(true);
  assert.ok(Math.abs(f.viewer.currentTime - .499995) < .000001);
  assert.equal(f.frames.size, 0);
  f.section.top = -1400;
  f.window.dispatchEvent(new Event('scroll')); f.flush();
  f.section.top = 0;
  f.window.dispatchEvent(new Event('pageshow'));
  assert.equal(f.viewer.currentTime, 0);
  assert.equal(f.frames.size, 0);
  f.section.top = -700;
  f.window.dispatchEvent(new Event('scroll')); f.flush();
  f.preference(true);
  assert.equal(f.frames.size, 0);
  f.preference(false);
  assert.ok(Math.abs(f.viewer.currentTime - .499995) < .000001);
  assert.equal(f.frames.size, 0);
});

test('a delayed frame is bounded instead of jumping to the final pose', () => {
  const f = fixture();
  f.near(true); f.loaded();
  f.section.top = -1400;
  f.window.dispatchEvent(new Event('scroll'));
  f.flush(5000);
  assert.ok(f.viewer.currentTime > 0 && f.viewer.currentTime < .5);
  f.settle();
  assert.equal(f.viewer.currentTime, .99999);
});
