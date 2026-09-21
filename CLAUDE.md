# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

PHICANDLES (phicandles.ru) — интернет-магазин свечей ручной работы. Статически генерируемый сайт (Python-скрипты пишут готовые `.html`), плюс набор PHP-скриптов в корне (`send-order.php`, `loyalty.php`, `cdek-proxy.php`, `metrika-auth.php` и др.) для форм, заказов, программы лояльности и доставки СДЭК — эти PHP-эндпоинты требуют PHP-хостинга и не работают на чистом GitHub Pages, несмотря на то что `README.md` описывает проект как "GitHub Pages archive". Уточняй у пользователя, если задача касается PHP-части — она не покрыта Python tooling ниже.

## Single source of truth: `data/catalog.json`

Все товары, категории, отзывы, popularity и данные магазина (`store`) живут в этом одном файле. Ничего в `products/**/index.html` или `index.html` не редактируется руками — эти файлы либо генерируются, либо содержат встроенную копию каталога, которая синхронизируется отдельным шагом (см. ниже). Схема полей товара и пример объекта — в `README.md` ("Как обновлять товары").

Важные поля товара, не всегда очевидные из примера в README:
- `image` / `assetImage` / `absoluteImage` — главное фото (первый слайд карусели и обложка карточки).
- `gallery` — массив доп. фото; вместе с `image` формирует порядок слайдов в карусели на странице товара и точки на карточке в каталоге (`assets/js/base.js`, `assets/js/product.js`). Чтобы "поменять местами фото в карусели", меняются местами именно значения `image`/`assetImage`/`absoluteImage` и элемент(ы) `gallery` — сами файлы изображений не переименовываются.

## Two separate update pipelines — don't confuse them

**1. Обычные правки данных товара (текст, цена, порядок фото, отзывы) — только `propagate.py`, НЕ `rebuild_from_catalog.py`.**

`propagate.py`: копирует изображения из именованных подпапок в `assets/img/products/` по жёстко заданному списку `copies`, затем находит `<script id="phicandles-catalog-json" type="application/json">…</script>` в каждом `index.html` по всему репо и заменяет его содержимое на текущий `data/catalog.json`. Именно этот встроенный `<script>`-блок читает клиентский JS как основной источник каталога на странице (см. `data-catalog-path` в `<body>` — это скорее fallback/для локального `file://` просмотра, а не основной путь).

`ОБНОВИТЬ_САЙТ.bat` — обычный способ публикации, которым пользуется владелец: запускает `convert_accordion.py` (легаси-миграция вёрстки, обычно no-op — файлы с классом `phi-accordion` пропускаются), затем `propagate.py`, затем `git add -A && git commit -m "Update site" && git push origin HEAD:main`. Т.е. пуш на GitHub — часть этого же .bat, отдельно его делать не нужно.

**2. Структурные изменения (новый товар, новый шаблон страницы, новые гиды/FAQ) — `python tools/rebuild_from_catalog.py`.**

Пересобирает с нуля `index.html`, каждую `products/<slug>/index.html`, `404.html`, `sitemap.xml`, и (если есть манифесты) `faq/index.html` и `data/guides.json` + `guides/**` — на основе шаблонов из `tools/templates/*.html` и логики в `tools/main.py`, `tools/products.py`, `tools/faq.py`, `tools/guides.py`, `tools/notfound.py`. Это более тяжёлая операция, затрагивающая структуру страниц, а не только данные — не запускать без явной просьбы, т.к. она перезапишет ручные правки вёрстки в `products/**`.

Не путать: **не выполнять ни один из двух пайплайнов, а тем более git push, без явного запроса пользователя** — правка `data/catalog.json` сама по себе часто достаточна как самостоятельный шаг, дальше пользователь публикует сам через `ОБНОВИТЬ_САЙТ.bat`.

## Other things worth knowing

- `_admin/` — браузерная админка для правки `data/catalog.json` визуально (см. `_admin/README.md`). Не публикуется на GitHub Pages (`_config.yml` исключает `_admin` и `tools` из Jekyll-сборки).
- Корзина — чистый `localStorage`, без бэкенда.
- Ветка по умолчанию — `main`; есть ещё `new-changes` и `My-Vers2`. Пуш через `ОБНОВИТЬ_САЙТ.bat` идёт в `origin HEAD:main`.
- Git remote уже настроен с embedded personal access token в URL — никогда не печатать/показывать вывод `git remote -v` пользователю или в файлах, это утечка секрета.
- `vk_*.py` и `pinterest_*.py` в корне — синхронизация обложек/постов с VK и Pinterest, отдельная от основного сайта подсистема.

## SEO-шаг: `tools/seo_static.py`

Запускается в `ОБНОВИТЬ_САЙТ.bat` сразу после `propagate.py` (Step 0c). Идемпотентно вписывает данные из `data/catalog.json` прямо в HTML: в `products/<slug>/index.html` — title, meta description (поле `seoDescription` или начало `description`), canonical, og:*, JSON-LD (Product + BreadcrumbList), alt фото и текст товара внутри маркеров `<!--seo:…-->…<!--/seo:…-->`; скрытым товарам (categoryId вне `categories`) ставит noindex. Также перезаписывает карточки в `catalog/index.html`, JSON-LD главной, `sitemap.xml` и `llms.txt`. Поэтому `sitemap.xml` руками не править, а после `rebuild_from_catalog.py` обязательно запускать этот скрипт.

## Особые поводы

Категория `occasions` («Особые поводы») — праздничный раздел каталога. Подразделы перечислены в `catalog.json` → `occasions` (id, name, month); товар попадает в подраздел через поле `occasions: [id, ...]` и при этом может оставаться в своей обычной категории. В каталоге (`catalog/index.html`) подразделы показываются только непустые, ближайший по месяцу — первым; ссылка вида `/catalog/index.html#occasions/march8`. Категория `desserts` — «Десерты и фрукты». Категорий `limited` и `seson` больше нет.

## Главная страница

Главная (`index.html`) свёрстана вручную (стили в блоке `<!--hp-css-->` в `<head>`). Два блока заполняет `tools/seo_static.py` из каталога: плитки коллекций между `<!--hp:cats-->…<!--/hp:cats-->` (картинка — поле `image` у категории в `catalog.json`) и «Хиты продаж» между `<!--hp:hits-->…<!--/hp:hits-->` (список slug в `catalog.json` → `homeHits`). Фото коллажа первого экрана — `assets/img/about-lifestyle.jpg` и `assets/img/covers/Main-cover-1/3/4.jpg`. Шаблон `tools/templates/home.html` устарел — `rebuild_from_catalog.py` для главной не запускать.

## Страницы разделов и «Особых поводов» (с 21.09.2026)
- `tools/seo_static.py` (build_landing_pages) собирает целиком `catalog/<slug>/index.html` для каждой категории и `catalog/osobye-povody/<slug>/index.html` для каждого повода с товарами. Руками эти файлы не править — перезапишутся.
- Тексты — в `data/catalog.json`: `categories[]` и `occasions[]` поля `slug`, `h1`, `intro`, необязательный `seoTitle`. Description собирается автоматически (кол-во товаров, цена «от»).
- Повод, где меньше 3 товаров, получает noindex и не попадает в sitemap/llms.txt (сейчас Хэллоуин и Новый год) — откроется сам, когда товаров станет ≥3.
- Раздел «Особые поводы» показывает товары категории occasions + все товары с любым поводом.
- Плитки коллекций на главной ведут на эти страницы. Старые папки catalog/sezonnye-kollekcii и catalog/specialnye-predlozheniya — noindex.
- Тексты подборок Хэллоуин и Новый год Наталия уточнит, когда добавит товары (тыковки, шкатулки-ёлочные игрушки, лошадки, символ года).
- В общем каталоге (`catalog/index.html`) при выборе раздела/повода заголовок и вводный текст над товарами тоже берутся из `h1`/`intro` (функция updateHeader) — тексты одинаковые с отдельными страницами.
- Фото «Особых поводов» Наталия хранит в `assets/img/products/osobie povodi/<Uchitelu|Deserti-i-fructi>/`; `propagate.py` (список `copies`) копирует их в `assets/img/products/` — сайт ссылается только на копии. Новый файл в этих папках → добавить строку в `copies`.
