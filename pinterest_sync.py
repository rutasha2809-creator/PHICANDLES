"""
PHICANDLES — Синхронизация товаров с Pinterest
Запускается автоматически из ОБНОВИТЬ_САЙТ.bat

Что делает:
- Читает catalog.json
- Для каждой категории создаёт доску Pinterest (если нет)
- Для каждого нового товара создаёт пин с фото и ссылкой на сайт
- Уже загруженные товары пропускает (tracked в pinterest_synced.json)
"""

import json, os, time, requests

try:
    from pinterest_config import PINTEREST_TOKEN
except ImportError:
    print("[Pinterest] ОШИБКА: pinterest_config.py не найден!")
    exit()

if 'ВСТАВЬТЕ' in PINTEREST_TOKEN:
    print("[Pinterest] Токен не настроен. Запустите pinterest_auth.py")
    exit()

SITE_URL   = 'https://phicandles.ru'
API_BASE   = 'https://api.pinterest.com/v5'
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CATALOG    = os.path.join(SCRIPT_DIR, 'data', 'catalog.json')
SYNCED     = os.path.join(SCRIPT_DIR, 'pinterest_synced.json')
SKIP_CATS  = {'hidden'}

# Соответствие категорий сайта → названия досок Pinterest
BOARD_NAMES = {
    'conteiner': 'Контейнерные свечи | PHICANDLES',
    'forming':   'Формовые свечи | PHICANDLES',
    'interier':  'Интерьерные свечи | PHICANDLES',
    'kashpo':    'Свечи в кашпо | PHICANDLES',
    'aroma':     'Ароматы для дома | PHICANDLES',
    'dekor':     'Декор для дома | PHICANDLES',
    'gift':      'Подарочные наборы | PHICANDLES',
    'limited':   'Лимитированная коллекция | PHICANDLES',
    'seson':     'Сезонные коллекции | PHICANDLES',
}

HEADERS = {
    'Authorization': f'Bearer {PINTEREST_TOKEN}',
    'Content-Type':  'application/json',
}

def api_get(path, params=None):
    r = requests.get(f'{API_BASE}/{path}', headers=HEADERS, params=params, timeout=30)
    r.raise_for_status()
    return r.json()

def api_post(path, data):
    r = requests.post(f'{API_BASE}/{path}', headers=HEADERS, json=data, timeout=30)
    r.raise_for_status()
    return r.json()

def get_or_create_board(category_id):
    """Ищет существующую доску или создаёт новую."""
    board_name = BOARD_NAMES.get(category_id, f'PHICANDLES | {category_id}')

    # Ищем среди существующих досок
    boards = api_get('boards', {'page_size': 100})
    for board in boards.get('items', []):
        if board['name'] == board_name:
            return board['id']

    # Создаём новую доску
    result = api_post('boards', {
        'name':        board_name,
        'description': f'Коллекция PHICANDLES — ароматические свечи и декор для дома. Магазин: {SITE_URL}',
        'privacy':     'PUBLIC',
    })
    print(f"  → Создана доска: {board_name}")
    return result['id']

def build_description(product):
    """Формирует описание пина."""
    parts = []
    if product.get('description'):
        parts.append(product['description'])
    if product.get('dimensions'):
        parts.append(f"📐 {product['dimensions']}")
    burn = product.get('burnTime', '')
    label = product.get('burnTimeLabel', 'Время горения')
    if burn:
        parts.append(f"🕯 {label}: {burn}")
    parts.append(f"💰 Цена: {product['price']:,} ₽")
    parts.append(f"👉 Заказать: {SITE_URL}/products/{product['slug']}/")
    return '\n\n'.join(parts)[:500]

def get_image_url(product):
    """Возвращает прямой URL фото товара с сайта."""
    img = product.get('assetImage', '')
    if not img:
        return None
    # assetImage обычно хранит имя файла, строим полный URL
    if img.startswith('http'):
        return img
    filename = os.path.basename(img)
    return f'{SITE_URL}/assets/img/products/{filename}'

def create_pin(board_id, product):
    """Создаёт пин в Pinterest."""
    img_url = get_image_url(product)
    if not img_url:
        return None

    data = {
        'board_id':    board_id,
        'title':       product['name'][:100],
        'description': build_description(product),
        'link':        f"{SITE_URL}/products/{product['slug']}/",
        'media_source': {
            'source_type': 'image_url',
            'url':         img_url,
        },
    }
    result = api_post('pins', data)
    return result.get('id')

def main():
    with open(CATALOG, 'r', encoding='utf-8') as f:
        catalog = json.load(f)

    synced = {}
    if os.path.exists(SYNCED):
        with open(SYNCED, 'r', encoding='utf-8') as f:
            synced = json.load(f)

    # Только новые товары, не из скрытых категорий
    new_products = [
        p for p in catalog['products']
        if p.get('categoryId') not in SKIP_CATS
        and not p.get('hidden', False)
        and p['slug'] not in synced
    ]

    if not new_products:
        print('[Pinterest] Нет новых товаров для синхронизации.')
        return

    print(f'[Pinterest] Новых товаров: {len(new_products)}')

    # Кэш досок чтобы не запрашивать каждый раз
    board_cache = {}

    for p in new_products:
        print(f'[Pinterest] → {p["name"]}...', end=' ', flush=True)
        try:
            cat_id = p.get('categoryId', 'conteiner')

            # Получаем/создаём доску для этой категории
            if cat_id not in board_cache:
                board_cache[cat_id] = get_or_create_board(cat_id)
            board_id = board_cache[cat_id]

            # Создаём пин
            pin_id = create_pin(board_id, p)
            if not pin_id:
                print('пин не создан, пропуск')
                continue

            # Сохраняем в трекер
            synced[p['slug']] = {
                'name':      p['name'],
                'pin_id':    pin_id,
                'board_id':  board_id,
                'synced_at': time.strftime('%Y-%m-%d %H:%M:%S'),
            }
            with open(SYNCED, 'w', encoding='utf-8') as f:
                json.dump(synced, f, ensure_ascii=False, indent=2)

            print('✓')
            time.sleep(1)  # пауза между запросами

        except Exception as e:
            print(f'✗ {e}')

    print('[Pinterest] Синхронизация завершена.')

if __name__ == '__main__':
    main()
