const CATALOG_PATH = document.body.dataset.catalogPath || './data/catalog.json';
const STORAGE_KEY = 'phicandles-cart-v1';
const CLIENT_ID_STORAGE_KEY = 'phicandles-client-id';
const CLIENT_ID_COOKIE_NAME = 'phicid';

/** Главная страница с явным index.html (нужно для file:// и предсказуемых переходов с вложенных URL). */
function homePageUrl(suffix = '') {
  const root = document.body.dataset.rootPath || './';
  return `${root}index.html${suffix}`;
}

async function loadCatalog() {
  const inlineCatalog = document.querySelector('#phicandles-catalog-json');
  if (inlineCatalog?.textContent) {
    try {
      return JSON.parse(inlineCatalog.textContent);
    } catch {
      // Если встроенный JSON битый, пробуем fetch как запасной вариант.
    }
  }
  const response = await fetch(CATALOG_PATH, { cache: 'no-store' });
  if (!response.ok) throw new Error('Не удалось загрузить каталог');
  return response.json();
}

function formatPrice(price) {
  // Единый формат цены для всего интерфейса.
  return new Intl.NumberFormat('ru-RU').format(price) + ' ₽';
}

function getProductGalleryImages(product) {
  const fallback = 'assets/img/image-placeholder.svg';
  const base = ((product.image || '') || fallback).replace(/^\.\//, '');
  const extra = Array.isArray(product.gallery) ? product.gallery : [];
  const all = [base, ...extra].filter(Boolean);
  const uniq = [...new Set(all)];
  return uniq.map((rel) => `./${rel.replace(/^\.\//, '')}`);
}

function currentPrice(product) {
  const salePrice = Number(product?.salePrice);
  const basePrice = Number(product?.price) || 0;
  return Number.isFinite(salePrice) && salePrice > 0 && salePrice < basePrice ? salePrice : basePrice;
}

function renderPriceHtml(product, options = {}) {
  const basePrice = Number(product?.price) || 0;
  const salePrice = Number(product?.salePrice);
  const current = currentPrice(product);
  if (Number.isFinite(salePrice) && salePrice > 0 && salePrice < basePrice) {
    const oldClass = options.oldClass || 'price-old';
    const currentClass = options.currentClass || 'price-current';
    return `<span class="${oldClass}">${formatPrice(basePrice)}</span><span class="${currentClass}">${formatPrice(current)}</span>`;
  }
  return `<span class="${options.currentClass || ''}">${formatPrice(current)}</span>`;
}

/** Слово перед «:» в начале сегмента — с заглавной буквы (например «диаметр» → «Диаметр»). */
function capitalizeDimensionLabel(segment) {
  const t = segment.trim();
  const prefix = segment.slice(0, segment.length - t.length);
  const m = t.match(/^([а-яёa-zё]+)(\s*:)(.*)$/i);
  if (!m) return segment;
  const word = m[1];
  const label = word.charAt(0).toLocaleUpperCase('ru-RU') + word.slice(1).toLowerCase();
  return prefix + label + m[2] + m[3];
}

/** Несколько параметров (Высота…, Диаметр…) — с новой строки; запятая в числах вроде «6,6 см» не режется. */
function formatDimensionsLines(dimensions) {
  if (!dimensions || typeof dimensions !== 'string') return '';
  const re = /\s*,\s*(?=(?:высота|диаметр|ширина|глубина|длина|вес|размер|набор)\s*:)/i;
  const raw = dimensions.split(re).map((s) => s.trim()).filter(Boolean);
  const parts = raw.map((s) => capitalizeDimensionLabel(s));
  if (parts.length > 1) return parts.join('\n');
  return capitalizeDimensionLabel(dimensions.trim());
}

function getCart() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveCart(cart) {
  // Единая точка записи корзины + уведомление подписчиков интерфейса.
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
  updateCartCount();
  document.dispatchEvent(new CustomEvent('phicandles-cart-changed'));
}

function getCartCount() {
  return getCart().reduce((sum, item) => sum + item.quantity, 0);
}

function getProductCountInCart(productId) {
  return getCart()
    .filter((item) => item.productId === productId)
    .reduce((sum, item) => sum + item.quantity, 0);
}

function updateCartCount() {
  document.querySelectorAll('[data-cart-count]').forEach((node) => {
    node.textContent = getCartCount();
  });
}

function cartItemKey(productId, options) {
  // Ключ зависит от товара и набора опций (цвет/аромат и т.д.).
  const normalized = Object.entries(options || {})
    .filter(([, value]) => value)
    .sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify([productId, normalized]);
}

function addToCart(product, selectedOptions = {}) {
  const cart = getCart();
  const key = cartItemKey(product.id, selectedOptions);
  const unitPrice = currentPrice(product);
  const found = cart.find((item) => item.key === key);
  if (found) {
    found.quantity += 1;
    found.price = unitPrice;
  } else {
    cart.push({
      key,
      productId: product.id,
      slug: product.slug,
      name: product.name,
      price: unitPrice,
      image: product.image,
      quantity: 1,
      selectedOptions,
    });
  }
  saveCart(cart);
  showToast(`Добавлено: ${product.name}`);
}

function updateCartItemQuantity(key, quantity) {
  const cart = getCart();
  const item = cart.find((entry) => entry.key === key);
  if (!item) return;
  item.quantity = Math.max(1, quantity);
  saveCart(cart);
}

function removeCartItem(key) {
  saveCart(getCart().filter((item) => item.key !== key));
}

function clearCart() {
  if (!getCart().length) return;
  saveCart([]);
  showToast('Корзина очищена');
}

function getCategoryMap(catalog) {
  return new Map((catalog.categories || []).map((category) => [category.id, category]));
}

function averageRating(product) {
  const reviews = product.reviews || [];
  if (!reviews.length) return null;
  const total = reviews.reduce((sum, review) => sum + (review.rating || 0), 0);
  return Math.round((total / reviews.length) * 10) / 10;
}

function renderRating(product) {
  const reviews = product.reviews || [];
  if (!reviews.length) return '';
  const avg = averageRating(product);
  return `★ ${avg} · ${reviews.length} отзыв${declension(reviews.length, ['','а','ов'])}`;
}

/** Для карточки товара: число и текст отзывов отдельно от звёзд. */
function getRatingSummary(product) {
  const reviews = product.reviews || [];
  if (!reviews.length) return null;
  return {
    avg: averageRating(product),
    count: reviews.length,
    reviewsLabel: `${reviews.length} отзыв${declension(reviews.length, ['', 'а', 'ов'])}`,
  };
}

function declension(number, forms) {
  const n = Math.abs(number) % 100;
  const n1 = n % 10;
  if (n > 10 && n < 20) return forms[2];
  if (n1 > 1 && n1 < 5) return forms[1];
  if (n1 === 1) return forms[0];
  return forms[2];
}

function renderProductCard(product, categoryName = '') {
  const rating = renderRating(product);
  const ratingBlock = rating ? `<div class="rating">${rating}</div>` : '';
  const featuredBadge = product.featured ? '<span class="badge">Хит</span>' : '';
  const categoryBadge = categoryName ? `<span class="badge">${categoryName}</span>` : '';
  const gallery = getProductGalleryImages(product);
  const hasGallery = gallery.length > 1;
  const imagesHtml = hasGallery
    ? gallery.map((src, index) => `<img loading="lazy" src="${src}" alt="${product.imageAlt || product.name}" class="${index === 0 ? 'is-active' : ''}" data-card-gallery-img="${index}" onerror="this.onerror=null;this.src='./assets/img/image-placeholder.svg';">`).join('')
    : `<img loading="lazy" src="${gallery[0] || './assets/img/image-placeholder.svg'}" alt="${product.imageAlt || product.name}" class="is-active" onerror="this.onerror=null;this.src='./assets/img/image-placeholder.svg';">`;
  return `
    <article class="product-card">
      <a class="product-card-media" href="./products/${product.slug}/index.html" aria-label="Перейти к товару ${product.name}" data-card-gallery="${hasGallery ? gallery.length : 1}">
        ${imagesHtml}
        ${hasGallery ? `
        <div class="card-gallery-dots" aria-hidden="true">
          ${gallery.map((_, i) => `
            <button type="button" class="card-gallery-dot${i === 0 ? ' is-active' : ''}" data-card-gallery-index="${i}"></button>
          `).join('')}
        </div>` : ''}
      </a>
      <div class="product-card-body">
        <div class="badge-row">${featuredBadge}${categoryBadge}</div>
        <h3><a href="./products/${product.slug}/index.html">${product.name}</a></h3>
        <p>${product.shortDescription || product.description || ''}</p>
        <div class="price-row">
          <div>
            <div class="price">${renderPriceHtml(product)}</div>
            ${ratingBlock}
          </div>
          <div class="muted">${formatDimensionsLines(product.dimensions)}</div>
        </div>
        <div class="card-actions">
          <a class="button-secondary" href="./products/${product.slug}/index.html">Подробнее</a>
          <button class="button" type="button" data-add-to-cart="${product.id}">В корзину</button>
        </div>
      </div>
    </article>
  `;
}

function bindCardGalleries() {
  document.querySelectorAll('[data-card-gallery]').forEach((host) => {
    if (host.dataset.galleryBound === '1') return;
    host.dataset.galleryBound = '1';
    const imgs = host.querySelectorAll('[data-card-gallery-img]');
    if (!imgs.length) return;
    let index = 0;
    const size = imgs.length;
    const show = (i) => {
      index = (i + size) % size;
      imgs.forEach((img, j) => {
        img.classList.toggle('is-active', j === index);
      });
    };
    host.querySelectorAll('.card-gallery-dot').forEach((dot) => {
      const i = Number(dot.dataset.cardGalleryIndex);
      if (Number.isNaN(i)) return;
      dot.addEventListener('click', (event) => {
        event.preventDefault();
        show(i);
      });
      dot.addEventListener('mouseenter', () => {
        show(i);
      });
    });
  });
}

function showToast(message) {
  let toast = document.querySelector('[data-toast]');
  if (!toast) {
    toast = document.createElement('div');
    toast.dataset.toast = 'true';
    toast.style.position = 'fixed';
    toast.style.right = '16px';
    toast.style.bottom = '16px';
    toast.style.padding = '12px 16px';
    toast.style.borderRadius = '14px';
    toast.style.background = '#2c201d';
    toast.style.color = '#fff';
    toast.style.zIndex = '999';
    toast.style.boxShadow = '0 10px 25px rgba(0,0,0,0.18)';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => { toast.hidden = true; }, 1800);
}

function bindQuickAdd(catalog) {
  const map = new Map(catalog.products.map((product) => [product.id, product]));

  // Синхронизация текста кнопок на карточках с текущей корзиной.
  const syncButtons = () => {
    document.querySelectorAll('[data-add-to-cart]').forEach((button) => {
      const productId = button.dataset.addToCart;
      const count = getProductCountInCart(productId);
      button.textContent = count > 0 ? `В корзине: ${count}` : 'В корзину';
    });
  };

  document.querySelectorAll('[data-add-to-cart]').forEach((button) => {
    // Защита от повторного addEventListener после перерисовок.
    if (button.dataset.quickAddBound === '1') return;
    button.dataset.quickAddBound = '1';
    button.addEventListener('click', () => {
      const product = map.get(button.dataset.addToCart);
      if (!product) return;
      const selectedOptions = {};
      if ((product.options?.aroma || []).length) selectedOptions.aroma = product.options.aroma[0];
      if ((product.options?.color || []).length) selectedOptions.color = product.options.color[0];
      addToCart(product, selectedOptions);
    });
  });

  if (document._phicandlesSyncAddButtons) {
    document.removeEventListener('phicandles-cart-changed', document._phicandlesSyncAddButtons);
  }
  document._phicandlesSyncAddButtons = syncButtons;
  document.addEventListener('phicandles-cart-changed', document._phicandlesSyncAddButtons);
  syncButtons();
}

function bindGlobalCartLink() {
  document.querySelectorAll('[data-cart-link]').forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      const cartSection = document.querySelector('#cart');
      if (cartSection) {
        cartSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        window.location.href = homePageUrl('#cart');
      }
    });
  });
}

function readCookie(name) {
  return document.cookie
    .split(';')
    .map((c) => c.trim())
    .filter(Boolean)
    .reduce((acc, pair) => {
      if (acc) return acc;
      const idx = pair.indexOf('=');
      if (idx === -1) return acc;
      const key = decodeURIComponent(pair.slice(0, idx));
      if (key !== name) return acc;
      return decodeURIComponent(pair.slice(idx + 1));
    }, '');
}

function writeCookie(name, value, days = 365) {
  const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toUTCString();
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; expires=${expires}; path=/`;
}

function generateClientId(now = Date.now()) {
  // Простейший хеш с 4 цифрами от timestamp.
  let hash = 0;
  const src = String(now);
  for (let i = 0; i < src.length; i += 1) {
    hash = (hash * 31 + src.charCodeAt(i)) >>> 0;
  }
  const four = String(hash % 10000).padStart(4, '0');
  const randSuffix = `${Math.floor(Math.random() * 10)}${Math.floor(Math.random() * 10)}`;
  return `${four}${randSuffix}`;
}

function ensureClientId() {
  try {
    const cookieVal = readCookie(CLIENT_ID_COOKIE_NAME) || '';
    const lsVal = localStorage.getItem(CLIENT_ID_STORAGE_KEY) || '';

    let id = cookieVal || lsVal;
    if (!id) {
      id = generateClientId();
    }

    // Синхронизируем во все источники, если хоть где-то есть или только что сгенерировали.
    if (localStorage.getItem(CLIENT_ID_STORAGE_KEY) !== id) {
      localStorage.setItem(CLIENT_ID_STORAGE_KEY, id);
    }
    if ((readCookie(CLIENT_ID_COOKIE_NAME) || '') !== id) {
      writeCookie(CLIENT_ID_COOKIE_NAME, id);
    }

    return id;
  } catch {
    // В режиме без localStorage/куки просто тихо выходим.
    return null;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  updateCartCount();
  bindGlobalCartLink();
  bindCardGalleries();
  ensureClientId();
});