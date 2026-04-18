"""Страница 404 и URL для sitemap."""
from __future__ import annotations

import html

import main


def notfound_page_url(store: dict) -> str:
    """Полный URL статической 404.html."""
    return f"{store['domain'].rstrip('/')}/404.html"


def render_popular_cards_html(catalog: dict, limit: int = main.FEATURED_PRODUCT_COUNT) -> str:
    products = catalog.get('products') or []
    categories = catalog.get('categories') or []
    category_map = {c['id']: c.get('name', '') for c in categories}
    top = sorted(products, key=lambda p: p.get('popularity', 0), reverse=True)[:limit]
    return ''.join(
        main.render_product_card(p, category_map.get(p.get('categoryId', ''), ''))
        for p in top
    )


def build_not_found_page(catalog: dict) -> None:
    store = catalog['store']
    canonical = notfound_page_url(store)
    title = f'Страница не найдена — {store["name"]}'
    description = (
        f'Страница не существует или была перенесена. Популярные свечи {store["name"]} '
        f'и ссылки на каталог — на этой странице.'
    )

    popular_html = render_popular_cards_html(catalog)
    popular_section = main.render_popular_section('Популярные свечи', popular_html)

    tpl = main.load_template('not_found.html')
    page = tpl.format(
        title=html.escape(title),
        description=html.escape(description),
        canonical=html.escape(canonical, quote=True),
        header_html=main.home_header_html(store),
        popular_section=popular_section,
        catalog_json=main.serialized_catalog_json(catalog),
    )
    out = main.NOT_FOUND_PAGE_PATH.resolve()
    out.write_text(page, encoding='utf-8')
    print(f'Wrote {out} ({out.stat().st_size} bytes)')
