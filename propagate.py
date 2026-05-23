"""
1. Copies images from subfolders to main products folder.
2. Propagates catalog.json into all HTML pages.
3. Adds manufacturing time section to all gips product pages.
Runs automatically from ОБНОВИТЬ_САЙТ.bat
"""
import os, re, json, sys, shutil

BASE = os.path.dirname(os.path.abspath(__file__))
PRODUCTS_IMG = os.path.join(BASE, "assets", "img", "products")

# ─── Step 1: copy images from subfolders ──────────────────────────────────
copies = [
    # Аромалампа Минимализм
    ("Aroma home/Aromalamp-simpl.jpg",   "aromalamp-simpl.jpg"),
    ("Aroma home/Aromalamp-simpl-1.jpg", "aromalamp-simpl-1.jpg"),
    ("Aroma home/Aromalamp-simpl-2.jpg", "aromalamp-simpl-2.jpg"),
    # Ароматические саше
    ("Aroma home/sashe.jpg",   "sashe.jpg"),
    ("Aroma home/sashe-1.jpg", "sashe-1.jpg"),
    ("Aroma home/sashe-2.jpg", "sashe-2.jpg"),
    # Интерьерный набор Минимализм
    ("Home decor/minimalizm.jpg",   "minimalizm-set.jpg"),
    ("Home decor/minimalizm-2.jpg", "minimalizm-set-2.jpg"),
    ("Home decor/minimalizm-3.jpg", "minimalizm-set-3.jpg"),
]

print("=== Step 1: copy images ===")
for src_rel, dst_name in copies:
    src = os.path.join(PRODUCTS_IMG, src_rel)
    dst = os.path.join(PRODUCTS_IMG, dst_name)
    if not os.path.exists(src):
        print(f"  NOT FOUND: {src_rel}")
        continue
    if os.path.exists(dst):
        print(f"  Already exists: {dst_name}")
    else:
        shutil.copy2(src, dst)
        print(f"  Copied: {dst_name}")

# ─── Step 2: propagate catalog.json ───────────────────────────────────────
catalog_path = os.path.join(BASE, "data", "catalog.json")

with open(catalog_path, "rb") as f:
    raw = f.read().rstrip(b"\x00")

text = raw.decode("utf-8").rstrip()
if not text.endswith("}"):
    text = text + "\n}"

try:
    catalog = json.loads(text)
    print(f"\n=== Step 2: propagate catalog ===")
    print(f"Catalog OK: {len(catalog.get('products', []))} products")
except json.JSONDecodeError as e:
    print("JSON ERROR:", e)
    sys.exit(1)

catalog_json = json.dumps(catalog, ensure_ascii=False, indent=2)
script_tag = f'<script id="phicandles-catalog-json" type="application/json">{catalog_json}</script>'

cat_pattern = re.compile(
    r'<script\s+id="phicandles-catalog-json"\s+type="application/json">.*?</script>',
    re.DOTALL,
)

updated = 0
skipped = 0

for root, dirs, files in os.walk(BASE):
    dirs[:] = [d for d in dirs if d not in [".git", "node_modules"]]
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
        new_content = cat_pattern.sub(script_tag, content)
        if new_content != content:
            with open(fpath, "w", encoding="utf-8") as f:
                f.write(new_content)
            updated += 1
            print(f"  Updated: {os.path.relpath(fpath, BASE)}")

print(f"\nDone! Updated {updated} pages, skipped {skipped}.")

# ─── Step 3: add manufacturing time to all gips product pages ─────────────
print(f"\n=== Step 3: add manufacturing time to gips pages ===")

GIPS_SLUGS = [
    "interernyy-nabor-minimalizm",
    "aromalampa-arka",
    "aromalampa-minimalizm",
    "roza-intalia-k",
    "tykva-k",
    "izyashnye-linii-k",
    "minimalizm-k",
    "minimalizm-k-m",
    "kub",
    "krolik",
    "art-deco",
    "candlehold-tall",
    "candlehold-mini",
    "kruglyy-podnos-podstavka",
    "kruglyy-podnos-podstavka-m",
    "kruglyy-podnos-podstavka-s",
    "ovalnyy-podnos-podstavka",
    "salfetnica-bubl",
]

MANUF_TEXT = (
    "Срок изготовления гипсовых изделий 7–9 дней. "
    "Ваши изделия заливаются в день заказа или на следующий день "
    "(в зависимости от времени заказа), проходят этап сушки 5–7 дней, "
    "далее происходит обработка грунтом и лаком. "
    "В зависимости от объема изделия и используемого материала "
    "– срок на изготовление может быть уменьшен."
)

MANUF_BLOCK = (
    '\n        <div class="product-story-inline" style="margin-top: 16px;">\n'
    '          <h2 class="product-story-inline__title">'
    "Срок изготовления"
    "</h2>\n"
    '          <p class="product-story-inline__text">'
    + MANUF_TEXT
    + "</p>\n        </div>"
)

# Insertion anchor: right before the first option-field div
ANCHOR = '<div class="option-field" data-option-aroma-wrap>'

gips_updated = 0

for slug in GIPS_SLUGS:
    fpath = os.path.join(BASE, "products", slug, "index.html")
    if not os.path.exists(fpath):
        print(f"  NOT FOUND: products/{slug}/index.html")
        continue
    with open(fpath, "r", encoding="utf-8") as f:
        content = f.read()
    if "Срок изготовления" in content:
        print(f"  Already has section: {slug}")
        continue
    if ANCHOR not in content:
        print(f"  Anchor not found: {slug}")
        continue
    new_content = content.replace(ANCHOR, MANUF_BLOCK + "\n        " + ANCHOR, 1)
    with open(fpath, "w", encoding="utf-8") as f:
        f.write(new_content)
    gips_updated += 1
    print(f"  Added to: {slug}")

print(f"\nManufacturing time added to {gips_updated} pages.")

if "--no-wait" not in sys.argv:
    input("\nPress Enter to close...")
