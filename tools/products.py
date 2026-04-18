"""Страницы товаров и sitemap.xml."""
from __future__ import annotations

import html

import main
import notfound


def product_page_image_attrs(product: dict) -> tuple[str, str]:
    rel = product.get('assetImage') or product.get('image', '').removeprefix('./').lstrip('/') or 'assets/img/image-placeholder.svg'
    src = f'../../{rel}'
    alt = html.escape(product.get('imageAlt') or product['name'], quote=True)
    return src, alt


def build_pages(catalog: dict, guide_urls: list[str] | None = None):
    store = catalog['store']
    products = catalog['products']
    products_dir = main.ROOT / 'products'
    products_dir.mkdir(exist_ok=True)

    for product in products:
        url = product.get('url') or f"{store['domain']}/products/{product['slug']}/"
        image_path = product.get('absoluteImage') or f"{store['domain']}/{product.get('assetImage', product['image'].replace('./', ''))}"
        availability = (
            "https://schema.org/PreOrder"
            if product.get('availability') == 'made_to_order'
            else "https://schema.org/InStock"
        )
        jsonld = {
            "@context": "https://schema.org",
            "@type": "Product",
            "name": product['name'],
            "description": product['description'],
            "image": [image_path],
            "sku": product['id'],
            "brand": {"@type": "Brand", "name": store['name']},
            "offers": {
                "@type": "Offer",
                "priceCurrency": store['currency'],
                "price": main.current_price(product),
                "availability": availability,
                "url": url,
            },
        }
        if product.get('reviews'):
            avg = round(sum(r['rating'] for r in product['reviews']) / len(product['reviews']), 1)
            jsonld['aggregateRating'] = {
                "@type": "AggregateRating",
                "ratingValue": avg,
                "reviewCount": len(product['reviews']),
            }

        image_src, image_alt = product_page_image_attrs(product)
        product_header_html = main.HOME_HEADER_TEMPLATE.format(
            index_href='../../index.html',
            logo_src='../../logo.svg',
            wordmark_src='../../assets/img/brand-wordmark.svg',
            store_name=html.escape(store['name']),
            tagline=html.escape(store['tagline']),
            catalog_href='../../index.html#catalog',
            guides_href='../../index.html#guides',
            faq_href='../../faq/index.html',
            faq_extra='',
            cart_href='../../index.html#cart',
        )
        page = main.PRODUCT_TEMPLATE.format(
            title=html.escape(f"{product['name']} — {store['name']}"),
            description=html.escape(product.get('shortDescription', product['description'][:140])),
            canonical=url,
            jsonld=main.json_ld_script(jsonld),
            slug=product['slug'],
            store_name=store['name'],
            tagline=store['tagline'],
            store_description=store['description'],
            email=store['email'],
            phones='<br>'.join(store['phones']),
            telegram=store['telegram'],
            instagram=store['instagram'],
            image_src=image_src,
            image_alt=image_alt,
            catalog_json=main.serialized_catalog_json(catalog),
            header_html=product_header_html,
        )
        target_dir = products_dir / product['slug']
        target_dir.mkdir(parents=True, exist_ok=True)
        (target_dir / 'index.html').write_text(page, encoding='utf-8')

    guide_urls = guide_urls or []
    faq_url = f"{store['domain'].rstrip('/')}/faq/"
    urls = (
        [store['domain'] + '/', notfound.notfound_page_url(store)]
        + guide_urls
        + [faq_url]
        + [p.get('url') or f"{store['domain']}/products/{p['slug']}/" for p in products]
    )
    sitemap = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for url in urls:
        sitemap.extend([
            '  <url>',
            f'    <loc>{html.escape(url)}</loc>',
            f'    <lastmod>{store["updatedAt"]}</lastmod>',
            '  </url>',
        ])
    sitemap.append('</urlset>')
    (main.ROOT / 'sitemap.xml').write_text('\n'.join(sitemap) + '\n', encoding='utf-8')
    print(f'Built {len(products)} product pages and sitemap.xml')
