import test from 'node:test';
import assert from 'node:assert/strict';
import { products, filterProducts, whatsappUrl } from '../dist/catalog.js';
import { productPhotos } from '../dist/product-photos.js';
import { readFileSync } from 'node:fs';
test('bed model filter selects the matching supplied image and resets to all models',() => {
  assert.deepEqual(filterProducts('bed',{id:'konor'}).map(p=>p.id),['konor']);
  assert.deepEqual(filterProducts('bed',{}).map(p=>p.id),['violetta','hanna','konor','tatlin','milano','silvia','seda','soul','monika']);
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
  assert.ok(productPhotos(mattress).includes(`src="${mattress.image}"`));
  assert.ok(productPhotos(mattress,true).includes(`src="${mattress.image}"`));
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

test('mattress card and dialog share complete responsive assets with independent slot sizes', () => {
  for (const mattress of products.filter(p => p.category === 'mattress')) {
    const card = productPhotos(mattress);
    const dialog = productPhotos(mattress, true);
    assert.equal(mattress.isExample, true);
    assert.ok(card.includes('loading="lazy"'));
    assert.ok(!dialog.includes('loading="lazy"'));
    assert.ok(card.includes(`width="${mattress.imageWidth}" height="${mattress.imageHeight}"`));
    assert.notEqual(card.match(/sizes="([^"]+)"/)[1], dialog.match(/sizes="([^"]+)"/)[1]);
    for (const candidate of mattress.imageSrcset.split(', ')) {
      const [path, width] = candidate.split(' ');
      assert.match(width, /^\d+w$/);
      assert.ok(card.includes(candidate));
      assert.ok(dialog.includes(candidate));
      const image = readFileSync(new URL(`../dist/${path}`, import.meta.url));
      assert.equal(image.toString('ascii', 8, 12), 'WEBP', path);
    }
  }
  const bed = productPhotos(products.find(p => p.category === 'bed'));
  assert.ok(!bed.includes('srcset='));
  assert.ok(!bed.includes('sizes='));
});

test('responsive image metadata cannot inject HTML attributes', () => {
  const markup = productPhotos({id:'sample',category:'mattress',name:'Sample',image:'sample.webp',
    imageSrcset:'sample.webp 576w" onerror="alert(1)',imageWidth:'1152" onclick="alert(1)',imageHeight:864});
  assert.ok(markup.includes('576w&quot; onerror=&quot;alert(1)'));
  assert.ok(markup.includes('width="1152&quot; onclick=&quot;alert(1)"'));
  assert.ok(!markup.includes(' onerror="'));
  assert.ok(!markup.includes(' onclick="'));
});
