import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

function fixture(readyState = 'loading') {
  const window = new EventTarget();
  const root = {dataset:{}};
  const document = {documentElement:root,readyState};
  const frames = new Map();
  let id=0;
  const context = {window,document,
    requestAnimationFrame: callback => {frames.set(++id,callback);return id;},
    cancelAnimationFrame: value => frames.delete(value)};
  const source=readFileSync(new URL('../dist/navigation-motion.js',import.meta.url),'utf8').replace('export function ','function ');
  vm.runInNewContext(source,context);
  return {window,root,frames,flush() {
    for(const [key,callback] of [...frames]) {frames.delete(key);callback();}
  }};
}

test('cold fragment restoration stays instant until pageshow has painted', () => {
  const f=fixture();
  assert.equal('scrollReady' in f.root.dataset,false);
  assert.equal(f.frames.size,0);
  f.window.dispatchEvent(new Event('pageshow'));
  f.flush();
  assert.equal('scrollReady' in f.root.dataset,false);
  f.flush();
  assert.equal('scrollReady' in f.root.dataset,true);
  assert.equal(f.frames.size,0,'no idle frame loop');
});

test('history restoration resets smooth scrolling and cancels stale callbacks', () => {
  const f=fixture('complete');
  f.flush();
  f.window.dispatchEvent(new Event('pagehide'));
  f.flush();
  assert.equal('scrollReady' in f.root.dataset,false);
  f.window.dispatchEvent(new Event('pageshow'));
  f.flush();f.flush();
  assert.equal('scrollReady' in f.root.dataset,true);
  f.window.dispatchEvent(new Event('pagehide'));
  assert.equal('scrollReady' in f.root.dataset,false);
});
