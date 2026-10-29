import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../dist/reveal.js', import.meta.url), 'utf8')
  .replace('export function initReveals', 'function initReveals');

// The fixture models the real section hierarchy, clipping in the horizontal
// catalogue, observer delivery, and cancellable Web Animations without a GPU.
function fixture({ reduced = false, scroll = 0, startTime = 1000, hash = '', hidden = false, navigationType = 'reload', readyState = 'loading', bootstrap = false, noObserver = false, noAnimate = false, observerError = false, animateError = false } = {}) {
  let now = startTime;
  const window = new EventTarget();
  Object.assign(window, { innerHeight: 800, innerWidth: 1200, scrollY: scroll, location: { hash } });
  const document = new EventTarget();
  Object.assign(document, { readyState, hidden });
  const motion = new EventTarget();
  motion.matches = reduced;
  const effects = [], observers = [];
  let firstBedAnimationSawAllMarked;
  let firstDeliveryAnimationSawAllMarked;
  let horizontal = 0;

  class Element extends EventTarget {
    constructor(tag, { id = '', classes = '', top = 1600, left = 0, width = 300, height = 60, href } = {}) {
      super();
      Object.assign(this, { tag, id, classes: new Set(classes.split(' ').filter(Boolean)), top, left, width, height, href, children: [], parentElement: null, dataset: {}, hidden: false });
      this.style = { opacity: '', translate: '', transform: '', visibility: '' };
    }
    append(child) { this.children.push(child); child.parentElement = this; return child; }
    contains(target) { return target === this || this.children.some(child => child.contains(target)); }
    matches(selector) {
      if (selector === 'a[href^="#"]') return this.tag === 'a' && this.href?.startsWith('#');
      if (selector.startsWith('#')) return this.id === selector.slice(1);
      if (selector.startsWith('.')) return this.classes.has(selector.slice(1));
      return this.tag === selector;
    }
    closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector); }
    querySelectorAll(selector) {
      const descendants = [];
      const visit = parent => parent.children.forEach(child => { descendants.push(child); visit(child); });
      visit(this);
      return descendants.filter(node => selector.split(',').some(part => {
        const item = part.trim();
        if (item.includes('>')) {
          const [parent, child] = item.split('>').map(value => value.trim());
          return node.matches(child) && node.parentElement?.matches(parent);
        }
        const pieces = item.split(/\s+/);
        return pieces.length === 2
          ? node.matches(pieces[1]) && node.parentElement?.closest(pieces[0])
          : node.matches(item);
      }));
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    getBoundingClientRect() {
      const left = this.parentElement?.id === 'bed-grid'
        ? this.parentElement.children.indexOf(this) * 400 - horizontal : this.left;
      const top = this.top - window.scrollY;
      return { top, bottom: top + this.height, left, right: left + this.width, width: this.width, height: this.height };
    }
    animate(frames, options) {
      if (this.parentElement?.id === 'bed-grid' && firstBedAnimationSawAllMarked === undefined) {
        firstBedAnimationSawAllMarked = this.parentElement.children.every(card => card.dataset.revealState === 'done');
      }
      if (this.parentElement?.classes.has('delivery-inner') && firstDeliveryAnimationSawAllMarked === undefined) {
        firstDeliveryAnimationSawAllMarked = this.parentElement.children.every(child => child.dataset.revealState === 'done');
      }
      if (animateError) throw new Error('Animation API unavailable');
      let resolve, reject;
      const animation = {
        cancelled: false,
        finished: new Promise((yes, no) => { resolve = yes; reject = no; }),
        cancel() { this.cancelled = true; reject(new Error('Animation cancelled')); },
        finish() { resolve(); }
      };
      effects.push({ element: this, frames, options, animation });
      return animation;
    }
  }
  if (noAnimate) Element.prototype.animate = undefined;

  const main = new Element('main', { id: 'top', top: 0, width: 1200, height: 6000 });
  const hero = main.append(new Element('section', { classes: 'hero', top: 0 }));
  const heroTitle = hero.append(new Element('h1', { id: 'hero-title', top: 70 }));
  const heroActions = hero.append(new Element('div', { classes: 'hero-actions', top: 220 }));
  const anchorLink = heroActions.append(new Element('a', { top: 220, href: '#beds' }));
  const heroImage = hero.append(new Element('img', { classes: 'bed-photo', top: 0 }));
  const collection = main.append(new Element('section', { classes: 'collection-section', top: 900 }));
  const copy = collection.append(new Element('div', { classes: 'collection-copy', top: 950 }));
  const heading = copy.append(new Element('h2', { top: 980 }));
  const description = copy.append(new Element('p', { top: 1060 }));
  const action = copy.append(new Element('a', { classes: 'collection-link', top: 1130, href: '#beds' }));
  const actionIcon = action.append(new Element('svg', { top: 1130 }));
  const scene = collection.append(new Element('div', { classes: 'collection-visual', top: 900 }));
  const hanna = scene.append(new Element('model-viewer', { id: 'hanna-bed', top: 900 }));
  const fallback = scene.append(new Element('img', { classes: 'collection-image', top: 900 }));
  const beds = main.append(new Element('section', { id: 'beds', top: 1750 }));
  const bedsTitle = beds.append(new Element('h2', { id: 'beds-title', top: 1780 }));
  const track = beds.append(new Element('div', { id: 'bed-grid', top: 1880, width: 1200, height: 500 }));
  const cards = Array.from({ length: 9 }, (_, index) => track.append(new Element('article', { id: `bed-${index}`, classes: 'product-card', top: 1880, width: 400, height: 500 })));
  const mattresses = main.append(new Element('section', { id: 'mattresses', top: 2550 }));
  const mattressTitle = mattresses.append(new Element('h2', { id: 'mattresses-title', top: 2600 }));
  const mattressGrid = mattresses.append(new Element('div', { id: 'mattress-grid', top: 2700 }));
  const mattressCards = Array.from({ length: 3 }, (_, index) => mattressGrid.append(new Element('article', { classes: 'product-card', top: 2700, left: index * 400 })));
  const delivery = main.append(new Element('section', { classes: 'delivery-section', top: 3250 }));
  const deliveryGroup = delivery.append(new Element('div', { classes: 'delivery-inner', top: 3270 }));
  const deliveryCopy = deliveryGroup.append(new Element('div', { classes: 'delivery-copy', top: 3300 }));
  const deliveryTitle = deliveryCopy.append(new Element('h2', { id: 'delivery-title', top: 3300 }));
  const image = deliveryGroup.append(new Element('img', { classes: 'delivery-porter', top: 3350 }));
  const faq = main.append(new Element('div', { id: 'faq', classes: 'faq', top: 3600 }));
  faq.append(new Element('h2', { top: 3600 }));
  const rows = Array.from({ length: 3 }, (_, index) => faq.append(new Element('details', { top: 3700 + index * 100 })));
  const consultation = main.append(new Element('div', { classes: 'consultation', top: 4000 }));
  consultation.append(new Element('h2', { top: 4000 }));
  const consultationAction = consultation.append(new Element('a', { classes: 'button', top: 4200 }));

  document.querySelector = selector => selector === 'main' ? main : null;
  document.getElementById = id => id === 'top' ? main : main.querySelectorAll(`#${id}`)[0];
  class IntersectionObserver {
    constructor(callback, options) {
      if (observerError) throw new Error('Observer creation failed');
      this.callback = callback; this.options = options; this.observed = new Set(); observers.push(this);
    }
    observe(element) { this.observed.add(element); }
    unobserve(element) { this.observed.delete(element); }
    disconnect() { this.disconnected = true; this.observed.clear(); }
  }
  window.IntersectionObserver = noObserver ? undefined : IntersectionObserver;
  const context = { document, window, Element, IntersectionObserver, matchMedia: () => motion, performance: { now: () => now, getEntriesByType: type => type === 'navigation' ? [{ type: navigationType }] : [] } };
  vm.runInNewContext(source, context);
  const dispose = bootstrap ? () => {} : context.initReveals();

  function event(type, target, properties = {}, surface = document) {
    const value = new Event(type);
    Object.defineProperty(value, 'target', { value: target });
    Object.assign(value, properties);
    surface.dispatchEvent(value);
  }
  return {
    main, heroTitle, heroImage, anchorLink, heading, description, action, actionIcon, beds, bedsTitle, track, cards, mattressTitle, mattressCards, deliveryGroup, deliveryCopy, deliveryTitle, image, rows, consultationAction, hanna, fallback,
    effects, observers, document, window, motion, dispose,
    firstBedMarked: () => firstBedAnimationSawAllMarked,
    firstDeliveryMarked: () => firstDeliveryAnimationSawAllMarked,
    enter(...elements) { observers[0]?.callback(elements.map(target => ({ target, isIntersecting: true, boundingClientRect: target.getBoundingClientRect() }))); },
    advance(ms) { now += ms; },
    scroll(y, ms = 16) { now += ms; window.scrollY = y; window.dispatchEvent(new Event('scroll')); },
    interaction(type, target) { event(type, target); },
    clickAnchor() { event('click', anchorLink); },
    hash(value) { window.location.hash = value; window.dispatchEvent(new Event('hashchange')); },
    reduced(value) { motion.matches = value; event('change', motion, { matches: value }, motion); },
    visible(value) { document.hidden = !value; document.dispatchEvent(new Event('visibilitychange')); },
    recycle() { track.children.push(track.children.shift()); horizontal = 0; }
  };
}

function assertNaturalStyles(...elements) {
  for (const element of elements) {
    assert.equal(element.hidden, false);
    assert.deepEqual(element.style, { opacity: '', translate: '', transform: '', visibility: '' });
  }
}

test('missing animation capabilities and observer initialization failure leave content visible', () => {
  for (const options of [{ noObserver: true }, { noAnimate: true }, { observerError: true }, { animateError: true }]) {
    const f = fixture(options);
    f.enter(f.heading, f.track, f.deliveryGroup);
    assert.equal(f.effects.length, 0);
    assertNaturalStyles(f.heroTitle, f.heading, f.track, ...f.cards, f.deliveryCopy, f.image, f.hanna, f.fallback);
    assert.doesNotThrow(f.dispose);
  }
});

test('already visible or passed content stays painted and Hanna scene nodes are never observed', () => {
  const f = fixture({ scroll: 2000 });
  assert.equal(f.effects.length, 0);
  for (const element of [f.heroTitle, f.heading, f.track, ...f.cards]) {
    assert.equal(element.dataset.revealState, 'done');
    assert.equal(f.observers[0].observed.has(element), false);
  }
  for (const element of [f.heroImage, f.hanna, f.fallback]) {
    assert.equal(element.dataset.revealState, undefined);
    assert.equal(f.observers[0].observed.has(element), false);
  }
  assertNaturalStyles(f.heroTitle, f.heading, f.hanna, f.fallback);
});

test('a fresh opening at the top visibly introduces the hero and input can finish it immediately', () => {
  const f = fixture({ startTime: 100, navigationType: 'navigate' });
  assert.deepEqual(new Set(f.effects.map(effect => effect.element)), new Set([f.heroTitle, f.anchorLink]));
  assert.equal(f.heroTitle.dataset.revealState, 'running');
  assert.equal(f.anchorLink.dataset.revealState, 'running');
  const title = f.effects.find(effect => effect.element === f.heroTitle);
  const action = f.effects.find(effect => effect.element === f.anchorLink);
  assert.equal(title.frames[0].translate, '0 16px');
  assert.equal(title.options.duration, 600);
  assert.equal(action.frames[0].translate, '0 12px');
  assert.equal(action.options.duration, 500);
  assert.equal(f.heroImage.dataset.revealState, undefined, 'the hero photograph stays naturally painted');
  f.interaction('focusin', f.heroTitle);
  assert.equal(title.animation.cancelled, true);
  f.interaction('pointerdown', f.anchorLink);
  assert.equal(action.animation.cancelled, true);
  assertNaturalStyles(f.heroTitle, f.anchorLink, f.heroImage);
  f.dispose();
});

test('restored positions, section links and hidden tabs never restart the hero', () => {
  for (const options of [
    { startTime: 100, scroll: 120 },
    { startTime: 100, hash: '#beds' },
    { startTime: 100, navigationType: 'reload' },
    { startTime: 100, navigationType: 'back_forward' },
    { startTime: 2000, navigationType: 'reload' },
    { startTime: 100, hidden: true }
  ]) {
    const f = fixture({ navigationType: 'navigate', ...options });
    assert.equal(f.effects.length, 0);
    assert.equal(f.heroTitle.dataset.revealState, 'done');
    assert.equal(f.heroImage.dataset.revealState, undefined);
    assertNaturalStyles(f.heroTitle, f.anchorLink, f.heroImage);
    f.dispose();
  }
});

test('a fresh navigation has the same gentle hero introduction regardless of asset loading time', () => {
  for (const startTime of [100, 900, 2000]) {
    const f = fixture({ navigationType: 'navigate', startTime });
    assert.deepEqual(new Set(f.effects.map(effect => effect.element)), new Set([f.heroTitle, f.anchorLink]));
    assert.equal(f.heroImage.dataset.revealState, undefined);
    assertNaturalStyles(f.heroImage);
    f.dispose();
  }
});

test('reload and back navigation remain readable when the browser restores scroll after initialization', () => {
  for (const navigationType of ['reload', 'back_forward']) {
    const f = fixture({ startTime: 100, navigationType });
    assert.equal(f.effects.length, 0);
    f.scroll(2500);
    f.enter(f.heroTitle, f.heroImage, f.anchorLink);
    f.scroll(0, 300);
    f.enter(f.heroTitle, f.heroImage, f.anchorLink);
    assert.equal(f.effects.length, 0);
    assert.equal(f.heroTitle.dataset.revealState, 'done');
    assertNaturalStyles(f.heroTitle, f.anchorLink, f.heroImage);
    f.dispose();
  }
});

test('the optional module starts at interactive readiness and waits only while the document is loading', () => {
  const interactive = fixture({ readyState: 'interactive', bootstrap: true });
  assert.equal(interactive.observers.length, 1);
  assert.equal(interactive.heading.dataset.revealState, 'pending');
  interactive.document.dispatchEvent(new Event('DOMContentLoaded'));
  assert.equal(interactive.observers.length, 1, 'DOMContentLoaded must not initialize the module twice');

  const loading = fixture({ readyState: 'loading', bootstrap: true });
  assert.equal(loading.observers.length, 0);
  loading.document.dispatchEvent(new Event('DOMContentLoaded'));
  assert.equal(loading.observers.length, 1);
});

test('scroll reveals wait until elements enter the viewport rather than finishing below it', () => {
  const f = fixture();
  assert.equal(f.observers[0].options.rootMargin, '0px 0px -32px');
  assert.equal(f.observers[0].options.threshold, .06);
  assert.equal(f.observers[0].observed.has(f.heading), true);
  assert.equal(f.heading.dataset.revealState, 'pending');
  f.enter(f.heading);
  assert.equal(f.heading.dataset.revealState, 'running');
  assert.equal(f.effects[0].options.duration, 600);
});

test('text, actions and card batches use bounded motion without replacing hover transforms', () => {
  const f = fixture();
  f.enter(f.heading, f.description, f.action, ...f.mattressCards, ...f.rows);
  assert.equal(f.effects.length, 9);
  for (const { frames, options } of f.effects) {
    assert.ok(options.duration >= 450 && options.duration <= 700);
    assert.ok(options.delay >= 0 && options.delay <= 140);
    assert.equal(options.fill, 'backwards');
    assert.match(options.easing, /cubic-bezier/);
    assert.ok(frames.every(frame => !('transform' in frame) && !('scale' in frame) && !('rotate' in frame)));
    assert.equal(frames[0].opacity, 0);
    assert.equal(frames.at(-1).opacity, 1);
    if ('translate' in frames[0]) {
      const distance = Number(frames[0].translate.match(/^0 (\d+)px$/)?.[1]);
      assert.ok(distance >= 12 && distance <= 24);
    }
  }
  assert.deepEqual(f.effects.filter(effect => f.mattressCards.includes(effect.element)).map(effect => effect.options.delay), [0, 70, 140]);
  const count = f.effects.length;
  f.enter(f.heading, ...f.mattressCards);
  assert.equal(f.effects.length, count, 'returning to a section must not restart its reveal');
});

test('delivery enters once as a synchronized horizontal pair with opposite directions', () => {
  const f = fixture();
  assert.equal(f.observers[0].observed.has(f.deliveryGroup), true);
  for (const child of [f.deliveryCopy, f.deliveryTitle, f.image]) {
    assert.equal(f.observers[0].observed.has(child), false);
  }
  f.enter(f.deliveryTitle, f.image);
  assert.equal(f.effects.length, 0, 'nested children must not launch independent effects');
  f.enter(f.deliveryGroup);
  assert.equal(f.firstDeliveryMarked(), true, 'both children must be marked before either animation starts');
  assert.equal(f.effects.length, 2);
  const copy = f.effects.find(effect => effect.element === f.deliveryCopy);
  const truck = f.effects.find(effect => effect.element === f.image);
  assert.deepEqual(Array.from(copy.frames, frame => ({ ...frame })), [{ opacity: 0, translate: '-24px 0' }, { opacity: 1, translate: '0 0' }]);
  assert.deepEqual(Array.from(truck.frames, frame => ({ ...frame })), [{ opacity: 0, translate: '24px 0' }, { opacity: 1, translate: '0 0' }]);
  for (const effect of [copy, truck]) {
    assert.equal(effect.options.duration, 600);
    assert.equal(effect.options.delay, 0);
    assert.equal(effect.options.easing, 'cubic-bezier(.22,1,.36,1)');
    assert.ok(effect.frames.every(frame => !('transform' in frame) && !('scale' in frame) && !('rotate' in frame)));
  }
  assertNaturalStyles(f.deliveryGroup, f.deliveryCopy, f.image);
  f.enter(f.deliveryGroup, f.deliveryTitle, f.image);
  assert.equal(f.effects.length, 2, 'returning or nested observer entries must not repeat the pair');
});

test('delivery remains naturally visible after animation failure and under reduced motion', () => {
  const failed = fixture({ animateError: true });
  failed.enter(failed.deliveryGroup);
  assert.equal(failed.firstDeliveryMarked(), true);
  assert.equal(failed.effects.length, 0);
  for (const element of [failed.deliveryGroup, failed.deliveryCopy, failed.image]) {
    assert.equal(element.dataset.revealState, 'done');
  }
  failed.enter(failed.deliveryGroup, failed.image);
  assert.equal(failed.effects.length, 0);
  assertNaturalStyles(failed.deliveryGroup, failed.deliveryCopy, failed.image);

  const initial = fixture({ reduced: true });
  assert.equal(initial.effects.length, 0);
  assert.equal(initial.deliveryCopy.dataset.revealState, 'done');
  assert.equal(initial.image.dataset.revealState, 'done');
  const active = fixture();
  active.enter(active.deliveryGroup);
  active.reduced(true);
  assert.equal(active.effects.length, 2);
  assert.ok(active.effects.every(effect => effect.animation.cancelled));
  assertNaturalStyles(active.deliveryGroup, active.deliveryCopy, active.image);
});

test('all nine original bed cards are marked before the visible batch animates and recycling never restarts it', () => {
  const f = fixture();
  f.enter(f.track);
  assert.equal(f.firstBedMarked(), true);
  assert.deepEqual(f.effects.map(effect => effect.element), f.cards.slice(0, 3));
  assert.deepEqual(f.effects.map(effect => effect.options.delay), [0, 70, 140]);
  assert.ok(f.cards.every(card => card.dataset.revealState !== 'pending' && card.dataset.revealState));
  for (let index = 0; index < 27; index++) { f.recycle(); f.enter(f.track, ...f.cards); }
  assert.equal(f.effects.length, 3);
  assert.equal(f.track.children.length, 9);
  assert.deepEqual(new Set(f.track.children), new Set(f.cards));
  assertNaturalStyles(...f.cards);
});

test('reduced motion starts immediately and turning it on cancels active effects and future reveals', () => {
  const initial = fixture({ reduced: true });
  assert.equal(initial.observers.length, 0);
  assert.equal(initial.effects.length, 0);
  assert.ok(initial.cards.every(card => card.dataset.revealState === 'done'));
  const f = fixture();
  f.enter(f.heading, f.track);
  f.reduced(true);
  assert.ok(f.effects.every(effect => effect.animation.cancelled));
  assert.equal(f.observers[0].disconnected, true);
  const count = f.effects.length;
  f.enter(f.image, ...f.mattressCards);
  assert.equal(f.effects.length, count);
  assertNaturalStyles(f.heading, ...f.cards, ...f.mattressCards);
});

test('fast vertical scrolling lets current effects settle naturally and skips newly passed content', async () => {
  const f = fixture();
  f.enter(f.heading);
  f.scroll(1000, 20);
  assert.equal(f.effects[0].animation.cancelled, false);
  assert.equal(f.heading.dataset.revealState, 'running');
  f.enter(f.description);
  assert.equal(f.description.dataset.revealState, 'done');
  assert.equal(f.effects.length, 1);
  f.effects[0].animation.finish();
  await Promise.resolve();
  assert.equal(f.heading.dataset.revealState, 'done');
  f.advance(300);
  f.enter(f.action);
  assert.equal(f.effects.length, 2, 'later unvisited content may reveal after fast scrolling stops');
});

test('ordinary 120px wheel ticks do not cancel a reveal based on one 16ms frame', () => {
  const f = fixture();
  f.enter(f.heading);
  f.scroll(120, 16);
  assert.equal(f.effects[0].animation.cancelled, false);
  f.enter(f.description);
  assert.equal(f.description.dataset.revealState, 'running');
  f.scroll(240, 16);
  assert.ok(f.effects.every(effect => !effect.animation.cancelled));
  f.enter(f.action);
  assert.equal(f.action.dataset.revealState, 'running');
});

test('rapid wheel ticks are classified by their accumulated travel within the short sample window', () => {
  const f = fixture();
  f.enter(f.heading);
  for (const y of [120, 240, 360, 480]) {
    f.scroll(y, 16);
    assert.equal(f.effects[0].animation.cancelled, false);
  }
  f.scroll(620, 16);
  assert.equal(f.effects[0].animation.cancelled, false);
  f.enter(f.description);
  assert.equal(f.description.dataset.revealState, 'done');
  assert.equal(f.effects.length, 1);
  f.advance(300);
  f.enter(f.action);
  assert.equal(f.action.dataset.revealState, 'running');
});

test('ordinary scrolling over separate sample windows does not accumulate into a false fast gesture', () => {
  const f = fixture();
  f.enter(f.heading);
  for (const y of [250, 500, 750, 1000]) {
    f.scroll(y, 130);
    assert.equal(f.effects[0].animation.cancelled, false);
  }
  f.enter(f.description);
  assert.equal(f.description.dataset.revealState, 'running');
});

test('section links and hash targets become usable immediately, including the whole bed catalogue', () => {
  const f = fixture();
  f.enter(f.heading);
  f.clickAnchor();
  assert.equal(f.effects[0].animation.cancelled, true);
  f.enter(f.mattressTitle);
  assert.equal(f.effects.length, 1);
  f.hash('#beds');
  assert.equal(f.bedsTitle.dataset.revealState, 'done');
  assert.ok(f.cards.every(card => card.dataset.revealState === 'done'));
  f.enter(f.track);
  assert.equal(f.effects.length, 1);
  assert.doesNotThrow(() => f.hash('#%invalid'));
});

test('focus or pointer input finishes a containing reveal and prevents a pending action from hiding', () => {
  for (const type of ['focusin', 'pointerdown']) {
    const f = fixture();
    f.enter(f.action);
    f.interaction(type, f.actionIcon);
    assert.equal(f.effects[0].animation.cancelled, true);
    assert.equal(f.action.dataset.revealState, 'done');
    f.interaction(type, f.consultationAction);
    f.enter(f.consultationAction);
    assert.equal(f.effects.length, 1);
    assertNaturalStyles(f.action, f.consultationAction);
  }
});

test('hidden documents and disposal cancel active animations without retaining hidden inline styles', async () => {
  const f = fixture();
  f.enter(f.heading, f.deliveryGroup);
  f.visible(false);
  assert.ok(f.effects.every(effect => effect.animation.cancelled));
  f.visible(true);
  f.enter(f.action);
  const action = f.effects.at(-1);
  action.animation.finish();
  await Promise.resolve();
  assert.equal(f.action.dataset.revealState, 'done');
  f.enter(f.description);
  f.dispose();
  assert.ok(f.effects.every(effect => effect.animation.cancelled));
  assert.equal(f.observers[0].disconnected, true);
  assertNaturalStyles(f.heading, f.image, f.action, f.description, ...f.cards);
});
