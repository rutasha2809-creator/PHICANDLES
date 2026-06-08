"""
PHICANDLES — Получение токена Pinterest через OAuth
Запустите один раз, следуйте инструкциям в браузере.
Токен сохранится в pinterest_config.py автоматически.
"""

import webbrowser
import urllib.parse
import http.server
import threading
import requests
import re
import os

try:
    from pinterest_config import PINTEREST_APP_ID, PINTEREST_APP_SECRET
except ImportError:
    print("ОШИБКА: файл pinterest_config.py не найден!")
    input("Нажмите Enter...")
    exit()

REDIRECT_URI = 'https://phicandles.ru/'
SCOPES = 'boards:read,boards:write,pins:read,pins:write,user_accounts:read'

def get_auth_url():
    params = {
        'client_id':     PINTEREST_APP_ID,
        'redirect_uri':  REDIRECT_URI,
        'response_type': 'code',
        'scope':         SCOPES,
    }
    return 'https://www.pinterest.com/oauth/?' + urllib.parse.urlencode(params)

def exchange_code_for_token(code):
    r = requests.post(
        'https://api.pinterest.com/v5/oauth/token',
        data={
            'grant_type':   'authorization_code',
            'code':         code,
            'redirect_uri': REDIRECT_URI,
        },
        auth=(PINTEREST_APP_ID, PINTEREST_APP_SECRET),
        timeout=30
    )
    return r.json()

def save_token(token):
    config_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'pinterest_config.py')
    with open(config_path, 'r', encoding='utf-8') as f:
        content = f.read()
    content = re.sub(
        r"PINTEREST_TOKEN\s*=\s*'[^']*'",
        f"PINTEREST_TOKEN = '{token}'",
        content
    )
    with open(config_path, 'w', encoding='utf-8') as f:
        f.write(content)

if __name__ == '__main__':
    print("=" * 50)
    print("  PHICANDLES — Авторизация Pinterest")
    print("=" * 50)
    print()
    print("Сейчас откроется браузер.")
    print("Разрешите доступ приложению PHI_CANDLES.")
    print("После этого браузер перейдёт на phicandles.ru —")
    print("скопируйте из адресной строки значение параметра 'code='")
    print()
    input("Нажмите Enter чтобы открыть браузер...")

    url = get_auth_url()
    webbrowser.open(url)

    print()
    print("После разрешения браузер перейдёт на phicandles.ru.")
    print("Адрес будет выглядеть примерно так:")
    print("  https://phicandles.ru/?code=XXXXXXXXXXXX&state=...")
    print()
    code = input("Вставьте сюда значение 'code' из адресной строки: ").strip()

    if not code:
        print("Код не введён. Выход.")
        input("Нажмите Enter...")
        exit()

    print("\nПолучаем токен...")
    result = exchange_code_for_token(code)

    if 'access_token' in result:
        token = result['access_token']
        save_token(token)
        print(f"\n✓ Токен получен и сохранён в pinterest_config.py!")
        print(f"  Тип: {result.get('token_type', 'Bearer')}")
        print(f"  Срок: {result.get('expires_in', '?')} секунд")
        print()
        print("Теперь можете запустить pinterest_sync.py")
    else:
        print(f"\n✗ Ошибка: {result}")
        print("Проверьте App ID, Secret и redirect URI.")

    input("\nНажмите Enter для закрытия...")
