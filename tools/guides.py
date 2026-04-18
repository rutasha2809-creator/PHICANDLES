"""
Сборка data/guides.json и правка <head> у страниц guides/**.
"""
from __future__ import annotations

import html
import json
import re

import main


def asset_url(domain: str, rel_path: str) -> str:
    rel = rel_path.removeprefix('./').lstrip('/')
    return f"{domain.rstrip('/')}/{rel}"


def replace_first_json_ld(page: str, json_inner: str) -> str:
    def repl(m):
        return m.group(1) + json_inner + m.group(3)

    return re.sub(
        r'(<script type="application/ld\+json">)([\s\S]*?)(</script>)',
        repl,
        page,
        count=1,
    )


def replace_title(page: str, title: str) -> str:
    return re.sub(r'<title>[^<]*</title>', f'<title>{html.escape(title)}</title>', page, count=1)


def replace_meta_name(page: str, name: str, content: str) -> str:
    esc = html.escape(content, quote=True)
    return re.sub(
        rf'<meta name="{re.escape(name)}" content="[^"]*">',
        f'<meta name="{name}" content="{esc}">',
        page,
        count=1,
    )


def replace_meta_property(page: str, prop: str, content: str) -> str:
    esc = html.escape(content, quote=True)
    return re.sub(
        rf'<meta property="{re.escape(prop)}" content="[^"]*">',
        f'<meta property="{prop}" content="{esc}">',
        page,
        count=1,
    )


def replace_canonical(page: str, url: str) -> str:
    esc = html.escape(url, quote=True)
    return re.sub(
        r'<link rel="canonical" href="[^"]*">',
        f'<link rel="canonical" href="{esc}">',
        page,
        count=1,
    )


def collection_page_json_ld(
    store: dict,
    index_meta: dict,
    domain: str,
    index_url: str,
    articles: list[dict],
) -> dict:
    items = []
    for i, art in enumerate(articles, start=1):
        u = art.get('url') or f"{domain}/guides/{art['slug']}/"
        items.append({
            '@type': 'ListItem',
            'position': i,
            'name': art['headline'],
            'url': u,
        })
    return {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        'name': index_meta['collection_name'],
        'description': index_meta['description'],
        'url': index_url,
        'inLanguage': 'ru-RU',
        'isPartOf': {'@type': 'WebSite', 'name': store['name'], 'url': domain},
        'mainEntity': {
            '@type': 'ItemList',
            'numberOfItems': len(items),
            'itemListElement': items,
        },
    }


def article_json_ld(
    store: dict,
    art: dict,
    *,
    page_url: str,
    image_url: str,
    updated: str,
    domain: str,
) -> dict:
    logo = f"{domain}/assets/img/logo-placeholder.svg"
    return {
        '@context': 'https://schema.org',
        '@type': 'Article',
        'headline': art['headline'],
        'description': art['description'],
        'image': image_url,
        'datePublished': updated,
        'dateModified': updated,
        'author': {'@type': 'Organization', 'name': store['name'], 'url': domain},
        'publisher': {
            '@type': 'Organization',
            'name': store['name'],
            'logo': {'@type': 'ImageObject', 'url': logo},
        },
        'mainEntityOfPage': {'@type': 'WebPage', '@id': page_url},
        'isPartOf': {'@type': 'WebSite', 'name': store['name'], 'url': domain},
        'inLanguage': 'ru-RU',
    }


def build_guides(catalog: dict, manifest: dict) -> list[str]:
    store = catalog['store']
    domain = store['domain'].rstrip('/')
    updated = store['updatedAt']
    idx = manifest['index']
    articles_in = manifest['articles']

    articles_out: list[dict] = []
    for art in articles_in:
        slug = art['slug']
        page_url = f'{domain}/guides/{slug}/'
        img = asset_url(domain, art['image'])
        articles_out.append({
            'slug': slug,
            'url': page_url,
            'headline': art['headline'],
            'description': art['description'],
            'image': img,
        })

    index_url = f'{domain}/guides/'
    guides_payload = {
        'updatedAt': updated,
        'index': index_url,
        'description': idx.get('summary_for_json') or idx['description'],
        'articles': articles_out,
    }
    main.GUIDES_JSON_PATH.write_text(
        json.dumps(guides_payload, ensure_ascii=False, indent=2) + '\n',
        encoding='utf-8',
    )

    index_path = main.ROOT / 'guides' / 'index.html'
    if index_path.is_file():
        html_in = index_path.read_text(encoding='utf-8')
        hero_img = asset_url(domain, idx['image'])
        coll = collection_page_json_ld(store, idx, domain, index_url, articles_out)
        html_in = replace_title(html_in, idx['title'])
        html_in = replace_meta_name(html_in, 'description', idx['description'])
        html_in = replace_canonical(html_in, index_url)
        html_in = replace_meta_property(html_in, 'og:title', idx['title'])
        html_in = replace_meta_property(html_in, 'og:description', idx['description'])
        html_in = replace_meta_property(html_in, 'og:url', index_url)
        html_in = replace_meta_property(html_in, 'og:image', hero_img)
        html_in = replace_first_json_ld(html_in, main.json_ld_script(coll))
        index_path.write_text(html_in, encoding='utf-8')
    else:
        print('Warning: guides/index.html not found, skipped head patch')

    for art in articles_in:
        slug = art['slug']
        page_path = main.ROOT / 'guides' / slug / 'index.html'
        if not page_path.is_file():
            print(f'Warning: guides/{slug}/index.html not found, skipped')
            continue
        page_url = f'{domain}/guides/{slug}/'
        image_url = asset_url(domain, art['image'])
        html_a = page_path.read_text(encoding='utf-8')
        ld = article_json_ld(
            store,
            art,
            page_url=page_url,
            image_url=image_url,
            updated=updated,
            domain=domain,
        )
        html_a = replace_title(html_a, art['title'])
        html_a = replace_meta_name(html_a, 'description', art['description'])
        html_a = replace_canonical(html_a, page_url)
        html_a = replace_meta_property(html_a, 'og:title', art['title'])
        html_a = replace_meta_property(html_a, 'og:description', art['description'])
        html_a = replace_meta_property(html_a, 'og:url', page_url)
        html_a = replace_meta_property(html_a, 'og:image', image_url)
        html_a = replace_first_json_ld(html_a, main.json_ld_script(ld))
        page_path.write_text(html_a, encoding='utf-8')

    print(f'Wrote {main.GUIDES_JSON_PATH.relative_to(main.ROOT)} and patched guide HTML heads')

    return [index_url] + [a['url'] for a in articles_out]
