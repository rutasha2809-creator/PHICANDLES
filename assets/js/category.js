// category.js — скрипт для страниц отдельных категорий
// Загружает каталог и рендерит товары нужной категории

(async function () {
  const grid = document.querySelector('[data-product-grid]');
  const categoryId = grid?.dataset.defaultCategory || 'all';
  const rootPath = document.body.dataset.rootPath || '../../';
  const catalogPath = document.body.dataset.catalogPath || (rootPath + 'data/catalog.json');

  if (!grid) return;

  // Загрузка каталога
  let catalog;
  try {
    const el = document.getElementById('phicandles-catalog-json');
    if (el) {
      catalog = JSON.parse(el.textContent);
    } else {
      const res = await fetch(catalogPath);
      catalog = await res.json();
    }
  } catch (e) {
    grid.innerHTML = '<p style="padding:20px;color:#888">Не удалось загрузить каталог.</p>';
    return;
  }

  const categoryMap = new Map((catalog.categories || []).map(c => [c.id, c]));

  // Фильтрация товаров
  let items = catalog.products || [];
  if (categoryId !== 'all') {
    items = items.filter(p => p.categoryId === categoryId);
  }

  if (!items.length) {
    grid.innerHTML = '<p style="padding:24px;color:#888;grid-column:1/-1">В этой категории пока нет товаров.</p>';
    return;
  }

  // Рендер карточки товара
  function renderCard(product) {
    const catName = categoryMap.get(product.categoryId)?.name || '';
    const price = Number(product.price);
    const sale = Number(product.salePrice);
    const hasSale = Number.isFinite(sale) && sale > 0 && sale < price;
    const priceHtml = hasSale
      ? `<span class="price-current">${sale.toLocaleString('ru-RU')} ₽</span><span class="price-old">${price.toLocaleString('ru-RU')} ₽</span>`
      : `<span>${price.toLocaleString('ru-RU')} ₽</span>`;

    return `<article class="product-card">
      <a class="product-card-media" href="${rootPath}products/${product.slug}/index.html" aria-label="Перейти к товару ${product.name}">
        <img loading="lazy" src="${rootPath}${product.assetImage || product.image?.replace('./', '')}" alt="${product.imageAlt || product.name}" class="is-active">
      </a>
      <div class="product-card-body">
        ${catName ? `<div class="badge-row"><span class="badge">${catName}</span></div>` : ''}
        <h3><a href="${rootPath}products/${product.slug}/index.html">${product.name}</a></h3>
        <p>${product.shortDescription || ''}</p>
        <div class="price-row">
          <div>
            <div class="price">${priceHtml}</div>
          </div>
          <div class="muted">${product.dimensions || ''}</div>
        </div>
        <div class="card-actions">
          <a class="button-secondary" href="${rootPath}products/${product.slug}/index.html">Подробнее</a>
          <button class="button" type="button" data-add-to-cart="${product.id}">В корзину</button>
        </div>
      </div>
    </article>`;
  }

  grid.innerHTML = items.map(renderCard).join('');

  // Корзина: простая поддержка кнопок «В корзину»
  const CART_KEY = 'phicandles_cart';
  function getCart() {
    try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch { return []; }
  }
  function saveCart(cart) {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  }
  function updateCount() {
    const count = getCart().reduce((s, i) => s + (i.quantity || 1), 0);
    document.querySelectorAll('[data-cart-count]').forEach(el => el.textContent = count);
  }
  updateCount();

  grid.addEventListener('click', e => {
    const btn = e.target.closest('[data-add-to-cart]');
    if (!btn) return;
    const id = btn.dataset.addToCart;
    const cart = getCart();
    const existing = cart.find(i => i.productId === id);
    if (existing) { existing.quantity = (existing.quantity || 1) + 1; }
    else { cart.push({ productId: id, quantity: 1 }); }
    saveCart(cart);
    updateCount();
    btn.textContent = 'Добавлено ✓';
    setTimeout(() => btn.textContent = 'В корзину', 1500);
  });
})();
