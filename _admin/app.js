(() => {
  function catalogUrl() {
    return document.body?.dataset?.catalogPath || '../data/catalog.json';
  }

  /** URL к catalog.json: уникальный при каждом вызове, чтобы обойти кэш браузера и прокси. */
  function catalogFetchUrl() {
    const u = new URL(catalogUrl(), location.href);
    u.searchParams.set('_', String(Date.now()));
    u.searchParams.set('r', String(Math.random()).slice(2, 12));
    return u.href;
  }

  /** Снимок содержимого для сравнения «файл на диске ↔ последняя подгрузка». */
  function snapshotMin(jsonText) {
    return JSON.stringify(JSON.parse(jsonText));
  }

  /** Последняя версия data/catalog.json, с которой совпадала админка (после загрузки/импорта). */
  let lastFetchedSnap = null;
  /** Версия на диске, которую пользователь отклонил в баннере «Подгрузить». */
  let ignoredDiskSnap = null;

  let diskPollStarted = false;

  async function fetchCatalogTextFromDisk() {
    const res = await fetch(catalogFetchUrl(), {
      cache: 'reload',
      headers: {
        Accept: 'application/json',
        'Cache-Control': 'no-cache, no-store, max-age=0, must-revalidate',
        Pragma: 'no-cache',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  }

  function hideDiskBanner() {
    document.getElementById('disk-newer-banner')?.classList.add('is-hidden');
  }

  async function pollDiskChanges() {
    if (location.protocol === 'file:' || lastFetchedSnap === null) return;
    try {
      const text = await fetchCatalogTextFromDisk();
      const snap = snapshotMin(text);
      if (snap !== lastFetchedSnap && snap !== ignoredDiskSnap) {
        document.getElementById('disk-newer-banner')?.classList.remove('is-hidden');
      }
    } catch {
      /* офлайн или сервер недоступен */
    }
  }

  function startDiskPolling() {
    if (location.protocol === 'file:' || diskPollStarted) return;
    diskPollStarted = true;
    setInterval(pollDiskChanges, 4000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') pollDiskChanges();
    });
  }

  /** @type {any} */
  let catalog = null;
  let selectedProductIndex = 0;
  let productFilter = '';
  /** @type {AbortController | null} */
  let productEditorAbort = null;

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function getCatalogJsonText() {
    return JSON.stringify(catalog, null, 2);
  }

  function triggerCatalogDownload() {
    const text = getCatalogJsonText();
    const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'catalog.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }

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
    if (!data.store || !Array.isArray(data.categories) || !Array.isArray(data.products)) {
      throw new Error('Ожидаются поля store, categories (массив) и products (массив)');
    }
    if (!data.colorSwatches || typeof data.colorSwatches !== 'object' || Array.isArray(data.colorSwatches)) {
      data.colorSwatches = {};
    }
    if (!Array.isArray(data.aromas)) {
      data.aromas = [];
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
    const text = await fetchCatalogTextFromDisk();
    const snap = snapshotMin(text);
    lastFetchedSnap = snap;
    ignoredDiskSnap = null;
    hideDiskBanner();
    const raw = JSON.parse(text);
    const data = ensureCatalogShape(deepClone(raw));
    catalog = data;
    selectedProductIndex = 0;
    setStatus('Актуальный каталог загружен из data/catalog.json');
    renderAll();
    startDiskPolling();
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
      aromas: [],
      colorSwatches: {},
      products: [],
    };
  }

  function syncReloadButtonLabel() {
    const btn = $('#btn-reload');
    if (location.protocol === 'file:') {
      btn.textContent = 'Перезагрузить страницу';
      btn.title =
        'При file:// каталог с сервера не загружается — откройте админку через http://localhost (см. текст выше) или «Загрузить JSON…»';
    } else {
      btn.textContent = 'Обновить из data';
      btn.title = 'Снова загрузить data/catalog.json с диска (нужен локальный сервер)';
    }
  }

  function renderAll() {
    if (!catalog) return;
    renderStore();
    renderCategories();
    renderProductList();
    renderProductEditor();
    renderAromas();
    renderSwatches();
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

  function renderAromas() {
    const tbody = $('#aromas-body');
    if (!tbody || !catalog) return;
    const list = Array.isArray(catalog.aromas) ? catalog.aromas : [];
    tbody.innerHTML = list
      .map(
        (a, i) => `
      <tr data-aroma-index="${i}">
        <td><input type="text" data-aroma-field="id" value="${esc(a.id || '')}" aria-label="id аромата ${i + 1}"></td>
        <td><input type="text" data-aroma-field="name" value="${esc(a.name || '')}" aria-label="название"></td>
        <td><input type="text" data-aroma-field="description" value="${esc(a.description || '')}" aria-label="описание"></td>
        <td><button type="button" class="icon-del" data-aroma-del="${i}">Удалить</button></td>
      </tr>`,
      )
      .join('');
  }

  function onAromaInput(e) {
    if (!catalog?.aromas) return;
    const t = e.target;
    if (!(t instanceof HTMLInputElement) || !t.dataset.aromaField) return;
    const tr = t.closest('tr[data-aroma-index]');
    if (!tr) return;
    const i = Number(tr.dataset.aromaIndex);
    const field = t.dataset.aromaField;
    if (!catalog.aromas[i]) return;
    catalog.aromas[i][field] = t.value;
  }

  function onAromaClick(e) {
    if (!catalog?.aromas) return;
    const t = e.target;
    if (!(t instanceof HTMLElement) || t.dataset.aromaDel == null) return;
    const i = Number(t.dataset.aromaDel);
    catalog.aromas.splice(i, 1);
    renderAromas();
  }

  function safeHexForCss(raw) {
    const s = String(raw ?? '').trim();
    if (/^#[0-9A-Fa-f]{3}$/i.test(s) || /^#[0-9A-Fa-f]{6}$/i.test(s) || /^#[0-9A-Fa-f]{8}$/i.test(s)) return s;
    return '#cccccc';
  }

  function syncColorSwatchesFromTable() {
    if (!catalog) return;
    const tbody = $('#swatches-body');
    if (!tbody) return;
    const next = {};
    tbody.querySelectorAll('tr[data-swatch-row]').forEach((tr) => {
      const name = tr.querySelector('[data-swatch-field="name"]')?.value?.trim() ?? '';
      const hex = tr.querySelector('[data-swatch-field="hex"]')?.value?.trim() ?? '';
      if (!name) return;
      next[name] = hex || '#cccccc';
    });
    catalog.colorSwatches = next;
  }

  function renderSwatches() {
    const tbody = $('#swatches-body');
    if (!tbody || !catalog) return;
    const obj = catalog.colorSwatches && typeof catalog.colorSwatches === 'object' ? catalog.colorSwatches : {};
    const keys = Object.keys(obj).sort((a, b) => a.localeCompare(b, 'ru'));
    tbody.innerHTML = keys
      .map((name, i) => {
        const hex = obj[name] ?? '';
        const sample = safeHexForCss(hex);
        return `<tr data-swatch-row="${i}">
        <td><span class="swatch-sample" style="background:${sample}" aria-hidden="true"></span></td>
        <td><input type="text" data-swatch-field="name" value="${esc(name)}" aria-label="ключ цвета ${i + 1}"></td>
        <td><input type="text" data-swatch-field="hex" value="${esc(hex)}" aria-label="hex" spellcheck="false"></td>
        <td><button type="button" class="icon-del" data-swatch-del="${i}">Удалить</button></td>
      </tr>`;
      })
      .join('');
  }

  function onSwatchInput(e) {
    const t = e.target;
    if (!(t instanceof HTMLInputElement) || !t.dataset.swatchField) return;
    syncColorSwatchesFromTable();
    if (t.dataset.swatchField === 'hex') {
      const tr = t.closest('tr[data-swatch-row]');
      const sample = tr?.querySelector('.swatch-sample');
      if (sample) sample.style.background = safeHexForCss(t.value);
    }
  }

  function onSwatchClick(e) {
    if (!catalog?.colorSwatches) return;
    const t = e.target;
    if (!(t instanceof HTMLElement) || t.dataset.swatchDel == null) return;
    const tr = t.closest('tr[data-swatch-row]');
    if (!tr) return;
    const name = tr.querySelector('[data-swatch-field="name"]')?.value?.trim();
    if (name && catalog.colorSwatches) delete catalog.colorSwatches[name];
    renderSwatches();
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
      <div class="field"><label>options.aroma (id из блока aromas в catalog.json, по одному на строку)</label><textarea data-p-aroma>${esc(aroma)}</textarea></div>
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

  function syncRawJsonTextarea() {
    const ta = $('#raw-json');
    if (!ta || !catalog) return;
    ta.value = JSON.stringify(catalog, null, 2);
  }

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
      if (!catalog) return;
      triggerCatalogDownload();
      setStatus('Скачан catalog.json — положите в data/catalog.json в проекте');
    } catch (e) {
      setStatus(String(e.message || e), true);
    }
  });

  $('#btn-save-file').addEventListener('click', async () => {
    if (!catalog) return;
    const text = getCatalogJsonText();
    if (typeof window.showSaveFilePicker !== 'function') {
      triggerCatalogDownload();
      setStatus('Запись на диск недоступна в этом браузере — скачан catalog.json');
      return;
    }
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: 'catalog.json',
        types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(new Blob([text], { type: 'application/json;charset=utf-8' }));
      await writable.close();
      try {
        const verify = await fetchCatalogTextFromDisk();
        lastFetchedSnap = snapshotMin(verify);
        ignoredDiskSnap = null;
        hideDiskBanner();
      } catch {
        lastFetchedSnap = snapshotMin(text);
      }
      setStatus('Файл catalog.json записан.');
    } catch (e) {
      if (e && e.name === 'AbortError') return;
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
        const rawText = String(reader.result || '{}');
        const parsed = ensureCatalogShape(JSON.parse(rawText));
        catalog = deepClone(parsed);
        selectedProductIndex = 0;
        lastFetchedSnap = snapshotMin(rawText);
        ignoredDiskSnap = null;
        hideDiskBanner();
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

  $('#btn-pull-disk').addEventListener('click', () => {
    loadFromServer().catch((e) => setStatus(String(e.message || e), true));
  });

  $('#btn-dismiss-disk').addEventListener('click', () => {
    fetchCatalogTextFromDisk()
      .then((t) => {
        ignoredDiskSnap = snapshotMin(t);
        hideDiskBanner();
      })
      .catch(() => hideDiskBanner());
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

  $('#panel-aromas').addEventListener('input', onAromaInput, { passive: true });
  $('#panel-aromas').addEventListener('click', onAromaClick);

  $('#panel-swatches').addEventListener('input', onSwatchInput, { passive: true });
  $('#panel-swatches').addEventListener('click', onSwatchClick);

  $('#btn-add-category').addEventListener('click', () => {
    if (!catalog) return;
    catalog.categories.push({
      id: 'new-cat',
      name: 'Новая категория',
      description: '',
    });
    renderCategories();
  });

  $('#btn-add-aroma').addEventListener('click', () => {
    if (!catalog) return;
    if (!Array.isArray(catalog.aromas)) catalog.aromas = [];
    catalog.aromas.push({
      id: `aroma-new-${Date.now()}`,
      name: 'Новый аромат',
      description: '',
    });
    renderAromas();
    setStatus('Добавлен аромат');
  });

  $('#btn-add-swatch').addEventListener('click', () => {
    if (!catalog) return;
    if (!catalog.colorSwatches || typeof catalog.colorSwatches !== 'object' || Array.isArray(catalog.colorSwatches)) {
      catalog.colorSwatches = {};
    }
    const base = 'новый цвет';
    let k = base;
    let n = 2;
    while (Object.prototype.hasOwnProperty.call(catalog.colorSwatches, k)) {
      k = `${base} ${n++}`;
    }
    catalog.colorSwatches[k] = '#e8e8e8';
    renderSwatches();
    setStatus('Добавлен цвет');
  });

  async function bootstrap() {
    syncReloadButtonLabel();

    if (location.protocol === 'file:') {
      setStatus(
        'Режим file://: откройте админку через локальный сервер (http://127.0.0.1:PORT/_admin/) или загрузите data/catalog.json кнопкой «Загрузить JSON…».',
        true,
      );
      catalog = ensureCatalogShape(emptyCatalogShell());
      renderAll();
      return;
    }

    try {
      await loadFromServer();
    } catch (e) {
      setStatus(`Не удалось загрузить data/catalog.json: ${e.message}. Проверьте URL и «Загрузить JSON…».`, true);
      catalog = ensureCatalogShape(emptyCatalogShell());
      renderAll();
    }
  }

  bootstrap();
})();
