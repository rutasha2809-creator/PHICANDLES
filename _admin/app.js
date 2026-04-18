(() => {
  const CATALOG_URL = '../data/catalog.json';

  /** @type {any} */
  let catalog = null;
  let selectedProductIndex = 0;
  let productFilter = '';
  /** @type {AbortController | null} */
  let productEditorAbort = null;

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function setStatus(text, isError = false) {
    const el = $('#status-line');
    el.textContent = text;
    el.classList.toggle('is-error', Boolean(isError));
  }

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function ensureCatalogShape(data) {
    if (!data || typeof data !== 'object') throw new Error('Некорректный JSON');
    if (!data.store || !data.categories || !Array.isArray(data.products)) {
      throw new Error('Ожидаются поля store, categories и массив products');
    }
    if (!data.colorSwatches || typeof data.colorSwatches !== 'object') {
      data.colorSwatches = {};
    }
    return data;
  }

  function applyCatalogData(data) {
    catalog = ensureCatalogShape(deepClone(data));
    selectedProductIndex = 0;
    renderAll();
  }

  async function loadFromServer() {
    setStatus('Загрузка…');
    const res = await fetch(CATALOG_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = ensureCatalogShape(await res.json());
    catalog = data;
    selectedProductIndex = 0;
    setStatus('Загружено с сервера');
    renderAll();
  }

  function emptyCatalogShell() {
    return {
      store: {
        name: 'PHICANDLES',
        tagline: '',
        description: '',
        domain: '',
        email: '',
        phones: [],
        telegram: '',
        instagram: '',
        currency: 'RUB',
        updatedAt: new Date().toISOString().slice(0, 10),
      },
      categories: [],
      colorSwatches: {},
      products: [],
    };
  }

  function syncReloadButtonLabel() {
    const btn = $('#btn-reload');
    if (location.protocol === 'file:') {
      btn.textContent = 'Перезагрузить страницу';
      btn.title = 'В file:// автозагрузка недоступна, используйте «Загрузить JSON…»';
    } else {
      btn.textContent = 'Перезагрузить с сервера';
      btn.title = '';
    }
  }

  function renderAll() {
    if (!catalog) return;
    renderStore();
    renderCategories();
    renderProductList();
    renderProductEditor();
    syncSwatchesTextarea();
    syncRawJsonTextarea();
  }

  function renderStore() {
    const s = catalog.store;
    const phones = Array.isArray(s.phones) ? s.phones.join('\n') : '';
    const wrap = $('#store-fields');
    wrap.innerHTML = `
      <div class="field"><label for="sf-name">name</label><input id="sf-name" type="text" data-store="name" value="${esc(s.name || '')}"></div>
      <div class="field"><label for="sf-tagline">tagline</label><input id="sf-tagline" type="text" data-store="tagline" value="${esc(s.tagline || '')}"></div>
      <div class="field"><label for="sf-description">description</label><textarea id="sf-description" data-store="description">${esc(s.description || '')}</textarea></div>
      <div class="field"><label for="sf-domain">domain</label><input id="sf-domain" type="url" data-store="domain" value="${esc(s.domain || '')}"></div>
      <div class="field"><label for="sf-email">email</label><input id="sf-email" type="text" data-store="email" value="${esc(s.email || '')}"></div>
      <div class="field"><label for="sf-phones">phones (по одному в строке)</label><textarea id="sf-phones" data-store-phones>${esc(phones)}</textarea></div>
      <div class="field"><label for="sf-telegram">telegram</label><input id="sf-telegram" type="url" data-store="telegram" value="${esc(s.telegram || '')}"></div>
      <div class="field"><label for="sf-instagram">instagram</label><input id="sf-instagram" type="url" data-store="instagram" value="${esc(s.instagram || '')}"></div>
      <div class="field"><label for="sf-currency">currency</label><input id="sf-currency" type="text" data-store="currency" value="${esc(s.currency || 'RUB')}"></div>
      <div class="field"><label for="sf-updated">updatedAt</label><input id="sf-updated" type="text" data-store="updatedAt" value="${esc(s.updatedAt || '')}"></div>
    `;
  }

  function onStoreInput(e) {
    if (!catalog?.store) return;
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;
    if (t.dataset.store) {
      catalog.store[t.dataset.store] = t.value;
    }
    if (t.dataset.storePhones != null) {
      catalog.store.phones = t.value
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
    }
  }

  function renderCategories() {
    const tbody = $('#categories-body');
    tbody.innerHTML = catalog.categories
      .map(
        (c, i) => `
      <tr data-cat-index="${i}">
        <td><input type="text" data-cat-field="id" value="${esc(c.id || '')}" aria-label="id категории ${i + 1}"></td>
        <td><input type="text" data-cat-field="name" value="${esc(c.name || '')}" aria-label="название"></td>
        <td><input type="text" data-cat-field="description" value="${esc(c.description || '')}" aria-label="описание"></td>
        <td><button type="button" class="icon-del" data-cat-del="${i}">Удалить</button></td>
      </tr>`,
      )
      .join('');
  }

  function onCategoryInput(e) {
    if (!catalog?.categories) return;
    const t = e.target;
    if (!(t instanceof HTMLInputElement) || !t.dataset.catField) return;
    const tr = t.closest('tr[data-cat-index]');
    if (!tr) return;
    const i = Number(tr.dataset.catIndex);
    const field = t.dataset.catField;
    catalog.categories[i][field] = t.value;
  }

  function onCategoryClick(e) {
    if (!catalog?.categories) return;
    const t = e.target;
    if (!(t instanceof HTMLElement) || t.dataset.catDel == null) return;
    const i = Number(t.dataset.catDel);
    catalog.categories.splice(i, 1);
    renderCategories();
  }


  function filteredProductIndices() {
    const q = productFilter.trim().toLowerCase();
    return catalog.products
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => {
        if (!q) return true;
        return (
          (p.name && String(p.name).toLowerCase().includes(q)) ||
          (p.slug && String(p.slug).toLowerCase().includes(q)) ||
          (p.id && String(p.id).toLowerCase().includes(q))
        );
      })
      .map(({ i }) => i);
  }

  function renderProductList() {
    const indices = filteredProductIndices();
    if (indices.length && !indices.includes(selectedProductIndex)) {
      selectedProductIndex = indices[0];
    }
    const list = $('#product-list');
    list.innerHTML = indices
      .map((i) => {
        const p = catalog.products[i];
        const active = i === selectedProductIndex;
        return `<button type="button" role="option" class="${active ? 'is-active' : ''}" data-product-index="${i}">${esc(p.name || p.slug)}</button>`;
      })
      .join('');
    list.onclick = (e) => {
      const btn = e.target.closest('button[data-product-index]');
      if (!btn) return;
      selectedProductIndex = Number(btn.dataset.productIndex);
      $$('#product-list button').forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      renderProductEditor();
    };
  }

  function categoryOptionsHtml(selectedId) {
    return catalog.categories
      .map((c) => `<option value="${esc(c.id)}"${c.id === selectedId ? ' selected' : ''}>${esc(c.name)} (${esc(c.id)})</option>`)
      .join('');
  }

  function renderProductEditor() {
    const wrap = $('#product-editor');
    productEditorAbort?.abort();
    productEditorAbort = null;
    if (!catalog.products.length) {
      wrap.innerHTML = '<p class="hint">Нет товаров. Добавьте черновик кнопкой слева.</p>';
      return;
    }
    if (selectedProductIndex < 0 || selectedProductIndex >= catalog.products.length) {
      selectedProductIndex = 0;
    }
    const p = catalog.products[selectedProductIndex];
    const materials = Array.isArray(p.materials) ? p.materials.join('\n') : '';
    const aroma = Array.isArray(p.options?.aroma) ? p.options.aroma.join('\n') : '';
    const color = Array.isArray(p.options?.color) ? p.options.color.join('\n') : '';
    let reviewsText = '';
    try {
      reviewsText = JSON.stringify(p.reviews || [], null, 2);
    } catch {
      reviewsText = '[]';
    }

    wrap.innerHTML = `
      <div class="field"><label>id</label><input type="text" data-p="id" value="${esc(p.id || '')}"></div>
      <div class="field"><label>slug</label><input type="text" data-p="slug" value="${esc(p.slug || '')}"></div>
      <div class="field"><label>name</label><input type="text" data-p="name" value="${esc(p.name || '')}"></div>
      <div class="field"><label>categoryId</label><select data-p="categoryId">${categoryOptionsHtml(p.categoryId)}</select></div>
      <div class="field"><label>price</label><input type="number" data-p="price" step="1" value="${Number(p.price) || 0}"></div>
      <div class="field"><label>featured</label><input type="checkbox" data-p="featured" ${p.featured ? 'checked' : ''}></div>
      <div class="field"><label>popularity</label><input type="number" data-p="popularity" step="1" value="${Number(p.popularity) || 0}"></div>
      <div class="field"><label>shortDescription</label><textarea data-p="shortDescription">${esc(p.shortDescription || '')}</textarea></div>
      <div class="field"><label>description</label><textarea data-p="description">${esc(p.description || '')}</textarea></div>
      <div class="field"><label>dimensions</label><input type="text" data-p="dimensions" value="${esc(p.dimensions || '')}"></div>
      <div class="field"><label>burnTime</label><input type="text" data-p="burnTime" value="${esc(p.burnTime || '')}"></div>
      <div class="field"><label>materials (строка на позицию)</label><textarea data-p-materials>${esc(materials)}</textarea></div>
      <div class="field"><label>options.aroma (строка на позицию)</label><textarea data-p-aroma>${esc(aroma)}</textarea></div>
      <div class="field"><label>options.color (строка на позицию)</label><textarea data-p-color>${esc(color)}</textarea></div>
      <div class="field"><label>image</label><input type="text" data-p="image" value="${esc(p.image || '')}"></div>
      <div class="field"><label>imageAlt</label><input type="text" data-p="imageAlt" value="${esc(p.imageAlt || '')}"></div>
      <div class="field"><label>assetImage</label><input type="text" data-p="assetImage" value="${esc(p.assetImage || '')}"></div>
      <div class="field"><label>absoluteImage</label><input type="text" data-p="absoluteImage" value="${esc(p.absoluteImage || '')}"></div>
      <div class="field"><label>url</label><input type="text" data-p="url" value="${esc(p.url || '')}"></div>
      <div class="field"><label>reviews (JSON-массив)</label><textarea data-p-reviews class="tall" spellcheck="false">${esc(reviewsText)}</textarea></div>
      <div class="row-actions">
        <button type="button" data-product-del>Удалить товар</button>
      </div>
    `;

    productEditorAbort = new AbortController();
    const sig = productEditorAbort.signal;

    const syncProductField = (e) => {
      const t = e.target;
      if (!(t instanceof HTMLElement)) return;
      const i = selectedProductIndex;
      const pr = catalog.products[i];
      if (t.dataset.p === 'featured' && t instanceof HTMLInputElement) {
        pr.featured = t.checked;
        return;
      }
      if (t.dataset.p) {
        const key = t.dataset.p;
        if (t instanceof HTMLInputElement && t.type === 'number') {
          pr[key] = Number(t.value);
        } else if (t instanceof HTMLSelectElement || t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) {
          pr[key] = t.value;
        }
      }
      if (t.dataset.pMaterials != null && t instanceof HTMLTextAreaElement) {
        pr.materials = t.value
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean);
      }
      if (t.dataset.pAroma != null && t instanceof HTMLTextAreaElement) {
        if (!pr.options) pr.options = { aroma: [], color: [] };
        pr.options.aroma = t.value
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean);
      }
      if (t.dataset.pColor != null && t instanceof HTMLTextAreaElement) {
        if (!pr.options) pr.options = { aroma: [], color: [] };
        pr.options.color = t.value
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean);
      }
    };
    wrap.addEventListener('input', syncProductField, { passive: true, signal: sig });
    wrap.addEventListener('change', syncProductField, { passive: true, signal: sig });

    const reviewsTa = wrap.querySelector('[data-p-reviews]');
    if (reviewsTa) {
      reviewsTa.addEventListener(
        'change',
        () => {
          try {
            catalog.products[selectedProductIndex].reviews = JSON.parse(reviewsTa.value || '[]');
            if (!Array.isArray(catalog.products[selectedProductIndex].reviews)) throw new Error('reviews должен быть массивом');
            setStatus('Отзывы обновлены');
          } catch (err) {
            setStatus(String(err.message || err), true);
          }
        },
        { passive: true, signal: sig },
      );
    }

    wrap.querySelector('[data-product-del]')?.addEventListener(
      'click',
      () => {
        if (!confirm('Удалить этот товар из каталога?')) return;
        catalog.products.splice(selectedProductIndex, 1);
        selectedProductIndex = Math.max(0, selectedProductIndex - 1);
        renderProductList();
        renderProductEditor();
        setStatus('Товар удалён');
      },
      { signal: sig },
    );
  }

  $('#product-search').addEventListener('input', (e) => {
    productFilter = e.target.value || '';
    renderProductList();
    renderProductEditor();
  });

  $('#btn-add-product').addEventListener('click', () => {
    const firstCat = catalog.categories[0]?.id || 'flowers';
    catalog.products.push({
      id: `prod-new-${Date.now()}`,
      slug: 'novyy-tovar',
      name: 'Новый товар',
      categoryId: firstCat,
      price: 0,
      description: '',
      shortDescription: '',
      dimensions: '',
      materials: [],
      burnTime: '',
      options: { aroma: [], color: [] },
      image: './assets/img/products/placeholder.jpg',
      imageAlt: '',
      popularity: 0,
      featured: false,
      reviews: [],
      assetImage: '',
      absoluteImage: '',
      url: '',
    });
    selectedProductIndex = catalog.products.length - 1;
    productFilter = '';
    $('#product-search').value = '';
    renderProductList();
    renderProductEditor();
    setStatus('Добавлен черновик товара');
  });

  function syncSwatchesTextarea() {
    const ta = $('#swatches-json');
    if (!ta || !catalog) return;
    ta.value = JSON.stringify(catalog.colorSwatches || {}, null, 2);
  }

  function syncRawJsonTextarea() {
    const ta = $('#raw-json');
    if (!ta || !catalog) return;
    ta.value = JSON.stringify(catalog, null, 2);
  }

  $('#btn-apply-swatches').addEventListener('click', () => {
    try {
      const obj = JSON.parse($('#swatches-json').value || '{}');
      if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) throw new Error('Нужен объект ключ → hex');
      catalog.colorSwatches = obj;
      setStatus('Цвета обновлены');
    } catch (e) {
      setStatus(String(e.message || e), true);
    }
  });

  $('#btn-apply-raw').addEventListener('click', () => {
    try {
      const parsed = ensureCatalogShape(JSON.parse($('#raw-json').value || '{}'));
      catalog = parsed;
      selectedProductIndex = 0;
      renderAll();
      setStatus('Каталог заменён из JSON');
    } catch (e) {
      setStatus(String(e.message || e), true);
    }
  });

  $('#btn-format-raw').addEventListener('click', () => {
    try {
      const parsed = JSON.parse($('#raw-json').value || '{}');
      $('#raw-json').value = JSON.stringify(parsed, null, 2);
      setStatus('Отформатировано');
    } catch (e) {
      setStatus(String(e.message || e), true);
    }
  });

  $('#btn-download').addEventListener('click', () => {
    try {
      const text = JSON.stringify(catalog, null, 2);
      const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'catalog.json';
      a.click();
      URL.revokeObjectURL(a.href);
      setStatus('Файл скачан — замените data/catalog.json в проекте');
    } catch (e) {
      setStatus(String(e.message || e), true);
    }
  });

  $('#file-import').addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = ensureCatalogShape(JSON.parse(String(reader.result || '{}')));
        catalog = deepClone(parsed);
        selectedProductIndex = 0;
        renderAll();
        setStatus(`Импортировано из файла «${file.name}»`);
      } catch (err) {
        setStatus(String(err.message || err), true);
      }
    };
    reader.readAsText(file, 'utf-8');
  });

  $('#btn-reload').addEventListener('click', () => {
    if (location.protocol === 'file:') {
      window.location.reload();
      return;
    }
    loadFromServer().catch((e) => setStatus(String(e.message || e), true));
  });

  $('#btn-updated').addEventListener('click', () => {
    if (!catalog) return;
    catalog.store.updatedAt = new Date().toISOString().slice(0, 10);
    renderStore();
    setStatus('Дата updatedAt обновлена');
  });

  $$('.tabs [data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const name = btn.dataset.tab;
      $$('.tabs [data-tab]').forEach((b) => {
        const on = b === btn;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-selected', on);
      });
      $$('.panel').forEach((p) => p.classList.toggle('is-active', p.id === `panel-${name}`));
      if (name === 'json') syncRawJsonTextarea();
      if (name === 'swatches') syncSwatchesTextarea();
    });
  });

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  $('#panel-store').addEventListener('input', onStoreInput, { passive: true });

  $('#panel-categories').addEventListener('input', onCategoryInput, { passive: true });
  $('#panel-categories').addEventListener('click', onCategoryClick);

  $('#btn-add-category').addEventListener('click', () => {
    if (!catalog) return;
    catalog.categories.push({
      id: 'new-cat',
      name: 'Новая категория',
      description: '',
    });
    renderCategories();
  });

  function bootstrap() {
    syncReloadButtonLabel();

    if (location.protocol === 'file:') {
      setStatus(
        'Режим file://: автозагрузка отключена. Используйте «Загрузить JSON…» или запустите локальный сервер.',
        true,
      );
      catalog = ensureCatalogShape(emptyCatalogShell());
      renderAll();
      return;
    }

    loadFromServer().catch((e) => {
      setStatus(`Не удалось загрузить ${CATALOG_URL}: ${e.message}. Используйте «Загрузить JSON…».`, true);
      catalog = ensureCatalogShape(emptyCatalogShell());
      renderAll();
    });
  }

  bootstrap();
})();
