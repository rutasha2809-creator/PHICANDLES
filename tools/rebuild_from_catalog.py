"""
================================================================================
rebuild_from_catalog.py — статическая сборка сайта PHICANDLES
================================================================================

Если читаешь файл впервые:
  • Это обычный скрипт на Python 3 (без фреймворка). Запуск из корня проекта:
        python tools/rebuild_from_catalog.py
  • Он НЕ поднимает сервер: только читает JSON/HTML-шаблоны и записывает .html / .xml.
  • «Шаблон» — текст с плейсхолдерами {title}, {header_html}; str.format(...) подставляет значения.

Короткий глоссарий:
  • JSON-LD / Schema.org — структурированные данные в <script type="application/ld+json">
    для поисковиков (товар, организация, FAQ и т.д.).
  • Манифест — отдельный JSON с текстами (guides_manifest, faq_manifest), чтобы не раздувать catalog.json.
  • Каталог (catalog.json) — товары, категории, store (магазин: домен, телефоны, валюта).

Что создаётся при запуске:
  • index.html — главная; products/<slug>/index.html — каждый товар.
  • data/guides.json + правки <head> в guides/** — если есть data/guides_manifest.json.
  • faq/index.html — если есть data/faq_manifest.json.
  • 404.html — шапка из tools/templates/home_header.html, популярные товары из каталога.
  • sitemap.xml — список URL для поисковиков.

Логика разнесена по модулям в каталоге tools/: main (общее и главная), guides, products, faq, notfound.

Зачем параметр называется page, а не html:
  В Python уже есть модуль html (import html). Если назвать переменную html, внутри функции
  она перекроет модуль — вызов html.escape() сломается. Поэтому HTML-строку страницы зовём page.

Подсказка по отладке:
  Если что-то не подставилось — проверь, что имена в HOME_TEMPLATE / FAQ_TEMPLATE совпадают
  с ключами в .format(...). Одна опечатка → исключение при запуске.
================================================================================
"""
from __future__ import annotations

import faq
import guides
import main
import notfound
import products

if __name__ == '__main__':
    catalog = main.load_catalog()
    guide_urls: list[str] = []
    gm = main.load_guides_manifest()
    if gm:
        guide_urls = guides.build_guides(catalog, gm)
    else:
        print(f'Note: {main.GUIDES_MANIFEST_PATH.relative_to(main.ROOT)} not found, skipping guides JSON/HTML/sitemap entries')
    fm = main.load_faq_manifest()
    if fm:
        faq.build_faq_page(catalog, fm)
    else:
        print(f'Note: {main.FAQ_MANIFEST_PATH.relative_to(main.ROOT)} not found, skipping FAQ page generation')
    main.build_home_page(catalog)
    notfound.build_not_found_page(catalog)
    products.build_pages(catalog, guide_urls=guide_urls)
