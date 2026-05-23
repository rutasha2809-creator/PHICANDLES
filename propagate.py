"""
1. Kopируet images from subfolders to main products folder.
2. Propagates catalog.json into all HTML pages.
Run before ОБНОВИТЬ_САЙТ.bat (or it runs automatically from it).
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
    raw = f.read().rstrip(b'\x00')

text = raw.decode("utf-8").rstrip()
if not text.endswith('}'):
    text = text + '\n}'

try:
    catalog = json.loads(text)
    print(f"\n=== Step 2: propagate catalog ===")
    print(f"Catalog OK: {len(catalog.get('products', []))} products")
except json.JSONDecodeError as e:
    print("JSON ERROR:", e)
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
            print(f"  Updated: {rel}")

print(f"\nDone! Updated {updated} pages, skipped {skipped}.")
if "--no-wait" not in sys.argv:
    input("\nPress Enter to close...")
