const AROMA_CHIP_MAX = 10;
const COLOR_SWATCH_MAX = 14;

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function escapeAttr(text) {
  return escapeHtml(text).replace(/"/g, '&quot;');
}

const COLOR_SWATCH_FALLBACK = 'linear-gradient(145deg, #ece6e2 0%, #ddd4cf 100%)';

/** Ключ для сопоставления с полем colorSwatches в каталоге (нижний регистр, ё → е). */
function colorSwatchLookupKey(name) {
  return String(name).toLowerCase().trim().replace(/ё/g, 'е');
}

function buildColorSwatchMap(catalog) {
  const raw = catalog?.colorSwatches;
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  Object.entries(raw).forEach(([k, v]) => {
    const key = colorSwatchLookupKey(k);
    if (key) out[key] = String(v).trim();
  });
  return out;
}

function colorSwatchBackground(name, colorMap) {
  const key = colorSwatchLookupKey(name);
  const hex = colorMap[key];
  if (hex) return hex;
  return COLOR_SWATCH_FALLBACK;
}

function collectionBadgeText(product) {
  if (product.collectionBadge) return product.collectionBadge;
  if (product.tags?.includes('gift')) return 'На подарок';
  if (product.tags?.includes('limited')) return 'Лимитированная серия';
  if (product.categoryId === 'easter') return 'Пасхальная коллекция';
  const desc = `${product.shortDescription || ''} ${product.description || ''}`.toLowerCase();
  if (desc.includes('подарок') || desc.includes('подарочн')) return 'На подарок';
  return 'Ручная работа';
}

function stockLabel(product) {
  if (product.availability === 'made_to_order') return 'Изготавливается 1–3 дня';
  return '';
}

function buildGalleryPaths(product) {
  const main = product.assetImage || product.image?.replace(/^\.\//, '') || 'assets/img/image-placeholder.svg';
  const extra = Array.isArray(product.gallery) ? product.gallery : [];
  const paths = [main, ...extra].filter(Boolean);
  const uniq = [...new Set(paths)];
  return uniq.map((p) => p.replace(/^\.\//, ''));
}

function dimensionSpecRows(dimensions) {
  const lines = (formatDimensionsLines(dimensions || '') || '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  return lines.map((line) => {
    const idx = line.indexOf(':');
    if (idx === -1) return { label: 'Параметры', value: line };
    return {
      label: line.slice(0, idx).trim(),
      value: line.slice(idx + 1).trim(),
    };
  });
}

function renderSpecCards(product) {
  const rows = dimensionSpecRows(product.dimensions);
  const cards = [];
  rows.forEach((row) => {
    cards.push(`<div class="spec-card"><span class="spec-card__label">${escapeHtml(row.label)}</span><span class="spec-card__value">${escapeHtml(row.value)}</span></div>`);
  });
  if (product.burnTime) {
    cards.push(`<div class="spec-card"><span class="spec-card__label">Горение</span><span class="spec-card__value">${escapeHtml(product.burnTime)}</span></div>`);
  }
  return cards.join('');
}

function setupAromaControls(aromaWrap, aromaSelect, product, aromaMap) {
  const aromaIds = product.options?.aroma || [];
  aromaSelect.innerHTML = '';
  if (!aromaIds.length) {
    aromaWrap.classList.add('hidden');
    return;
  }
  aromaWrap.classList.remove('hidden');

  const chipHost = aromaWrap.querySelector('[data-option-aroma-chips]');
  const selectWrap = aromaWrap.querySelector('[data-option-aroma-select-wrap]');

  const labelFor = (id) => aromaDisplayName(aromaMap, id);

  // Если ароматов много, используем select; иначе — чипы.
  const useNative = aromaIds.length > AROMA_CHIP_MAX;
  if (useNative) {
    chipHost?.classList.add('hidden');
    selectWrap?.classList.remove('hidden');
    aromaSelect.classList.remove('hidden');
    aromaSelect.removeAttribute('aria-hidden');
    aromaSelect.tabIndex = 0;
    aromaSelect.innerHTML = aromaIds
      .map((id) => `<option value="${escapeAttr(id)}">${escapeHtml(labelFor(id))}</option>`)
      .join('');
    return;
  }

  selectWrap?.classList.add('hidden');
  chipHost?.classList.remove('hidden');
  if (!chipHost) return;

  chipHost.innerHTML = aromaIds
    .map(
      (id, i) => `
    <button type="button" class="option-chip${i === 0 ? ' is-active' : ''}" data-aroma-chip value="${escapeAttr(id)}">${escapeHtml(labelFor(id))}</button>`,
    )
    .join('');

  const setActive = (value) => {
    chipHost.querySelectorAll('[data-aroma-chip]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.value === value);
    });
    aromaSelect.value = value;
  };

  chipHost.querySelectorAll('[data-aroma-chip]').forEach((btn) => {
    btn.addEventListener('click', () => setActive(btn.value));
  });

  aromaSelect.innerHTML = aromaIds
    .map((id) => `<option value="${escapeAttr(id)}">${escapeHtml(labelFor(id))}</option>`)
    .join('');
  setActive(aromaIds[0]);
  aromaSelect.classList.add('hidden');
  aromaSelect.setAttribute('aria-hidden', 'true');
  aromaSelect.tabIndex = -1;
}

function setupColorControls(colorWrap, colorSelect, product, colorMap) {
  const colors = product.options?.color || [];
  colorSelect.innerHTML = '';
  if (!colors.length) {
    colorWrap.classList.add('hidden');
    return;
  }
  colorWrap.classList.remove('hidden');

  // Для длинного списка цветов переключаемся на нативный select.
  if (colors.length > COLOR_SWATCH_MAX) {
    colorWrap.querySelector('[data-option-color-swatches]')?.classList.add('hidden');
    colorWrap.querySelector('[data-option-color-select-wrap]')?.classList.remove('hidden');
    colorSelect.classList.remove('hidden');
    colorSelect.removeAttribute('aria-hidden');
    colorSelect.tabIndex = 0;
    colorSelect.innerHTML = colors.map((item) => `<option value="${escapeAttr(item)}">${escapeHtml(item)}</option>`).join('');
    return;
  }

  colorWrap.querySelector('[data-option-color-select-wrap]')?.classList.add('hidden');
  const swRoot = colorWrap.querySelector('[data-option-color-swatches]');
  swRoot?.classList.remove('hidden');
  if (!swRoot) return;

  swRoot.innerHTML = colors
    .map(
      (item, i) => `
    <button type="button" class="color-swatch${i === 0 ? ' is-active' : ''}" data-color-swatch value="${escapeAttr(item)}"
      style="--swatch:${colorSwatchBackground(item, colorMap)}"
      title="${escapeAttr(item)}"
      aria-label="${escapeAttr(item)}"><span class="color-swatch__inner"></span></button>`,
    )
    .join('');

  const setActive = (value) => {
    swRoot.querySelectorAll('[data-color-swatch]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.value === value);
    });
    colorSelect.value = value;
  };

  swRoot.querySelectorAll('[data-color-swatch]').forEach((btn) => {
    btn.addEventListener('click', () => setActive(btn.value));
  });

  colorSelect.innerHTML = colors.map((item) => `<option value="${escapeAttr(item)}">${escapeHtml(item)}</option>`).join('');
  setActive(colors[0]);
  colorSelect.classList.add('hidden');
  colorSelect.setAttribute('aria-hidden', 'true');
  colorSelect.tabIndex = -1;
}

function setupFinishControls(finishWrap, finishSelect, product) {
  const values = product.options?.finish || [];
  if (!finishWrap || !finishSelect || !values.length) {
    finishWrap?.classList.add('hidden');
    return;
  }
  finishWrap.classList.remove('hidden');

  const chipHost = finishWrap.querySelector('[data-option-finish-chips]');
  if (!chipHost) return;

  chipHost.innerHTML = values
    .map(
      (val, i) => `<button type="button" class="option-chip${i === 0 ? ' is-active' : ''}" data-finish-chip value="${escapeAttr(val)}">${escapeHtml(val)}</button>`,
    )
    .join('');

  const setActive = (value) => {
    chipHost.querySelectorAll('[data-finish-chip]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.value === value);
    });
    finishSelect.value = value;
  };

  chipHost.querySelectorAll('[data-finish-chip]').forEach((btn) => {
    btn.addEventListener('click', () => setActive(btn.value));
  });

  finishSelect.innerHTML = values
    .map((val) => `<option value="${escapeAttr(val)}">${escapeHtml(val)}</option>`)
    .join('');
  setActive(values[0]);
}

function setupGallery(product, mainImg) {
  const paths = buildGalleryPaths(product);
  const thumbs = document.querySelector('[data-product-gallery-thumbs]');
  const root = document.querySelector('[data-product-gallery]');
  if (!thumbs || !root || paths.length < 2) {
    thumbs?.classList.add('hidden');
    return;
  }
  thumbs.classList.remove('hidden');
  thumbs.innerHTML = paths
    .map(
      (rel, i) => `
    <button type="button" class="product-gallery-thumb${i === 0 ? ' is-active' : ''}" data-gallery-index="${i}" aria-label="Фото ${i + 1}"></button>`,
    )
    .join('');

  let currentIndex = 0;

  // Переключение главного изображения.
  const setIndex = (i) => {
    currentIndex = (i + paths.length) % paths.length;
    const rel = paths[currentIndex];
    if (!rel) return;
    mainImg.src = `../../${rel}`;
    thumbs.querySelectorAll('.product-gallery-thumb').forEach((btn, j) => {
      btn.classList.toggle('is-active', j === currentIndex);
    });
  };

  thumbs.querySelectorAll('.product-gallery-thumb').forEach((btn) => {
    const index = Number(btn.dataset.galleryIndex);
    btn.addEventListener('click', () => setIndex(index));
  });

  // Стрелки навигации.
  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.className = 'gallery-arrow gallery-arrow--prev';
  prevBtn.setAttribute('aria-label', 'Предыдущее фото');
  prevBtn.innerHTML = '&#8249;';
  prevBtn.addEventListener('click', () => setIndex(currentIndex - 1));

  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'gallery-arrow gallery-arrow--next';
  nextBtn.setAttribute('aria-label', 'Следующее фото');
  nextBtn.innerHTML = '&#8250;';
  nextBtn.addEventListener('click', () => setIndex(currentIndex + 1));

  root.appendChild(prevBtn);
  root.appendChild(nextBtn);

  // Свайп пальцем.
  let touchStartX = 0;
  const mainWrap = root.querySelector('.product-gallery-main') || mainImg.parentElement;
  mainWrap.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].clientX;
  }, { passive: true });
  mainWrap.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) > 40) setIndex(currentIndex + (dx < 0 ? 1 : -1));
  }, { passive: true });
}

function syncProductAddButton(productId, button) {
  const count = getProductCountInCart(productId);
  button.textContent = count > 0 ? `В корзине: ${count}` : 'Добавить в корзину';
}

async function initProductPage() {
  // Инициализация карточки товара по slug из data-атрибута страницы.
  const catalog = await loadCatalog();
  const slug = document.body.dataset.productSlug;
  const product = catalog.products.find((item) => item.slug === slug);
  const categoryMap = getCategoryMap(catalog);
  if (!product) {
    window.location.href = '../../404.html';
    return;
  }

  document.title = `${product.name} — ${catalog.store.name}`;
  document.querySelectorAll('[data-product-name], [data-product-breadcrumb-name]').forEach((node) => {
    node.textContent = product.name;
  });
  const breadcrumbCategory = document.querySelector('[data-breadcrumb-category]');
  if (breadcrumbCategory) {
    const catName = categoryMap.get(product.categoryId)?.name || '';
    breadcrumbCategory.textContent = catName;
    const rootPath = document.body.dataset.rootPath || './';
    breadcrumbCategory.href = rootPath + 'catalog/index.html#' + product.categoryId;
  }

  const badgeEl = document.querySelector('[data-product-collection-badge]');
  if (badgeEl) {
    badgeEl.textContent = collectionBadgeText(product);
  }

  const shortEl = document.querySelector('[data-product-short]');
  const lead = product.shortDescription || '';
  if (shortEl) {
    shortEl.textContent = lead;
    shortEl.classList.toggle('hidden', !lead);
  }

  const descEl = document.querySelector('[data-product-description]');
  if (descEl) {
    descEl.textContent = product.description || '';
    descEl.classList.toggle('hidden', !product.description);
  }

  // Hide entire "О свече" block and tagline when there is no text content
  const storyBlock = document.querySelector('.product-story-inline');
  if (storyBlock) {
    const hasContent = !!(lead || product.description);
    storyBlock.classList.toggle('hidden', !hasContent);
  }
  const tagline = document.querySelector('.product-story-inline__tagline');
  if (tagline) tagline.classList.toggle('hidden', !lead && !product.description);

  document.querySelector('[data-product-price]').innerHTML = renderPriceHtml(product, {
    oldClass: 'product-price-old',
    currentClass: 'product-price-current',
  });

  const stockEl = document.querySelector('[data-product-stock]');
  if (stockEl) stockEl.textContent = stockLabel(product);


  const mainImg = document.querySelector('[data-product-image]');
  mainImg.src = '../../' + product.assetImage;
  mainImg.alt = product.imageAlt || product.name;
  setupGallery(product, mainImg);

  const specsRoot = document.querySelector('[data-product-specs]');
  const specsSection = document.querySelector('[data-product-specs-section]');
  if (specsRoot) {
    const specHtml = renderSpecCards(product);
    specsRoot.innerHTML = specHtml;
    if (specsSection) specsSection.classList.toggle('hidden', !specHtml.trim());
  }

  const materialList = document.querySelector('[data-product-materials]');
  const materialsArr = (product.materials || []).filter(Boolean);
  materialList.innerHTML = materialsArr.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
  // Hide the entire materials block when there are no materials
  const materialsBlock = document.querySelector('.materials-block');
  if (materialsBlock) materialsBlock.classList.toggle('hidden', !materialsArr.length);

  const aromaWrap = document.querySelector('[data-option-aroma-wrap]');
  const colorWrap = document.querySelector('[data-option-color-wrap]');
  const finishWrap = document.querySelector('[data-option-finish-wrap]');
  const aromaSelect = document.querySelector('[data-option-aroma]');
  const colorSelect = document.querySelector('[data-option-color]');
  const finishSelect = document.querySelector('[data-option-finish]');
  const aromaMap = buildAromaMap(catalog);
  setupAromaControls(aromaWrap, aromaSelect, product, aromaMap);
  const colorSwatchMap = buildColorSwatchMap(catalog);
  setupColorControls(colorWrap, colorSelect, product, colorSwatchMap);
  setupFinishControls(finishWrap, finishSelect, product);

  const addButton = document.querySelector('[data-add-product]');
  // Поддерживаем текст кнопки в актуальном состоянии при любом изменении корзины.
  syncProductAddButton(product.id, addButton);
  document.addEventListener('phicandles-cart-changed', () => syncProductAddButton(product.id, addButton));
  addButton.addEventListener('click', () => {
    const options = {};
    if (!aromaWrap.classList.contains('hidden')) options.aroma = aromaSelect.value;
    if (!colorWrap.classList.contains('hidden')) options.color = colorSelect.value;
    if (finishWrap && !finishWrap.classList.contains('hidden')) options.finish = finishSelect.value;
    addToCart({ ...product, image: '../../' + product.assetImage }, options);
  });


  // Related products: by relatedGroup within same category, or just same category
  const allOther = catalog.products.filter(
    (item) => item.id !== product.id && item.categoryId !== 'hidden'
  );
  let related;
  if (product.relatedGroup) {
    const sameGroup = allOther.filter(
      (item) => item.categoryId === product.categoryId && item.relatedGroup === product.relatedGroup
    );
    related = sameGroup.sort((a, b) => b.popularity - a.popularity).slice(0, 4);
  } else {
    related = allOther
      .filter((item) => item.categoryId === product.categoryId)
      .sort((a, b) => b.popularity - a.popularity)
      .slice(0, 4);
  }
  document.querySelector('[data-related-grid]').innerHTML = related
    .map((item) => {
      const categoryName = categoryMap.get(item.categoryId)?.name || '';
      return renderProductCard({ ...item, image: '../../' + item.assetImage }, categoryName, { rootPath: '../../' });
    })
    .join('');

  if (typeof bindQuickAdd === 'function') {
    bindQuickAdd({
      ...catalog,
      products: catalog.products.map((item) => ({ ...item, image: '../../' + item.assetImage })),
    });
  }
}

async function safeInitProductPage() {
  try {
    await initProductPage();
  } catch (err) {
    console.error('[product] init error', err);
    const root = document.querySelector('[data-product-root]');
    if (root) root.innerHTML =
      '<div class="notice">Не удалось загрузить карточку товара.</div>';
  }
}

document.addEventListener('DOMContentLoaded', safeInitProductPage);
