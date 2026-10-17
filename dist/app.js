import { products, filterProducts, whatsappUrl } from './catalog.js';
import { enhanceFilters, syncFilters, focusFirstFilter } from './filters.js';
import { productPhotos, initProductPhotos } from './product-photos.js';
import { initConsultationHint } from './consultation-hint.js';

const siteHeader = document.querySelector('.site-header');
const fitFirstScreen = () => document.documentElement.style.setProperty('--site-header-height', `${siteHeader.getBoundingClientRect().height}px`);
fitFirstScreen();
new ResizeObserver(fitFirstScreen).observe(siteHeader);

const icon = id => `<svg class="icon" aria-hidden="true"><use href="#i-${id}"/></svg>`;
const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dialog = document.querySelector('#product-dialog');
const sizeSelect = document.querySelector('#product-size');
let selectedProduct;
let lastTrigger;
enhanceFilters();

function renderCategory(category) {
  const form = document.querySelector(`#${category}-filters`);
  const filters = form ? Object.fromEntries(new FormData(form)) : {};
  const visible = filterProducts(category, filters);
  document.querySelector(`#${category}-grid`).innerHTML = visible.map(p => `
    <article class="product-card${p.image ? '' : ' product-card-text'}">
      ${productPhotos(p)}
      <div class="product-info">${p.firmnessLabel ? `<span class="firmness">Жёсткость: ${escapeHTML(p.firmnessLabel)}</span>` : ''}<h3>${p.name}</h3><p class="product-meta">${p.summary}</p>
        ${p.isExample ? '<p class="product-example">Пример для подбора</p>' : ''}
        <button type="button" class="details-button" data-product="${p.id}" aria-label="Подробнее о товаре: ${escapeHTML(p.name)}"><span>Подробнее</span>${icon('arrow')}</button>
      </div>
    </article>`).join('');
  initProductPhotos(document.querySelector(`#${category}-grid`));
  if (!form) return;
  const active = Object.values(filters).some(Boolean);
  const feedback = document.querySelector(`#${category}-feedback`);
  feedback.hidden = !active;
  feedback.querySelector('span').textContent = `Найдено: ${visible.length}`;
  document.querySelector(`#${category}-empty`).hidden = visible.length > 0;
  syncFilters(form);
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
  const filterSize = document.querySelector(`#${p.category}-filters [name="size"]`)?.value;
  if (p.sizes.includes(filterSize)) sizeSelect.value = filterSize;
  document.querySelector('#size-options').innerHTML = p.sizes.map(size => `<label class="size-option"><input type="radio" name="model-size" value="${size}" ${size === sizeSelect.value ? 'checked' : ''}><span>${size}<small>см</small></span></label>`).join('');
  updateDraft();
  dialog.showModal();
}
function updateDraft() {
  if (selectedProduct) document.querySelector('#product-whatsapp').href = whatsappUrl(selectedProduct,sizeSelect.value);
}
for (const category of ['bed','mattress']) {
  renderCategory(category);
  document.querySelector(`#${category}-filters`)?.addEventListener('change',() => renderCategory(category));
  document.querySelector(`#${category}-filters`)?.addEventListener('submit',event => event.preventDefault());
}
document.addEventListener('click',event => {
  const trigger = event.target.closest('[data-product]');
  if (trigger) openProduct(trigger.dataset.product,trigger);
  const reset = event.target.closest('[data-reset]');
  if (reset) {
    const category = reset.dataset.reset;
    const form = document.querySelector(`#${category}-filters`);
    form.reset();
    renderCategory(category);
    focusFirstFilter(form);
  }
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
