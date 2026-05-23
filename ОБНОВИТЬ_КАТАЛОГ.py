"""
1. Копирует изображения из подпапок в основную папку products.
2. Распространяет catalog.json во все HTML-страницы сайта.
Запустите этот файл двойным кликом перед ОБНОВИТЬ_САЙТ.bat
"""
import os, re, json, sys, shutil

BASE = os.path.dirname(os.path.abspath(__file__))
PRODUCTS_IMG = os.path.join(BASE, "assets", "img", "products")

# ─── Шаг 1: копирование изображений из подпапок ───────────────────────────
copies = [
    # Аромалампа Минимализм
    ("Aroma home/Aromalamp-simpl.jpg",   "aromalamp-simpl.jpg"),
    ("Aroma home/Aromalamp-simpl-1.jpg", "aromalamp-simpl-1.jpg"),
    ("Aroma home/Aromalamp-simpl-2.jpg", "aromalamp-simpl-2.jpg"),
]

print("=== Шаг 1: копирование изображений ===")
for src_rel, dst_name in copies:
    src = os.path.join(PRODUCTS_IMG, src_rel)
    dst = os.path.join(PRODUCTS_IMG, dst_name)
    if not os.path.exists(src):
        print(f"  НЕ НАЙДЕН: {src_rel}")
        continue
    if os.path.exists(dst):
        print(f"  Уже есть:  {dst_name}")
    else:
        shutil.copy2(src, dst)
        print(f"  Скопирован: {dst_name}")

# ─── Шаг 2: распространение catalog.json ──────────────────────────────────
catalog_path = os.path.join(BASE, "data", "catalog.json")

with open(catalog_path, "rb") as f:
    raw = f.read().rstrip(b'\x00')

text = raw.decode("utf-8").rstrip()
if not text.endswith('}'):
    text = text + '\n}'

try:
    catalog = json.loads(text)
    print(f"\n=== Шаг 2: распространение каталога ===")
    print(f"Каталог OK: {len(catalog.get('products', []))} товаров")
except json.JSONDecodeError as e:
    print("ОШИБКА JSON:", e)
    sys.exit(1)

catalog_json = json.dumps(catalog, ensure_ascii=False, indent=2)
script_tag = f'<script id="phicandles-catalog-json" type="application/json">{catalog_json}</script>'

pattern = re.compile(
    r'<script\s+id="phicandles-catalog-json"\s+type="application/json">.*?</script>',
    re.DOTALL
)

updated = 0
skipped = 0

for root, dirs, files in os.walk(BASE):
    dirs[:] = [d for d in dirs if d not in ['.git', 'node_modules']]
    for fname in files:
        if fname != "index.html":
            continue
        fpath = os.path.join(root, fname)
        try:
            with open(fpath, "r", encoding="utf-8") as f:
                content = f.read()
        except Exception:
            continue
        if 'id="phicandles-catalog-json"' not in content:
            skipped += 1
            continue
        new_content = pattern.sub(script_tag, content)
        if new_content != content:
            with open(fpath, "w", encoding="utf-8") as f:
                f.write(new_content)
            updated += 1
            rel = os.path.relpath(fpath, BASE)
            print(f"  Обновлён: {rel}")

print(f"\nГотово! Обновлено {updated} страниц, пропущено {skipped}.")
print("Теперь запустите ОБНОВИТЬ_САЙТ.bat")
input("\nNажмите Enter для закрытия...")
