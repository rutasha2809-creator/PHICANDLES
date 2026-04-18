"""Сборка страницы FAQ."""
from __future__ import annotations

import html
import re

import main


def strip_html_for_jsonld(fragment: str) -> str:
    text = re.sub(r'<[^>]+>', ' ', fragment)
    return ' '.join(text.split())


def apply_faq_answer_placeholders(answer_html: str, store: dict) -> str:
    return (
        answer_html.replace('EMAIL_PLACEHOLDER', store['email']).replace('TELEGRAM_PLACEHOLDER', store['telegram'])
    )


def render_faq_accordion_html(store: dict, items: list[dict]) -> str:
    blocks: list[str] = []
    for item in items:
        q = html.escape(item['question'])
        body = apply_faq_answer_placeholders(item['answer_html'], store)
        blocks.append(f'        <details name="faq">\n          <summary>{q}</summary>\n          <div class="faq-answer">\n            {body}\n          </div>\n        </details>')
    return '\n'.join(blocks)


def faq_intro_html(store: dict) -> str:
    name = html.escape(store['name'])
    em = store['email']
    tg = store['telegram']
    return (
        f'<p>Коротко о том, как заказать свечи {name}, связаться с нами, оплатить покупку и получить посылку. '
        f'Если не нашли ответ — напишите на <a href="mailto:{html.escape(em)}">{html.escape(em)}</a> '
        f'или в <a href="{html.escape(tg, quote=True)}">Telegram</a>.</p>'
    )


def faq_cta_body_html(store: dict) -> str:
    phones = ', '.join(store['phones'])
    return f'<p>Напишите нам — подскажем по составу заказа, срокам и доставке. Телефоны: {html.escape(phones)}.</p>'


def build_faq_page(catalog: dict, manifest: dict) -> None:
    store = catalog['store']
    domain = store['domain'].rstrip('/')
    canonical = f'{domain}/faq/'
    items = manifest.get('items') or []

    main_entity = []
    for item in items:
        body = apply_faq_answer_placeholders(item['answer_html'], store)
        plain = strip_html_for_jsonld(body)
        main_entity.append({
            '@type': 'Question',
            'name': item['question'],
            'acceptedAnswer': {'@type': 'Answer', 'text': plain},
        })
    faq_jsonld = {'@context': 'https://schema.org', '@type': 'FAQPage', 'mainEntity': main_entity}

    header_html = main.HOME_HEADER_TEMPLATE.format(
        index_href='../index.html',
        logo_src='../logo.svg',
        wordmark_src='../assets/img/brand-wordmark.svg',
        store_name=html.escape(store['name']),
        tagline=html.escape(store['tagline']),
        catalog_href='../index.html#catalog',
        guides_href='../index.html#guides',
        faq_href='./index.html',
        faq_extra=' aria-current="page"',
        cart_href='../index.html#cart',
    )

    title = manifest['title']
    description = manifest['meta_description']
    page = main.FAQ_TEMPLATE.format(
        title=html.escape(title),
        description=html.escape(description),
        canonical=html.escape(canonical, quote=True),
        og_title=html.escape(title),
        og_description=html.escape(description),
        og_url=html.escape(canonical, quote=True),
        og_site_name=html.escape(store['name']),
        jsonld=main.json_ld_script(faq_jsonld),
        header_html=header_html,
        eyebrow=html.escape(manifest['eyebrow']),
        h1=html.escape(manifest['h1']),
        intro_html=faq_intro_html(store),
        faq_items_html=render_faq_accordion_html(store, items),
        cta_title=html.escape(manifest['cta_title']),
        cta_body_html=faq_cta_body_html(store),
        store_name=html.escape(store['name']),
        store_description=html.escape(store['description']),
        email=html.escape(store['email']),
        phones='<br>'.join(html.escape(p) for p in store['phones']),
        telegram=html.escape(store['telegram'], quote=True),
        instagram=html.escape(store['instagram'], quote=True),
    )

    main.FAQ_PAGE_PATH.parent.mkdir(parents=True, exist_ok=True)
    main.FAQ_PAGE_PATH.write_text(page, encoding='utf-8')
    print(f'Wrote {main.FAQ_PAGE_PATH.relative_to(main.ROOT)}')
