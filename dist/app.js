import { products, filterProducts, whatsappUrl } from './catalog.js';

const icon = id => `<svg class="icon" aria-hidden="true"><use href="#i-${id}"/></svg>`;
const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dialog = document.querySelector('#product-dialog');
const sizeSelect = document.querySelector('#product-size');
let selectedProduct;
let lastTrigger;

function renderCategory(category) {
  const form = document.querySelector(`#${category}-filters`);
  const filters = Object.fromEntries(new FormData(form));
  const visible = filterProducts(category, filters);
  document.querySelector(`#${category}-grid`).innerHTML = visible.map(p => `
    <article class="product-card">
      <button type="button" class="photo-button" data-product="${p.id}" aria-label="Подробнее: ${escapeHTML(p.name)}">
        <span class="product-art" style="--image-position:${p.image}" aria-hidden="true"></span>
        ${p.firmnessLabel ? `<span class="firmness">Жёсткость: ${p.firmnessLabel}</span>` : ''}
      </button>
      <div class="product-info"><h3>${p.name}</h3><p class="product-meta">${p.summary}</p>
        <button type="button" class="details-button" data-product="${p.id}" aria-label="Подробнее о товаре: ${escapeHTML(p.name)}"><span>Подробнее</span>${icon('arrow')}</button>
      </div>
    </article>`).join('');
  const active = Object.values(filters).some(Boolean);
  const feedback = document.querySelector(`#${category}-feedback`);
  feedback.hidden = !active;
  feedback.querySelector('span').textContent = `Найдено: ${visible.length}`;
  document.querySelector(`#${category}-empty`).hidden = visible.length > 0;
  form.querySelectorAll('select').forEach(select => select.classList.toggle('active',Boolean(select.value)));
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
  photo.innerHTML = `<span class="product-art" style="--image-position:${p.image}"></span>`;
  photo.setAttribute('aria-label',p.name);
  document.querySelector('#dialog-specs').innerHTML = p.specs.map(([key,value]) => `<div><dt>${key}</dt><dd>${value}</dd></div>`).join('');
  sizeSelect.replaceChildren(...p.sizes.map(size => new Option(`${size} см`,size)));
  const filterSize = document.querySelector(`#${p.category}-filters [name="size"]`).value;
  if (p.sizes.includes(filterSize)) sizeSelect.value = filterSize;
  updateDraft();
  dialog.showModal();
}
function updateDraft() {
  if (selectedProduct) document.querySelector('#product-whatsapp').href = whatsappUrl(selectedProduct,sizeSelect.value);
}
for (const category of ['bed','mattress']) {
  renderCategory(category);
  document.querySelector(`#${category}-filters`).addEventListener('change',() => renderCategory(category));
  document.querySelector(`#${category}-filters`).addEventListener('submit',event => event.preventDefault());
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
    form.querySelector('select').focus({preventScroll:true});
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
document.querySelectorAll('[data-whatsapp]').forEach(link => link.href = whatsappUrl());
