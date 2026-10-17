import test from 'node:test';
import assert from 'node:assert/strict';
import { products, filterProducts, whatsappUrl } from '../dist/catalog.js';
import { productPhotos } from '../dist/product-photos.js';
test('bed model filter selects the matching supplied image and resets to all models',() => {
  assert.deepEqual(filterProducts('bed',{id:'konor'}).map(p=>p.id),['konor']);
  assert.deepEqual(filterProducts('bed',{}).map(p=>p.id),['violetta','hanna','konor']);
  assert.equal(filterProducts('bed',{id:'unknown-model'}).length,0);
});
test('both sides of a two-sided mattress can be found by firmness',() => {
  assert.deepEqual(filterProducts('mattress',{firmness:'high'}).map(p=>p.id),['foam-mattress']);
  assert.equal(filterProducts('mattress',{firmness:'medium'}).length,2);
  assert.equal(filterProducts('mattress',{size:'180×200',type:'topper'}).length,0);
});

test('catalogue photographs are shown for beds and mattresses, without a second-photo control unless supplied',() => {
  const bed = products.find(p => p.id === 'violetta');
  const mattress = products.find(p => p.category === 'mattress');
  const markup = productPhotos(bed);
  assert.ok(markup.includes('src="assets/catalog/violetta.svg"'));
  assert.ok(!markup.includes('photo-toggle'));
  assert.ok(productPhotos(mattress).includes('src="assets/spring-mattress-alternate.webp"'));
  assert.ok(productPhotos(mattress,true).includes('src="assets/spring-mattress-alternate.webp"'));
  assert.ok(!productPhotos(mattress).includes('photo-toggle'));
  const gallery = productPhotos({...bed,alternateImage:'assets/catalog/violetta-detail.svg'});
  assert.ok(gallery.includes('data-src="assets/catalog/violetta-detail.svg"'));
  assert.ok(gallery.includes('photo-toggle'));
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
  const unsizedDraft = new URL(whatsappUrl(products[0])).searchParams.get('text');
  assert.ok(unsizedDraft.includes(products[0].name));
  assert.ok(!unsizedDraft.includes('undefined'));
  assert.ok(!unsizedDraft.includes('размер  см'));
  assert.ok(unsizedDraft.includes('доступные размеры'));
});
