# PHICANDLES — GitHub Pages archive

В этом архиве уже подготовлен статический магазин под GitHub Pages.

## Что внутри

- `data/catalog.json` — единый источник данных для каталога, карточек товаров, отзывов и популярности.
- `data/guides_manifest.json` — заголовки, описания и пути картинок для гидов; скрипт сборки из него генерирует `data/guides.json` и метаданные в HTML гидов.
- `data/faq_manifest.json` — вопросы и HTML-ответы для FAQ; скрипт собирает `faq/index.html` и JSON-LD, подставляет контакты из `catalog.json`.
- `index.html` — главная страница со всеми товарами.
- `products/<slug>/index.html` — отдельная страница каждого товара.
- `faq/index.html` — вопросы и ответы по заказу, доставке и оплате.
- `404.html` — страница 404 со ссылкой на главную и 3 самыми популярными товарами.
- `assets/js/base.js` — общие функции, загрузка каталога и работа корзины.
- `assets/js/home.js` — рендер главной страницы и корзины.
- `assets/js/product.js` — рендер страницы товара.
- `robots.txt`, `sitemap.xml`, `.nojekyll`, `CNAME` — базовая инфраструктура для GitHub Pages и индексации.

## Как обновлять товары

Все данные меняются в одном файле: `data/catalog.json`.

У товара предусмотрены:

- `slug`
- `name`
- `categoryId`
- `price`
- `description`
- `shortDescription`
- `dimensions`
- `materials`
- `burnTime`
- `options.aroma`
- `options.color`
- `popularity`
- `reviews`

### Пример структуры товара

```json
{
  "id": "prod-example",
  "slug": "primer-svechi",
  "name": "Пример свечи",
  "categoryId": "flowers",
  "price": 1500,
  "description": "Полное описание товара.",
  "shortDescription": "Короткое описание для карточки.",
  "dimensions": "Диаметр: 7 см",
  "materials": ["соевый воск", "хлопковый фитиль"],
  "burnTime": "до 24 часов",
  "options": {
    "aroma": ["Ваниль", "Лаванда"],
    "color": ["Белый", "Пудровый"]
  },
  "image": "./assets/img/products/primer-svechi.svg",
  "imageAlt": "Пример свечи",
  "popularity": 90,
  "featured": true,
  "reviews": [
    {
      "author": "Анна",
      "rating": 5,
      "date": "2026-04-12",
      "text": "Очень понравилось качество и аромат."
    }
  ]
}
```

## Как добавить новый товар

1. Добавьте объект товара в `data/catalog.json`.
2. Добавьте картинку в `assets/img/products/`.
3. Создайте страницу `products/<slug>/index.html`.
   - В этом архиве страницы уже созданы для текущих товаров.
   - Для новых товаров можно клонировать любую существующую страницу и заменить `data-product-slug`.
4. Обновите `sitemap.xml`.

## Автогенерация страниц после правок каталога

После изменения `data/catalog.json` можно автоматически пересобрать страницы товаров и `sitemap.xml`:

```bash
python tools/rebuild_from_catalog.py
```

Скрипт заново создаст все `products/<slug>/index.html` на основе актуального JSON, пересоберёт `sitemap.xml`, при наличии `data/guides_manifest.json` обновит `data/guides.json` и метаданные в `guides/**/*.html`, при наличии `data/faq_manifest.json` пересоберёт `faq/index.html` с общей шапкой как у остальных страниц. Даты и URL берутся из `catalog.json` → `store`.

## Корзина

Корзина работает без бэкенда и хранится в `localStorage`. Это значит, что:

- она сохраняется при переходах между страницами;
- её можно использовать на GitHub Pages;
- для оформления заказа нужен внешний сервис: Telegram, Tally, ЮKassa, CloudPayments, Ecwid/Snipcart или кастомный сервер.

## Деплой на GitHub Pages

1. Загрузите содержимое архива в репозиторий.
2. В настройках репозитория включите GitHub Pages.
3. Если используете кастомный домен `phicandles.ru`, оставьте файл `CNAME`.
4. Если тестируете на временном адресе `username.github.io/repo`, удалите `CNAME` до публикации.

## Локальный просмотр

Лучше запускать через локальный сервер, а не открывать файл двойным кликом.

Например:

```bash
python -m http.server 8000
```

После этого откройте `http://localhost:8000/`.
