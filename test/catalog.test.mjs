import test from 'node:test';
import assert from 'node:assert/strict';
import { products, filterProducts, whatsappUrl } from '../dist/catalog.js';
test('filter intersections return matching beds and recover from an empty combination',() => {
  assert.deepEqual(filterProducts('bed',{size:'140×200',color:'beige'}).map(p=>p.id),['soft-bed']);
  assert.equal(filterProducts('bed',{mechanism:'lift',color:'olive'}).length,0);
  assert.equal(filterProducts('bed',{}).length,3);
});
test('both sides of a two-sided mattress can be found by firmness',() => {
  assert.deepEqual(filterProducts('mattress',{firmness:'high'}).map(p=>p.id),['foam-mattress']);
  assert.equal(filterProducts('mattress',{firmness:'medium'}).length,2);
  assert.equal(filterProducts('mattress',{size:'180×200',type:'topper'}).length,0);
});
test('WhatsApp URL contains business phone, site attribution, product and selected size',() => {
  const url = new URL(whatsappUrl(products[1],'180×200'));
  assert.equal(url.origin,'https://wa.me');
  assert.equal(url.pathname,'/77016000330');
  const draft = url.searchParams.get('text');
  assert.match(draft,/Пишу с сайта MebelVia/);
  assert.ok(draft.includes(products[1].name));
  assert.ok(draft.includes('180×200'));
  assert.ok(new URL(whatsappUrl()).searchParams.get('text').includes('Пишу с сайта MebelVia'));
});
