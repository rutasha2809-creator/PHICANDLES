function recentReviewsFromCatalog(catalog, limit = 3) {
  const flat = [];
  for (const product of catalog.products) {
    for (const review of product.reviews || []) {
      flat.push({
        ...review,
        productName: product.name,
        productSlug: product.slug,
      });
    }
  }
  flat.sort((a, b) => {
    const ta = new Date(a.date).getTime();
    const tb = new Date(b.date).getTime();
    if (Number.isNaN(ta) && Number.isNaN(tb)) return 0;
    if (Number.isNaN(ta)) return 1;
    if (Number.isNaN(tb)) return -1;
    return tb - ta;
  });
  return flat.slice(0, limit);
}

function cartKeyDataAttr(key) {
  return encodeURIComponent(key);
}

function cartKeyFromDataAttr(encoded) {
  try {
    return decodeURIComponent(encoded);
  } catch {
    return encoded;
  }
}

function optionLabel(key) {
  if (key === 'aroma') return 'Аромат';
  if (key === 'color') return 'Цвет';
  return key;
}

function normalizeTelegramUsername(telegramUrl) {
  if (!telegramUrl) return '';
  const trimmed = String(telegramUrl).trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('@')) return trimmed.slice(1);
  const match = trimmed.match(/(?:https?:\/\/)?(?:t\.me|telegram\.me)\/([A-Za-z0-9_]+)/i);
  if (match?.[1]) return match[1];
  return '';
}

function buildTelegramOrderUrl(telegramUrl, messageText) {
  const username = normalizeTelegramUsername(telegramUrl);
  if (!username) return telegramUrl;
  return `https://t.me/${username}?text=${encodeURIComponent(messageText)}`;
}

function generateOrderNumber(now = new Date()) {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const timestampSec = Math.floor(now.getTime() / 1000);
  const tsLast5 = String(timestampSec % 100000).padStart(5, '0');
  const clientId = (typeof ensureClientId === 'function' && ensureClientId()) || '';
  return clientId ? `#${clientId}-${month}${day}-${tsLast5}` : `#${month}${day}-${tsLast5}`;
}

const ORDER_HISTORY_STORAGE_KEY = 'phicandles-order-history-v1';

function saveOrderToLocalStorage(orderPayload) {
  let history = [];
  try {
    history = JSON.parse(localStorage.getItem(ORDER_HISTORY_STORAGE_KEY)) || [];
    if (!Array.isArray(history)) history = [];
  } catch {
    history = [];
  }
  history.unshift(orderPayload);
  localStorage.setItem(ORDER_HISTORY_STORAGE_KEY, JSON.stringify(history));
}

function getOrderHistoryFromLocalStorage() {
  try {
    const history = JSON.parse(localStorage.getItem(ORDER_HISTORY_STORAGE_KEY)) || [];
    return Array.isArray(history) ? history : [];
  } catch {
    return [];
  }
}

function buildOrderMessage(cart, productsMap, formData, totalRub, orderNumber) {
  const lines = [
    'Новый заказ PHICANDLES',
    `Номер заказа: ${orderNumber}`,
    '',
    'Покупатель:',
    `Имя: ${formData.name}`,
    `Телефон: ${formData.phone}`,
    `Email: ${formData.email || 'не указан'}`,
    `Адрес доставки: ${formData.address}`,
    `Комментарий: ${formData.comment || 'нет'}`,
    `Способ оплаты: ${formData.payment}`,
    '',
    'Состав заказа:',
  ];

  cart.forEach((item, index) => {
    const product = productsMap.get(item.productId);
    if (!product) return;
    const options = Object.entries(item.selectedOptions || {}).filter(([, value]) => value);
    const optionText = options.length ? ` (${options.map(([key, value]) => `${key}: ${value}`).join(', ')})` : '';
    const lineTotal = item.price * item.quantity;
    lines.push(`${index + 1}. ${product.name}${optionText}`);
    lines.push(`   ${item.quantity} × ${formatPrice(item.price)} = ${formatPrice(lineTotal)}`);
  });

  lines.push('');
  lines.push(`Итого: ${formatPrice(totalRub)}`);
  return lines.join('\n');
}

function openCheckoutModal({ cart, productsMap, totalRub, telegramUrl }) {
  const orderNumber = generateOrderNumber();
  const backdrop = document.createElement('div');
  backdrop.className = 'checkout-modal-backdrop';
  backdrop.innerHTML = `
    <div class="checkout-modal" role="dialog" aria-modal="true" aria-labelledby="checkout-modal-title">
      <button type="button" class="checkout-modal__close" data-close-checkout aria-label="Закрыть">×</button>
      <h3 id="checkout-modal-title" class="checkout-modal__title">Оформление заказа</h3>
      <p class="muted checkout-modal__order-number">Номер заказа: <strong>${orderNumber}</strong></p>
      <form class="checkout-form" data-checkout-form novalidate>
        <label class="checkout-form__field">
          <span>Ваше имя*</span>
          <input type="text" name="name" autocomplete="name" required>
        </label>
        <label class="checkout-form__field">
          <span>Телефон*</span>
          <input type="tel" name="phone" autocomplete="tel" required>
        </label>
        <label class="checkout-form__field">
          <span>Email</span>
          <input type="email" name="email" autocomplete="email">
        </label>
        <label class="checkout-form__field">
          <span>Адрес доставки*</span>
          <input type="text" name="address" autocomplete="street-address" required>
        </label>
        <label class="checkout-form__field">
          <span>Комментарий к заказу</span>
          <textarea name="comment" rows="3"></textarea>
        </label>
        <fieldset class="checkout-form__field checkout-form__fieldset">
          <legend>Способ оплаты*</legend>
          <label><input type="radio" name="payment" value="Банковская карта" required checked> Банковская карта</label>
          <label><input type="radio" name="payment" value="Наличными при получении" required> Наличными при получении</label>
        </fieldset>
        <p class="checkout-form__total">Итого: <strong>${formatPrice(totalRub)}</strong></p>
        <p class="checkout-form__error hidden" data-checkout-error>Заполните обязательные поля: имя, телефон и адрес доставки.</p>
        <button type="submit" class="button checkout-form__submit">Подтвердить заказ</button>
      </form>
    </div>
  `;

  const close = () => {
    backdrop.remove();
    document.body.classList.remove('checkout-modal-open');
  };

  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop || event.target.closest('[data-close-checkout]')) close();
  });

  backdrop.querySelector('[data-checkout-form]').addEventListener('submit', (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const error = form.querySelector('[data-checkout-error]');
    const formData = {
      name: form.elements.name.value.trim(),
      phone: form.elements.phone.value.trim(),
      email: form.elements.email.value.trim(),
      address: form.elements.address.value.trim(),
      comment: form.elements.comment.value.trim(),
      payment: form.elements.payment.value,
    };
    if (!formData.name || !formData.phone || !formData.address) {
      error.classList.remove('hidden');
      return;
    }
    error.classList.add('hidden');
    const message = buildOrderMessage(cart, productsMap, formData, totalRub, orderNumber);
    const telegramOrderUrl = buildTelegramOrderUrl(telegramUrl, message);
    const orderItems = cart.map((item) => {
      const product = productsMap.get(item.productId);
      return {
        productId: item.productId,
        productName: product?.name || item.name,
        slug: product?.slug || item.slug || '',
        quantity: item.quantity,
        price: item.price,
        selectedOptions: item.selectedOptions || {},
      };
    });
    saveOrderToLocalStorage({
      orderNumber,
      createdAt: new Date().toISOString(),
      totalRub,
      items: orderItems,
      customer: formData,
      telegramOrderUrl,
      telegramMessage: message,
    });
    console.log('[Checkout debug] Telegram payload', {
      orderNumber,
      formData,
      totalRub,
      telegramOrderUrl,
      message,
    });
    clearCart();
    close();
  });

  document.body.appendChild(backdrop);
  document.body.classList.add('checkout-modal-open');
  const firstInput = backdrop.querySelector('input[name="name"]');
  firstInput?.focus();
}

function renderHomeReviews(catalog) {
  const root = document.querySelector('[data-home-reviews]');
  if (!root) return;
  const picked = recentReviewsFromCatalog(catalog, 3);
  if (!picked.length) {
    root.innerHTML = '<p class="muted">Отзывов пока нет.</p>';
    return;
  }
  root.innerHTML = picked.map((review) => `
    <article class="review-card review-card--compact">
      <div class="review-head">
        <strong>${review.author}</strong>
        <span>★ ${review.rating}</span>
      </div>
      <p>${review.text}</p>
      <p class="muted review-meta">
        <a href="./products/${review.productSlug}/index.html">${review.productName}</a>
        · ${new Date(review.date).toLocaleDateString('ru-RU')}
      </p>
    </article>
  `).join('');
}

function serializeCartForShare(cart) {
  const payload = cart
    .filter((item) => item?.productId && Number.isFinite(item.quantity) && item.quantity > 0)
    .map((item) => ({
      id: item.productId,
      q: Math.max(1, Math.min(99, Math.trunc(item.quantity))),
      o: item.selectedOptions || {},
    }));
  return encodeURIComponent(JSON.stringify(payload));
}

function parseSharedCartPayload(raw) {
  if (!raw) return [];
  try {
    const decoded = decodeURIComponent(raw);
    const parsed = JSON.parse(decoded);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function restoreCartFromShareParam(catalog) {
  const url = new URL(window.location.href);
  const shared = parseSharedCartPayload(url.searchParams.get('cart'));
  if (!shared.length) return false;

  const productsMap = new Map((catalog.products || []).map((product) => [product.id, product]));
  const restoredCart = [];

  shared.forEach((entry) => {
    if (!entry || typeof entry !== 'object') return;
    const product = productsMap.get(entry.id);
    if (!product) return;
    const selectedOptions = entry.o && typeof entry.o === 'object' ? entry.o : {};
    const quantity = Math.max(1, Math.min(99, Math.trunc(Number(entry.q) || 1)));
    const key = cartItemKey(product.id, selectedOptions);
    const existing = restoredCart.find((item) => item.key === key);
    if (existing) {
      existing.quantity += quantity;
      return;
    }
    restoredCart.push({
      key,
      productId: product.id,
      slug: product.slug,
      name: product.name,
      price: product.price,
      image: product.image,
      quantity,
      selectedOptions,
    });
  });

  if (!restoredCart.length) return false;
  saveCart(restoredCart);
  return true;
}

async function initHomePage() {
  // Главная инициализация: загружаем каталог и поднимаем интерактив.
  const catalog = await loadCatalog();
  const categoryMap = getCategoryMap(catalog);
  const productGrid = document.querySelector('[data-product-grid]');
  const filters = document.querySelector('[data-category-filters]');
  const featuredBlock = document.querySelector('[data-featured-grid]');
  const cartRestoredFromShare = restoreCartFromShareParam(catalog);
  const DISCOUNT_CATEGORY_ID = 'discounts';
  const hasDiscounts = catalog.products.some((product) => {
    const base = Number(product.price) || 0;
    const sale = Number(product.salePrice);
    return Number.isFinite(sale) && sale > 0 && sale < base;
  });

  renderHomeReviews(catalog);

  const syncCategoryInUrl = (categoryId) => {
    const url = new URL(window.location.href);
    if (!categoryId || categoryId === 'all') {
      url.searchParams.delete('category');
    } else {
      url.searchParams.set('category', categoryId);
    }
    url.hash = 'catalog';
    window.history.pushState({ category: categoryId || 'all' }, '', url.toString());
  };

  const applyCategorySelection = (categoryId = 'all', { updateUrl = false } = {}) => {
    const normalized = categoryId === 'all' ? 'all' : categoryId;
    const activeBtn = filters.querySelector(`[data-category="${normalized}"]`) || filters.querySelector('[data-category="all"]');
    filters.querySelectorAll('[data-category]').forEach((node) => node.classList.toggle('active', node === activeBtn));
    renderProducts(activeBtn?.dataset.category || 'all');
    if (updateUrl) syncCategoryInUrl(activeBtn?.dataset.category || 'all');
  };

  const renderProducts = (categoryId = 'all') => {
    // Перерисовка каталога при смене фильтра.
    let items;
    if (categoryId === 'all') {
      items = catalog.products;
    } else if (categoryId === DISCOUNT_CATEGORY_ID) {
      items = catalog.products.filter((product) => {
        const base = Number(product.price) || 0;
        const sale = Number(product.salePrice);
        return Number.isFinite(sale) && sale > 0 && sale < base;
      });
    } else {
      items = catalog.products.filter((product) => product.categoryId === categoryId);
    }
    productGrid.innerHTML = items.map((product) => renderProductCard(product, categoryMap.get(product.categoryId)?.name || '')).join('');
    bindCardGalleries();
    bindQuickAdd(catalog);
  };

  const filterButtons = [
    '<button class="pill active" type="button" data-category="all">Все товары</button>',
  ];
  if (hasDiscounts) {
    filterButtons.push(`<button class="pill" type="button" data-category="${DISCOUNT_CATEGORY_ID}">Скидки %</button>`);
  }
  filterButtons.push(
    ...catalog.categories.map(
      (category) => `<button class="pill" type="button" data-category="${category.id}">${category.name}</button>`,
    ),
  );
  filters.innerHTML = filterButtons.join('');

  filters.addEventListener('click', (event) => {
    const button = event.target.closest('[data-category]');
    if (!button) return;
    applyCategorySelection(button.dataset.category, { updateUrl: true });
  });

  const allProductsSorted = [...catalog.products].sort((a, b) => b.popularity - a.popularity);
  let featured = [];
  const discounted = allProductsSorted.filter((product) => {
    const base = Number(product.price) || 0;
    const sale = Number(product.salePrice);
    return Number.isFinite(sale) && sale > 0 && sale < base;
  });
  if (discounted.length) {
    // Берём самую популярную скидочную свечу.
    featured.push(discounted[0]);
  }
  allProductsSorted.forEach((product) => {
    if (featured.length >= 4) return;
    if (featured.includes(product)) return;
    featured.push(product);
  });
  featuredBlock.innerHTML = featured.map((product) => renderProductCard(product, categoryMap.get(product.categoryId)?.name || '')).join('');
  bindCardGalleries();

  const urlCategory = new URLSearchParams(window.location.search).get('category');
  const categoryValid = urlCategory && (catalog.categories.some((c) => c.id === urlCategory) || (hasDiscounts && urlCategory === DISCOUNT_CATEGORY_ID));
  if (categoryValid) {
    applyCategorySelection(urlCategory);
  } else {
    applyCategorySelection('all');
  }

  window.addEventListener('popstate', () => {
    const categoryFromUrl = new URLSearchParams(window.location.search).get('category');
    const isKnownCategory = categoryFromUrl
      && (catalog.categories.some((c) => c.id === categoryFromUrl) || (hasDiscounts && categoryFromUrl === DISCOUNT_CATEGORY_ID));
    applyCategorySelection(isKnownCategory ? categoryFromUrl : 'all');
  });

  renderCart(catalog);
  if (cartRestoredFromShare) {
    showToast('Корзина загружена по ссылке');
  }
}

function renderCart(catalog) {
  const cartRoot = document.querySelector('[data-cart-root]');
  const cartItemsRoot = document.querySelector('[data-cart-items]');
  const cartSummaryRoot = document.querySelector('[data-cart-summary]');
  const cartStatus = document.querySelector('[data-cart-status]');
  const heroPreview = document.querySelector('[data-home-cart-preview]');
  const heroMeta = document.querySelector('[data-home-cart-meta]');
  const heroSecondaryCta = document.querySelector('[data-home-cart-secondary-cta]');
  const lastOrderPreview = document.querySelector('[data-home-last-order]');
  const orderHistoryRoot = document.querySelector('[data-order-history]');
  const productsMap = new Map(catalog.products.map((product) => [product.id, product]));

  const paintHeroPreview = (cart, totalRub, qtySum) => {
    if (!heroPreview || !heroMeta) return;
    if (!cart.length) {
      heroMeta.textContent = '';
      heroPreview.innerHTML = '<p class="muted home-cart-preview-empty">Пока пусто — добавьте товар из каталога ниже.</p>';
      if (heroSecondaryCta) {
        heroSecondaryCta.textContent = 'Как выбрать свечу';
        heroSecondaryCta.setAttribute('href', './guides/kak-vybrat-svechu/index.html');
      }
      return;
    }
    heroMeta.textContent = `${qtySum} шт. · ${formatPrice(totalRub)}`;
    if (heroSecondaryCta) {
      heroSecondaryCta.textContent = 'К оформлению';
      heroSecondaryCta.setAttribute('href', '#cart');
    }
    heroPreview.innerHTML = cart.map((item) => {
      const product = productsMap.get(item.productId);
      if (!product) return '';
      const img = product.image || item.image || './assets/img/image-placeholder.svg';
      const options = Object.entries(item.selectedOptions || {}).filter(([, value]) => value);
      const optionText = options.length ? options.map(([key, value]) => `${optionLabel(key)}: ${value}`).join(' · ') : '';
      const productUrl = product.slug ? `./products/${product.slug}/index.html` : '#';
      return `
        <div class="home-cart-preview-row">
          <a class="home-cart-preview-thumb" href="${productUrl}" aria-label="Перейти к товару ${product.name}">
            <img src="${img}" alt="" loading="lazy" onerror="this.onerror=null;this.src='./assets/img/image-placeholder.svg';">
          </a>
          <div class="home-cart-preview-main">
            <span class="home-cart-preview-name">${product.name}</span>
            ${optionText ? `<span class="muted home-cart-preview-opts">${optionText}</span>` : ''}
            <span class="muted home-cart-preview-line">${item.quantity} × ${formatPrice(item.price)}</span>
          </div>
        </div>
      `;
    }).join('');
  };

  const paintLastOrderPreview = () => {
    if (!lastOrderPreview) return;
    const history = getOrderHistoryFromLocalStorage();
    const lastOrder = history[0];
    if (!lastOrder) {
      lastOrderPreview.innerHTML = '<p class="muted">История заказов пока пуста.</p>';
      return;
    }
    const itemsCount = (lastOrder.items || []).reduce((sum, item) => sum + (item.quantity || 0), 0);
    const itemsPreview = (lastOrder.items || [])
      .slice(0, 2)
      .map((item) => `${item.productName} × ${item.quantity}`)
      .join(' · ');
    lastOrderPreview.innerHTML = `
      <p><strong>${lastOrder.orderNumber || 'Без номера'}</strong></p>
      <p class="muted">${itemsCount} шт. · ${formatPrice(lastOrder.totalRub || 0)}</p>
      ${itemsPreview ? `<p class="muted">${itemsPreview}</p>` : ''}
      <a class="button-secondary home-cart-preview-cta" href="#order-history">К истории заказов</a>
    `;
  };

  const clearCartBtn = document.querySelector('[data-clear-cart]');

  const paintOrderHistory = () => {
    if (!orderHistoryRoot) return;
    const history = getOrderHistoryFromLocalStorage();
    if (!history.length) {
      orderHistoryRoot.innerHTML = '<p class="muted">История заказов пока пуста.</p>';
      return;
    }
    orderHistoryRoot.innerHTML = `
      <div class="order-history-list">
        ${history.slice(0, 8).map((order) => `
          <article class="order-history-card">
            <p><strong>${order.orderNumber || 'Без номера'}</strong></p>
            <p class="muted order-history-card__meta">${new Date(order.createdAt).toLocaleString('ru-RU')}</p>
            <p>Итого: <strong>${formatPrice(order.totalRub || 0)}</strong></p>
            <ol class="order-history-card__items">
              ${(order.items || []).map((item) => `<li>${item.productName} × ${item.quantity}</li>`).join('')}
            </ol>
          </article>
        `).join('')}
      </div>
    `;
  };

  const paint = () => {
    // Централизованная перерисовка корзины и мини-превью в hero-блоке.
    const cart = getCart();
    const qtySum = cart.reduce((sum, item) => sum + item.quantity, 0);
    let total = 0;
    cart.forEach((item) => {
      const product = productsMap.get(item.productId);
      if (!product) return;
      total += item.price * item.quantity;
    });
    paintHeroPreview(cart, total, qtySum);

    if (!cartRoot || !cartItemsRoot || !cartSummaryRoot || !cartStatus) return;

    if (!cart.length) {
      cartItemsRoot.innerHTML = '<div class="cart-empty">Корзина пока пуста. Добавьте товар из каталога выше.</div>';
      cartSummaryRoot.innerHTML = `
        <div class="cart-empty-actions">
          <a class="button" href="#catalog">К каталогу</a>
          <a class="button-secondary" href="./guides/kak-vybrat-svechu/index.html">Как выбрать свечу</a>
        </div>
      `;
      cartStatus.textContent = '0 товаров';
      if (clearCartBtn) clearCartBtn.hidden = true;
      updateCartCount();
      paintOrderHistory();
      paintLastOrderPreview();
      return;
    }

    if (clearCartBtn) clearCartBtn.hidden = false;

    cartItemsRoot.innerHTML = cart.map((item) => {
      const product = productsMap.get(item.productId);
      if (!product) return '';
      const options = Object.entries(item.selectedOptions || {}).filter(([, value]) => value);
      const optionText = options.length ? options.map(([key, value]) => `${optionLabel(key)}: ${value}`).join(' · ') : '';
      const productUrl = product.slug ? `./products/${product.slug}/index.html` : '#';
      return `
        <div class="cart-item">
          <a class="cart-item-thumb" href="${productUrl}" aria-label="Перейти к товару ${product.name}">
            <img src="${(product.image || item.image).replace('./', './')}" alt="${product.name}" loading="lazy">
          </a>
          <div>
            <strong>${product.name}</strong>
            ${optionText ? `<p class="muted">${optionText}</p>` : ''}
            <p class="muted">${formatPrice(item.price)} за штуку</p>
          </div>
          <div>
            <div class="qty-controls">
              <button type="button" data-qty-down="${cartKeyDataAttr(item.key)}">−</button>
              <span>${item.quantity}</span>
              <button type="button" data-qty-up="${cartKeyDataAttr(item.key)}">+</button>
            </div>
            <button class="button-secondary" style="margin-top:10px" type="button" data-remove-item="${cartKeyDataAttr(item.key)}">Удалить</button>
          </div>
        </div>
      `;
    }).join('');

    cartSummaryRoot.innerHTML = `
      <p><strong>Товаров:</strong> ${qtySum}</p>
      <p><strong>Итого:</strong> ${formatPrice(total)}</p>
      <button class="button-secondary" type="button" data-share-cart>Поделиться корзиной</button>
      <button class="button" type="button" data-checkout-trigger>Оформить через Telegram</button>
    `;
    cartStatus.textContent = `${qtySum} товаров`;
    updateCartCount();
    paintOrderHistory();
    paintLastOrderPreview();
  };

  if (cartRoot) {
    // Делегирование кликов для кнопок количества/удаления/очистки корзины.
    cartRoot.addEventListener('click', (event) => {
      const clearEl = event.target.closest('[data-clear-cart]');
      if (clearEl && getCart().length) {
        clearCart();
        return;
      }
      const down = event.target.closest('[data-qty-down]');
      const up = event.target.closest('[data-qty-up]');
      const remove = event.target.closest('[data-remove-item]');
      if (down) {
        const key = cartKeyFromDataAttr(down.getAttribute('data-qty-down') || '');
        const item = getCart().find((entry) => entry.key === key);
        if (item) updateCartItemQuantity(key, Math.max(1, item.quantity - 1));
      }
      if (up) {
        const key = cartKeyFromDataAttr(up.getAttribute('data-qty-up') || '');
        const item = getCart().find((entry) => entry.key === key);
        if (item) updateCartItemQuantity(key, item.quantity + 1);
      }
      if (remove) {
        const key = cartKeyFromDataAttr(remove.getAttribute('data-remove-item') || '');
        removeCartItem(key);
      }
      const checkout = event.target.closest('[data-checkout-trigger]');
      const shareCart = event.target.closest('[data-share-cart]');
      if (shareCart) {
        const cart = getCart();
        if (!cart.length) return;
        const shareUrl = new URL(window.location.href);
        shareUrl.searchParams.set('cart', serializeCartForShare(cart));
        shareUrl.hash = 'cart';
        const finalUrl = shareUrl.toString();
        if (navigator.clipboard?.writeText) {
          navigator.clipboard.writeText(finalUrl)
            .then(() => showToast('Ссылка на корзину скопирована'))
            .catch(() => {
              window.prompt('Скопируйте ссылку на корзину:', finalUrl);
            });
        } else {
          window.prompt('Скопируйте ссылку на корзину:', finalUrl);
        }
      }
      if (checkout) {
        const cart = getCart();
        if (!cart.length) return;
        let total = 0;
        cart.forEach((item) => {
          if (!productsMap.has(item.productId)) return;
          total += item.price * item.quantity;
        });
        openCheckoutModal({
          cart,
          productsMap,
          totalRub: total,
          telegramUrl: catalog.store.telegram,
        });
      }
    });
  }

  document.addEventListener('phicandles-cart-changed', paint);
  paint();
}

window.addEventListener('DOMContentLoaded', () => {
  initHomePage().catch((error) => {
    // Для статически сгенерированной главной не затираем каталог при ошибке fetch.
    console.warn('Каталог не загружен динамически, оставляем статический контент.', error);
  });
});