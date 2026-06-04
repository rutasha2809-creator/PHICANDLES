"""
PHICANDLES — синхронизация товаров с ВКонтакте
Запускается автоматически из ОБНОВИТЬ_САЙТ.bat
"""

import json, os, time, requests
from vk_config import VK_TOKEN, VK_GROUP

SITE_URL   = 'https://phicandles.ru'
VK_VERSION = '5.131'
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CATALOG    = os.path.join(SCRIPT_DIR, 'data', 'catalog.json')
SYNCED     = os.path.join(SCRIPT_DIR, 'vk_synced.json')
ASSETS_DIR = os.path.join(SCRIPT_DIR, 'assets', 'img', 'products')
SKIP_CATS  = {'hidden'}  # категории не для публикации

def vk(method, params={}):
    params = {**params, 'access_token': VK_TOKEN, 'v': VK_VERSION}
    r = requests.post(f'https://api.vk.com/method/{method}', data=params, timeout=30)
    data = r.json()
    if 'error' in data:
        raise Exception(f"VK: {data['error']['error_msg']} (code {data['error']['error_code']})")
    return data['response']

def upload_photo(image_path):
    """Загружает фото товара в VK и возвращает photo_id."""
    server = vk('photos.getMarketUploadServer', {'group_id': VK_GROUP, 'main_photo': 1})
    with open(image_path, 'rb') as f:
        resp = requests.post(server['upload_url'], files={'file': f}, timeout=60).json()
    saved = vk('photos.saveMarketPhoto', {
        'group_id':  VK_GROUP,
        'photo':     resp.get('photo', ''),
        'server':    resp.get('server', ''),
        'hash':      resp.get('hash', ''),
        'crop_data': resp.get('crop_data', ''),
        'crop_hash': resp.get('crop_hash', ''),
    })
    return saved[0]['id']

def build_description(product):
    parts = []
    if product.get('description'):
        parts.append(product['description'])
    if product.get('dimensions'):
        parts.append(f"📐 Размеры: {product['dimensions']}")
    if product.get('materials'):
        parts.append(f"🌿 Материалы: {', '.join(product['materials'])}")
    burn = product.get('burnTime', '')
    label = product.get('burnTimeLabel', 'Время горения')
    if burn:
        parts.append(f"🕯 {label}: {burn}")
    parts.append(f"\n👉 Заказать: {SITE_URL}/products/{product['slug']}/")
    return '\n\n'.join(parts)[:4096]

def add_to_market(product, photo_id):
    result = vk('market.add', {
        'owner_id':    -VK_GROUP,
        'name':        product['name'][:100],
        'description': build_description(product),
        'category_id': 603,   # Товары ручной работы
        'price':       product['price'],
        'photo_id':    photo_id,
        'url':         f"{SITE_URL}/products/{product['slug']}/",
    })
    return result['market_item_id']

def post_to_wall(product, market_item_id):
    desc = product.get('description', '')
    short = desc[:200] + '…' if len(desc) > 200 else desc
    text = (
        f"🕯 {product['name']}\n\n"
        f"{short}\n\n"
        f"💰 {product['price']:,} ₽\n"
        f"👉 {SITE_URL}/products/{product['slug']}/"
    )
    vk('wall.post', {
        'owner_id':    -VK_GROUP,
        'message':     text,
        'attachments': f"market-{VK_GROUP}_{market_item_id}",
        'from_group':  1,
    })

def main():
    with open(CATALOG, 'r', encoding='utf-8') as f:
        catalog = json.load(f)

    synced = {}
    if os.path.exists(SYNCED):
        with open(SYNCED, 'r', encoding='utf-8') as f:
            synced = json.load(f)

    new_products = [
        p for p in catalog['products']
        if p.get('categoryId') not in SKIP_CATS
        and p['slug'] not in synced
    ]

    if not new_products:
        print('[VK] Нет новых товаров для синхронизации.')
        return

    print(f'[VK] Новых товаров: {len(new_products)}')

    for p in new_products:
        print(f'[VK] → {p["name"]}...', end=' ')
        try:
            # Путь к фото
            img_file = os.path.basename(p.get('assetImage', ''))
            img_path = os.path.join(ASSETS_DIR, img_file)
            if not os.path.exists(img_path):
                print(f'фото не найдено ({img_file}), пропуск')
                continue

            photo_id      = upload_photo(img_path)
            market_item_id = add_to_market(p, photo_id)
            post_to_wall(p, market_item_id)

            synced[p['slug']] = {
                'name':           p['name'],
                'market_item_id': market_item_id,
                'synced_at':      time.strftime('%Y-%m-%d %H:%M:%S'),
            }
            with open(SYNCED, 'w', encoding='utf-8') as f:
                json.dump(synced, f, ensure_ascii=False, indent=2)

            print('✓')
            time.sleep(1)   # пауза между товарами

        except Exception as e:
            print(f'✗ {e}')

    print('[VK] Синхронизация завершена.')

if __name__ == '__main__':
    main()
