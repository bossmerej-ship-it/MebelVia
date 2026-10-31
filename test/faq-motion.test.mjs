import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../dist/faq-motion.js', import.meta.url), 'utf8').replace('export function ', 'function ');

function fixture({reduced = false, noAnimate = false, fail = '', extraAnswer = false, initiallyOpen = false, bootstrap = false, readyState = 'loading'} = {}) {
  const effects = [], observers = [];
  class Element extends EventTarget {
    constructor(tag, height = 0) {
      super(); this.tagName = tag; this.height = height; this.children = []; this.dataset = {};
      this.style = {height: '', opacity: '', transform: '', translate: '', overflow: ''};
    }
    append(child) { child.parentElement = this; this.children.push(child); return child; }
    contains(element) { return element === this || this.children.some(child => child.contains(element)); }
    closest() {
      return ['A','BUTTON','INPUT','SELECT','TEXTAREA'].includes(this.tagName) ? this : this.parentElement?.closest();
    }
    getBoundingClientRect() {
      let height = this.height;
      if (this.tagName === 'DETAILS') height = this.open ? this.children.reduce((sum, child) => sum + child.height, 2) : this.children[0].height + 2;
      else if (this.parentElement?.tagName === 'DETAILS' && !this.parentElement.open && this.tagName !== 'SUMMARY') height = 0;
      const effect = this.heightEffect;
      if (effect && !effect.cancelled) height = effect.start + (effect.end - effect.start) * effect.progress;
      return {height};
    }
    animate(frames, options) {
      const kind = 'height' in frames[0] ? 'height' : 'opacity';
      if (fail === kind || (fail === 'second-answer' && this.secondAnswer)) throw new Error('Animation unavailable');
      let resolve, reject;
      const animation = {
        progress: 0, cancelled: false,
        start: Number.parseFloat(frames[0][kind]), end: Number.parseFloat(frames[1][kind]),
        finished: new Promise((yes, no) => { resolve = yes; reject = no; }),
        cancel() { this.cancelled = true; reject(new Error('cancelled')); },
        finish() { this.progress = 1; resolve(); }
      };
      this[`${kind}Effect`] = animation;
      effects.push({element: this, kind, frames, options, animation});
      return animation;
    }
  }
  if (noAnimate) Element.prototype.animate = undefined;
  const states = Array.from({length: 3}, (_, index) => {
    const details = new Element('DETAILS'); details.open = initiallyOpen;
    const summary = details.append(new Element('SUMMARY', 56));
    const icon = summary.append(new Element('SPAN'));
    const answer = details.append(new Element('P', 80));
    if (extraAnswer && index === 0) { const extra = details.append(new Element('P', 40)); extra.secondAnswer = true; }
    return {details, summary, icon, answer};
  });
  const document = new EventTarget();
  document.readyState = readyState; document.hidden = false;
  document.querySelectorAll = () => states.map(state => state.details);
  const window = new EventTarget(), motion = new EventTarget();
  motion.matches = reduced;
  class ResizeObserver {
    constructor(callback) { this.callback = callback; this.elements = new Set(); observers.push(this); }
    observe(element) { this.elements.add(element); }
    disconnect() { this.disconnected = true; this.elements.clear(); }
  }
  const context = {document, window, Element, ResizeObserver, matchMedia: () => motion,
    getComputedStyle(element) {
      const effect = element.opacityEffect;
      const opacity = effect && !effect.cancelled ? effect.start + (effect.end - effect.start) * effect.progress : 1;
      return {borderTopWidth: '1px', borderBottomWidth: '1px', marginTop: '0px', marginBottom: '0px', opacity: String(opacity)};
    }};
  vm.runInNewContext(source, context);
  const dispose = bootstrap ? () => {} : context.initFaqMotion();
  return {states, effects, observers, document, window, motion, dispose,
    click(index = 0, {target, detail = 1, button = 0, prevented = false} = {}) {
      const state = states[index], event = new Event('click', {cancelable: true});
      Object.defineProperty(event, 'target', {value: target ?? state.icon});
      Object.assign(event, {detail, button});
      if (prevented) event.preventDefault();
      const before = state.details.open;
      state.summary.dispatchEvent(event);
      if (!event.defaultPrevented && button === 0 && !target?.closest()) state.details.open = !state.details.open;
      if (before !== state.details.open) state.details.dispatchEvent(new Event('toggle'));
      return event;
    },
    changeMotion(value) { motion.matches = value; const event = new Event('change'); event.matches = value; motion.dispatchEvent(event); },
    resize() { window.dispatchEvent(new Event('resize')); },
    resized(element) { observers[0].callback([{target: element}]); },
    externalOpen(index, value) { states[index].details.open = value; states[index].details.dispatchEvent(new Event('toggle')); },
    hidden(value) { document.hidden = value; document.dispatchEvent(new Event('visibilitychange')); },
    addLink(index) { return states[index].summary.append(new Element('A')); }
  };
}

const heights = f => f.effects.filter(effect => effect.kind === 'height');
const lastHeight = f => heights(f).at(-1);
const finish = async f => { lastHeight(f).animation.finish(); await Promise.resolve(); };
function natural(state) {
  for (const element of [state.details, state.answer]) assert.deepEqual(element.style, {height: '', opacity: '', transform: '', translate: '', overflow: ''});
  assert.equal(state.details.dataset.faqMotion, undefined);
}

test('native details remain available without Web Animations', () => {
  const f = fixture({noAnimate: true});
  assert.equal(f.click().defaultPrevented, false);
  assert.equal(f.states[0].details.open, true);
  assert.equal(f.effects.length, 0);
  natural(f.states[0]);
});

test('opening and closing interpolate the real height and release every effect', async () => {
  const f = fixture(), state = f.states[0];
  assert.equal(f.click().defaultPrevented, true);
  assert.equal(state.details.open, true);
  assert.equal(state.details.dataset.faqMotion, 'opening');
  assert.deepEqual(Array.from(lastHeight(f).frames, frame => frame.height), ['58px', '138px']);
  assert.equal(lastHeight(f).options.duration, 320);
  assert.deepEqual(Array.from(f.effects[1].frames, frame => frame.opacity), [0, 1]);
  await finish(f);
  assert.equal(state.details.getBoundingClientRect().height, 138);
  natural(state);
  f.click();
  assert.equal(state.details.open, true, 'keep the answer laid out until closing finishes');
  assert.equal(state.details.dataset.faqMotion, 'closing');
  assert.deepEqual(Array.from(lastHeight(f).frames, frame => frame.height), ['138px', '58px']);
  await finish(f);
  assert.equal(state.details.open, false);
  assert.equal(state.details.getBoundingClientRect().height, 58);
  assert.ok(f.effects.every(effect => effect.animation.cancelled));
  natural(state);
});

test('several answers can remain open independently', async () => {
  const f = fixture();
  f.click(0); await finish(f);
  f.click(1); await finish(f);
  assert.equal(f.states[0].details.open, true);
  assert.equal(f.states[1].details.open, true);
  f.click(0); await finish(f);
  assert.equal(f.states[0].details.open, false);
  assert.equal(f.states[1].details.open, true);
});

test('rapid reversals continue from the displayed height and old completions cannot close the answer', async () => {
  const f = fixture();
  f.click();
  const opening = lastHeight(f).animation;
  opening.progress = .4;
  f.effects[1].animation.progress = .4;
  f.click();
  const closing = lastHeight(f).animation;
  assert.equal(closing.start, 90);
  assert.equal(closing.end, 58);
  assert.equal(opening.cancelled, true);
  closing.progress = .5;
  f.click();
  assert.equal(lastHeight(f).animation.start, 74);
  assert.equal(lastHeight(f).animation.end, 138);
  assert.equal(closing.cancelled, true);
  opening.finish(); closing.finish(); await Promise.resolve();
  assert.equal(f.states[0].details.open, true);
  assert.equal(f.states[0].details.dataset.faqMotion, 'opening');
  await finish(f);
  natural(f.states[0]);
});

test('native keyboard-generated click events use the same open and close path', async () => {
  const f = fixture();
  f.click(0, {detail: 0}); await finish(f);
  assert.equal(f.states[0].details.open, true);
  f.click(0, {detail: 0}); await finish(f);
  assert.equal(f.states[0].details.open, false);
});

test('reduced motion uses native toggles and switching it on completes the requested close', async () => {
  const initial = fixture({reduced: true});
  assert.equal(initial.click().defaultPrevented, false);
  assert.equal(initial.states[0].details.open, true);
  assert.equal(initial.effects.length, 0);
  initial.changeMotion(false);
  initial.click();
  initial.changeMotion(true);
  assert.equal(initial.states[0].details.open, false);
  assert.ok(initial.effects.every(effect => effect.animation.cancelled));
  natural(initial.states[0]);
  await Promise.resolve();
});

test('motion and visibility changes do not undo an unrelated native open state', () => {
  const f = fixture();
  f.states[1].details.open = true;
  f.changeMotion(true);
  assert.equal(f.states[1].details.open, true);
  f.hidden(true);
  assert.equal(f.states[1].details.open, true);
});

test('content and summary resizing retarget from the current height without a snap', async () => {
  const f = fixture();
  f.click();
  lastHeight(f).animation.progress = .5;
  f.states[0].answer.height = 160;
  f.resized(f.states[0].answer);
  assert.equal(lastHeight(f).animation.start, 98);
  assert.equal(lastHeight(f).animation.end, 218);
  const count = f.effects.length;
  f.resize();
  assert.equal(f.effects.length, count, 'unchanged measurements must not restart the animation');
  await finish(f);
  f.click();
  lastHeight(f).animation.progress = .5;
  f.states[0].summary.height = 80;
  f.resize();
  assert.equal(lastHeight(f).animation.start, 138);
  assert.equal(lastHeight(f).animation.end, 82);
  await finish(f);
  assert.equal(f.states[0].details.getBoundingClientRect().height, 82);
});

test('animation failure falls back to the requested native state without a hidden answer', async () => {
  for (const fail of ['height', 'opacity', 'second-answer']) {
    const f = fixture({fail, extraAnswer: fail === 'second-answer'});
    f.click(); await Promise.resolve();
    assert.equal(f.states[0].details.open, true);
    assert.ok(f.effects.every(effect => effect.animation.cancelled));
    natural(f.states[0]);
    f.click(); await Promise.resolve();
    assert.equal(f.states[0].details.open, false);
    natural(f.states[0]);
  }
});

test('external close, hidden page and disposal cancel the height tail safely', async () => {
  const f = fixture();
  f.click();
  f.externalOpen(0, false);
  assert.equal(lastHeight(f).animation.cancelled, true);
  natural(f.states[0]);
  f.click(); f.hidden(true);
  assert.equal(f.states[0].details.open, true);
  natural(f.states[0]);
  f.hidden(false); f.click(); f.dispose();
  assert.equal(f.states[0].details.open, false);
  assert.equal(f.observers[0].disconnected, true);
  natural(f.states[0]);
  assert.equal(f.click().defaultPrevented, false, 'disposal restores the untouched native control');
  await Promise.resolve();
});

test('interactive links and non-primary or already handled clicks retain their native behavior', () => {
  const f = fixture(), link = f.addLink(0);
  assert.equal(f.click(0, {target: link}).defaultPrevented, false);
  assert.equal(f.click(0, {button: 1}).defaultPrevented, false);
  f.click(0, {prevented: true});
  assert.equal(f.effects.length, 0);
});

test('an initially expanded answer stays expanded without an entrance or height constraint', async () => {
  const f = fixture({initiallyOpen: true});
  assert.equal(f.effects.length, 0);
  natural(f.states[0]);
  f.click();
  assert.equal(lastHeight(f).animation.start, 138);
  await finish(f);
  assert.equal(f.states[0].details.open, false);
});

test('the optional module starts after DOM loading or immediately when the DOM is already ready', () => {
  const loading = fixture({bootstrap: true});
  assert.equal(loading.observers.length, 0);
  loading.document.dispatchEvent(new Event('DOMContentLoaded'));
  assert.equal(loading.observers.length, 1);
  const ready = fixture({bootstrap: true, readyState: 'interactive'});
  assert.equal(ready.observers.length, 1);
  ready.document.dispatchEvent(new Event('DOMContentLoaded'));
  assert.equal(ready.observers.length, 1);
});
