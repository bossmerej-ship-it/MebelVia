// Custom presentation, with native selects retained as the form's value source.
const controls = new Map();
let opened;

function closeMenu(restoreFocus = false) {
  if (!opened) return;
  const control = opened;
  control.menu.hidden = true;
  control.button.setAttribute('aria-expanded', 'false');
  control.root.classList.remove('is-open');
  opened = null;
  if (restoreFocus) control.button.focus({preventScroll:true});
}

function openMenu(control, edge) {
  closeMenu();
  opened = control;
  control.menu.hidden = false;
  control.button.setAttribute('aria-expanded', 'true');
  control.root.classList.add('is-open');
  control.menu.style.left = '0';
  control.menu.style.right = 'auto';
  if (control.menu.getBoundingClientRect().right > document.documentElement.clientWidth - 16) {
    control.menu.style.left = 'auto';
    control.menu.style.right = '0';
  }
  const index = edge === 'last' ? control.options.length - 1 : edge === 'first' ? 0 : control.select.selectedIndex;
  control.options[Math.max(0,index)].focus({preventScroll:true});
}

export function syncFilters(form) {
  form.querySelectorAll('select').forEach(select => {
    const control = controls.get(select);
    if (!control) return;
    const selected = select.selectedOptions[0];
    control.value.textContent = selected.textContent;
    control.button.setAttribute('aria-label', `${select.getAttribute('aria-label')}: ${selected.value ? selected.textContent : 'Все варианты'}`);
    control.button.classList.toggle('has-value', Boolean(select.value));
    control.options.forEach(option => option.setAttribute('aria-selected', String(option.dataset.value === select.value)));
  });
}

export function focusFirstFilter(form) {
  controls.get(form.querySelector('select'))?.button.focus({preventScroll:true});
}

export function enhanceFilters() {
  document.querySelectorAll('.filters select').forEach((select, index) => {
    const root = document.createElement('div');
    root.className = 'filter-select';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'filter-trigger';
    button.setAttribute('aria-haspopup', 'listbox');
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-controls', `filter-options-${index}`);
    const value = document.createElement('span');
    value.className = 'filter-value';
    button.append(value);
    button.insertAdjacentHTML('beforeend', '<svg class="icon" aria-hidden="true"><use href="#i-chevron"/></svg>');
    const menu = document.createElement('div');
    menu.className = 'filter-menu';
    menu.id = `filter-options-${index}`;
    menu.setAttribute('role', 'listbox');
    menu.setAttribute('aria-label', select.getAttribute('aria-label'));
    menu.hidden = true;
    const options = Array.from(select.options, option => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'filter-option';
      item.tabIndex = -1;
      item.setAttribute('role', 'option');
      item.dataset.value = option.value;
      const text = document.createElement('span');
      text.textContent = option.value ? option.textContent : select.name === 'size' ? 'Все размеры' : select.name === 'color' ? 'Все цвета' : select.name === 'firmness' ? 'Любая жёсткость' : 'Все варианты';
      item.append(text);
      item.insertAdjacentHTML('beforeend', '<svg class="icon" aria-hidden="true"><use href="#i-check"/></svg>');
      item.addEventListener('click', () => {
        select.value = item.dataset.value;
        select.dispatchEvent(new Event('change', {bubbles:true}));
        closeMenu(true);
      });
      menu.append(item);
      return item;
    });
    const oldWrapper = select.closest('.select-wrap');
    select.hidden = true;
    root.append(select, button, menu);
    oldWrapper.replaceWith(root);
    const control = {select, root, button, value, menu, options};
    controls.set(select, control);
    button.addEventListener('click', () => opened === control ? closeMenu() : openMenu(control));
    button.addEventListener('keydown', event => {
      if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
        event.preventDefault();
        openMenu(control);
      }
    });
    menu.addEventListener('keydown', event => {
      const index = options.indexOf(document.activeElement);
      let next;
      if (event.key === 'ArrowDown') next = (index + 1) % options.length;
      if (event.key === 'ArrowUp') next = (index - 1 + options.length) % options.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = options.length - 1;
      if (next !== undefined) {
        event.preventDefault();
        options[next].focus({preventScroll:true});
      }
      if (event.key === 'Escape') { event.preventDefault(); closeMenu(true); }
      // Restore the trigger before the browser advances to the next tab stop.
      if (event.key === 'Tab') closeMenu(true);
      if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && event.key !== ' ') {
        const match = options.find(item => item.textContent.trim().toLocaleLowerCase('ru').startsWith(event.key.toLocaleLowerCase('ru')));
        if (match) { event.preventDefault(); match.focus({preventScroll:true}); }
      }
    });
    root.addEventListener('focusout', () => queueMicrotask(() => {
      if (opened === control && !root.contains(document.activeElement)) closeMenu();
    }));
  });
  document.addEventListener('pointerdown', event => {
    if (opened && !opened.root.contains(event.target)) closeMenu();
  });
  document.querySelectorAll('.filters').forEach(syncFilters);
}
