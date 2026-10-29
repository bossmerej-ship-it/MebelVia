import { products, whatsappUrl } from './catalog.js';
import { productPhotos, initProductPhotos } from './product-photos.js';
import { initConsultationHint } from './consultation-hint.js';
import { initBedCarousel } from './bed-carousel.js?v=775bdcfd985f';

const icon = id => `<svg class="icon" aria-hidden="true"><use href="#i-${id}"/></svg>`;
const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dialog = document.querySelector('#product-dialog');
const sizeSelect = document.querySelector('#product-size');
let selectedProduct;
let lastTrigger;
function renderCategory(category) {
  const visible = products.filter(product => product.category === category);
  document.querySelector(`#${category}-grid`).innerHTML = visible.map(p => `
    <article class="product-card${p.image ? '' : ' product-card-text'}">
      ${productPhotos(p)}
      <div class="product-info">${p.firmnessLabel ? `<span class="firmness">Жёсткость: ${escapeHTML(p.firmnessLabel)}</span>` : ''}<h3>${p.name}</h3><p class="product-meta">${p.summary}</p>
        ${p.isExample ? '<p class="product-example">Пример для подбора</p>' : ''}
        <button type="button" class="details-button" data-product="${p.id}" aria-label="Подробнее о товаре: ${escapeHTML(p.name)}"><span>Подробнее</span>${icon('arrow')}</button>
      </div>
    </article>`).join('');
  initProductPhotos(document.querySelector(`#${category}-grid`));
}

function openProduct(id, trigger) {
  selectedProduct = products.find(p => p.id === id);
  if (!selectedProduct) return;
  lastTrigger = trigger;
  const p = selectedProduct;
  document.querySelector('#dialog-title').textContent = p.name;
  document.querySelector('#dialog-category').textContent = p.category === 'bed' ? 'Кровати / MebelVia' : 'Матрасы / MebelVia';
  document.querySelector('#dialog-description').textContent = p.description;
  const photo = document.querySelector('#dialog-photo');
  photo.hidden = !p.image;
  photo.innerHTML = productPhotos(p, true);
  initProductPhotos(photo);
  dialog.classList.toggle('product-dialog-text', !p.image);
  document.querySelector('.sample-note').textContent = p.isExample
    ? 'Характеристики матрасов приведены для примера. Доступные модели, размеры и стоимость уточните у консультанта.'
    : 'Стоимость, обивку и состав комплекта уточните у консультанта. Матрас и другие предметы на фото могут не входить в комплект.';
  document.querySelector('#dialog-specs').innerHTML = p.specs.map(([key,value]) => `<div><dt>${key}</dt><dd>${value}</dd></div>`).join('');
  sizeSelect.replaceChildren(...p.sizes.map(size => new Option(`${size} см`,size)));
  document.querySelector('.size-picker').hidden = p.sizes.length === 0;
  document.querySelector('#size-options').innerHTML = p.sizes.map(size => `<label class="size-option"><input type="radio" name="model-size" value="${size}" ${size === sizeSelect.value ? 'checked' : ''}><span>${size}<small>см</small></span></label>`).join('');
  updateDraft();
  dialog.showModal();
}
function updateDraft() {
  if (selectedProduct) document.querySelector('#product-whatsapp').href = whatsappUrl(selectedProduct,sizeSelect.value);
}
for (const category of ['bed','mattress']) {
  renderCategory(category);
}
initBedCarousel();
document.addEventListener('click',event => {
  const trigger = event.target.closest('[data-product]');
  if (trigger) openProduct(trigger.dataset.product,trigger);
});
document.querySelector('.dialog-close').addEventListener('click',() => dialog.close());
dialog.addEventListener('click',event => {
  if (event.target !== dialog) return;
  const rect = dialog.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
});
dialog.addEventListener('close',() => lastTrigger?.focus({preventScroll:true}));
sizeSelect.addEventListener('change',updateDraft);
document.querySelector('#size-options').addEventListener('change', event => {
  if (event.target.matches('input[type="radio"]')) {
    sizeSelect.value = event.target.value;
    updateDraft();
  }
});
document.querySelectorAll('[data-whatsapp]').forEach(link => link.href = whatsappUrl());
initConsultationHint();

document.querySelector('.delivery-link').addEventListener('click', () => {
  const details = document.querySelector('#delivery-details');
  details.open = true;
  details.querySelector('summary').focus({preventScroll:true});
});
