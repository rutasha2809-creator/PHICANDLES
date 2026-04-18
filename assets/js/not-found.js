/** Карточки «популярное» в разметке собирает rebuild_from_catalog.py; здесь только корзина. */
async function initNotFoundPage() {
  const catalog = await loadCatalog();
  bindQuickAdd(catalog);
}

window.addEventListener('DOMContentLoaded', () => {
  initNotFoundPage().catch((error) => {
    console.error(error);
  });
});
