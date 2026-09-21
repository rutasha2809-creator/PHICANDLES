"""
seo_static.py — SEO-шаг для PHICANDLES (запускается из ОБНОВИТЬ_САЙТ.bat после propagate.py).

Зачем: поисковые и ИИ-роботы (ChatGPT, Claude, Perplexity и др.) часто не выполняют JavaScript,
поэтому видят карточки товаров пустыми. Этот скрипт берёт данные из data/catalog.json и
вписывает их прямо в готовый HTML. После загрузки страницы JS всё равно перерисовывает эти
блоки теми же данными — внешне для покупателя ничего не меняется.

Что делает (идемпотентно — можно запускать сколько угодно раз):
  • products/<slug>/index.html — <title>, meta description, canonical, og:*, JSON-LD
    (Product + хлебные крошки), alt главного фото; текст товара (название, описание, цена,
    характеристики, материалы) прямо в HTML.
  • Скрытые товары (categoryId, которого нет в categories, например "hidden") и лишние папки
    в products/ получают <meta name="robots" content="noindex,follow"> и не попадают в sitemap.
  • catalog/index.html — карточки всех товаров прямо в HTML + JSON-LD списка товаров.
  • index.html — JSON-LD организации (логотип) и сайта.
  • sitemap.xml и llms.txt — собираются заново.

Заголовок и описание для поисковиков собираются по шаблону (см. seo_title / meta_description):
  «Свеча «Собачка» ручной работы — купить | PHICANDLES» и
  «Фигурная свеча «Собачка» из соевого воска ручной работы. Цена 800 ₽. …».
Для отдельного товара их можно задать вручную полями "seoTitle" / "seoDescription"
в catalog.json — на самой странице они не показываются.

Запуск вручную из корня проекта:  python tools/seo_static.py
"""
from __future__ import annotations

import html
import json
import os
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOG = json.loads((ROOT / 'data' / 'catalog.json').read_text(encoding='utf-8'))
STORE = CATALOG['store']
DOMAIN = STORE['domain'].rstrip('/')
CATEGORIES = CATALOG.get('categories') or []
CAT_BY_ID = {c['id']: c for c in CATEGORIES}
CAT_ORDER = {c['id']: i for i, c in enumerate(CATEGORIES)}
PRODUCTS = CATALOG.get('products') or []
VISIBLE = sorted((p for p in PRODUCTS if p.get('categoryId') in CAT_BY_ID),
                 key=lambda p: CAT_ORDER.get(p['categoryId'], 999))
VISIBLE_SLUGS = {p['slug'] for p in VISIBLE}

changed: list[str] = []


# ---------- утилиты ----------

def esc(value) -> str:
    return html.escape(str(value), quote=True)


def read(path: Path) -> str:
    with open(path, 'r', encoding='utf-8', newline='') as f:
        return f.read()


def write_if_changed(path: Path, text: str) -> None:
    old = read(path) if path.exists() else None
    if old == text:
        return
    tmp = path.with_suffix(path.suffix + '.tmp')
    with open(tmp, 'w', encoding='utf-8', newline='') as f:
        f.write(text)
    os.replace(tmp, path)
    changed.append(str(path.relative_to(ROOT)))


def ld_json(obj) -> str:
    return json.dumps(obj, ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c')


def current_price(p: dict):
    base = p.get('price') or 0
    sale = p.get('salePrice')
    if isinstance(sale, (int, float)) and 0 < sale < base:
        return sale
    return base


def fmt_price(value) -> str:
    return f'{int(value):,}'.replace(',', ' ') + ' ₽'


def plain(text: str) -> str:
    return ' '.join((text or '').split())


# Слова, по которым понятно, что это за товар. Если их нет в названии («Собачка», «Тюльпан»),
# в заголовок и описание добавляется тип товара по категории.
PRODUCT_KEYWORDS = re.compile(r'свеч|подсвечник|поднос|саше|аромалампа|мэлтс|мелтс|набор|салфетниц|подставк', re.I)
TYPE_BY_CATEGORY = {            # как называть товар в описании, если в названии нет типа
    'forming': 'Фигурная свеча',
    'kashpo': 'Свеча в кашпо',
    'interier': 'Интерьерная свеча',
}
MATERIAL_GENITIVE = {
    'соевый воск': 'соевого воска',
    'кокосовый воск': 'кокосового воска',
    'пчелиный воск': 'пчелиного воска',
    'оливковый воск': 'оливкового воска',
    'гипс': 'гипса',
}
TITLE_MAX = 70
DESCRIPTION_MAX = 160


def has_type(p: dict) -> bool:
    return bool(PRODUCT_KEYWORDS.search(p['name']))


def seo_title(p: dict) -> str:
    """Свеча «Собачка» ручной работы — купить | PHICANDLES (или поле seoTitle из каталога)."""
    if p.get('seoTitle'):
        return plain(p['seoTitle'])
    brand = STORE['name']
    base = p['name'] if has_type(p) else f"Свеча «{p['name']}»"
    for variant in (f'{base} ручной работы — купить | {brand}', f'{base} — купить | {brand}', f'{base} | {brand}'):
        if len(variant) <= TITLE_MAX:
            return variant
    return f'{base} | {brand}'


def meta_description(p: dict) -> str:
    """Фигурная свеча «Собачка» из соевого воска ручной работы. Цена 800 ₽. Красивая упаковка,
    доставка по Москве и России. Закажите на сайте! (или поле seoDescription из каталога)."""
    if p.get('seoDescription'):
        return plain(p['seoDescription'])
    material = next((MATERIAL_GENITIVE[m] for m in (p.get('materials') or []) if m in MATERIAL_GENITIVE), '')
    of_material = f' из {material}' if material else ''
    if has_type(p):
        lead = f"{p['name']} ручной работы{of_material}."
    else:
        kind = TYPE_BY_CATEGORY.get(p.get('categoryId'), 'Свеча')
        if ' ' in kind and kind.split(' ', 1)[1].lower() in p['name'].lower():
            kind = 'Свеча'  # «Пион в кашпо» → не «Свеча в кашпо «Пион в кашпо»»
        lead = f"{kind} «{p['name']}»{of_material} ручной работы."
    price = f'Цена {fmt_price(current_price(p))}.'.replace(' ', ' ')
    variants = [
        f'{lead} {price} Красивая упаковка, доставка по Москве и России. Закажите на сайте!',
        f'{lead} {price} Доставка по Москве и России. Закажите на сайте!',
        f'{lead} {price} Доставка по Москве и России.',
        f'{lead} {price}',
    ]
    return next((v for v in variants if len(v) <= DESCRIPTION_MAX), variants[-1])


def abs_img(rel: str) -> str:
    return f"{DOMAIN}/{rel.removeprefix('./').lstrip('/')}"


def product_url(p: dict) -> str:
    return f"{DOMAIN}/products/{p['slug']}/"


# ---------- правка <head> ----------

def set_title(page: str, title: str) -> str:
    return re.sub(r'<title>.*?</title>', lambda m: f'<title>{esc(title)}</title>', page, count=1, flags=re.S)


def set_meta(page: str, kind: str, key: str, value: str) -> str:
    """kind = 'name' | 'property'. Меняет content или добавляет тег перед </head>."""
    pat = re.compile(r'<meta\s+' + kind + r'="' + re.escape(key) + r'"\s+content="[^"]*"\s*/?>')
    tag = f'<meta {kind}="{key}" content="{esc(value)}">'
    if pat.search(page):
        return pat.sub(lambda m: tag, page, count=1)
    return page.replace('</head>', f'  {tag}\n</head>', 1)


def remove_meta(page: str, kind: str, key: str) -> str:
    return re.sub(r'[ \t]*<meta\s+' + kind + r'="' + re.escape(key) + r'"\s+content="[^"]*"\s*/?>\n?', '', page)


def set_canonical(page: str, url: str) -> str:
    tag = f'<link rel="canonical" href="{esc(url)}">'
    pat = re.compile(r'<link\s+rel="canonical"\s+href="[^"]*"\s*/?>')
    if pat.search(page):
        return pat.sub(lambda m: tag, page, count=1)
    return page.replace('</head>', f'  {tag}\n</head>', 1)


def set_head_jsonld(page: str, payload) -> str:
    """Убирает все JSON-LD из <head> и ставит один актуальный."""
    head_end = page.find('</head>')
    head, rest = page[:head_end], page[head_end:]
    script = f'<script type="application/ld+json">{ld_json(payload)}</script>'
    pat = re.compile(r'<script type="application/ld\+json"[^>]*>.*?</script>', re.S)
    if pat.search(head):
        head = pat.sub(lambda m: script, head, count=1)
        first = head.find(script) + len(script)
        head = head[:first] + re.sub(r'\n?[ \t]*<script type="application/ld\+json"[^>]*>.*?</script>', '', head[first:], flags=re.S)
    else:
        head += f'  {script}\n'
    return head + rest


def set_robots(page: str, noindex: bool) -> str:
    page = remove_meta(page, 'name', 'robots')
    if noindex:
        page = page.replace('</head>', '  <meta name="robots" content="noindex,follow">\n</head>', 1)
    return page


# ---------- правка <body>: содержимое элементов по data-атрибуту ----------

def fill(page: str, attr: str, inner: str, path: Path) -> str:
    """Вписывает inner внутрь элемента с атрибутом attr. Содержимое обёрнуто
    в <!--seo:attr-->…<!--/seo:attr-->, чтобы повторный запуск просто заменял его."""
    key = re.sub(r'[^a-z0-9-]', '', attr)
    start, end = f'<!--seo:{key}-->', f'<!--/seo:{key}-->'
    block = f'{start}{inner}{end}'
    if start in page:
        return re.sub(re.escape(start) + r'.*?' + re.escape(end), lambda m: block, page, count=1, flags=re.S)
    pat = re.compile(r'(<(?P<tag>[a-z0-9]+)\b[^>]*\s' + re.escape(attr) + r'(?=[\s>=/])[^>]*>)\s*(</(?P=tag)>)')
    new, n = pat.subn(lambda m: m.group(1) + block + m.group(3), page, count=1)
    if not n and re.search(r'\s' + re.escape(attr) + r'(?=[\s>=/])', page):
        print(f'  ! {path.relative_to(ROOT)}: элемент {attr} не пустой — пропущен')
    return new


def set_img(page: str, attr: str, src: str, alt: str) -> str:
    pat = re.compile(r'<img\b[^>]*\s' + re.escape(attr) + r'(?=[\s>=])[^>]*>')
    m = pat.search(page)
    if not m:
        return page
    tag = m.group(0)
    tag = re.sub(r'\ssrc="[^"]*"', lambda _: f' src="{esc(src)}"', tag, count=1)
    if ' alt="' in tag:
        tag = re.sub(r'\salt="[^"]*"', lambda _: f' alt="{esc(alt)}"', tag, count=1)
    else:
        tag = tag.replace('<img', f'<img alt="{esc(alt)}"', 1)
    return page[:m.start()] + tag + page[m.end():]


def spec_rows(p: dict) -> list[tuple[str, str]]:
    rows = []
    for part in re.split(r',\s*(?=[А-Яа-яЁёA-Za-z ]+:)', p.get('dimensions') or ''):
        part = part.strip()
        if not part:
            continue
        if ':' in part:
            k, v = part.split(':', 1)
            k = k.strip()
            rows.append((k[:1].upper() + k[1:], v.strip()))
        else:
            rows.append(('Параметры', part))
    if p.get('burnTime'):
        rows.append((p.get('burnTimeLabel') or 'Горение', p['burnTime']))
    if p.get('makeTime'):
        rows.append(('Срок изготовления', p['makeTime']))
    return rows


# ---------- страницы товаров ----------

def product_jsonld(p: dict) -> dict:
    cat = CAT_BY_ID.get(p.get('categoryId'), {})
    images = [abs_img(p.get('assetImage') or p.get('image') or '')]
    images += [abs_img(g) for g in (p.get('gallery') or []) if g]
    product = {
        '@type': 'Product',
        '@id': product_url(p) + '#product',
        'name': p['name'],
        'description': plain(p.get('description') or p.get('shortDescription') or ''),
        'image': images,
        'sku': p['id'],
        'url': product_url(p),
        'brand': {'@type': 'Brand', 'name': STORE['name']},
        'offers': {
            '@type': 'Offer',
            'price': current_price(p),
            'priceCurrency': STORE.get('currency', 'RUB'),
            'availability': 'https://schema.org/PreOrder' if p.get('availability') == 'made_to_order' else 'https://schema.org/InStock',
            'url': product_url(p),
            'seller': {'@type': 'Organization', 'name': STORE['name'], 'url': DOMAIN + '/'},
        },
    }
    if cat.get('name'):
        product['category'] = cat['name']
    if p.get('materials'):
        product['material'] = ', '.join(m for m in p['materials'] if m)
    props = [{'@type': 'PropertyValue', 'name': k, 'value': v} for k, v in spec_rows(p)]
    if props:
        product['additionalProperty'] = props
    reviews = [r for r in (p.get('reviews') or []) if isinstance(r.get('rating'), (int, float))]
    if reviews:
        product['aggregateRating'] = {
            '@type': 'AggregateRating',
            'ratingValue': round(sum(r['rating'] for r in reviews) / len(reviews), 1),
            'reviewCount': len(reviews),
        }
    crumbs = {
        '@type': 'BreadcrumbList',
        'itemListElement': [
            {'@type': 'ListItem', 'position': 1, 'name': 'Главная', 'item': DOMAIN + '/'},
            {'@type': 'ListItem', 'position': 2, 'name': 'Каталог', 'item': DOMAIN + '/catalog/'},
            {'@type': 'ListItem', 'position': 3, 'name': p['name'], 'item': product_url(p)},
        ],
    }
    return {'@context': 'https://schema.org', '@graph': [product, crumbs]}


def process_product(p: dict) -> None:
    path = ROOT / 'products' / p['slug'] / 'index.html'
    if not path.exists():
        print(f"  ! нет страницы для товара {p['slug']}")
        return
    page = read(path)
    title = seo_title(p)
    desc = meta_description(p)
    img_rel = (p.get('assetImage') or p.get('image') or 'assets/img/image-placeholder.svg').removeprefix('./').lstrip('/')
    cat_name = CAT_BY_ID.get(p.get('categoryId'), {}).get('name', '')
    alt = p.get('imageAlt') or p['name']
    if alt.strip() == p['name'].strip() and cat_name:
        alt = f"{p['name']} — {cat_name.lower()} PHICANDLES"

    page = set_title(page, title)
    page = set_meta(page, 'name', 'description', desc)
    page = set_canonical(page, product_url(p))
    page = set_meta(page, 'property', 'og:title', title)
    page = set_meta(page, 'property', 'og:description', desc)
    page = set_meta(page, 'property', 'og:url', product_url(p))
    page = set_meta(page, 'property', 'og:image', abs_img(img_rel))
    page = set_meta(page, 'property', 'product:price:amount', str(current_price(p)))
    visible = p['slug'] in VISIBLE_SLUGS
    page = set_robots(page, noindex=not visible)
    page = set_head_jsonld(page, product_jsonld(p))

    if visible:
        page = fill(page, 'data-product-name', esc(p['name']), path)
        page = fill(page, 'data-product-breadcrumb-name', esc(p['name']), path)
        page = fill(page, 'data-breadcrumb-category', esc(cat_name), path)
        page = fill(page, 'data-product-short', esc(p.get('shortDescription') or ''), path)
        page = fill(page, 'data-product-description', esc(p.get('description') or ''), path)
        base, cur = p.get('price') or 0, current_price(p)
        price_html = (f'<span class="product-price-old">{fmt_price(base)}</span><span class="product-price-current">{fmt_price(cur)}</span>'
                      if cur < base else f'<span class="product-price-current">{fmt_price(cur)}</span>')
        page = fill(page, 'data-product-price', price_html, path)
        specs = ''.join(f'<div class="spec-card"><span class="spec-card__label">{esc(k)}</span><span class="spec-card__value">{esc(v)}</span></div>'
                        for k, v in spec_rows(p))
        page = fill(page, 'data-product-specs', specs, path)
        page = fill(page, 'data-product-materials', ''.join(f'<li>{esc(m)}</li>' for m in (p.get('materials') or []) if m), path)
        page = set_img(page, 'data-product-image', '../../' + img_rel, alt)
    write_if_changed(path, page)


def process_orphan_product_dirs() -> None:
    known = {p['slug'] for p in PRODUCTS}
    for d in sorted((ROOT / 'products').iterdir()):
        f = d / 'index.html'
        if d.is_dir() and d.name not in known and f.exists():
            page = set_robots(read(f), noindex=True)
            page = set_canonical(page, f'{DOMAIN}/products/{d.name}/')
            write_if_changed(f, page)


# ---------- каталог и главная ----------

def catalog_card(p: dict) -> str:
    img = (p.get('assetImage') or p.get('image') or '').removeprefix('./').lstrip('/')
    href = f"../products/{p['slug']}/index.html"
    cat_name = CAT_BY_ID.get(p.get('categoryId'), {}).get('name', '')
    base, cur = p.get('price') or 0, current_price(p)
    price = (f'<span class="price-current">{fmt_price(cur)}</span><span class="price-old">{fmt_price(base)}</span>'
             if cur < base else f'<span>{fmt_price(cur)}</span>')
    dims = re.sub(r',?\s*Вес:[^,]*', '', p.get('dimensions') or '', flags=re.I).strip().rstrip(',')
    alt = p.get('imageAlt') or p['name']
    return ('<article class="product-card">'
            f'<a class="product-card-media" href="{esc(href)}" aria-label="{esc(p["name"])}">'
            f'<img loading="lazy" src="../{esc(img)}" alt="{esc(alt)}" class="is-active"></a>'
            '<div class="product-card-body">'
            + (f'<div class="badge-row"><span class="badge">{esc(cat_name)}</span></div>' if cat_name else '')
            + f'<h3><a href="{esc(href)}">{esc(p["name"])}</a></h3>'
            f'<div class="card-price">{price}</div>'
            f'<div class="card-dims muted">{esc(dims)}</div>'
            '</div></article>')


def process_catalog() -> None:
    path = ROOT / 'catalog' / 'index.html'
    if not path.exists():
        return
    page = read(path)
    page = fill(page, 'id="catalog-grid"', ''.join(catalog_card(p) for p in VISIBLE), path)
    payload = {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        'name': 'Каталог — ' + STORE['name'],
        'url': DOMAIN + '/catalog/',
        'inLanguage': 'ru-RU',
        'mainEntity': {
            '@type': 'ItemList',
            'numberOfItems': len(VISIBLE),
            'itemListElement': [
                {'@type': 'ListItem', 'position': i, 'name': p['name'], 'url': product_url(p)}
                for i, p in enumerate(VISIBLE, 1)
            ],
        },
    }
    page = set_head_jsonld(page, payload)
    write_if_changed(path, page)


def site_email() -> str:
    m = re.search(r'[\w.+-]+@phicandles\.ru', read(ROOT / 'index.html'))
    return m.group(0) if m else STORE.get('email', '')


def process_home() -> None:
    path = ROOT / 'index.html'
    page = read(path)
    org = {
        '@type': 'Organization',
        '@id': DOMAIN + '/#organization',
        'name': STORE['name'],
        'url': DOMAIN + '/',
        'logo': DOMAIN + '/assets/img/icon-512.png',
        'description': STORE.get('description', ''),
        'email': site_email(),
        'telephone': STORE.get('phones', []),
        'sameAs': [u for u in (STORE.get('telegram'), STORE.get('instagram')) if u],
    }
    site = {
        '@type': 'WebSite',
        '@id': DOMAIN + '/#website',
        'name': STORE['name'],
        'url': DOMAIN + '/',
        'inLanguage': 'ru-RU',
        'publisher': {'@id': DOMAIN + '/#organization'},
    }
    page = set_head_jsonld(page, {'@context': 'https://schema.org', '@graph': [org, site]})
    page = fill_home_sections(page)
    write_if_changed(path, page)


def fill_marker(page: str, name: str, inner: str) -> str:
    start, end = f'<!--hp:{name}-->', f'<!--/hp:{name}-->'
    if start not in page:
        return page
    return re.sub(re.escape(start) + r'.*?' + re.escape(end), lambda m: start + inner + end, page, count=1, flags=re.S)


def fill_home_sections(page: str) -> str:
    """Главная: плитки коллекций (categories[].image) и «Хиты продаж» (catalog.homeHits)."""
    tiles = []
    for c in CATEGORIES:
        if not c.get('image') or not any(p['categoryId'] == c['id'] for p in VISIBLE):
            continue
        tiles.append(
            f'\n          <a class="hp-cat" href="./catalog/index.html#{esc(c["id"])}">'
            f'\n            <img src="./{esc(c["image"].lstrip("./"))}" alt="{esc(c["name"])}" loading="lazy">'
            f'\n            <span class="hp-cat__name">{esc(c["name"])}</span>'
            f'\n          </a>')
    page = fill_marker(page, 'cats', ''.join(tiles) + '\n        ')

    by_slug = {p['slug']: p for p in VISIBLE}
    cards = []
    for slug in CATALOG.get('homeHits') or []:
        p = by_slug.get(slug)
        if not p:
            print(f'  ! homeHits: товар {slug} не найден или скрыт')
            continue
        img = (p.get('assetImage') or p.get('image') or '').removeprefix('./').lstrip('/')
        base, cur = p.get('price') or 0, current_price(p)
        price = (f'<span class="hp-price__old">{fmt_price(base)}</span>' if cur < base else '') + f'<span>{fmt_price(cur)}</span>'
        href = f"./products/{p['slug']}/index.html"
        cat_name = CAT_BY_ID.get(p['categoryId'], {}).get('name', '')
        cards.append(
            f'\n          <article class="hp-card">'
            f'\n            <a class="hp-card__media" href="{esc(href)}"><img src="./{esc(img)}" alt="{esc(p.get("imageAlt") or p["name"])}" loading="lazy"></a>'
            f'\n            <span class="hp-card__cat">{esc(cat_name)}</span>'
            f'\n            <h3><a href="{esc(href)}">{esc(p["name"])}</a></h3>'
            f'\n            <div class="hp-card__row"><div class="hp-price">{price}</div>'
            f'<button class="hp-card__btn" type="button" data-add-to-cart="{esc(p["id"])}">В корзину</button></div>'
            f'\n          </article>')
    return fill_marker(page, 'hits', ''.join(cards) + '\n        ')


# ---------- sitemap.xml и llms.txt ----------

STATIC_PAGES = ['', 'catalog/', 'guides/', 'delivery/', 'faq/', 'corporate/', 'about/', 'loyalty/']


def guide_pages() -> list[tuple[str, str]]:
    out = []
    gdir = ROOT / 'guides'
    for d in sorted(gdir.iterdir()) if gdir.exists() else []:
        f = d / 'index.html'
        if d.is_dir() and f.exists():
            m = re.search(r'<h1[^>]*>(.*?)</h1>', read(f), re.S)
            title = html.unescape(re.sub('<[^>]+>', '', m.group(1))).strip() if m else d.name
            out.append((f'guides/{d.name}/', title))
    return out


def is_indexable(rel: str) -> bool:
    f = ROOT / rel / 'index.html' if rel else ROOT / 'index.html'
    return f.exists() and 'noindex' not in read(f)[:20000]


def build_sitemap() -> None:
    urls = [rel for rel in STATIC_PAGES if is_indexable(rel)]
    urls += [rel for rel, _ in guide_pages()]
    urls += [f"products/{p['slug']}/" for p in VISIBLE]
    lines = ['<?xml version="1.0" encoding="UTF-8"?>',
             '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for rel in urls:
        lines += ['  <url>', f'    <loc>{esc(DOMAIN + "/" + rel)}</loc>', '  </url>']
    lines.append('</urlset>')
    write_if_changed(ROOT / 'sitemap.xml', '\n'.join(lines) + '\n')


def first_sentence(text: str) -> str:
    text = plain(text)
    m = re.match(r'(.{40,220}?[.!?])(\s|$)', text)
    return m.group(1) if m else text[:200]


def build_llms_txt() -> None:
    lines = [f"# {STORE['name']}", '',
             f"> {STORE.get('description', '')} Доставка по Москве и России.", '',
             f"Сайт: {DOMAIN}/. Цены указаны в рублях. Список товаров ниже собирается автоматически из каталога магазина.", '']
    lines += ['## Покупателям', '',
              f'- [Каталог]({DOMAIN}/catalog/): все товары с ценами',
              f'- [Доставка, оплата и возврат]({DOMAIN}/delivery/)',
              f'- [Вопросы и ответы]({DOMAIN}/faq/)',
              f'- [Корпоративные заказы]({DOMAIN}/corporate/)', '']
    guides = guide_pages()
    if guides:
        lines += ['## Гид по свечам', '']
        lines += [f'- [{t}]({DOMAIN}/{rel})' for rel, t in guides]
        lines.append('')
    for cat in CATEGORIES:
        items = [p for p in VISIBLE if p['categoryId'] == cat['id']]
        if not items:
            continue
        lines += [f"## {cat['name']}", '']
        for p in items:
            bits = [fmt_price(current_price(p)).replace(' ', ' ')]
            if p.get('dimensions'):
                bits.append(plain(p['dimensions']))
            if p.get('burnTime'):
                bits.append(f"{(p.get('burnTimeLabel') or 'горение').lower()}: {p['burnTime']}")
            desc = first_sentence(p.get('shortDescription') or p.get('description') or '')
            lines.append(f"- [{p['name']}]({product_url(p)}): {'; '.join(bits)}. {desc}".rstrip())
        lines.append('')
    phones = ', '.join(STORE.get('phones', []))
    lines += ['## Контакты', '', f'- Email: {site_email()}', f'- Телефон: {phones}']
    if STORE.get('telegram'):
        lines.append(f"- Telegram: {STORE['telegram']}")
    write_if_changed(ROOT / 'llms.txt', '\n'.join(lines).rstrip() + '\n')


if __name__ == '__main__':
    for prod in PRODUCTS:
        process_product(prod)
    process_orphan_product_dirs()
    process_catalog()
    process_home()
    build_sitemap()
    build_llms_txt()
    print(f'SEO: товаров в каталоге {len(VISIBLE)}, скрытых {len(PRODUCTS) - len(VISIBLE)}; изменено файлов: {len(changed)}')
