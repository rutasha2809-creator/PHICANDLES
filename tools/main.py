"""
Общие пути, загрузка каталога/шаблонов, JSON-LD helper и сборка главной страницы (index.html).
"""
from __future__ import annotations

import html
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

CATALOG_PATH = ROOT / 'data' / 'catalog.json'
GUIDES_MANIFEST_PATH = ROOT / 'data' / 'guides_manifest.json'
GUIDES_JSON_PATH = ROOT / 'data' / 'guides.json'
FAQ_MANIFEST_PATH = ROOT / 'data' / 'faq_manifest.json'
FAQ_PAGE_PATH = ROOT / 'faq' / 'index.html'
HOME_PAGE_PATH = ROOT / 'index.html'
NOT_FOUND_PAGE_PATH = ROOT / '404.html'
TEMPLATES_DIR = ROOT / 'tools' / 'templates'

# Сколько карточек в блоке «Популярное» на главной и на 404 (сортировка по popularity).
FEATURED_PRODUCT_COUNT = 4


def json_ld_script(payload: dict) -> str:
    text = json.dumps(payload, ensure_ascii=False, separators=(',', ':'))
    return text.replace('<', '\\u003c')


def load_template(name: str) -> str:
    return (TEMPLATES_DIR / name).read_text(encoding='utf-8')


PRODUCT_TEMPLATE = load_template('product.html')
HOME_TEMPLATE = load_template('home.html')
HOME_HEADER_TEMPLATE = load_template('home_header.html')
FAQ_TEMPLATE = load_template('faq.html')


def load_catalog() -> dict:
    return json.loads(CATALOG_PATH.read_text(encoding='utf-8'))


def load_guides_manifest() -> dict | None:
    if not GUIDES_MANIFEST_PATH.is_file():
        return None
    return json.loads(GUIDES_MANIFEST_PATH.read_text(encoding='utf-8'))


def load_faq_manifest() -> dict | None:
    if not FAQ_MANIFEST_PATH.is_file():
        return None
    return json.loads(FAQ_MANIFEST_PATH.read_text(encoding='utf-8'))


def serialized_catalog_json(catalog: dict) -> str:
    text = json.dumps(catalog, ensure_ascii=False, separators=(',', ':'))
    return text.replace('<', '\\u003c')


def format_price_rub(price: int | float) -> str:
    return f"{int(price):,}".replace(',', ' ') + ' ₽'


def current_price(product: dict) -> int | float:
    base_price = product.get('price', 0)
    sale_price = product.get('salePrice')
    if isinstance(sale_price, (int, float)) and 0 < sale_price < base_price:
        return sale_price
    return base_price


def render_price_html(product: dict) -> str:
    base_price = product.get('price', 0)
    sale_price = product.get('salePrice')
    if isinstance(sale_price, (int, float)) and 0 < sale_price < base_price:
        return (
            f'<span class="price-old">{format_price_rub(base_price)}</span>'
            f'<span class="price-current">{format_price_rub(sale_price)}</span>'
        )
    return f'<span>{format_price_rub(base_price)}</span>'


def rating_line(product: dict) -> str:
    reviews = product.get('reviews') or []
    if not reviews:
        return ''
    avg = round(sum(r.get('rating', 0) for r in reviews) / len(reviews), 1)
    suffix = '' if len(reviews) == 1 else ('а' if 1 < len(reviews) < 5 else 'ов')
    return f'★ {avg} · {len(reviews)} отзыв{suffix}'


def render_popular_section(
    heading: str,
    cards_html: str,
    *,
    intro_html: str = '',
    grid_attrs: str = '',
) -> str:
    """Общий блок «Популярное» для главной и 404 (шаблон popular_section.html)."""
    tpl = load_template('popular_section.html')
    return tpl.format(
        popular_heading=html.escape(heading),
        popular_intro_html=intro_html,
        popular_cards_html=cards_html,
        grid_attrs=grid_attrs,
    )


def home_header_html(store: dict) -> str:
    """Та же шапка, что на главной: относительные пути от корня сайта."""
    return HOME_HEADER_TEMPLATE.format(
        index_href='./index.html',
        logo_src='./logo.svg',
        wordmark_src='./assets/img/brand-wordmark.svg',
        store_name=html.escape(store['name']),
        tagline=html.escape(store['tagline']),
        catalog_href='./index.html#catalog',
        guides_href='./index.html#guides',
        faq_href='./faq/index.html',
        faq_extra='',
        cart_href='./index.html#cart',
    )


def render_product_card(product: dict, category_name: str = '') -> str:
    name = html.escape(product['name'])
    slug = html.escape(product['slug'])
    raw_img = product.get('image') or './assets/img/logo-placeholder.svg'
    image = html.escape(raw_img)
    image_alt = html.escape(product.get('imageAlt') or product['name'])
    short = html.escape(product.get('shortDescription') or product.get('description') or '')
    price_html = render_price_html(product)
    dimensions = html.escape(product.get('dimensions') or '')
    rating = rating_line(product)
    rating_html = f'<div class="rating">{html.escape(rating)}</div>' if rating else ''
    featured_badge = '<span class="badge">Хит</span>' if product.get('featured') else ''
    category_badge = f'<span class="badge">{html.escape(category_name)}</span>' if category_name else ''
    product_id = html.escape(product['id'])
    return f"""
    <article class="product-card">
      <a class="product-card-media" href="./products/{slug}/index.html" aria-label="Перейти к товару {name}">
        <img loading="lazy" src="{image}" alt="{image_alt}">
      </a>
      <div class="product-card-body">
        <div class="badge-row">{featured_badge}{category_badge}</div>
        <h3><a href="./products/{slug}/index.html">{name}</a></h3>
        <p>{short}</p>
        <div class="price-row">
          <div>
            <div class="price">{price_html}</div>
            {rating_html}
          </div>
          <div class="muted">{dimensions}</div>
        </div>
        <div class="card-actions">
          <a class="button-secondary" href="./products/{slug}/index.html">Подробнее</a>
          <button class="button" type="button" data-add-to-cart="{product_id}">В корзину</button>
        </div>
      </div>
    </article>"""


def render_home_blocks(catalog: dict) -> tuple[str, str, str]:
    categories = catalog.get('categories') or []
    products = catalog.get('products') or []
    category_map = {c['id']: c.get('name', '') for c in categories}

    filters = ['<button class="pill active" type="button" data-category="all">Все товары</button>']
    filters.extend(
        f'<button class="pill" type="button" data-category="{html.escape(c["id"])}">{html.escape(c["name"])}</button>'
        for c in categories
    )

    featured = sorted(products, key=lambda p: p.get('popularity', 0), reverse=True)[:FEATURED_PRODUCT_COUNT]
    featured_cards = ''.join(render_product_card(p, category_map.get(p.get('categoryId', ''), '')) for p in featured)
    all_cards = ''.join(render_product_card(p, category_map.get(p.get('categoryId', ''), '')) for p in products)
    return ''.join(filters), featured_cards, all_cards


def build_home_page(catalog: dict) -> None:
    store = catalog['store']
    title = f"{store['name']} — {store['tagline']}"
    org_jsonld = {
        "@context": "https://schema.org",
        "@type": "Organization",
        "name": store['name'],
        "url": store['domain'],
        "logo": f"{store['domain']}/assets/img/logo-placeholder.svg",
        "email": store['email'],
        "telephone": store['phones'],
        "sameAs": [store['telegram'], store['instagram']],
    }
    filters_html, featured_html, products_html = render_home_blocks(catalog)
    popular_section = render_popular_section(
        'Популярное',
        featured_html,
        grid_attrs=' data-featured-grid',
    )
    page = HOME_TEMPLATE.format(
        title=html.escape(title),
        description=html.escape(store['description']),
        canonical=f"{store['domain']}/",
        jsonld=json_ld_script(org_jsonld),
        store_name=html.escape(store['name']),
        tagline=html.escape(store['tagline']),
        store_description=html.escape(store['description']),
        email=html.escape(store['email']),
        phones='<br>'.join(html.escape(phone) for phone in store['phones']),
        telegram=html.escape(store['telegram'], quote=True),
        instagram=html.escape(store['instagram'], quote=True),
        filters_html=filters_html,
        popular_section=popular_section,
        products_html=products_html,
        catalog_json=serialized_catalog_json(catalog),
        header_html=home_header_html(store),
    )
    HOME_PAGE_PATH.write_text(page, encoding='utf-8')
