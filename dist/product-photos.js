const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function productPhotos(product, inDialog = false) {
  if (!product.image) return '';
  const name = escapeHTML(product.name);
  const tag = inDialog ? 'div' : 'button';
  const action = inDialog ? '' : `type="button" data-product="${product.id}" aria-label="Подробнее: ${name}"`;
  const alternate = product.alternateImage;
  return `<div class="product-media"${alternate ? ' data-gallery' : ''}>
    <${tag} class="photo-button" ${action}>
      <img class="product-photo" src="${escapeHTML(product.image)}" alt="${escapeHTML(product.imageAlt || product.name)}" ${inDialog ? '' : 'loading="lazy"'} decoding="async" style="object-position:${escapeHTML(inDialog ? 'center' : product.imagePosition || 'center')}">
      ${alternate ? `<img class="product-secondary" data-src="${escapeHTML(alternate)}" alt="" decoding="async">` : ''}
    </${tag}>
    ${alternate ? `<button type="button" class="photo-toggle" aria-label="Второе фото: ${name}" aria-pressed="false"><span class="photo-count" aria-hidden="true">1 / 2</span><svg class="icon" aria-hidden="true"><use href="#i-arrow"/></svg></button>
    <span class="photo-feedback" role="status" hidden>Фото не загрузилось. Нажмите на стрелку ещё раз.</span>` : ''}
  </div>`;
}

export function initProductPhotos(root) {
  root.querySelectorAll('[data-gallery]').forEach(gallery => {
    const surface = gallery.querySelector('.photo-button');
    const image = gallery.querySelector('.product-secondary');
    const toggle = gallery.querySelector('.photo-toggle');
    const feedback = gallery.querySelector('.photo-feedback');
    let selected = false;
    let hovered = false;
    let loading;
    let failed = false;

    function loadImage() {
      if (image.complete && image.naturalWidth) return Promise.resolve();
      if (!loading) {
        loading = new Promise((resolve, reject) => {
          image.onload = resolve;
          image.onerror = reject;
          image.src = image.dataset.src;
        });
      }
      return loading;
    }

    async function update() {
      if ((selected || hovered) && !failed) {
        toggle.setAttribute('aria-busy', 'true');
        try {
          await loadImage();
        } catch {
          failed = true;
          loading = null;
          image.removeAttribute('src');
          feedback.hidden = false;
        }
        toggle.removeAttribute('aria-busy');
      }
      const show = (selected || hovered) && !!image.naturalWidth && !failed;
      gallery.classList.toggle('show-secondary', show);
      toggle.setAttribute('aria-pressed', String(show));
      toggle.querySelector('.photo-count').textContent = show ? '2 / 2' : '1 / 2';
    }

    toggle.addEventListener('click', () => {
      selected = failed || !gallery.classList.contains('show-secondary');
      hovered = false;
      failed = false;
      feedback.hidden = true;
      update();
    });
    surface.addEventListener('pointerenter', event => {
      if (event.pointerType === 'mouse' && matchMedia('(hover:hover)').matches) {
        hovered = true;
        update();
      }
    });
    surface.addEventListener('pointerleave', () => {
      hovered = false;
      update();
    });
  });
}
